#!/usr/bin/env python3
"""Local environment controller under repo-env-contract.

Subcommands:
  - doctor: validate required files and required keys for an env; check secret material resolvability.
  - compile: resolve secrets and generate `.env.local` (or `.env.<env>.local`) and redacted effective context JSON.
  - connectivity: best-effort parse/TCP checks for configured URL endpoints (redacted output).

Design goals:
  - Never print secret values.
  - Write secret values only to gitignored local env files.
  - Produce actionable markdown reports.

Exit codes:
  - 0: success
  - 1: failure
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import socket
import stat
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple
from urllib.parse import parse_qs, urlparse

import yaml_min

ALLOWED_TYPES = {"string", "int", "float", "bool", "json", "enum", "url"}
LIFECYCLE_STATES = {"active", "deprecated", "removed"}
_DATE_YYYY_MM_DD_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ENV_VAR_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")

AUTH_MODES = {"role-only", "auto", "ak-only"}
PREFLIGHT_MODES = {"fail", "warn", "off"}

_BWS_PROJECT_ID_CACHE: Dict[str, str] = {}
_BWS_SECRETS_CACHE: Dict[str, Dict[str, str]] = {}


def normalize_runtime_target(value: str) -> str:
    target = str(value or "").strip().lower()
    if target == "remote":
        # Backward-compatible alias: remote -> ecs
        return "ecs"
    return target


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _run_cli_json(
    args: Sequence[str],
    *,
    name: str,
    allow_stdout_in_error: bool = True,
) -> Tuple[Optional[Any], Optional[str]]:
    """Run CLI command and parse JSON output.

    Important: callers must ensure secret values are not printed/logged.
    """
    try:
        proc = subprocess.run(
            list(args),
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError:
        return None, f"{name} not found in PATH: {args[0]!r}"
    except Exception as e:
        return None, f"failed to run {name}: {e}"

    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        stdout = (proc.stdout or "").strip() if allow_stdout_in_error else ""
        details = stderr if stderr else stdout
        details = details.splitlines()[-1] if details else f"exit={proc.returncode}"
        return None, f"{name} failed: {details}"

    try:
        return json.loads(proc.stdout), None
    except Exception as e:
        return None, f"{name} returned invalid JSON: {e}"


def _bws_bin() -> Optional[str]:
    return shutil.which("bws")


def _bws_projects() -> Tuple[Optional[List[Mapping[str, Any]]], Optional[str]]:
    bws = _bws_bin()
    if not bws:
        return None, "bws CLI not found in PATH (install Bitwarden Secrets Manager CLI)"
    if not os.environ.get("BWS_ACCESS_TOKEN"):
        return None, "BWS_ACCESS_TOKEN is not set (export your Bitwarden Secrets Manager access token)"
    data, err = _run_cli_json([bws, "project", "list", "--output", "json", "--color", "no"], name="bws project list")
    if err:
        return None, err
    if not isinstance(data, list):
        return None, "bws project list: expected JSON array"
    return data, None


def _bws_project_id_by_name(project_name: str) -> Tuple[Optional[str], Optional[str]]:
    name_norm = project_name.strip().lower()
    if not name_norm:
        return None, "bws project_name must be a non-empty string"
    if name_norm in _BWS_PROJECT_ID_CACHE:
        return _BWS_PROJECT_ID_CACHE[name_norm], None

    projects, err = _bws_projects()
    if err:
        return None, err
    matches: List[str] = []
    for p in projects or []:
        if not isinstance(p, dict):
            continue
        pname = p.get("name")
        pid = p.get("id")
        if isinstance(pname, str) and isinstance(pid, str) and pname.strip().lower() == name_norm:
            matches.append(pid)
    if not matches:
        return None, f"bws project not found by name: {project_name!r}"
    if len(matches) > 1:
        return None, f"bws project name is not unique: {project_name!r}"
    _BWS_PROJECT_ID_CACHE[name_norm] = matches[0]
    return matches[0], None


def _bws_secrets_for_project(project_id: str) -> Tuple[Optional[Dict[str, str]], Optional[str]]:
    pid = project_id.strip()
    if not pid:
        return None, "bws project_id must be a non-empty string"
    if pid in _BWS_SECRETS_CACHE:
        return _BWS_SECRETS_CACHE[pid], None

    bws = _bws_bin()
    if not bws:
        return None, "bws CLI not found in PATH (install Bitwarden Secrets Manager CLI)"
    if not os.environ.get("BWS_ACCESS_TOKEN"):
        return None, "BWS_ACCESS_TOKEN is not set (export your Bitwarden Secrets Manager access token)"
    data, err = _run_cli_json(
        [bws, "secret", "list", pid, "--output", "json", "--color", "no"],
        name="bws secret list",
        allow_stdout_in_error=False,
    )
    if err:
        return None, err
    if not isinstance(data, list):
        return None, "bws secret list: expected JSON array"

    out: Dict[str, str] = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        k = item.get("key")
        v = item.get("value")
        if isinstance(k, str) and isinstance(v, str):
            # If duplicates occur, fail fast to avoid ambiguous resolution.
            if k in out:
                return None, f"bws project has duplicate secret key: {k!r}"
            out[k] = v

    _BWS_SECRETS_CACHE[pid] = out
    return out, None


def load_yaml(path: Path) -> Any:
    return yaml_min.safe_load(read_text(path))


def load_json(path: Path) -> Any:
    return json.loads(read_text(path))


def get_ssot_mode(root: Path) -> Optional[str]:
    gate = root / "docs" / "project" / "env-ssot.json"
    if not gate.exists():
        return None
    try:
        data = load_json(gate)
    except Exception:
        return None
    if isinstance(data, dict):
        for k in ("mode", "env_ssot", "ssot_mode"):
            if k in data and isinstance(data[k], str):
                return data[k]
    return None


def _as_str_list(v: Any) -> List[str]:
    if v is None:
        return []
    if isinstance(v, list):
        out: List[str] = []
        for item in v:
            if isinstance(item, str) and item.strip():
                out.append(item.strip())
        return out
    if isinstance(v, str) and v.strip():
        return [v.strip()]
    return []


def _env_var_present(name: str) -> bool:
    val = os.environ.get(name)
    return bool(val)


def load_policy(path: Path) -> Tuple[Optional[Dict[str, Any]], List[str], List[str]]:
    warnings: List[str] = []
    errors: List[str] = []
    if not path.exists():
        warnings.append(f"Policy file missing: {path}")
        return None, warnings, errors
    try:
        data = load_yaml(path)
    except Exception as e:
        errors.append(f"Failed to parse policy file {path}: {e}")
        return None, warnings, errors
    if not isinstance(data, dict):
        errors.append(f"Policy file must be a YAML mapping: {path}")
        return None, warnings, errors
    return data, warnings, errors


def _policy_bws_defaults(policy: Mapping[str, Any]) -> Mapping[str, Any]:
    root = policy.get("policy") if isinstance(policy.get("policy"), dict) else {}
    env_policy = root.get("env") if isinstance(root, dict) else {}
    if not isinstance(env_policy, dict):
        return {}
    secrets = env_policy.get("secrets") if isinstance(env_policy.get("secrets"), dict) else {}
    backends = secrets.get("backends") if isinstance(secrets, dict) else {}
    bws = backends.get("bws") if isinstance(backends, dict) else {}
    return bws if isinstance(bws, dict) else {}


def _apply_bws_defaults(meta: Mapping[str, Any], defaults: Mapping[str, Any]) -> Dict[str, Any]:
    if not defaults:
        return dict(meta)

    out = dict(meta)
    scope = out.get("scope")
    scope_cfg = {}
    scopes = defaults.get("scopes")
    if isinstance(scope, str) and isinstance(scopes, dict):
        scope_cfg = scopes.get(scope) if isinstance(scopes.get(scope), dict) else {}

    for key in ("project_id", "project_name"):
        if not out.get(key):
            if isinstance(scope_cfg.get(key), str) and scope_cfg.get(key).strip():
                out[key] = scope_cfg.get(key).strip()
            elif isinstance(defaults.get(key), str) and defaults.get(key).strip():
                out[key] = defaults.get(key).strip()

    prefix = None
    if isinstance(scope_cfg.get("key_prefix"), str) and scope_cfg.get("key_prefix").strip():
        prefix = scope_cfg.get("key_prefix").strip()
    elif isinstance(defaults.get("key_prefix"), str) and defaults.get("key_prefix").strip():
        prefix = defaults.get("key_prefix").strip()

    if prefix and isinstance(out.get("key"), str) and out.get("key").strip():
        key_val = out.get("key").strip()
        if not key_val.startswith(prefix):
            prefix_norm = prefix.rstrip("/")
            key_norm = key_val.lstrip("/")
            out["key"] = f"{prefix_norm}/{key_norm}" if prefix_norm else key_norm

    return out


def load_policy_bws_defaults(path: Path) -> Mapping[str, Any]:
    if not path.exists():
        return {}
    try:
        data = load_yaml(path)
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    return _policy_bws_defaults(data)


def _match_rule(rule: Mapping[str, Any], env: str, runtime_target: str, workload: str) -> Tuple[bool, int]:
    match = rule.get("match")
    if match is None:
        match = {}
    if not isinstance(match, dict):
        return False, 0
    keys = 0
    for k, v in match.items():
        if k == "env":
            keys += 1
            if str(v) != env:
                return False, 0
        elif k == "runtime_target":
            keys += 1
            if str(v) != runtime_target:
                return False, 0
        elif k == "workload":
            keys += 1
            if str(v) != workload:
                return False, 0
        else:
            # Unknown match key => treat as non-match to avoid silent surprises.
            return False, 0
    return True, keys


def compute_effective_policy(
    policy: Mapping[str, Any],
    *,
    env: str,
    runtime_target: str,
    workload: str,
) -> Tuple[Dict[str, Any], List[str], List[str]]:
    warnings: List[str] = []
    errors: List[str] = []

    root = policy.get("policy") if isinstance(policy.get("policy"), dict) else {}
    env_policy = root.get("env") if isinstance(root, dict) else {}
    if not isinstance(env_policy, dict):
        errors.append("policy.env missing or invalid in policy.yaml")
        return {}, warnings, errors

    defaults = env_policy.get("defaults") if isinstance(env_policy.get("defaults"), dict) else {}
    default_auth = defaults.get("auth_mode") if isinstance(defaults, dict) else None
    if default_auth not in AUTH_MODES:
        warnings.append(f"policy.env.defaults.auth_mode invalid or missing; defaulting to 'auto'")
        default_auth = "auto"

    default_preflight_mode = None
    if isinstance(defaults, dict):
        pre = defaults.get("preflight")
        if isinstance(pre, dict):
            default_preflight_mode = pre.get("mode")
    if default_preflight_mode not in PREFLIGHT_MODES:
        warnings.append(f"policy.env.defaults.preflight.mode invalid or missing; defaulting to 'warn'")
        default_preflight_mode = "warn"

    rules = env_policy.get("rules")
    rule_list = rules if isinstance(rules, list) else []

    candidates: List[Tuple[int, int, Mapping[str, Any]]] = []
    for idx, rule in enumerate(rule_list):
        if not isinstance(rule, dict):
            continue
        ok, spec = _match_rule(rule, env, runtime_target, workload)
        if ok:
            candidates.append((spec, idx, rule))

    selected_rules: List[Mapping[str, Any]] = []
    if candidates:
        max_spec = max(c[0] for c in candidates)
        selected_rules = [c[2] for c in candidates if c[0] == max_spec]

        # Detect conflicts on critical fields
        def _get_auth(r: Mapping[str, Any]) -> Optional[str]:
            s = r.get("set")
            if isinstance(s, dict):
                v = s.get("auth_mode")
                return str(v).strip() if isinstance(v, str) else None
            return None

        def _get_pf(r: Mapping[str, Any]) -> Optional[str]:
            s = r.get("set")
            if isinstance(s, dict):
                p = s.get("preflight")
                if isinstance(p, dict):
                    v = p.get("mode")
                    return str(v).strip() if isinstance(v, str) else None
            return None

        auth_vals = {v for v in (_get_auth(r) for r in selected_rules) if v}
        pf_vals = {v for v in (_get_pf(r) for r in selected_rules) if v}
        if len(auth_vals) > 1:
            ids = [str(r.get("id") or "?") for r in selected_rules]
            errors.append(f"policy.env.rules conflict on auth_mode for env={env}, runtime_target={runtime_target}, workload={workload}: {ids}")
        if len(pf_vals) > 1:
            ids = [str(r.get("id") or "?") for r in selected_rules]
            errors.append(f"policy.env.rules conflict on preflight.mode for env={env}, runtime_target={runtime_target}, workload={workload}: {ids}")

    effective: Dict[str, Any] = {
        "auth_mode": default_auth,
        "preflight_mode": default_preflight_mode,
        "ak_fallback": {},
        "sts_bootstrap": {},
        "rule_ids": [],
        "evidence": env_policy.get("evidence") if isinstance(env_policy.get("evidence"), dict) else {},
        "providers": {},
    }

    if selected_rules:
        for rule in selected_rules:
            rid = rule.get("id")
            if rid:
                effective["rule_ids"].append(str(rid))
            set_block = rule.get("set")
            if not isinstance(set_block, dict):
                continue
            if isinstance(set_block.get("auth_mode"), str):
                effective["auth_mode"] = set_block["auth_mode"].strip()
            pf = set_block.get("preflight")
            if isinstance(pf, dict) and isinstance(pf.get("mode"), str):
                effective["preflight_mode"] = pf["mode"].strip()
            if isinstance(set_block.get("ak_fallback"), dict):
                effective["ak_fallback"] = {**effective["ak_fallback"], **set_block.get("ak_fallback")}
            if isinstance(set_block.get("sts_bootstrap"), dict):
                effective["sts_bootstrap"] = {**effective["sts_bootstrap"], **set_block.get("sts_bootstrap")}

    # Preflight provider config
    pf_cfg = env_policy.get("preflight") if isinstance(env_policy.get("preflight"), dict) else {}
    detect = pf_cfg.get("detect") if isinstance(pf_cfg, dict) else {}
    providers = detect.get("providers") if isinstance(detect, dict) else {}
    effective["providers"] = providers if isinstance(providers, dict) else {}

    # Validate modes
    if effective["auth_mode"] not in AUTH_MODES:
        warnings.append(f"auth_mode invalid in policy; defaulting to 'auto' (got {effective['auth_mode']!r})")
        effective["auth_mode"] = "auto"
    if effective["preflight_mode"] not in PREFLIGHT_MODES:
        warnings.append(f"preflight.mode invalid in policy; defaulting to 'warn' (got {effective['preflight_mode']!r})")
        effective["preflight_mode"] = "warn"

    return effective, warnings, errors


def detect_preflight_signals(providers: Mapping[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {"providers": {}, "summary": {"has_ak": False, "has_sts": False}}
    has_ak = False
    has_sts = False

    for name, cfg in providers.items():
        if not isinstance(cfg, dict):
            continue
        provider: Dict[str, Any] = {"ak_env": [], "sts_env": [], "env_var_presence": [], "credential_files": []}

        for item in _as_str_list(cfg.get("env_var_presence")):
            if _env_var_present(item):
                provider["env_var_presence"].append(item)
                has_ak = True

        for cred in cfg.get("env_credential_sets") or []:
            if not isinstance(cred, dict):
                continue
            id_vars = _as_str_list(cred.get("id_vars"))
            secret_vars = _as_str_list(cred.get("secret_vars"))
            token_vars = _as_str_list(cred.get("token_vars"))

            id_present = [v for v in id_vars if _env_var_present(v)]
            secret_present = [v for v in secret_vars if _env_var_present(v)]
            token_present = [v for v in token_vars if _env_var_present(v)]

            if id_present and secret_present:
                entry = {
                    "id_vars": id_present,
                    "secret_vars": secret_present,
                    "token_vars": token_present,
                }
                if token_present:
                    provider["sts_env"].append(entry)
                    has_sts = True
                else:
                    provider["ak_env"].append(entry)
                    has_ak = True

        cred_files = cfg.get("credential_files") if isinstance(cfg.get("credential_files"), dict) else {}
        for p in _as_str_list(cred_files.get("paths")):
            path = Path(p).expanduser()
            if path.exists():
                provider["credential_files"].append(str(path))
                has_ak = True

        if provider["ak_env"] or provider["sts_env"] or provider["env_var_presence"] or provider["credential_files"]:
            out["providers"][name] = provider

    out["summary"]["has_ak"] = has_ak
    out["summary"]["has_sts"] = has_sts
    return out


def write_fallback_evidence(root: Path, base_dir: str, payload: Mapping[str, Any]) -> Optional[str]:
    if not base_dir:
        return None
    base = Path(base_dir)
    if not base.is_absolute():
        base = (root / base).resolve()
    run_id = f"{time.strftime('%Y%m%d-%H%M%SZ', time.gmtime())}-{os.getpid()}"
    out_dir = base / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "fallback.json"
    path.write_text(json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    return str(path)


def evaluate_preflight(
    *,
    auth_mode: str,
    preflight_mode: str,
    signals: Mapping[str, Any],
    ak_fallback: Mapping[str, Any],
    sts_bootstrap: Mapping[str, Any],
    env: str,
    runtime_target: str,
    workload: str,
    rule_ids: Sequence[str],
    root: Path,
    evidence_cfg: Mapping[str, Any],
) -> Tuple[Dict[str, Any], List[str], List[str]]:
    warnings: List[str] = []
    errors: List[str] = []

    if preflight_mode == "off":
        return (
            {
                "status": "SKIP",
                "auth_mode": auth_mode,
                "preflight_mode": preflight_mode,
                "rule_ids": list(rule_ids),
                "signals": signals,
                "reasons": ["preflight.mode=off"],
            },
            warnings,
            errors,
        )

    has_ak = bool(signals.get("summary", {}).get("has_ak"))
    has_sts = bool(signals.get("summary", {}).get("has_sts"))
    reasons: List[str] = []
    status = "PASS"
    fallback_used = False

    if auth_mode == "role-only":
        # sts_bootstrap allows AK to be used solely for obtaining STS credentials
        sts_bootstrap_allowed = bool(sts_bootstrap.get("allowed"))
        ak_for_sts_only = bool(sts_bootstrap.get("allow_ak_for_sts_only"))

        if has_ak:
            # Check if AK is permitted for STS bootstrap purposes
            if sts_bootstrap_allowed and ak_for_sts_only and has_sts:
                # AK is acceptable because it's used only for STS bootstrap and STS is present
                reasons.append("AK signals detected but allowed for STS bootstrap (STS present)")
                status = "PASS"
            else:
                reasons.append("AK/credential signals detected in role-only mode")
                status = "FAIL" if preflight_mode == "fail" else "WARN"
        elif not has_sts:
            # In role-only mode without STS signals, fail-fast when preflight_mode=fail
            reasons.append("No STS env signals detected (role chain not verified)")
            if preflight_mode == "fail":
                status = "FAIL"
            elif preflight_mode == "warn":
                status = "WARN"
            else:
                status = "PASS"
    elif auth_mode == "auto":
        if has_sts:
            if has_ak:
                reasons.append("Both STS and AK signals present (potential fallback risk)")
                status = "WARN" if preflight_mode == "warn" else "PASS"
        elif has_ak:
            allowed = bool(ak_fallback.get("allowed"))
            require_explicit = bool(ak_fallback.get("require_explicit_policy"))
            if allowed and require_explicit and not rule_ids:
                allowed = False
                reasons.append("AK fallback requires explicit policy rule but none matched")
            if allowed:
                fallback_used = True
                reasons.append("AK fallback used (no STS signals detected)")
                status = "WARN" if preflight_mode == "warn" else "PASS"
            else:
                reasons.append("AK signals detected but fallback is not allowed by policy")
                status = "FAIL" if preflight_mode == "fail" else "WARN"
        else:
            reasons.append("No credential signals detected")
            status = "WARN" if preflight_mode == "warn" else "PASS"
    elif auth_mode == "ak-only":
        if not has_ak:
            reasons.append("AK-only mode but no AK/credential signals detected")
            status = "FAIL" if preflight_mode == "fail" else "WARN"

    if status == "WARN":
        warnings.append(f"Preflight warning: {', '.join(reasons)}")
    elif status == "FAIL":
        errors.append(f"Preflight failed: {', '.join(reasons)}")

    evidence_path = None
    if fallback_used and bool(ak_fallback.get("record")):
        evidence_dir = ""
        if isinstance(evidence_cfg, dict):
            evidence_dir = str(evidence_cfg.get("fallback_dir") or "")
        payload = {
            "timestamp_utc": utc_now_iso(),
            "env": env,
            "runtime_target": runtime_target,
            "workload": workload,
            "auth_mode": auth_mode,
            "preflight_mode": preflight_mode,
            "rule_ids": list(rule_ids),
            "reason": "AK fallback used (no STS signals detected)",
            "signals": signals,
        }
        evidence_path = write_fallback_evidence(root, evidence_dir, payload)

    return (
        {
            "status": status,
            "auth_mode": auth_mode,
            "preflight_mode": preflight_mode,
            "rule_ids": list(rule_ids),
            "signals": signals,
            "reasons": reasons,
            "fallback_used": fallback_used,
            "fallback_evidence": evidence_path,
        },
        warnings,
        errors,
    )


@dataclass
class VarDef:
    name: str
    type: str
    required: bool
    secret: bool
    secret_ref: Optional[str]
    default: Any
    enum: Optional[List[str]]
    scopes: Optional[List[str]]
    description: str
    state: str  # active|deprecated|removed
    deprecate_after: Optional[str]
    replacement: Optional[str]
    rename_from: Optional[str]


def parse_contract(root: Path) -> Tuple[Dict[str, VarDef], List[str]]:
    """Return (vars, errors)."""
    errors: List[str] = []
    contract_path = root / "env" / "contract.yaml"
    if not contract_path.exists():
        return {}, [f"Missing contract: {contract_path}"]

    try:
        doc = load_yaml(contract_path)
    except Exception as e:
        return {}, [f"Failed to parse contract YAML: {e}"]

    if not isinstance(doc, dict) or "variables" not in doc or not isinstance(doc.get("variables"), dict):
        return {}, ["Contract must be a mapping with top-level 'variables' mapping."]

    raw_vars: Mapping[str, Any] = doc["variables"]
    vars_out: Dict[str, VarDef] = {}

    for name, cfg in raw_vars.items():
        if not isinstance(name, str) or not ENV_VAR_RE.match(name):
            errors.append(f"Invalid env var name in contract: {name!r}")
            continue
        if not isinstance(cfg, dict):
            errors.append(f"Variable {name}: definition must be a mapping")
            continue

        vtype = cfg.get("type")
        if not isinstance(vtype, str) or vtype not in ALLOWED_TYPES:
            errors.append(f"Variable {name}: invalid type {vtype!r} (allowed: {sorted(ALLOWED_TYPES)})")
            continue

        # Lifecycle (backward compatible):
        # - preferred: state: active|deprecated|removed
        # - legacy: deprecated: true
        state_raw = cfg.get("state")
        deprecated_raw = cfg.get("deprecated")
        state: str
        if isinstance(state_raw, str) and state_raw.strip():
            state = state_raw.strip()
        elif deprecated_raw is True:
            state = "deprecated"
        else:
            state = "active"
        if state not in LIFECYCLE_STATES:
            errors.append(f"Variable {name}: invalid state {state!r} (allowed: {sorted(LIFECYCLE_STATES)})")
            state = "active"
        if deprecated_raw is True and state != "deprecated":
            errors.append(f"Variable {name}: deprecated=true conflicts with state={state!r}")

        deprecate_after = cfg.get("deprecate_after")
        if deprecate_after is not None:
            if not isinstance(deprecate_after, str) or not _DATE_YYYY_MM_DD_RE.match(deprecate_after.strip()):
                errors.append(f"Variable {name}: deprecate_after must be YYYY-MM-DD if present")
                deprecate_after = None
            else:
                deprecate_after = deprecate_after.strip()
            if state != "deprecated":
                errors.append(f"Variable {name}: deprecate_after is only valid when state='deprecated'")
                deprecate_after = None

        replacement = cfg.get("replacement")
        replaced_by = cfg.get("replaced_by")
        if replacement is None and replaced_by is not None:
            replacement = replaced_by
        if replacement is not None:
            if not isinstance(replacement, str) or not ENV_VAR_RE.match(replacement):
                errors.append(f"Variable {name}: replacement must be a valid env var name")
                replacement = None
            if state != "deprecated":
                errors.append(f"Variable {name}: replacement is only valid when state='deprecated'")
                replacement = None

        rename_from: Optional[str] = None
        migration = cfg.get("migration")
        if migration is not None:
            if not isinstance(migration, dict):
                errors.append(f"Variable {name}: migration must be a mapping if present")
            else:
                rf = migration.get("rename_from")
                if rf is not None:
                    if not isinstance(rf, str) or not ENV_VAR_RE.match(rf):
                        errors.append(f"Variable {name}: migration.rename_from must be a valid env var name")
                    elif rf == name:
                        errors.append(f"Variable {name}: migration.rename_from must not equal the variable name")
                    else:
                        rename_from = rf

        required = bool(cfg.get("required", False))
        secret = bool(cfg.get("secret", False))
        secret_ref = cfg.get("secret_ref")
        if secret:
            if not isinstance(secret_ref, str) or not secret_ref.strip():
                errors.append(f"Variable {name}: secret variables must set non-empty secret_ref")
            if "default" in cfg:
                errors.append(f"Variable {name}: secret variables must not define a default")
        else:
            if secret_ref is not None:
                # Allow but warn-like error? We'll treat as error to keep contract clean.
                errors.append(f"Variable {name}: non-secret variables must not set secret_ref")

        default = cfg.get("default")
        enum_vals = cfg.get("enum")
        enum_list: Optional[List[str]] = None
        if vtype == "enum":
            if not isinstance(enum_vals, list) or not enum_vals or not all(isinstance(x, str) for x in enum_vals):
                errors.append(f"Variable {name}: enum type requires non-empty string list 'enum'")
            else:
                enum_list = list(enum_vals)

        scopes_vals = cfg.get("scopes")
        scopes: Optional[List[str]] = None
        if scopes_vals is not None:
            if not isinstance(scopes_vals, list) or not all(isinstance(x, str) for x in scopes_vals):
                errors.append(f"Variable {name}: scopes must be a list of env names")
            else:
                scopes = list(scopes_vals)

        description = cfg.get("description")
        if not isinstance(description, str) or not description.strip() or "\n" in description:
            errors.append(f"Variable {name}: description must be a non-empty single line")
            description = (description or "").replace("\n", " ").strip()

        vars_out[name] = VarDef(
            name=name,
            type=vtype,
            required=required,
            secret=secret,
            secret_ref=secret_ref if isinstance(secret_ref, str) else None,
            default=default,
            enum=enum_list,
            scopes=scopes,
            description=description,
            state=state,
            deprecate_after=deprecate_after if isinstance(deprecate_after, str) else None,
            replacement=replacement if isinstance(replacement, str) else None,
            rename_from=rename_from,
        )

    # Validate rename_from mapping collisions / conflicts.
    rename_from_to: Dict[str, str] = {}
    for new_name, vdef in vars_out.items():
        if not vdef.rename_from:
            continue
        old = vdef.rename_from
        if old in rename_from_to and rename_from_to[old] != new_name:
            errors.append(f"Contract rename_from collision: {old} -> {rename_from_to[old]} and {new_name}")
        else:
            rename_from_to[old] = new_name

    for old, new in rename_from_to.items():
        old_def = vars_out.get(old)
        if old_def and old_def.state != "removed":
            errors.append(f"Contract rename_from conflict: {new} declares rename_from={old} but {old} exists and is not state='removed'")

    return vars_out, errors


def _rename_from_map(vars_def: Mapping[str, VarDef]) -> Dict[str, str]:
    return {v.rename_from: v.name for v in vars_def.values() if v.rename_from}


def canonicalize_values_for_env(
    vars_def: Mapping[str, VarDef],
    raw_values: Mapping[str, Any],
    *,
    env: str,
    source_path: Path,
) -> Tuple[Dict[str, Any], List[str], List[str]]:
    """Canonicalize values file keys using contract migration.rename_from.

    Returns (canonical_values, errors, warnings).
    """
    errors: List[str] = []
    warnings: List[str] = []
    out: Dict[str, Any] = {}

    rename_map = _rename_from_map(vars_def)

    for k, v in raw_values.items():
        if k in vars_def:
            vdef = vars_def[k]
            if not applicable(vdef, env):
                errors.append(f"Out-of-scope key in values file {source_path}: {k} (env={env})")
                continue
            if vdef.state == "removed":
                errors.append(f"Removed contract key set in values file {source_path}: {k}")
                continue
            if vdef.secret:
                errors.append(f"Values file must not include secret variable {k}: {source_path}")
                continue
            if vdef.state == "deprecated":
                msg = f"Deprecated contract key used in values file {source_path}: {k}"
                if vdef.deprecate_after:
                    msg += f" (deprecate_after={vdef.deprecate_after})"
                if vdef.replacement:
                    msg += f" (replacement={vdef.replacement})"
                warnings.append(msg)
            out[k] = v
            continue

        if k in rename_map:
            new_key = rename_map[k]
            if new_key in raw_values:
                errors.append(
                    f"Conflicting keys in values file {source_path}: both legacy {k} and new {new_key} are set. Remove {k}."
                )
                continue
            vdef = vars_def.get(new_key)
            if vdef is None:
                errors.append(f"Legacy key {k} maps to unknown contract key {new_key}: {source_path}")
                continue
            if not applicable(vdef, env):
                errors.append(f"Out-of-scope key in values file {source_path}: {k} -> {new_key} (env={env})")
                continue
            if vdef.state == "removed":
                errors.append(f"Legacy key {k} maps to removed contract key {new_key}: {source_path}")
                continue
            if vdef.secret:
                errors.append(f"Values file must not include secret variable {k} (renamed to {new_key}): {source_path}")
                continue
            warnings.append(f"Legacy key used in values file {source_path}: {k} -> {new_key} (migration.rename_from).")
            out[new_key] = v
            continue

        errors.append(f"Unknown key in values file {source_path}: {k}")

    return out, errors, warnings


def discover_envs(root: Path) -> List[str]:
    envs: set[str] = set()
    values_dir = root / "env" / "values"
    if values_dir.exists():
        for p in values_dir.glob("*.yaml"):
            envs.add(p.stem)
    secrets_dir = root / "env" / "secrets"
    if secrets_dir.exists():
        for p in secrets_dir.glob("*.ref.yaml"):
            envs.add(p.name.replace(".ref.yaml", ""))
    inventory_dir = root / "env" / "inventory"
    if inventory_dir.exists():
        for p in inventory_dir.glob("*.yaml"):
            envs.add(p.stem)
    return sorted(envs)


def load_values_file(path: Path) -> Tuple[Dict[str, Any], List[str]]:
    if not path.exists():
        return {}, []
    try:
        data = load_yaml(path)
    except Exception as e:
        return {}, [f"Failed to parse values file {path}: {e}"]
    if data is None:
        return {}, []
    if not isinstance(data, dict):
        return {}, [f"Values file {path} must be a mapping"]
    out: Dict[str, Any] = {}
    errors: List[str] = []
    for k, v in data.items():
        if not isinstance(k, str) or not ENV_VAR_RE.match(k):
            errors.append(f"Invalid key in values file {path}: {k!r}")
            continue
        out[k] = v
    return out, errors


def load_secrets_ref(path: Path) -> Tuple[Dict[str, Dict[str, Any]], List[str]]:
    if not path.exists():
        return {}, [f"Missing secret ref file: {path}"]
    try:
        data = load_yaml(path)
    except Exception as e:
        return {}, [f"Failed to parse secrets ref {path}: {e}"]

    if data is None:
        return {}, [f"Secrets ref {path} is empty"]

    # Preferred format: {version: 1, secrets: {name: {backend, ref, ...}}}
    if isinstance(data, dict) and "secrets" in data and isinstance(data["secrets"], dict):
        secrets = data["secrets"]
    elif isinstance(data, dict):
        # Back-compat: allow top-level mapping of secrets (ignore metadata keys like version)
        secrets = {k: v for k, v in data.items() if k not in {"version"}}
    else:
        return {}, [f"Secrets ref {path} must be a mapping"]

    out: Dict[str, Dict[str, Any]] = {}
    errors: List[str] = []
    for name, cfg in secrets.items():
        if not isinstance(name, str) or not name.strip():
            errors.append(f"Invalid secret name in {path}: {name!r}")
            continue
        if not isinstance(cfg, dict):
            errors.append(f"Secret {name} in {path}: definition must be a mapping")
            continue
        backend = cfg.get("backend")
        ref = cfg.get("ref")
        if not isinstance(backend, str) or not backend.strip():
            errors.append(f"Secret {name} in {path}: backend must be a non-empty string")
        if isinstance(backend, str) and backend.strip() == "bws":
            key = cfg.get("key")
            if (not isinstance(ref, str) or not ref.strip()) and (not isinstance(key, str) or not key.strip()):
                errors.append(f"Secret {name} in {path}: bws backend requires ref or key")
        else:
            if not isinstance(ref, str) or not ref.strip():
                errors.append(f"Secret {name} in {path}: ref must be a non-empty string")
        out[name] = cfg
    return out, errors


def applicable(v: VarDef, env: str) -> bool:
    return v.scopes is None or env in v.scopes


def type_check_value(v: VarDef, value: Any) -> Optional[str]:
    t = v.type
    if t == "string":
        return None if isinstance(value, str) else "expected string"
    if t == "url":
        return None if isinstance(value, str) else "expected url string"
    if t == "int":
        return None if isinstance(value, int) and not isinstance(value, bool) else "expected int"
    if t == "float":
        return None if isinstance(value, (int, float)) and not isinstance(value, bool) else "expected float"
    if t == "bool":
        return None if isinstance(value, bool) else "expected bool"
    if t == "json":
        return None if isinstance(value, (dict, list, str, int, float, bool)) else "expected json-like"
    if t == "enum":
        if not isinstance(value, str):
            return "expected enum string"
        if v.enum and value not in v.enum:
            return f"expected one of {v.enum}"
        return None
    return None


def resolve_secret(
    root: Path,
    env: str,
    secret_name: str,
    secret_cfg: Mapping[str, Any],
    *,
    policy_bws: Optional[Mapping[str, Any]] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Return (value, error). Never print value elsewhere."""
    backend = str(secret_cfg.get("backend", "")).strip()
    ref = str(secret_cfg.get("ref", "")).strip()

    if backend == "mock":
        # Read from env/.secrets-store/<env>/<name>
        store_path = root / "env" / ".secrets-store" / env / secret_name
        if not store_path.exists():
            return None, f"mock secret missing: create {store_path}"
        val = read_text(store_path)
        # Allow multiline but strip trailing newlines to keep .env stable.
        return val.rstrip("\n"), None

    if backend == "env":
        # Supported ref forms: env://VAR or env:VAR
        var = ref
        if ref.startswith("env://"):
            var = ref[len("env://") :]
        elif ref.startswith("env:"):
            var = ref[len("env:") :]
        var = var.strip()
        if not var:
            return None, f"env backend requires ref like env://VAR_NAME (got {ref!r})"
        val = os.getenv(var)
        if val is None:
            return None, f"missing environment variable for secret backend env: {var}"
        return val, None

    if backend == "file":
        # Supported ref forms: file:///abs/path or file:relative/path
        p = ref
        if ref.startswith("file://"):
            p = ref[len("file://") :]
        elif ref.startswith("file:"):
            p = ref[len("file:") :]
        p = p.strip()
        if not p:
            return None, f"file backend requires ref like file:///abs/path (got {ref!r})"
        path = Path(p)
        if not path.is_absolute():
            path = (root / path).resolve()
        if not path.exists():
            return None, f"file secret missing: {path}"
        val = read_text(path)
        return val.rstrip("\n"), None

    if backend == "bws":
        # Bitwarden Secrets Manager (bws CLI).
        #
        # Recommended config (avoid committing sensitive tokens):
        #   backend: bws
        #   project_name: "mr-common-dev"
        #   key: "project/dev/db/password"
        #
        # Alternative compact ref form:
        #   ref: "bws://<PROJECT_ID>?key=<SECRET_KEY>"
        cfg = _apply_bws_defaults(secret_cfg, policy_bws or {})
        project_id = cfg.get("project_id")
        project_name = cfg.get("project_name")
        key = cfg.get("key")

        if (not project_id or not isinstance(project_id, str)) and ref.startswith("bws://"):
            u = urlparse(ref)
            project_id = u.netloc
            q = parse_qs(u.query or "")
            k = q.get("key", [None])[0]
            if isinstance(k, str) and k.strip():
                key = k.strip()

        if not isinstance(key, str) or not key.strip():
            return None, "bws backend requires secret_cfg.key (or ref like bws://<PROJECT_ID>?key=<SECRET_KEY>)"
        key = key.strip()

        pid: Optional[str] = None
        if isinstance(project_id, str) and project_id.strip():
            pid = project_id.strip()
        elif isinstance(project_name, str) and project_name.strip():
            pid, err = _bws_project_id_by_name(project_name)
            if err:
                return None, err
        else:
            return None, "bws backend requires secret_cfg.project_id or secret_cfg.project_name"

        secrets, err = _bws_secrets_for_project(pid or "")
        if err:
            return None, err
        if not secrets or key not in secrets:
            return None, f"bws secret key not found in project_id={pid}: {key!r}"
        return secrets[key], None

    return None, f"unsupported secret backend: {backend!r} (supported: mock, env, file, bws)"


def redact_effective(vars_def: Mapping[str, VarDef], effective: Mapping[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in effective.items():
        var_def = vars_def.get(k)
        if var_def and var_def.secret:
            out[k] = "***REDACTED***"
        else:
            out[k] = v
    return out


def envfile_name_for(env: str) -> str:
    return ".env.local" if env == "dev" else f".env.{env}.local"


def write_env_file(path: Path, kv: Mapping[str, Any]) -> None:
    lines: List[str] = []
    lines.append("# Generated by env-localctl. Do not hand-edit; regenerate via env_localctl.py compile")
    lines.append(f"# Generated at: {utc_now_iso()}")
    lines.append("")
    for k in sorted(kv.keys()):
        v = kv[k]
        # Render scalars.
        if isinstance(v, bool):
            s = "true" if v else "false"
        elif v is None:
            s = ""
        elif isinstance(v, (dict, list)):
            s = json.dumps(v, separators=(",", ":"), ensure_ascii=False)
        else:
            s = str(v)
        lines.append(f"{k}={s}")
    content = "\n".join(lines) + "\n"

    path.write_text(content, encoding="utf-8")

    # chmod 600
    try:
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except Exception:
        # Best-effort; may fail on some FS.
        pass


def tcp_check(host: str, port: int, timeout_s: float) -> Tuple[bool, str]:
    start = time.time()
    try:
        sock = socket.create_connection((host, port), timeout=timeout_s)
        sock.close()
        ms = int((time.time() - start) * 1000)
        return True, f"reachable ({ms}ms)"
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def connectivity_report(vars_def: Mapping[str, VarDef], effective: Mapping[str, Any], env: str) -> Dict[str, Any]:
    results: Dict[str, Any] = {"env": env, "timestamp_utc": utc_now_iso(), "checks": []}

    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.type != "url":
            continue
        if name not in effective:
            continue
        value = effective[name]
        if not isinstance(value, str) or not value:
            continue

        parsed = urlparse(value)
        entry: Dict[str, Any] = {
            "var": name,
            "scheme": parsed.scheme,
            "secret": vdef.secret,
            "status": "UNKNOWN",
            "details": {},
        }

        if parsed.scheme.startswith("sqlite"):
            # sqlite:////abs/path or sqlite:///relative
            path = parsed.path
            # Normalize similar to the db skill.
            if path.startswith("//"):
                path = path[1:]
            elif path.startswith("/"):
                path = path[1:]
            if not path:
                entry["status"] = "FAIL"
                entry["details"] = {"error": "sqlite URL missing path"}
            else:
                fpath = Path("/" + path) if parsed.path.startswith("//") else Path(path)
                if not fpath.is_absolute():
                    fpath = (Path.cwd() / fpath).resolve()
                entry["status"] = "PASS" if fpath.exists() else "FAIL"
                entry["details"] = {"path": str(fpath), "exists": fpath.exists()}
            results["checks"].append(entry)
            continue

        # Network-style URLs: best-effort TCP check if host/port present.
        host = parsed.hostname
        port = parsed.port
        if host and port:
            ok, msg = tcp_check(host, int(port), timeout_s=1.5)
            entry["status"] = "PASS" if ok else "FAIL"
            entry["details"] = {"host": host, "port": int(port), "result": msg}
        else:
            entry["status"] = "SKIP"
            entry["details"] = {"note": "No host/port to TCP-check; parsed only."}

        results["checks"].append(entry)

    return results


def render_markdown_doctor(summary: Mapping[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Local Environment Doctor")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{summary.get('timestamp_utc')}`")
    lines.append(f"- Env: `{summary.get('env')}`")
    if summary.get("runtime_target"):
        lines.append(f"- Runtime target: `{summary.get('runtime_target')}`")
    if summary.get("workload"):
        lines.append(f"- Workload: `{summary.get('workload')}`")
    lines.append(f"- Status: **{summary.get('status')}**")
    lines.append("")

    if summary.get("errors"):
        lines.append("## Errors")
        for e in summary["errors"]:
            lines.append(f"- {e}")
        lines.append("")

    if summary.get("warnings"):
        lines.append("## Warnings")
        for w in summary["warnings"]:
            lines.append(f"- {w}")
        lines.append("")

    if summary.get("actions"):
        lines.append("## Next actions (minimal entry points)")
        for a in summary["actions"]:
            lines.append(f"- {a}")
        lines.append("")

    lines.append("## Details (redacted)")
    lines.append("```json")
    lines.append(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Do not paste secret values into chat.")
    lines.append("- Evidence files must not include secret values.")
    return "\n".join(lines) + "\n"


def render_markdown_compile(report: Mapping[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Local Environment Compile Report")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{report.get('timestamp_utc')}`")
    lines.append(f"- Env: `{report.get('env')}`")
    if report.get("runtime_target"):
        lines.append(f"- Runtime target: `{report.get('runtime_target')}`")
    if report.get("workload"):
        lines.append(f"- Workload: `{report.get('workload')}`")
    lines.append(f"- Status: **{report.get('status')}**")
    lines.append(f"- Env file: `{report.get('env_file')}`")
    lines.append(f"- Effective context: `{report.get('effective_context')}`")
    lines.append("")

    missing = list(report.get("missing") or [])
    errors = list(report.get("errors") or [])
    warnings = list(report.get("warnings") or [])
    missing_set = set(missing)
    extra_errors = [e for e in errors if e not in missing_set]

    if extra_errors:
        lines.append("## Errors")
        for e in extra_errors:
            lines.append(f"- {e}")
        lines.append("")

    if missing:
        lines.append("## Missing requirements")
        for k in missing:
            lines.append(f"- {k}")
        lines.append("")

    if warnings:
        lines.append("## Warnings")
        for w in warnings:
            lines.append(f"- {w}")
        lines.append("")

    lines.append("## Key summary (redacted)")
    lines.append("```json")
    lines.append(json.dumps(report.get("keys"), indent=2, sort_keys=True, ensure_ascii=False))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Secret values are written only to the local env file.")
    lines.append("- Do not commit the local env file.")
    return "\n".join(lines) + "\n"


def ensure_dirs(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def run_preflight(
    *,
    root: Path,
    env: str,
    runtime_target: str,
    workload: str,
    policy_path: Path,
    no_preflight: bool,
) -> Tuple[Optional[Dict[str, Any]], List[str], List[str]]:
    warnings: List[str] = []
    errors: List[str] = []
    runtime_target = normalize_runtime_target(runtime_target)

    if no_preflight:
        return (
            {"status": "SKIP", "reasons": ["preflight disabled via --no-preflight"]},
            warnings,
            errors,
        )

    policy, p_warns, p_errs = load_policy(policy_path)
    warnings.extend(p_warns)
    errors.extend(p_errs)
    if policy is None:
        return (
            {"status": "SKIP", "reasons": ["policy.yaml missing"], "policy_path": str(policy_path)},
            warnings,
            errors,
        )

    effective, w2, e2 = compute_effective_policy(
        policy,
        env=env,
        runtime_target=runtime_target,
        workload=workload,
    )
    warnings.extend(w2)
    errors.extend(e2)
    if e2:
        return (
            {
                "status": "FAIL",
                "reasons": e2,
                "policy_path": str(policy_path),
                "rule_ids": effective.get("rule_ids", []),
            },
            warnings,
            errors,
        )

    signals = detect_preflight_signals(effective.get("providers") or {})
    result, w3, e3 = evaluate_preflight(
        auth_mode=effective.get("auth_mode", "auto"),
        preflight_mode=effective.get("preflight_mode", "warn"),
        signals=signals,
        ak_fallback=effective.get("ak_fallback") or {},
        sts_bootstrap=effective.get("sts_bootstrap") or {},
        env=env,
        runtime_target=runtime_target,
        workload=workload,
        rule_ids=effective.get("rule_ids") or [],
        root=root,
        evidence_cfg=effective.get("evidence") or {},
    )
    warnings.extend(w3)
    errors.extend(e3)
    result["policy_path"] = str(policy_path)
    return result, warnings, errors


def cmd_doctor(
    root: Path,
    env: str,
    out: Optional[Path],
    *,
    runtime_target: str,
    workload: str,
    policy_path: Path,
    no_preflight: bool,
) -> int:
    ts = utc_now_iso()

    mode = get_ssot_mode(root)
    errors: List[str] = []
    warnings: List[str] = []
    actions: List[str] = []

    if mode != "repo-env-contract":
        errors.append("SSOT mode gate failed: docs/project/env-ssot.json must set mode=repo-env-contract")

    vars_def, contract_errors = parse_contract(root)
    errors.extend(contract_errors)

    values_path = root / "env" / "values" / f"{env}.yaml"
    local_values_path = root / "env" / "values" / f"{env}.local.yaml"
    values, v_err = load_values_file(values_path)
    local_values, lv_err = load_values_file(local_values_path)
    errors.extend(v_err)
    errors.extend(lv_err)

    values, v_err2, v_warn2 = canonicalize_values_for_env(vars_def, values, env=env, source_path=values_path)
    local_values, lv_err2, lv_warn2 = canonicalize_values_for_env(vars_def, local_values, env=env, source_path=local_values_path)
    errors.extend(v_err2)
    errors.extend(lv_err2)
    warnings.extend(v_warn2)
    warnings.extend(lv_warn2)

    secrets_ref, s_err = load_secrets_ref(root / "env" / "secrets" / f"{env}.ref.yaml")
    errors.extend(s_err)
    policy_bws = load_policy_bws_defaults(policy_path)

    missing_required: List[str] = []

    # Build a partial effective map without materializing secrets.
    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.state == "removed":
            continue

        if vdef.secret:
            # Need a ref and resolvable secret material.
            if not vdef.secret_ref:
                missing_required.append(f"{name} (secret_ref missing in contract)")
                continue
            ref_cfg = secrets_ref.get(vdef.secret_ref)
            if ref_cfg is None:
                missing_required.append(f"{name} (missing secret ref entry: {vdef.secret_ref} in env/secrets/{env}.ref.yaml)")
                continue
            # Try resolve but do not store in report.
            _val, err = resolve_secret(root, env, vdef.secret_ref, ref_cfg, policy_bws=policy_bws)
            if err:
                missing_required.append(f"{name} (secret material unavailable: {err})")
            continue

        # Non-secret: default or value.
        value: Any
        if name in local_values:
            value = local_values[name]
        elif name in values:
            value = values[name]
        else:
            value = vdef.default

        if vdef.required and (value is None or value == ""):
            missing_required.append(f"{name} (required; provide in env/values/{env}.yaml or env/values/{env}.local.yaml or contract default)")
            continue

        if value is not None:
            err = type_check_value(vdef, value)
            if err:
                errors.append(f"Type check failed for {name}: {err}")

    if missing_required:
        errors.extend(missing_required)

    preflight, pf_warns, pf_errs = run_preflight(
        root=root,
        env=env,
        runtime_target=runtime_target,
        workload=workload,
        policy_path=policy_path,
        no_preflight=no_preflight,
    )
    warnings.extend(pf_warns)
    errors.extend(pf_errs)

    # Minimal action pointers.
    if any("env/values" in e for e in missing_required):
        actions.append(f"Add missing non-secret values to env/values/{env}.local.yaml (developer-specific) or env/values/{env}.yaml (project-wide).")
    if any("secret" in e for e in missing_required):
        actions.append(f"Ensure env/secrets/{env}.ref.yaml contains the referenced secrets and provide secret material via approved backend (never via chat).")
        actions.append(f"For mock backend: create files under env/.secrets-store/{env}/<secret_name>.")

    status = "PASS" if not errors else "FAIL"
    summary = {
        "timestamp_utc": ts,
        "env": env,
        "runtime_target": runtime_target,
        "workload": workload,
        "status": status,
        "errors": errors,
        "warnings": warnings,
        "actions": actions,
        "preflight": preflight,
    }

    md = render_markdown_doctor(summary)
    if out:
        ensure_dirs(out)
        out.write_text(md, encoding="utf-8")
    else:
        print(md)

    return 0 if status == "PASS" else 1


def cmd_compile(
    root: Path,
    env: str,
    out: Optional[Path],
    *,
    no_write: bool = False,
    env_file: Optional[Path] = None,
    no_context: bool = False,
    runtime_target: str,
    workload: str,
    policy_path: Path,
    no_preflight: bool,
) -> int:
    ts = utc_now_iso()
    errors: List[str] = []
    missing: List[str] = []
    warnings: List[str] = []

    mode = get_ssot_mode(root)
    if mode != "repo-env-contract":
        errors.append("SSOT mode gate failed: docs/project/env-ssot.json must set mode=repo-env-contract")

    vars_def, contract_errors = parse_contract(root)
    errors.extend(contract_errors)

    values_path = root / "env" / "values" / f"{env}.yaml"
    local_values_path = root / "env" / "values" / f"{env}.local.yaml"
    values, v_err = load_values_file(values_path)
    local_values, lv_err = load_values_file(local_values_path)
    errors.extend(v_err)
    errors.extend(lv_err)

    values, v_err2, v_warn2 = canonicalize_values_for_env(vars_def, values, env=env, source_path=values_path)
    local_values, lv_err2, lv_warn2 = canonicalize_values_for_env(vars_def, local_values, env=env, source_path=local_values_path)
    errors.extend(v_err2)
    errors.extend(lv_err2)
    warnings.extend(v_warn2)
    warnings.extend(lv_warn2)

    secrets_ref, s_err = load_secrets_ref(root / "env" / "secrets" / f"{env}.ref.yaml")
    errors.extend(s_err)
    policy_bws = load_policy_bws_defaults(policy_path)

    effective: Dict[str, Any] = {}

    # Defaults first (non-secret only).
    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.state == "removed":
            continue
        if vdef.secret:
            continue
        if vdef.default is not None:
            effective[name] = vdef.default

    # Overlay values.
    for src, src_path in ((values, values_path), (local_values, local_values_path)):
        for k, v in src.items():
            vdef = vars_def.get(k)
            if vdef is None:
                continue
            t_err = type_check_value(vdef, v)
            if t_err:
                errors.append(f"Type check failed for {k} in {src_path}: {t_err}")
                continue
            effective[k] = v

    # Resolve secrets.
    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.state == "removed":
            continue
        if not vdef.secret:
            continue
        if not vdef.secret_ref:
            missing.append(f"{name} (missing secret_ref in contract)")
            continue
        ref_cfg = secrets_ref.get(vdef.secret_ref)
        if ref_cfg is None:
            missing.append(f"{name} (missing secret ref entry: {vdef.secret_ref} in env/secrets/{env}.ref.yaml)")
            continue
        val, err = resolve_secret(root, env, vdef.secret_ref, ref_cfg, policy_bws=policy_bws)
        if err:
            missing.append(f"{name} (secret material unavailable: {err})")
            continue
        effective[name] = val

    # Ensure required keys.
    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.state == "removed":
            continue
        if not vdef.required:
            continue
        if name not in effective or effective[name] in (None, ""):
            missing.append(f"{name} (required but missing)")

    if missing:
        errors.extend(missing)

    # Strongly prefer env selector to match.
    if "APP_ENV" in vars_def and applicable(vars_def["APP_ENV"], env) and vars_def["APP_ENV"].state != "removed":
        effective["APP_ENV"] = env

    preflight, pf_warns, pf_errs = run_preflight(
        root=root,
        env=env,
        runtime_target=runtime_target,
        workload=workload,
        policy_path=policy_path,
        no_preflight=no_preflight,
    )
    warnings.extend(pf_warns)
    errors.extend(pf_errs)

    status = "PASS" if not errors else "FAIL"

    env_file_name = envfile_name_for(env)
    env_file_path = env_file if env_file is not None else root / env_file_name
    if env_file_path and not env_file_path.is_absolute():
        env_file_path = (root / env_file_path).resolve()

    ctx_path = None if no_context else root / "docs" / "context" / "env" / f"effective-{env}.json"

    keys_summary: Dict[str, Any] = {}
    for k in sorted(effective.keys()):
        vdef = vars_def.get(k)
        keys_summary[k] = {
            "secret": bool(vdef.secret) if vdef else False,
            "present": True,
            "type": vdef.type if vdef else "unknown",
        }

    report = {
        "timestamp_utc": ts,
        "env": env,
        "runtime_target": runtime_target,
        "workload": workload,
        "status": status,
        "env_file": str(env_file_path),
        "effective_context": str(ctx_path) if ctx_path else "(skipped)",
        "missing": missing,
        "errors": errors,
        "warnings": warnings,
        "keys": keys_summary,
        "preflight": preflight,
    }

    if status == "PASS":
        if not no_write:
            write_env_file(env_file_path, effective)
        if ctx_path is not None:
            ensure_dirs(ctx_path)
            redacted = {
                "generated_at_utc": ts,
                "env": env,
                "values": redact_effective(vars_def, effective),
            }
            ctx_path.write_text(json.dumps(redacted, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")

    md = render_markdown_compile(report)
    if out:
        ensure_dirs(out)
        out.write_text(md, encoding="utf-8")
    else:
        print(md)

    return 0 if status == "PASS" else 1


def cmd_connectivity(
    root: Path,
    env: str,
    out: Optional[Path],
    *,
    runtime_target: str,
    workload: str,
    policy_path: Path,
    no_preflight: bool,
) -> int:
    # Use compile's effective env resolution but do not write env file.
    # We'll re-run compile logic with no_write and capture effective values.

    vars_def, contract_errors = parse_contract(root)
    if contract_errors:
        summary = {
            "timestamp_utc": utc_now_iso(),
            "env": env,
            "status": "FAIL",
            "errors": contract_errors,
        }
        md = "# Connectivity Smoke\n\n" + json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
        if out:
            ensure_dirs(out)
            out.write_text(md, encoding="utf-8")
        else:
            print(md)
        return 1

    # Reuse compile internals by building effective map in-memory.
    values_path = root / "env" / "values" / f"{env}.yaml"
    local_values_path = root / "env" / "values" / f"{env}.local.yaml"
    values, v_err = load_values_file(values_path)
    local_values, lv_err = load_values_file(local_values_path)
    secrets_ref, s_err = load_secrets_ref(root / "env" / "secrets" / f"{env}.ref.yaml")
    policy_bws = load_policy_bws_defaults(policy_path)

    errors: List[str] = []
    warnings: List[str] = []
    errors.extend(v_err)
    errors.extend(lv_err)
    errors.extend(s_err)

    values, v_err2, v_warn2 = canonicalize_values_for_env(vars_def, values, env=env, source_path=values_path)
    local_values, lv_err2, lv_warn2 = canonicalize_values_for_env(vars_def, local_values, env=env, source_path=local_values_path)
    errors.extend(v_err2)
    errors.extend(lv_err2)
    warnings.extend(v_warn2)
    warnings.extend(lv_warn2)

    effective: Dict[str, Any] = {}
    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.state == "removed":
            continue
        if vdef.secret:
            continue
        if vdef.default is not None:
            effective[name] = vdef.default

    for src in (values, local_values):
        for k, v in src.items():
            vdef = vars_def.get(k)
            if vdef is None:
                continue
            if vdef.secret or not applicable(vdef, env) or vdef.state == "removed":
                continue
            t_err = type_check_value(vdef, v)
            if t_err:
                errors.append(f"Type check failed for {k}: {t_err}")
                continue
            effective[k] = v

    for name, vdef in vars_def.items():
        if not applicable(vdef, env):
            continue
        if vdef.state == "removed":
            continue
        if not vdef.secret:
            continue
        if not vdef.secret_ref:
            continue
        ref_cfg = secrets_ref.get(vdef.secret_ref)
        if not ref_cfg:
            continue
        val, err = resolve_secret(root, env, vdef.secret_ref, ref_cfg, policy_bws=policy_bws)
        if err:
            errors.append(f"Secret unresolved for connectivity check: {name} ({err})")
            continue
        effective[name] = val

    preflight, pf_warns, pf_errs = run_preflight(
        root=root,
        env=env,
        runtime_target=runtime_target,
        workload=workload,
        policy_path=policy_path,
        no_preflight=no_preflight,
    )
    warnings.extend(pf_warns)
    errors.extend(pf_errs)

    report = connectivity_report(vars_def, effective, env)
    report["preflight"] = preflight
    status = "PASS" if not errors and all(c.get("status") in {"PASS", "SKIP"} for c in report.get("checks", [])) else "FAIL"

    md_lines: List[str] = []
    md_lines.append("# Connectivity Smoke")
    md_lines.append("")
    md_lines.append(f"- Timestamp (UTC): `{report.get('timestamp_utc')}`")
    md_lines.append(f"- Env: `{env}`")
    md_lines.append(f"- Runtime target: `{runtime_target}`")
    md_lines.append(f"- Workload: `{workload}`")
    md_lines.append(f"- Status: **{status}**")
    md_lines.append("")
    if errors:
        md_lines.append("## Errors")
        for e in errors:
            md_lines.append(f"- {e}")
        md_lines.append("")
    if warnings:
        md_lines.append("## Warnings")
        for w in warnings:
            md_lines.append(f"- {w}")
        md_lines.append("")

    md_lines.append("## Details (redacted)")
    md_lines.append("```json")
    md_lines.append(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False))
    md_lines.append("```")
    md_lines.append("")
    md_lines.append("## Notes")
    md_lines.append("- Secret values are not printed.")

    md = "\n".join(md_lines) + "\n"
    if out:
        ensure_dirs(out)
        out.write_text(md, encoding="utf-8")
    else:
        print(md)

    return 0 if status == "PASS" else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Local env controller (repo-env-contract)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_doc = sub.add_parser("doctor", help="Diagnose local env readiness and missing inputs.")
    p_doc.add_argument("--root", default=".", help="Project root")
    p_doc.add_argument("--env", default="dev", help="Environment name (default: dev)")
    p_doc.add_argument("--runtime-target", default="local", help="Runtime target (default: local; supports: local|ecs, 'remote' is alias)")
    p_doc.add_argument("--workload", default="api", help="Workload name (default: api)")
    p_doc.add_argument("--policy", default="docs/project/policy.yaml", help="Policy file path")
    p_doc.add_argument("--no-preflight", action="store_true", help="Disable policy preflight checks")
    p_doc.add_argument("--out", default=None, help="Write markdown report to file")

    p_comp = sub.add_parser("compile", help="Compile and write local env file and redacted effective context.")
    p_comp.add_argument("--root", default=".", help="Project root")
    p_comp.add_argument("--env", default="dev", help="Environment name (default: dev)")
    p_comp.add_argument("--runtime-target", default="local", help="Runtime target (default: local; supports: local|ecs, 'remote' is alias)")
    p_comp.add_argument("--workload", default="api", help="Workload name (default: api)")
    p_comp.add_argument("--policy", default="docs/project/policy.yaml", help="Policy file path")
    p_comp.add_argument("--no-preflight", action="store_true", help="Disable policy preflight checks")
    p_comp.add_argument("--env-file", default=None, help="Override output env file path")
    p_comp.add_argument("--no-context", action="store_true", help="Do not write docs/context/env/effective-<env>.json")
    p_comp.add_argument("--out", default=None, help="Write markdown report to file")
    p_comp.add_argument("--no-write", action="store_true", help="Do not write env file (still writes redacted context on PASS)")

    p_conn = sub.add_parser("connectivity", help="Best-effort connectivity smoke checks (redacted).")
    p_conn.add_argument("--root", default=".", help="Project root")
    p_conn.add_argument("--env", default="dev", help="Environment name (default: dev)")
    p_conn.add_argument("--runtime-target", default="local", help="Runtime target (default: local; supports: local|ecs, 'remote' is alias)")
    p_conn.add_argument("--workload", default="api", help="Workload name (default: api)")
    p_conn.add_argument("--policy", default="docs/project/policy.yaml", help="Policy file path")
    p_conn.add_argument("--no-preflight", action="store_true", help="Disable policy preflight checks")
    p_conn.add_argument("--out", default=None, help="Write markdown report to file")

    args = parser.parse_args()
    root = Path(args.root).resolve()
    out = Path(args.out).resolve() if getattr(args, "out", None) else None

    def _resolve_policy(p: str) -> Path:
        pol = Path(p)
        if not pol.is_absolute():
            pol = (root / pol).resolve()
        return pol

    runtime_target = normalize_runtime_target(args.runtime_target)

    if args.cmd == "doctor":
        return cmd_doctor(
            root,
            args.env,
            out,
            runtime_target=runtime_target,
            workload=args.workload,
            policy_path=_resolve_policy(args.policy),
            no_preflight=bool(args.no_preflight),
        )
    if args.cmd == "compile":
        env_file = Path(args.env_file) if args.env_file else None
        return cmd_compile(
            root,
            args.env,
            out,
            no_write=bool(args.no_write),
            env_file=env_file,
            no_context=bool(args.no_context),
            runtime_target=runtime_target,
            workload=args.workload,
            policy_path=_resolve_policy(args.policy),
            no_preflight=bool(args.no_preflight),
        )
    if args.cmd == "connectivity":
        return cmd_connectivity(
            root,
            args.env,
            out,
            runtime_target=runtime_target,
            workload=args.workload,
            policy_path=_resolve_policy(args.policy),
            no_preflight=bool(args.no_preflight),
        )

    print(f"Unknown command: {args.cmd}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
