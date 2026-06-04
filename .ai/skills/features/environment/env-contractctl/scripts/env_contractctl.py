#!/usr/bin/env python3
"""Environment contract controller (repo-env-contract SSOT).

This script is intentionally dependency-light and deterministic.

It supports two primary operations:
  - validate: validate env/contract.yaml, env/values/<env>.yaml, env/secrets/<env>.ref.yaml
  - generate: generate env/.env.example, docs/env.md, docs/context/env/contract.json

Design goals:
  - Keep secrets out of repo outputs (never materialize secret values).
  - Provide clear, actionable validation errors.
  - Be usable in CI.

Exit codes:
  - 0: success
  - 1: validation or runtime failure

NOTE: This is a generic controller. Cloud provider specifics belong in env-cloudctl.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

import yaml_min

ALLOWED_TYPES = {"string", "int", "float", "bool", "json", "enum", "url"}
LIFECYCLE_STATES = {"active", "deprecated", "removed"}
_DATE_YYYY_MM_DD_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def load_yaml(path: Path) -> Any:
    return yaml_min.safe_load(read_text(path))


def load_json(path: Path) -> Any:
    return json.loads(read_text(path))


def is_repo_env_contract_mode(root: Path) -> Tuple[bool, str]:
    gate = root / "docs" / "project" / "env-ssot.json"
    if not gate.exists():
        return False, "Missing gate file: docs/project/env-ssot.json"
    try:
        data = load_json(gate)
    except Exception as e:  # noqa: BLE001
        return False, f"Failed to parse docs/project/env-ssot.json: {e}"

    mode = None
    if isinstance(data, dict):
        mode = data.get("mode") or data.get("env_ssot") or data.get("envSSOT")
    if mode != "repo-env-contract":
        return False, f"env SSOT mode is not repo-env-contract (found: {mode!r})"
    return True, "OK"


_VAR_NAME_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")


@dataclass
class ValidationMessage:
    level: str  # ERROR | WARN
    code: str
    message: str
    path: Optional[str] = None


@dataclass
class ValidationResult:
    timestamp_utc: str
    root: str
    envs: List[str]
    errors: List[ValidationMessage]
    warnings: List[ValidationMessage]
    summary: Dict[str, Any]

    @property
    def ok(self) -> bool:
        return len(self.errors) == 0


def _add_msg(msgs: List[ValidationMessage], level: str, code: str, message: str, path: Optional[Path] = None) -> None:
    msgs.append(ValidationMessage(level=level, code=code, message=message, path=str(path) if path else None))


def discover_envs(root: Path) -> List[str]:
    envs: set[str] = set()
    values_dir = root / "env" / "values"
    secrets_dir = root / "env" / "secrets"
    inventory_dir = root / "env" / "inventory"

    if values_dir.exists():
        for p in values_dir.glob("*.yaml"):
            envs.add(p.stem)
        for p in values_dir.glob("*.yml"):
            envs.add(p.stem)

    if secrets_dir.exists():
        for p in secrets_dir.glob("*.ref.yaml"):
            envs.add(p.name.replace(".ref.yaml", ""))
        for p in secrets_dir.glob("*.ref.yml"):
            envs.add(p.name.replace(".ref.yml", ""))

    if inventory_dir.exists():
        for p in inventory_dir.glob("*.yaml"):
            envs.add(p.stem)
        for p in inventory_dir.glob("*.yml"):
            envs.add(p.stem)

    return sorted(envs)


def normalize_secrets_ref(doc: Any) -> Dict[str, Any]:
    """Return {secret_name: {backend, ref, ...}}."""
    if doc is None:
        return {}
    if isinstance(doc, dict) and "secrets" in doc and isinstance(doc["secrets"], dict):
        return doc["secrets"]
    if isinstance(doc, dict):
        # Allow shorthand: top-level mapping is secrets
        # (but reserve "version" key if present).
        secrets = {k: v for k, v in doc.items() if k != "version"}
        # If it looks like a proper mapping, accept.
        if all(isinstance(k, str) for k in secrets.keys()):
            return secrets  # type: ignore[return-value]
    return {}


def load_contract(root: Path) -> Tuple[Optional[Dict[str, Any]], List[ValidationMessage]]:
    msgs: List[ValidationMessage] = []
    contract_path = root / "env" / "contract.yaml"
    if not contract_path.exists():
        _add_msg(msgs, "ERROR", "CONTRACT_MISSING", "Missing env/contract.yaml", contract_path)
        return None, msgs

    try:
        doc = load_yaml(contract_path)
    except Exception as e:  # noqa: BLE001
        _add_msg(msgs, "ERROR", "CONTRACT_PARSE", f"Failed to parse env/contract.yaml: {e}", contract_path)
        return None, msgs

    if not isinstance(doc, dict):
        _add_msg(msgs, "ERROR", "CONTRACT_SHAPE", "env/contract.yaml must be a YAML mapping", contract_path)
        return None, msgs

    if "variables" not in doc or not isinstance(doc.get("variables"), dict):
        _add_msg(msgs, "ERROR", "CONTRACT_VARIABLES", "env/contract.yaml must contain a top-level 'variables' mapping", contract_path)
        return None, msgs

    return doc, msgs


def validate_contract(contract: Dict[str, Any], root: Path) -> Tuple[Dict[str, Any], List[ValidationMessage], List[ValidationMessage]]:
    errors: List[ValidationMessage] = []
    warnings: List[ValidationMessage] = []

    contract_path = root / "env" / "contract.yaml"

    variables: Dict[str, Any] = contract.get("variables", {})
    states: Dict[str, str] = {}
    rename_from_entries: List[Tuple[str, str]] = []
    replacements: Dict[str, str] = {}

    for key, spec in variables.items():
        if not isinstance(key, str) or not _VAR_NAME_RE.match(key):
            _add_msg(errors, "ERROR", "VAR_NAME", f"Invalid variable name: {key!r}. Use uppercase with underscores.", contract_path)
            continue

        if not isinstance(spec, dict):
            _add_msg(errors, "ERROR", "VAR_SPEC", f"Variable {key} spec must be a mapping.", contract_path)
            continue

        vtype = spec.get("type")
        if vtype not in ALLOWED_TYPES:
            _add_msg(errors, "ERROR", "VAR_TYPE", f"Variable {key} has invalid type {vtype!r}. Allowed: {sorted(ALLOWED_TYPES)}", contract_path)

        # Lifecycle (backward compatible):
        # - preferred: state: active|deprecated|removed
        # - legacy: deprecated: true
        state_raw = spec.get("state")
        deprecated_raw = spec.get("deprecated")
        state: str
        if isinstance(state_raw, str) and state_raw.strip():
            state = state_raw.strip()
        elif deprecated_raw is True:
            state = "deprecated"
        else:
            state = "active"

        if state not in LIFECYCLE_STATES:
            _add_msg(errors, "ERROR", "VAR_STATE", f"Variable {key} has invalid state {state!r}. Allowed: {sorted(LIFECYCLE_STATES)}", contract_path)
            state = "active"

        if deprecated_raw not in (None, True, False):
            _add_msg(errors, "ERROR", "VAR_DEPRECATED", f"Variable {key} deprecated must be a boolean if present.", contract_path)

        if deprecated_raw is True and state != "deprecated":
            _add_msg(errors, "ERROR", "VAR_DEPRECATED_CONFLICT", f"Variable {key} sets deprecated=true but state is {state!r}.", contract_path)
        if deprecated_raw is False and state == "deprecated":
            _add_msg(errors, "ERROR", "VAR_DEPRECATED_CONFLICT", f"Variable {key} sets deprecated=false but state is 'deprecated'.", contract_path)

        deprecate_after = spec.get("deprecate_after")
        if deprecate_after is not None:
            if not isinstance(deprecate_after, str) or not _DATE_YYYY_MM_DD_RE.match(deprecate_after.strip()):
                _add_msg(errors, "ERROR", "VAR_DEPRECATE_AFTER", f"Variable {key} deprecate_after must be YYYY-MM-DD.", contract_path)
            if state != "deprecated":
                _add_msg(errors, "ERROR", "VAR_DEPRECATE_AFTER_STATE", f"Variable {key} deprecate_after is only valid when state='deprecated'.", contract_path)

        # replacement (preferred) / replaced_by (legacy)
        replacement = spec.get("replacement")
        replaced_by = spec.get("replaced_by")
        if replacement is not None and replaced_by is not None and replacement != replaced_by:
            _add_msg(errors, "ERROR", "VAR_REPLACEMENT_CONFLICT", f"Variable {key} sets both replacement and replaced_by with different values.", contract_path)
        replacement_name = replacement if replacement is not None else replaced_by
        if replacement_name is not None:
            if not isinstance(replacement_name, str) or not _VAR_NAME_RE.match(replacement_name):
                _add_msg(errors, "ERROR", "VAR_REPLACEMENT", f"Variable {key} replacement must be a valid env var name.", contract_path)
            else:
                replacements[key] = replacement_name

        migration = spec.get("migration")
        if migration is not None:
            if not isinstance(migration, dict):
                _add_msg(errors, "ERROR", "VAR_MIGRATION", f"Variable {key} migration must be a mapping.", contract_path)
            else:
                rename_from = migration.get("rename_from")
                if rename_from is not None:
                    if not isinstance(rename_from, str) or not _VAR_NAME_RE.match(rename_from):
                        _add_msg(errors, "ERROR", "VAR_RENAME_FROM", f"Variable {key} migration.rename_from must be a valid env var name.", contract_path)
                    elif rename_from == key:
                        _add_msg(errors, "ERROR", "VAR_RENAME_FROM", f"Variable {key} migration.rename_from must not equal the new name.", contract_path)
                    else:
                        rename_from_entries.append((rename_from, key))

        # Persist computed state for cross-field checks and downstream coverage rules.
        states[key] = state

        desc = spec.get("description")
        if not isinstance(desc, str) or not desc.strip():
            _add_msg(warnings, "WARN", "VAR_DESC", f"Variable {key} should have a non-empty description.", contract_path)
        elif "\n" in desc:
            _add_msg(errors, "ERROR", "VAR_DESC_MULTILINE", f"Variable {key} description must be single-line.", contract_path)

        secret = bool(spec.get("secret", False))
        secret_ref = spec.get("secret_ref")
        if secret:
            if not isinstance(secret_ref, str) or not secret_ref.strip():
                _add_msg(errors, "ERROR", "SECRET_REF", f"Secret variable {key} must set secret_ref.", contract_path)
            if "default" in spec and spec.get("default") not in (None, ""):
                _add_msg(errors, "ERROR", "SECRET_DEFAULT", f"Secret variable {key} must not define a default value.", contract_path)
        if state == "removed":
            if bool(spec.get("required", False)):
                _add_msg(errors, "ERROR", "VAR_REMOVED_REQUIRED", f"Variable {key} has state='removed' but required=true (invalid).", contract_path)
            if not secret and spec.get("default") not in (None, ""):
                _add_msg(errors, "ERROR", "VAR_REMOVED_DEFAULT", f"Variable {key} has state='removed' but defines a default (invalid).", contract_path)

        if vtype == "enum":
            enum_vals = spec.get("enum")
            if not isinstance(enum_vals, list) or not enum_vals:
                _add_msg(errors, "ERROR", "ENUM_VALUES", f"Enum variable {key} must define a non-empty 'enum' list.", contract_path)

        scopes = spec.get("scopes")
        if scopes is not None and not (isinstance(scopes, list) and all(isinstance(x, str) for x in scopes)):
            _add_msg(errors, "ERROR", "SCOPES", f"Variable {key} scopes must be a list of env names.", contract_path)

        # Legacy compatibility check (deprecated/replaced_by handled above).

    # Cross-variable checks: rename_from collisions and replacement validity.
    rename_from_to: Dict[str, str] = {}
    for old, new in rename_from_entries:
        if old in rename_from_to and rename_from_to[old] != new:
            _add_msg(errors, "ERROR", "VAR_RENAME_FROM_COLLISION", f"Multiple variables declare migration.rename_from={old!r}: {rename_from_to[old]} and {new}", contract_path)
        else:
            rename_from_to[old] = new

    for old, new in rename_from_to.items():
        if old in states and states.get(old) != "removed":
            _add_msg(errors, "ERROR", "VAR_RENAME_FROM_CONFLICT", f"Variable {new} migration.rename_from points to {old}, but {old} exists in contract and is not state='removed'.", contract_path)

    for var, repl in replacements.items():
        if repl in states and states.get(repl) == "removed":
            _add_msg(warnings, "WARN", "VAR_REPLACEMENT_REMOVED", f"Variable {var} replacement points to {repl}, but {repl} is state='removed'.", contract_path)
        if repl not in states:
            _add_msg(warnings, "WARN", "VAR_REPLACEMENT_UNKNOWN", f"Variable {var} replacement points to {repl}, but {repl} is not defined in contract.", contract_path)

    return variables, errors, warnings


def load_values_for_env(root: Path, env: str) -> Tuple[Dict[str, Any], Optional[Path], List[ValidationMessage]]:
    msgs: List[ValidationMessage] = []
    values_dir = root / "env" / "values"
    candidates = [values_dir / f"{env}.yaml", values_dir / f"{env}.yml"]
    path = next((p for p in candidates if p.exists()), None)
    if path is None:
        return {}, None, msgs

    try:
        doc = load_yaml(path)
    except Exception as e:  # noqa: BLE001
        _add_msg(msgs, "ERROR", "VALUES_PARSE", f"Failed to parse values file for env={env}: {e}", path)
        return {}, path, msgs

    if doc is None:
        return {}, path, msgs

    if not isinstance(doc, dict):
        _add_msg(msgs, "ERROR", "VALUES_SHAPE", f"Values file must be a mapping for env={env}", path)
        return {}, path, msgs

    return doc, path, msgs


def load_secrets_ref_for_env(root: Path, env: str) -> Tuple[Dict[str, Any], Optional[Path], List[ValidationMessage]]:
    msgs: List[ValidationMessage] = []
    secrets_dir = root / "env" / "secrets"
    candidates = [secrets_dir / f"{env}.ref.yaml", secrets_dir / f"{env}.ref.yml"]
    path = next((p for p in candidates if p.exists()), None)
    if path is None:
        return {}, None, msgs

    try:
        doc = load_yaml(path)
    except Exception as e:  # noqa: BLE001
        _add_msg(msgs, "ERROR", "SECRETS_PARSE", f"Failed to parse secrets ref file for env={env}: {e}", path)
        return {}, path, msgs

    secrets = normalize_secrets_ref(doc)
    if not isinstance(secrets, dict):
        _add_msg(msgs, "ERROR", "SECRETS_SHAPE", f"Secrets ref file must be a mapping for env={env}", path)
        return {}, path, msgs

    return secrets, path, msgs


def validate_coverage(
    root: Path,
    envs: Sequence[str],
    variables: Dict[str, Any],
) -> Tuple[List[ValidationMessage], List[ValidationMessage], Dict[str, Any]]:
    errors: List[ValidationMessage] = []
    warnings: List[ValidationMessage] = []

    per_env: Dict[str, Any] = {}

    # Precompute secret vars and non-secret vars + lifecycle + rename-from mapping.
    secret_vars = {k for k, v in variables.items() if isinstance(v, dict) and bool(v.get("secret", False))}
    states: Dict[str, str] = {}
    rename_from_to: Dict[str, str] = {}
    replacements: Dict[str, str] = {}
    for k, spec in variables.items():
        if not isinstance(k, str) or not isinstance(spec, dict):
            continue
        state_raw = spec.get("state")
        deprecated_raw = spec.get("deprecated")
        state = str(state_raw).strip() if isinstance(state_raw, str) and state_raw.strip() else ("deprecated" if deprecated_raw is True else "active")
        if state not in LIFECYCLE_STATES:
            state = "active"
        states[k] = state

        replacement = spec.get("replacement")
        replaced_by = spec.get("replaced_by")
        repl = replacement if replacement is not None else replaced_by
        if isinstance(repl, str) and repl.strip():
            replacements[k] = repl.strip()

        mig = spec.get("migration")
        if isinstance(mig, dict):
            rf = mig.get("rename_from")
            if isinstance(rf, str) and _VAR_NAME_RE.match(rf) and rf != k:
                # Only keep non-colliding mapping; collisions already flagged in validate_contract.
                if rf not in rename_from_to:
                    rename_from_to[rf] = k

    for env in envs:
        values, values_path, vmsgs = load_values_for_env(root, env)
        secrets_ref, secrets_path, smsgs = load_secrets_ref_for_env(root, env)

        for m in vmsgs + smsgs:
            (errors if m.level == "ERROR" else warnings).append(m)

        # Apply rename_from migrations (alias old key -> new key) before unknown-key validation.
        migrated_values: Dict[str, Any] = {}
        migration_warnings: List[str] = []
        migration_errors: List[str] = []

        for k, v in values.items():
            if k in variables:
                migrated_values[k] = v
                continue
            new_key = rename_from_to.get(k)
            if new_key:
                if new_key in values or new_key in migrated_values:
                    migration_errors.append(f"{k} -> {new_key} (both old and new keys present)")
                else:
                    migrated_values[new_key] = v
                    migration_warnings.append(f"{k} -> {new_key}")
                continue
            migrated_values[k] = v

        if migration_errors:
            _add_msg(errors, "ERROR", "MIGRATION_RENAME_CONFLICT", f"Conflicting rename_from usage in env/values/{env}: {migration_errors}", values_path)
        if migration_warnings:
            _add_msg(warnings, "WARN", "MIGRATION_RENAME_USED", f"env/values/{env} uses legacy keys (rename_from): {migration_warnings}", values_path)

        values = migrated_values

        # Unknown keys in values (after migration)
        unknown_values = [k for k in values.keys() if k not in variables]
        if unknown_values:
            _add_msg(errors, "ERROR", "UNKNOWN_VALUES_KEYS", f"env/values/{env} contains unknown keys: {unknown_values}", values_path)

        # Secret keys must not appear in values
        secret_in_values = [k for k in values.keys() if k in secret_vars]
        if secret_in_values:
            _add_msg(errors, "ERROR", "SECRET_IN_VALUES", f"Secret keys must not appear in env/values/{env}: {secret_in_values}", values_path)

        # Lifecycle enforcement for values keys
        removed_in_values = [k for k in values.keys() if states.get(k) == "removed"]
        if removed_in_values:
            _add_msg(errors, "ERROR", "REMOVED_KEY_IN_VALUES", f"Removed keys must not appear in env/values/{env}: {removed_in_values}", values_path)

        deprecated_in_values = [k for k in values.keys() if states.get(k) == "deprecated"]
        if deprecated_in_values:
            notes = []
            for k in sorted(deprecated_in_values):
                repl = replacements.get(k)
                notes.append(f"{k}" + (f" (replacement: {repl})" if repl else ""))
            _add_msg(warnings, "WARN", "DEPRECATED_KEY_IN_VALUES", f"Deprecated keys appear in env/values/{env}: {notes}", values_path)

        # Coverage check for required vars in scope
        missing_required: List[str] = []
        missing_secret_refs: List[str] = []

        # Track which secret refs are used
        used_secret_refs: set[str] = set()

        for var_name, spec in variables.items():
            if not isinstance(spec, dict):
                continue

            if states.get(var_name) == "removed":
                # Removed variables must not participate in coverage requirements.
                continue

            scopes = spec.get("scopes")
            if isinstance(scopes, list) and env not in scopes:
                continue

            required = bool(spec.get("required", False))
            secret = bool(spec.get("secret", False))

            if secret:
                secret_ref = spec.get("secret_ref")
                if isinstance(secret_ref, str) and secret_ref.strip():
                    used_secret_refs.add(secret_ref)
                if required:
                    if not isinstance(secret_ref, str) or not secret_ref.strip():
                        missing_secret_refs.append(f"{var_name} (missing secret_ref)")
                    elif secret_ref not in secrets_ref:
                        missing_secret_refs.append(f"{var_name} -> {secret_ref}")
            else:
                if required:
                    has_value = var_name in values
                    has_default = "default" in spec and spec.get("default") is not None
                    if not (has_value or has_default):
                        missing_required.append(var_name)

        if missing_required:
            _add_msg(errors, "ERROR", "MISSING_REQUIRED", f"Missing required non-secret vars for env={env}: {missing_required}", values_path or (root / "env" / "values"))

        if missing_secret_refs:
            _add_msg(errors, "ERROR", "MISSING_SECRET_REFS", f"Missing required secret refs for env={env}: {missing_secret_refs}", secrets_path or (root / "env" / "secrets"))

        # Warn about unused secret refs
        unused_secret_refs = sorted([k for k in secrets_ref.keys() if k not in used_secret_refs])
        if unused_secret_refs:
            _add_msg(warnings, "WARN", "UNUSED_SECRET_REFS", f"Unused secret refs in env={env}: {unused_secret_refs}", secrets_path)

        per_env[env] = {
            "values_file": str(values_path) if values_path else None,
            "secrets_ref_file": str(secrets_path) if secrets_path else None,
            "values_keys": sorted(list(values.keys())),
            "secret_ref_keys": sorted(list(secrets_ref.keys())),
            "used_secret_refs": sorted(list(used_secret_refs)),
        }

    summary = {
        "variables_total": len(variables),
        "variables_secret": len(secret_vars),
        "variables_non_secret": len(variables) - len(secret_vars),
        "per_env": per_env,
    }

    return errors, warnings, summary


def render_validation_markdown(result: ValidationResult) -> str:
    lines: List[str] = []
    lines.append("# Env Contract Validation")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{result.timestamp_utc}`")
    lines.append(f"- Root: `{result.root}`")
    lines.append(f"- Envs: `{', '.join(result.envs) if result.envs else '(none discovered)'}`")
    lines.append(f"- Status: **{'PASS' if result.ok else 'FAIL'}**")
    lines.append("")

    def section(title: str, msgs: Sequence[ValidationMessage]) -> None:
        lines.append(f"## {title}")
        if not msgs:
            lines.append("- (none)")
            lines.append("")
            return
        for m in msgs:
            loc = f" ({m.path})" if m.path else ""
            lines.append(f"- **{m.code}**: {m.message}{loc}")
        lines.append("")

    section("Errors", result.errors)
    section("Warnings", result.warnings)

    lines.append("## Summary (redacted)")
    lines.append("```json")
    lines.append(json.dumps(result.summary, indent=2, sort_keys=True))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    lines.append("- This report never includes secret values.")
    lines.append("- If this is used in CI, treat any ERROR as a merge blocker.")
    return "\n".join(lines) + "\n"


def generate_env_example(root: Path, contract: Dict[str, Any]) -> str:
    variables: Dict[str, Any] = contract.get("variables", {})

    header = [
        "# Generated file. DO NOT EDIT BY HAND.",
        "# Source of truth: env/contract.yaml (repo-env-contract)",
        f"# Generated at: {utc_now_iso()}",
        "#",
        "# Usage:",
        "#   - Copy to .env.local (gitignored) and fill values.",
        "#   - Do NOT commit .env.local.",
        "",
    ]

    lines: List[str] = list(header)

    for name in sorted(variables.keys()):
        spec = variables[name]
        if not isinstance(spec, dict):
            continue

        state_raw = spec.get("state")
        deprecated_raw = spec.get("deprecated")
        state = str(state_raw).strip() if isinstance(state_raw, str) and state_raw.strip() else ("deprecated" if deprecated_raw is True else "active")
        if state not in LIFECYCLE_STATES:
            state = "active"
        if state == "removed":
            continue

        desc = (spec.get("description") or "").strip()
        vtype = spec.get("type")
        required = bool(spec.get("required", False))
        secret = bool(spec.get("secret", False))
        secret_ref = spec.get("secret_ref")
        example = spec.get("example")
        default = spec.get("default")
        deprecate_after = spec.get("deprecate_after")
        replacement = spec.get("replacement") if spec.get("replacement") is not None else spec.get("replaced_by")
        rename_from = None
        mig = spec.get("migration")
        if isinstance(mig, dict):
            rf = mig.get("rename_from")
            rename_from = rf if isinstance(rf, str) and rf.strip() else None

        comment_parts = []
        if desc:
            comment_parts.append(desc)
        comment_parts.append(f"type={vtype}")
        comment_parts.append("required" if required else "optional")
        if state != "active":
            comment_parts.append(f"state={state}")
        if state == "deprecated" and isinstance(deprecate_after, str) and deprecate_after.strip():
            comment_parts.append(f"deprecate_after={deprecate_after.strip()}")
        if state == "deprecated" and isinstance(replacement, str) and replacement.strip():
            comment_parts.append(f"replacement={replacement.strip()}")
        if isinstance(rename_from, str) and rename_from.strip():
            comment_parts.append(f"rename_from={rename_from.strip()}")
        if secret:
            comment_parts.append(f"secret_ref={secret_ref}")
        elif default is not None:
            comment_parts.append(f"default={default!r}")

        lines.append(f"# {name}: " + "; ".join(comment_parts))

        value: str = ""
        if secret:
            value = f"<secret:{secret_ref}>" if secret_ref else "<secret>"
        elif example is not None:
            value = str(example)
        elif default is not None:
            value = str(default)
        else:
            value = "<required>" if required else ""

        lines.append(f"{name}={value}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def generate_env_docs_md(root: Path, envs: Sequence[str], contract: Dict[str, Any]) -> str:
    variables: Dict[str, Any] = contract.get("variables", {})

    lines: List[str] = []
    lines.append("# Environment Configuration")
    lines.append("")
    lines.append("This document is generated from `env/contract.yaml`. Do not hand-edit.")
    lines.append("")
    lines.append(f"Generated at (UTC): `{utc_now_iso()}`")
    lines.append("")

    lines.append("## Environments")
    if envs:
        lines.append("- " + ", ".join(f"`{e}`" for e in envs))
    else:
        lines.append("- (none discovered)")
    lines.append("")

    lines.append("## Variables")
    lines.append("")
    lines.append("| Name | State | Type | Required | Secret | Default | Secret Ref | Scopes | Deprecate After | Replacement | Rename From | Description |")
    lines.append("|---|---:|---:|:---:|:---:|---|---|---|---|---|---|---|")

    for name in sorted(variables.keys()):
        spec = variables[name]
        if not isinstance(spec, dict):
            continue
        state_raw = spec.get("state")
        deprecated_raw = spec.get("deprecated")
        state = str(state_raw).strip() if isinstance(state_raw, str) and state_raw.strip() else ("deprecated" if deprecated_raw is True else "active")
        if state not in LIFECYCLE_STATES:
            state = "active"
        vtype = spec.get("type")
        required = "yes" if bool(spec.get("required", False)) else "no"
        secret = "yes" if bool(spec.get("secret", False)) else "no"
        default = spec.get("default")
        secret_ref = spec.get("secret_ref") if bool(spec.get("secret", False)) else ""
        scopes = spec.get("scopes")
        scopes_s = ",".join(scopes) if isinstance(scopes, list) else "*"
        deprecate_after = spec.get("deprecate_after")
        deprecate_after_s = deprecate_after.strip() if isinstance(deprecate_after, str) and deprecate_after.strip() else ""
        replacement = spec.get("replacement") if spec.get("replacement") is not None else spec.get("replaced_by")
        replacement_s = replacement.strip() if isinstance(replacement, str) and replacement.strip() else ""
        rename_from_s = ""
        mig = spec.get("migration")
        if isinstance(mig, dict):
            rf = mig.get("rename_from")
            rename_from_s = rf.strip() if isinstance(rf, str) and rf.strip() else ""
        desc = (spec.get("description") or "").replace("|", "\\|")
        default_s = "" if default is None else str(default).replace("|", "\\|")
        secret_ref_s = "" if not secret_ref else str(secret_ref).replace("|", "\\|")
        lines.append(
            f"| `{name}` | `{state}` | `{vtype}` | {required} | {secret} | `{default_s}` | `{secret_ref_s}` | `{scopes_s}` | `{deprecate_after_s}` | `{replacement_s}` | `{rename_from_s}` | {desc} |"
        )

    lines.append("")
    lines.append("## Loading model (recommended)")
    lines.append("")
    lines.append("1. Runtime injection (cloud)\n2. Local .env.local (gitignored)\n3. env/values/<env>.yaml\n4. env/contract.yaml defaults")
    lines.append("")
    lines.append("## Secret handling rules")
    lines.append("")
    lines.append("- Secret values must never be committed to the repository.")
    lines.append("- Secret variables are defined in the contract with `secret: true` and `secret_ref`.")
    lines.append("- Secret refs are stored in `env/secrets/<env>.ref.yaml`.")

    return "\n".join(lines) + "\n"


def generate_contract_context_json(root: Path, envs: Sequence[str], contract: Dict[str, Any]) -> Dict[str, Any]:
    variables = contract.get("variables", {})
    # Ensure JSON-serializable by filtering to plain types.
    normalized: Dict[str, Any] = {}
    for k, v in variables.items():
        if not isinstance(k, str) or not isinstance(v, dict):
            continue
        state_raw = v.get("state")
        deprecated_raw = v.get("deprecated")
        state = str(state_raw).strip() if isinstance(state_raw, str) and state_raw.strip() else ("deprecated" if deprecated_raw is True else "active")
        if state not in LIFECYCLE_STATES:
            state = "active"
        replacement = v.get("replacement") if v.get("replacement") is not None else v.get("replaced_by")
        mig = v.get("migration")
        rename_from = mig.get("rename_from") if isinstance(mig, dict) else None
        normalized[k] = {
            "state": state,
            "type": v.get("type"),
            "required": bool(v.get("required", False)),
            "default": v.get("default") if not bool(v.get("secret", False)) else None,
            "secret": bool(v.get("secret", False)),
            "secret_ref": v.get("secret_ref") if bool(v.get("secret", False)) else None,
            "description": v.get("description"),
            "scopes": v.get("scopes"),
            "deprecate_after": v.get("deprecate_after"),
            "replacement": replacement if isinstance(replacement, str) and replacement.strip() else None,
            "migration": {"rename_from": rename_from} if isinstance(rename_from, str) and rename_from.strip() else None,
            "legacy": {
                "deprecated": bool(v.get("deprecated", False)),
                "replaced_by": v.get("replaced_by"),
            },
        }

    return {
        "generated_at_utc": utc_now_iso(),
        "ssot_mode": "repo-env-contract",
        "envs": list(envs),
        "variables": normalized,
    }


def run_validate(root: Path) -> ValidationResult:
    ok, reason = is_repo_env_contract_mode(root)
    errors: List[ValidationMessage] = []
    warnings: List[ValidationMessage] = []

    if not ok:
        _add_msg(errors, "ERROR", "SSOT_MODE", reason, root / "docs" / "project" / "env-ssot.json")
        return ValidationResult(
            timestamp_utc=utc_now_iso(),
            root=str(root),
            envs=[],
            errors=errors,
            warnings=warnings,
            summary={},
        )

    contract, msgs = load_contract(root)
    for m in msgs:
        (errors if m.level == "ERROR" else warnings).append(m)
    if contract is None:
        return ValidationResult(
            timestamp_utc=utc_now_iso(),
            root=str(root),
            envs=[],
            errors=errors,
            warnings=warnings,
            summary={},
        )

    variables, c_errors, c_warnings = validate_contract(contract, root)
    errors.extend(c_errors)
    warnings.extend(c_warnings)

    envs = discover_envs(root)

    cov_errors, cov_warnings, summary = validate_coverage(root, envs, variables)
    errors.extend(cov_errors)
    warnings.extend(cov_warnings)

    return ValidationResult(
        timestamp_utc=utc_now_iso(),
        root=str(root),
        envs=envs,
        errors=errors,
        warnings=warnings,
        summary=summary,
    )


def run_generate(root: Path) -> Tuple[ValidationResult, Dict[str, str]]:
    validation = run_validate(root)
    if not validation.ok:
        return validation, {}

    contract_doc = load_yaml(root / "env" / "contract.yaml")
    envs = validation.envs

    outputs: Dict[str, str] = {}

    # env/.env.example (module-owned; keep repo root clean)
    env_example = generate_env_example(root, contract_doc)
    env_example_path = root / "env" / ".env.example"
    write_text(env_example_path, env_example)
    outputs["env/.env.example"] = str(env_example_path)

    # docs/env.md
    env_docs = generate_env_docs_md(root, envs, contract_doc)
    write_text(root / "docs" / "env.md", env_docs)
    outputs["docs/env.md"] = str(root / "docs" / "env.md")

    # docs/context/env/contract.json
    ctx = generate_contract_context_json(root, envs, contract_doc)
    write_text(root / "docs" / "context" / "env" / "contract.json", json.dumps(ctx, indent=2, sort_keys=True) + "\n")
    outputs["docs/context/env/contract.json"] = str(root / "docs" / "context" / "env" / "contract.json")

    return validation, outputs


def render_generate_markdown(validation: ValidationResult, outputs: Mapping[str, str]) -> str:
    lines: List[str] = []
    lines.append("# Env Contract Generate")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{utc_now_iso()}`")
    lines.append(f"- Root: `{validation.root}`")
    lines.append(f"- Status: **{'PASS' if validation.ok else 'FAIL'}**")
    lines.append("")

    if not validation.ok:
        lines.append("## Validation failed")
        lines.append("Fix validation errors before generating artifacts.")
        lines.append("")
        lines.append("```text")
        lines.append(render_validation_markdown(validation))
        lines.append("```")
        return "\n".join(lines) + "\n"

    lines.append("## Generated artifacts")
    for k, v in outputs.items():
        lines.append(f"- `{k}` -> `{v}`")
    lines.append("")
    lines.append("## Notes")
    lines.append("- No secret values are generated or written.")
    lines.append("- Treat generated files as build artifacts; do not hand-edit.")
    return "\n".join(lines) + "\n"



def run_init(root: Path, envs: Sequence[str], force: bool = False) -> Dict[str, Any]:
    """Initialize a minimal repo-env-contract skeleton.

    Intended for template repos and first-time setup.
    The operation is conservative: it will NOT overwrite existing files
    unless force=True.
    """

    created: List[str] = []
    skipped: List[str] = []
    warnings: List[str] = []

    def _ensure(path: Path, content: str) -> None:
        if path.exists() and not force:
            skipped.append(str(path))
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        created.append(str(path))

    # SSOT gate
    _ensure(
        root / "docs" / "project" / "env-ssot.json",
        """{
  "mode": "repo-env-contract"
}
""",
    )

    # Policy SSOT (v1 skeleton). Template repos should only create this when the
    # environment feature is enabled (init pipeline Stage C calls `init`).
    _ensure(
        root / "docs" / "project" / "policy.yaml",
        """version: 1

policy:
  env:
    merge:
      strategy: most-specific-wins
      tie_breaker: error

    defaults:
      auth_mode: auto
      preflight:
        mode: warn

    evidence:
      fallback_dir: .ai/.tmp/env/fallback

    preflight:
      detect:
        providers:
          cloud_a:
            env_credential_sets:
              - id_vars: [CLOUD_ACCESS_KEY_ID]
                secret_vars: [CLOUD_ACCESS_KEY_SECRET]
                token_vars: [CLOUD_SESSION_TOKEN]
            credential_files:
              paths:
                - "~/.cloud/credentials"
          cloud_b:
            env_var_presence:
              - CLOUD_APPLICATION_CREDENTIALS
            credential_files:
              paths:
                - "~/.config/cloud/application_default_credentials.json"

    # Supported auth_mode: role-only | auto | ak-only
    # Supported preflight.mode: fail | warn | off
    rules:
      - id: ecs-default
        match: { runtime_target: ecs }
        set:
          auth_mode: role-only
          preflight: { mode: fail }

      - id: prod-ecs
        match: { env: prod, runtime_target: ecs }
        set:
          auth_mode: role-only
          preflight: { mode: fail }

      - id: staging-local
        match: { env: staging, runtime_target: local }
        set:
          auth_mode: role-only
          preflight: { mode: fail }
          sts_bootstrap:
            allowed: true
            allow_ak_for_sts_only: true

      - id: dev-local
        match: { env: dev, runtime_target: local }
        set:
          auth_mode: auto
          preflight: { mode: warn }
          ak_fallback:
            allowed: true
            record: true

    secrets:
      backends:
        bws:
          # Optional defaults; keep empty to disable.
          key_prefix: ""
          scopes:
            project: {}
            shared: {}

    cloud:
      # Set to true to disallow inventory fallback and enforce policy-only routing.
      require_target: false
      defaults:
        provider: envfile
        env_file_source: "ops/deploy/env-files/{env}.env"
        env_file_name: "{env}.env"
        transport: local
        write:
          chmod: "600"
          remote_tmp_dir: "/tmp"
      targets: []

  iac:
    # cloud_scope: aliyun-only | multi-cloud
    cloud_scope: multi-cloud
    # tool: none | ros | terraform | opentofu (none = IaC feature not enabled)
    tool: none
    evidence_dir: ops/iac/handbook
    identity:
      allow_ak: true
      forbid_runtime_injection: true
""",
    )

    # Minimal contract template
    _ensure(
        root / "env" / "contract.yaml",
        """version: 1
variables:
  APP_ENV:
    type: enum
    enum: [dev, staging, prod]
    required: true
    default: dev
    description: Deployment environment profile.
  SERVICE_NAME:
    type: string
    required: true
    default: your-service
    description: Service name (logical).
  PORT:
    type: int
    required: true
    default: 8000
    description: Service listen port.
""",
    )

    values_template = """SERVICE_NAME: your-service
PORT: 8000
"""

    secrets_template = """version: 1
secrets: {}
"""

    # Values + secrets refs + inventory
    for env in envs:
        env = str(env).strip()
        if not env:
            continue

        _ensure(root / "env" / "values" / f"{env}.yaml", values_template)
        _ensure(root / "env" / "secrets" / f"{env}.ref.yaml", secrets_template)

        inv_template = f"""version: 1
env: {env}
provider: mockcloud
runtime: mock
region: local
"""
        _ensure(root / "env" / "inventory" / f"{env}.yaml", inv_template)

    warnings.append("Update env/contract.yaml to match your application configuration keys.")
    warnings.append("Do NOT place secret values in env/values/*.yaml. Use env/secrets/*.ref.yaml + a secret backend.")
    warnings.append("Replace mockcloud inventory with your real provider/runtime before using env-cloudctl against real infrastructure.")

    return {
        "timestamp_utc": utc_now_iso(),
        "status": "PASS",
        "root": str(root),
        "created": created,
        "skipped": skipped,
        "warnings": warnings,
    }


def render_init_markdown(report: Mapping[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Environment SSOT Init")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{report.get('timestamp_utc')}`")
    lines.append(f"- Root: `{report.get('root')}`")
    lines.append(f"- Status: **{report.get('status')}**")
    lines.append("")

    created = report.get("created") or []
    skipped = report.get("skipped") or []

    if created:
        lines.append("## Created")
        for p in created:
            lines.append(f"- `{p}`")
        lines.append("")

    if skipped:
        lines.append("## Skipped")
        lines.append("(already exists)")
        lines.append("")
        for p in skipped:
            lines.append(f"- `{p}`")
        lines.append("")

    if report.get("warnings"):
        lines.append("## Next steps")
        for w in report["warnings"]:
            lines.append(f"- {w}")
        lines.append("")

    return "\n".join(lines) + "\n"


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="env-contractctl: validate and generate environment contract artifacts")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_validate = sub.add_parser("validate", help="Validate contract/values/secrets refs")
    p_validate.add_argument("--root", default=".", help="Project root (default: .)")
    p_validate.add_argument("--out", default=None, help="Write markdown report to file")

    p_generate = sub.add_parser("generate", help="Generate env/.env.example, docs/env.md, docs/context/env/contract.json")
    p_generate.add_argument("--root", default=".", help="Project root (default: .)")
    p_generate.add_argument("--out", default=None, help="Write markdown report to file")

    p_init = sub.add_parser("init", help="Initialize minimal repo-env-contract layout (safe; no overwrite unless --force)")
    p_init.add_argument("--root", default=".", help="Project root (default: .)")
    p_init.add_argument("--envs", default="dev,staging,prod", help="Comma-separated env names to scaffold")
    p_init.add_argument("--force", action="store_true", help="Overwrite existing files")
    p_init.add_argument("--out", default=None, help="Write markdown report to file")

    args = parser.parse_args(argv)
    root = Path(args.root).resolve()

    if args.cmd == "init":
        envs = [e.strip() for e in str(args.envs).split(",") if e.strip()]
        report = run_init(root, envs, force=bool(args.force))
        md = render_init_markdown(report)
        if args.out:
            write_text(Path(args.out), md)
        else:
            sys.stdout.write(md)
        return 0

    if args.cmd == "validate":
        res = run_validate(root)
        md = render_validation_markdown(res)
        if args.out:
            write_text(Path(args.out), md)
        else:
            sys.stdout.write(md)
        return 0 if res.ok else 1

    if args.cmd == "generate":
        res, outputs = run_generate(root)
        md = render_generate_markdown(res, outputs)
        if args.out:
            write_text(Path(args.out), md)
        else:
            sys.stdout.write(md)
        return 0 if res.ok else 1

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
