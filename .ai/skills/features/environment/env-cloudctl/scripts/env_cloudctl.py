#!/usr/bin/env python3
"""Cloud environment controller (adapter-based; mockcloud included).

This script provides deterministic plan/apply/verify workflows for environment
configuration under the repo-env-contract SSOT model.

It is intentionally conservative:
  - Never prints secret values.
  - Applies config only with an explicit `--approve` flag.
  - Treats IAM/Identity changes as out-of-scope for automatic apply.

Supported providers:
  - mockcloud: uses local filesystem state for offline tests/demos.
  - ecs-envfile/envfile: injects a prebuilt env file via local copy or ssh/scp (deploy machine).

Exit codes:
  - 0: success
  - 1: failure
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
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

import yaml_min

ALLOWED_TYPES = {"string", "int", "float", "bool", "json", "enum", "url"}
LIFECYCLE_STATES = {"active", "deprecated", "removed"}
_DATE_YYYY_MM_DD_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ENV_VAR_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_yaml(path: Path) -> Any:
    return yaml_min.safe_load(path.read_text(encoding="utf-8"))


def resolve_path(root: Path, raw: str) -> Path:
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = (root / path).resolve()
    return path


def normalize_runtime_target(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    target = str(value or "").strip().lower()
    if target == "remote":
        # Backward-compatible alias: remote -> ecs
        return "ecs"
    return target


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def file_meta(path: Path) -> Dict[str, Any]:
    st = path.stat()
    return {
        "sha256": sha256_file(path),
        "size": int(st.st_size),
        "mtime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(st.st_mtime)),
    }


def sha256_text(text: str) -> str:
    h = hashlib.sha256()
    h.update(text.encode("utf-8"))
    return h.hexdigest()


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def ensure_ssot_mode(root: Path) -> None:
    gate = root / "docs" / "project" / "env-ssot.json"
    if not gate.exists():
        die(f"Missing SSOT gate file: {gate}")
    data = load_json(gate)
    mode = None
    if isinstance(data, dict):
        mode = data.get("mode") or data.get("env_ssot")
    if mode != "repo-env-contract":
        die(f"SSOT mode must be 'repo-env-contract', got: {mode!r}")


@dataclass
class ContractVar:
    name: str
    vtype: str
    required: bool
    default: Any
    description: str
    secret: bool
    secret_ref: Optional[str]
    scopes: Optional[List[str]]
    state: str  # active|deprecated|removed
    deprecate_after: Optional[str]
    replacement: Optional[str]
    rename_from: Optional[str]


def parse_contract(root: Path) -> Tuple[List[ContractVar], List[str]]:
    contract_path = root / "env" / "contract.yaml"
    if not contract_path.exists():
        die(f"Missing contract file: {contract_path}")

    raw = load_yaml(contract_path)
    if not isinstance(raw, dict):
        die("env/contract.yaml must be a YAML mapping")

    variables = raw.get("variables")
    if not isinstance(variables, dict):
        die("env/contract.yaml must contain 'variables' mapping")

    envs: List[str] = []
    if isinstance(raw.get("environments"), list):
        envs = [str(e) for e in raw.get("environments") if str(e).strip()]

    out: List[ContractVar] = []
    for name, meta in variables.items():
        if not isinstance(name, str):
            continue
        if not ENV_VAR_RE.match(name):
            die(f"Invalid env var name in contract: {name!r}")
        if not isinstance(meta, dict):
            die(f"Contract var '{name}' must be a mapping")

        vtype = str(meta.get("type") or "").strip()
        if vtype not in ALLOWED_TYPES:
            die(f"Contract var '{name}' has unsupported type: {vtype!r}")

        # Lifecycle (backward compatible):
        # - preferred: state: active|deprecated|removed
        # - legacy: deprecated: true
        state_raw = meta.get("state")
        deprecated_raw = meta.get("deprecated")
        state: str
        if isinstance(state_raw, str) and state_raw.strip():
            state = state_raw.strip()
        elif deprecated_raw is True:
            state = "deprecated"
        else:
            state = "active"
        if state not in LIFECYCLE_STATES:
            die(f"Contract var '{name}' has invalid state: {state!r} (allowed: {sorted(LIFECYCLE_STATES)})")
        if deprecated_raw is True and state != "deprecated":
            die(f"Contract var '{name}' sets deprecated=true but state={state!r}")

        deprecate_after = meta.get("deprecate_after")
        if deprecate_after is not None:
            if not isinstance(deprecate_after, str) or not _DATE_YYYY_MM_DD_RE.match(deprecate_after.strip()):
                die(f"Contract var '{name}' deprecate_after must be YYYY-MM-DD if present")
            if state != "deprecated":
                die(f"Contract var '{name}' deprecate_after is only valid when state='deprecated'")
            deprecate_after = deprecate_after.strip()

        replacement = meta.get("replacement")
        replaced_by = meta.get("replaced_by")
        if replacement is None and replaced_by is not None:
            replacement = replaced_by
        if replacement is not None:
            if not isinstance(replacement, str) or not ENV_VAR_RE.match(replacement):
                die(f"Contract var '{name}' replacement must be a valid env var name if present")
            if state != "deprecated":
                die(f"Contract var '{name}' replacement is only valid when state='deprecated'")

        rename_from: Optional[str] = None
        migration = meta.get("migration")
        if migration is not None:
            if not isinstance(migration, dict):
                die(f"Contract var '{name}' migration must be a mapping if present")
            rf = migration.get("rename_from")
            if rf is not None:
                if not isinstance(rf, str) or not ENV_VAR_RE.match(rf):
                    die(f"Contract var '{name}' migration.rename_from must be a valid env var name if present")
                if rf == name:
                    die(f"Contract var '{name}' migration.rename_from must not equal the var name")
                rename_from = rf

        required = bool(meta.get("required", False))
        default = meta.get("default")
        description = str(meta.get("description") or "").strip()

        secret = bool(meta.get("secret", False))
        secret_ref = meta.get("secret_ref")
        if secret:
            if not isinstance(secret_ref, str) or not secret_ref.strip():
                die(f"Contract var '{name}' is secret but missing secret_ref")
            if "default" in meta:
                die(f"Contract var '{name}' is secret and must not define a default")
        else:
            secret_ref = None

        scopes = meta.get("scopes")
        if scopes is not None:
            if not isinstance(scopes, list) or any(not isinstance(s, (str, int)) for s in scopes):
                die(f"Contract var '{name}': scopes must be a list of env names")
            scopes = [str(s) for s in scopes]

        out.append(
            ContractVar(
                name=name,
                vtype=vtype,
                required=required,
                default=default,
                description=description,
                secret=secret,
                secret_ref=secret_ref,
                scopes=scopes,
                state=state,
                deprecate_after=deprecate_after if isinstance(deprecate_after, str) else None,
                replacement=replacement if isinstance(replacement, str) else None,
                rename_from=rename_from,
            )
        )

    # Validate rename_from collisions / conflicts.
    rename_from_to: Dict[str, str] = {}
    by_name = {v.name: v for v in out}
    for v in out:
        if not v.rename_from:
            continue
        old = v.rename_from
        if old in rename_from_to and rename_from_to[old] != v.name:
            die(f"Contract rename_from collision: {old} -> {rename_from_to[old]} and {v.name}")
        rename_from_to[old] = v.name

    for old, new in rename_from_to.items():
        old_def = by_name.get(old)
        if old_def and old_def.state != "removed":
            die(f"Contract rename_from conflict: {new} declares rename_from={old} but {old} exists and is not state='removed'")

    return out, envs


def is_in_scope(var: ContractVar, env: str) -> bool:
    return var.scopes is None or env in var.scopes



def type_check_value(var: ContractVar, value: Any) -> Optional[str]:
    t = var.vtype
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
        # Enum options are validated in contractctl/localctl; keep cloudctl light.
        return None
    return None


def load_values(root: Path, env: str) -> Dict[str, Any]:
    values_path = root / "env" / "values" / f"{env}.yaml"
    if not values_path.exists():
        return {}
    data = load_yaml(values_path)
    if data is None:
        return {}
    if not isinstance(data, dict):
        die(f"Values file must be a mapping: {values_path}")
    out: Dict[str, Any] = {}
    for k, v in data.items():
        if not isinstance(k, str) or not ENV_VAR_RE.match(k):
            die(f"Invalid key in values file {values_path}: {k!r}")
        out[k] = v
    return out


def load_secrets_ref(root: Path, env: str) -> Dict[str, Dict[str, Any]]:
    ref_path = root / "env" / "secrets" / f"{env}.ref.yaml"
    if not ref_path.exists():
        die(f"Missing secrets ref file: {ref_path}")
    data = load_yaml(ref_path)
    if not isinstance(data, dict):
        die(f"Secrets ref file must be a mapping: {ref_path}")
    secrets = data.get("secrets")
    if secrets is None:
        # allow legacy: top-level mapping
        secrets = {k: v for k, v in data.items() if k != "version"}
    if not isinstance(secrets, dict):
        die(f"Secrets ref file must have 'secrets' mapping: {ref_path}")

    out: Dict[str, Dict[str, Any]] = {}
    for name, meta in secrets.items():
        if not isinstance(name, str):
            continue
        if not isinstance(meta, dict):
            die(f"Secret ref '{name}' must be a mapping in {ref_path}")
        if "value" in meta:
            die(f"Secret ref '{name}' must not include secret values (found 'value' key) in {ref_path}")

        backend = str(meta.get("backend") or "").strip()
        if not backend:
            die(f"Secret ref '{name}' must specify backend in {ref_path}")

        ref = str(meta.get("ref") or "").strip()

        if backend in {"mock", "env", "file"}:
            if not ref:
                die(f"Secret ref '{name}' backend '{backend}' must specify a non-empty ref in {ref_path}")
        elif backend == "bws":
            # Bitwarden Secrets Manager:
            # - allow compact ref: bws://<PROJECT_ID>?key=<SECRET_KEY>
            # - or explicit fields: (project_id|project_name) + key
            key = meta.get("key")
            project_id = meta.get("project_id")
            project_name = meta.get("project_name")
            has_key = isinstance(key, str) and bool(key.strip())
            has_pid = isinstance(project_id, str) and bool(project_id.strip())
            has_pname = isinstance(project_name, str) and bool(project_name.strip())
            if not ref and not has_key:
                die(
                    f"Secret ref '{name}' backend 'bws' requires either ref (bws://...) "
                    f"or a key (policy may provide project_id/project_name) in {ref_path}"
                )
        else:
            # Unknown backend: require ref so the reference remains actionable.
            if not ref:
                die(f"Secret ref '{name}' backend '{backend}' must specify a non-empty ref in {ref_path}")

        normalized: Dict[str, Any] = {k: v for k, v in meta.items() if k != "backend"}
        if "ref" in meta or ref:
            normalized["ref"] = ref
        out[name] = {"backend": backend, **normalized}

    return out


def load_inventory(root: Path, env: str) -> Dict[str, Any]:
    inv_path = root / "env" / "inventory" / f"{env}.yaml"
    if not inv_path.exists():
        die(f"Missing inventory file: {inv_path}")
    data = load_yaml(inv_path)
    if not isinstance(data, dict):
        die(f"Inventory file must be a mapping: {inv_path}")
    # Minimal required field
    provider = data.get("provider")
    if not isinstance(provider, str) or not provider.strip():
        die(f"Inventory must include a provider string: {inv_path}")
    return data


def load_policy(root: Path) -> Optional[Dict[str, Any]]:
    policy_path = root / "docs" / "project" / "policy.yaml"
    if not policy_path.exists():
        return None
    data = load_yaml(policy_path)
    if not isinstance(data, dict):
        die(f"Policy file must be a YAML mapping: {policy_path}")
    return data


def deep_merge_dicts(base: Mapping[str, Any], override: Mapping[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = dict(base or {})
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge_dicts(out[k], v)
        else:
            out[k] = v
    return out


def _match_value(expected: Any, actual: Optional[str]) -> bool:
    if expected is None:
        return True
    if isinstance(expected, str):
        if expected.strip() in {"*", "any"}:
            return True
        return actual is not None and str(actual) == expected
    if isinstance(expected, list):
        if actual is None:
            return False
        return str(actual) in {str(x) for x in expected if x is not None}
    return False


def _match_specificity(match: Mapping[str, Any]) -> int:
    score = 0
    for key in ("env", "runtime_target", "workload"):
        v = match.get(key)
        if v is None:
            continue
        if isinstance(v, str) and v.strip() in {"*", "any"}:
            continue
        if isinstance(v, list) and len(v) == 0:
            continue
        score += 1
    return score


def _match_cloud_target(match: Mapping[str, Any], env: str, runtime_target: Optional[str], workload: Optional[str]) -> Tuple[bool, int]:
    if not _match_value(match.get("env"), env):
        return False, 0
    if not _match_value(match.get("runtime_target"), runtime_target):
        return False, 0
    if not _match_value(match.get("workload"), workload):
        return False, 0
    return True, _match_specificity(match)


def _format_template(value: str, *, env: str, workload: Optional[str]) -> str:
    out = str(value or "")
    if "{env}" in out:
        out = out.replace("{env}", env)
    if "{workload}" in out:
        if not workload:
            die("Template value uses {workload} but workload was not provided.")
        out = out.replace("{workload}", workload)
    return out


def _policy_env_cloud(policy: Mapping[str, Any]) -> Optional[Mapping[str, Any]]:
    root = policy.get("policy") if isinstance(policy.get("policy"), dict) else {}
    env_policy = root.get("env") if isinstance(root, dict) else {}
    if not isinstance(env_policy, dict):
        return None
    cloud = env_policy.get("cloud")
    return cloud if isinstance(cloud, dict) else None


def _resolve_cloud_target_from_policy(
    policy: Mapping[str, Any], *, env: str, runtime_target: Optional[str], workload: Optional[str]
) -> Tuple[Optional[Mapping[str, Any]], Optional[str]]:
    cloud = _policy_env_cloud(policy)
    if not cloud:
        return None, None
    targets = cloud.get("targets")
    if not isinstance(targets, list) or not targets:
        return None, None

    defaults = cloud.get("defaults") if isinstance(cloud.get("defaults"), dict) else {}

    matches: List[Tuple[int, int, Mapping[str, Any]]] = []
    for idx, target in enumerate(targets):
        if not isinstance(target, dict):
            continue
        match = target.get("match") if isinstance(target.get("match"), dict) else {}
        ok, spec = _match_cloud_target(match, env, runtime_target, workload)
        if ok:
            matches.append((spec, idx, target))

    if not matches:
        return None, None

    max_spec = max(m[0] for m in matches)
    selected = [m for m in matches if m[0] == max_spec]
    if len(selected) > 1:
        ids = [str(t.get("id") or f"index:{idx}") for _, idx, t in selected]
        die(f"policy.env.cloud.targets conflict for env={env}: {ids}")

    _, _, target = selected[0]
    set_block = target.get("set")
    if not isinstance(set_block, dict):
        die("policy.env.cloud.targets[].set must be a mapping")

    merged = deep_merge_dicts(defaults, set_block)
    return merged, str(target.get("id") or "")


def _build_envfile_injection_from_policy(merged: Mapping[str, Any], *, env: str, workload: Optional[str]) -> Dict[str, Any]:
    injection = merged.get("injection") if isinstance(merged.get("injection"), dict) else {}
    if injection is None:
        injection = {}
    if not isinstance(injection, dict):
        die("policy.env.cloud.targets[].set.injection must be a mapping if provided")

    out: Dict[str, Any] = dict(injection)

    env_file = out.get("env_file") or merged.get("env_file") or merged.get("env_file_source")
    if not isinstance(env_file, str) or not env_file.strip():
        die("policy.env.cloud.targets requires env_file or env_file_source for envfile injection")
    out["env_file"] = _format_template(env_file, env=env, workload=workload)

    mode = out.get("mode") or merged.get("mode") or "copy"
    out["mode"] = str(mode).strip()

    transport = out.get("transport") or merged.get("transport")
    if not transport:
        transport = "ssh" if ("ssh" in out or "ssh" in merged) else "local"
    out["transport"] = str(transport).strip()

    write_block: Dict[str, Any] = {}
    if isinstance(merged.get("write"), dict):
        write_block = deep_merge_dicts(write_block, merged.get("write"))
    if isinstance(out.get("write"), dict):
        write_block = deep_merge_dicts(write_block, out.get("write"))
    if write_block:
        out["write"] = write_block

    target = out.get("target") or merged.get("target")
    if isinstance(target, str) and target.strip():
        target = _format_template(target, env=env, workload=workload)
    else:
        target = None

    if not target:
        deploy_dir = merged.get("deploy_dir")
        env_file_name = merged.get("env_file_name") or "{env}.env"
        if isinstance(deploy_dir, str) and deploy_dir.strip():
            target = str(Path(deploy_dir) / _format_template(str(env_file_name), env=env, workload=workload))

    if not target and out["transport"] == "local":
        target = out["env_file"]

    if not target and out["transport"] == "ssh":
        die("policy.env.cloud.targets requires target or deploy_dir + env_file_name when transport=ssh")

    if target:
        out["target"] = str(target)

    ssh_cfg = None
    if isinstance(merged.get("ssh"), dict):
        ssh_cfg = deep_merge_dicts(ssh_cfg or {}, merged.get("ssh"))
    if isinstance(out.get("ssh"), dict):
        ssh_cfg = deep_merge_dicts(ssh_cfg or {}, out.get("ssh"))
    if ssh_cfg:
        if "host" in ssh_cfg and "hosts" not in ssh_cfg:
            host = ssh_cfg.pop("host")
            if isinstance(host, str) and host.strip():
                ssh_cfg["hosts"] = [host.strip()]
        out["ssh"] = ssh_cfg

    if out["transport"] == "ssh" and "ssh" not in out:
        die("policy.env.cloud.targets requires ssh config when transport=ssh")

    return out


def _build_inventory_from_policy(merged: Mapping[str, Any], *, env: str, workload: Optional[str]) -> Dict[str, Any]:
    if not isinstance(merged, dict):
        die("policy.env.cloud.targets[].set must resolve to a mapping")

    inv: Dict[str, Any] = {"version": 1, "env": env}

    provider = merged.get("provider") or "envfile"
    if isinstance(provider, str) and provider.strip().lower() == "ssh":
        provider = "envfile"
        merged = {**merged, "transport": merged.get("transport") or "ssh"}
    inv["provider"] = provider

    if merged.get("runtime") is not None:
        inv["runtime"] = merged.get("runtime")

    needs_envfile = provider in {"envfile", "ecs-envfile"} or any(
        key in merged for key in ("injection", "env_file", "env_file_source", "env_file_name", "transport", "ssh")
    )
    if needs_envfile:
        inv["injection"] = _build_envfile_injection_from_policy(merged, env=env, workload=workload)

    # Pass through extra metadata keys (non-reserved) for diagnostics.
    reserved = {
        "provider",
        "runtime",
        "injection",
        "env_file",
        "env_file_source",
        "env_file_name",
        "deploy_dir",
        "target",
        "transport",
        "write",
        "ssh",
        "mode",
    }
    for k, v in merged.items():
        if k in reserved or k in inv:
            continue
        inv[k] = v

    return inv


def resolve_cloud_inventory(
    root: Path,
    *,
    env: str,
    runtime_target: Optional[str],
    workload: Optional[str],
) -> Tuple[Dict[str, Any], List[str]]:
    notes: List[str] = []
    policy = load_policy(root)
    if policy:
        cloud_cfg = _policy_env_cloud(policy)
        require_target = bool(cloud_cfg.get("require_target")) if isinstance(cloud_cfg, dict) else False
        merged, target_id = _resolve_cloud_target_from_policy(policy, env=env, runtime_target=runtime_target, workload=workload)
        if merged is not None:
            inv = _build_inventory_from_policy(merged, env=env, workload=workload)
            label = target_id or "unnamed-target"
            notes.append(f"cloud routing resolved from policy.yaml target: {label}")
            return inv, notes
        if require_target:
            die(
                "policy.env.cloud.require_target is true but no target matched for "
                f"env={env}, runtime_target={runtime_target}, workload={workload}"
            )
        notes.append("no matching policy.env.cloud.targets; fallback to env/inventory")

    inv = load_inventory(root, env)
    return inv, notes


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


def _apply_bws_defaults_to_secrets(
    secrets_ref: Dict[str, Dict[str, Any]], policy: Optional[Mapping[str, Any]]
) -> Dict[str, Dict[str, Any]]:
    if not policy:
        return secrets_ref
    defaults = _policy_bws_defaults(policy)
    if not defaults:
        return secrets_ref
    out: Dict[str, Dict[str, Any]] = {}
    for name, meta in secrets_ref.items():
        if meta.get("backend") == "bws":
            out[name] = _apply_bws_defaults(meta, defaults)
        else:
            out[name] = meta
    return out
def parse_envfile_config(root: Path, inv: Mapping[str, Any]) -> Dict[str, Any]:
    injection = inv.get("injection")
    if not isinstance(injection, dict):
        die("Inventory 'injection' mapping is required for envfile-based providers.")

    env_file = injection.get("env_file")
    if not isinstance(env_file, str) or not env_file.strip():
        die("Inventory injection.env_file is required for envfile-based providers.")

    mode = str(injection.get("mode") or "copy").strip()
    if mode not in {"copy", "noop"}:
        die("Inventory injection.mode must be one of: copy | noop")

    target = injection.get("target")
    if target is not None and (not isinstance(target, str) or not target.strip()):
        die("Inventory injection.target must be a non-empty string if provided.")

    source_path = resolve_path(root, env_file.strip())
    target_path = resolve_path(root, target.strip()) if isinstance(target, str) else source_path

    transport = injection.get("transport")
    if not transport:
        transport = "ssh" if "ssh" in injection else "local"
    transport = str(transport).strip()
    if transport not in {"local", "ssh"}:
        die("Inventory injection.transport must be one of: local | ssh")

    ssh_cfg = None
    if transport == "ssh":
        if not isinstance(target, str) or not target.strip():
            die("Inventory injection.target is required when injection.transport=ssh.")
        if not str(target).strip().startswith("/"):
            die("Inventory injection.target must be an absolute remote path when injection.transport=ssh (must start with '/').")
        ssh_block = injection.get("ssh")
        if not isinstance(ssh_block, dict):
            die("Inventory injection.ssh mapping is required when transport=ssh.")
        ssh_cfg = parse_ssh_config(root, ssh_block)

    write_block = injection.get("write") or {}
    if not isinstance(write_block, dict):
        die("Inventory injection.write must be a mapping if provided.")

    sudo = bool(write_block.get("sudo")) if "sudo" in write_block else False
    chmod = str(write_block.get("chmod") or "600").strip()
    if not chmod.isdigit():
        die("Inventory injection.write.chmod must be a numeric string like '600' or '0640' if provided.")
    remote_tmp_dir = str(write_block.get("remote_tmp_dir") or "/tmp").strip()
    if not remote_tmp_dir:
        die("Inventory injection.write.remote_tmp_dir must be a non-empty string if provided.")

    return {
        "mode": mode,
        "transport": transport,
        "source": str(source_path),
        "target": str(target_path),
        "ssh": ssh_cfg,
        "write": {"sudo": sudo, "chmod": chmod, "remote_tmp_dir": remote_tmp_dir},
    }


def normalize_hosts(hosts: Sequence[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for h in hosts:
        if not isinstance(h, str):
            continue
        name = h.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


def load_hosts_from_file(path: Path) -> List[str]:
    if not path.exists():
        die(f"Hosts file not found: {path}")
    raw_text = path.read_text(encoding="utf-8")
    try:
        parsed = yaml_min.safe_load(raw_text)
    except Exception:
        parsed = None

    if isinstance(parsed, list):
        return normalize_hosts([str(x) for x in parsed])
    if isinstance(parsed, dict) and isinstance(parsed.get("hosts"), list):
        return normalize_hosts([str(x) for x in parsed.get("hosts")])

    # Fallback: treat as newline-separated text file.
    lines = [line.strip() for line in raw_text.splitlines() if line.strip() and not line.strip().startswith("#")]
    return normalize_hosts(lines)


def parse_ssh_config(root: Path, ssh: Mapping[str, Any]) -> Dict[str, Any]:
    hosts: List[str] = []
    if isinstance(ssh.get("hosts"), list):
        hosts.extend([str(x) for x in ssh.get("hosts")])

    hosts_file = ssh.get("hosts_file")
    if hosts_file is not None:
        if not isinstance(hosts_file, str) or not hosts_file.strip():
            die("ssh.hosts_file must be a non-empty string if provided.")
        hosts_path = resolve_path(root, hosts_file.strip())
        hosts.extend(load_hosts_from_file(hosts_path))

    hosts = normalize_hosts(hosts)
    if not hosts:
        die("ssh.hosts or ssh.hosts_file must provide at least one host.")

    port = ssh.get("port")
    if port is not None:
        try:
            port = int(port)
        except Exception:
            die("ssh.port must be an integer if provided.")

    user = ssh.get("user")
    if user is not None and (not isinstance(user, str) or not user.strip()):
        die("ssh.user must be a non-empty string if provided.")

    identity_file = ssh.get("identity_file")
    if identity_file is not None and (not isinstance(identity_file, str) or not identity_file.strip()):
        die("ssh.identity_file must be a non-empty string if provided.")

    known_hosts = ssh.get("known_hosts")
    if known_hosts is not None and (not isinstance(known_hosts, str) or not known_hosts.strip()):
        die("ssh.known_hosts must be a non-empty string if provided.")

    strict = ssh.get("strict_host_key_checking")
    if strict is None:
        strict = True
    strict = bool(strict)

    options = ssh.get("options") or []
    if isinstance(options, str):
        options = [options]
    if not isinstance(options, list) or any(not isinstance(x, str) for x in options):
        die("ssh.options must be a list of strings if provided.")

    pre_cmds = ssh.get("pre_commands") or []
    if isinstance(pre_cmds, str):
        pre_cmds = [pre_cmds]
    if not isinstance(pre_cmds, list) or any(not isinstance(x, str) for x in pre_cmds):
        die("ssh.pre_commands must be a list of strings if provided.")

    post_cmds = ssh.get("post_commands") or []
    if isinstance(post_cmds, str):
        post_cmds = [post_cmds]
    if not isinstance(post_cmds, list) or any(not isinstance(x, str) for x in post_cmds):
        die("ssh.post_commands must be a list of strings if provided.")

    connect_timeout = ssh.get("connect_timeout")
    if connect_timeout is not None:
        try:
            connect_timeout = int(connect_timeout)
        except Exception:
            die("ssh.connect_timeout must be an integer if provided.")

    return {
        "hosts": hosts,
        "user": user.strip() if isinstance(user, str) else None,
        "port": port,
        "identity_file": str(resolve_path(root, identity_file.strip())) if isinstance(identity_file, str) else None,
        "known_hosts": str(resolve_path(root, known_hosts.strip())) if isinstance(known_hosts, str) else None,
        "strict_host_key_checking": strict,
        "options": options,
        "pre_commands": pre_cmds,
        "post_commands": post_cmds,
        "connect_timeout": connect_timeout,
    }


def ssh_meta(ssh: Optional[Mapping[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(ssh, dict):
        return None
    hosts = ssh.get("hosts") or []
    hosts = [str(h) for h in hosts if isinstance(h, str)]
    digest = sha256_text("\n".join(hosts) + ("\n" if hosts else ""))
    return {
        "user": ssh.get("user"),
        "port": ssh.get("port"),
        "strict_host_key_checking": ssh.get("strict_host_key_checking"),
        "host_count": len(hosts),
        "hosts_digest": digest,
    }


def build_envfile_meta(root: Path, inv: Mapping[str, Any], require_exists: bool) -> Tuple[Dict[str, Any], List[str]]:
    warnings: List[str] = []
    cfg = parse_envfile_config(root, inv)
    source = Path(cfg["source"])
    if not source.exists():
        if require_exists:
            die(f"Env file missing: {source}. Generate it first (env-localctl compile --env-file ...).")
        warnings.append(f"Env file missing: {source} (generate with env-localctl compile --env-file ...)")
        return {**cfg, "missing": True}, warnings

    meta = file_meta(source)
    envfile_meta = {k: cfg.get(k) for k in ("mode", "transport", "source", "target")}
    if cfg.get("transport") == "ssh":
        envfile_meta["ssh"] = ssh_meta(cfg.get("ssh"))
    return {**envfile_meta, **meta}, warnings


@dataclass
class DesiredState:
    env: str
    provider: str
    runtime: Optional[str]
    runtime_target: Optional[str]
    workload: Optional[str]
    config: Dict[str, Any]  # non-secret values
    secrets: Dict[str, Dict[str, Any]]  # secret refs only
    var_to_secret_ref: Dict[str, str]  # variable name -> secret_ref
    env_file: Optional[Dict[str, Any]]  # env file metadata (redacted)
    warnings: List[str]  # non-fatal issues (e.g., deprecated/legacy keys)
    notes: List[str]  # informational notes (e.g., routing source)


def build_desired_state(
    root: Path,
    env: str,
    *,
    runtime_target: Optional[str] = None,
    workload: Optional[str] = None,
) -> DesiredState:
    ensure_ssot_mode(root)
    runtime_target = normalize_runtime_target(runtime_target)
    contract_vars, _contract_envs = parse_contract(root)
    policy = load_policy(root)
    inv, notes = resolve_cloud_inventory(root, env=env, runtime_target=runtime_target, workload=workload)

    values = load_values(root, env)
    secrets_ref = load_secrets_ref(root, env)
    secrets_ref = _apply_bws_defaults_to_secrets(secrets_ref, policy)

    values_path = root / "env" / "values" / f"{env}.yaml"

    provider = str(inv.get("provider"))
    runtime = inv.get("runtime")
    runtime = str(runtime) if runtime is not None else None

    config: Dict[str, Any] = {}
    secrets: Dict[str, Dict[str, Any]] = {}
    var_to_secret: Dict[str, str] = {}
    warnings: List[str] = []
    env_file: Optional[Dict[str, Any]] = None

    if provider in {"ecs-envfile", "envfile"}:
        env_file, env_warns = build_envfile_meta(root, inv, require_exists=False)
        warnings.extend(env_warns)

    # Compute non-secret config with defaults + values.
    for var in contract_vars:
        if not is_in_scope(var, env):
            continue
        if var.state == "removed":
            continue
        if var.secret:
            assert var.secret_ref is not None
            ref_name = var.secret_ref
            if ref_name not in secrets_ref:
                die(f"Missing secret ref '{ref_name}' required by contract var '{var.name}' for env '{env}'")
            secrets[ref_name] = dict(secrets_ref[ref_name])
            var_to_secret[var.name] = ref_name
        else:
            # Start with default if present.
            if var.default is not None:
                config[var.name] = var.default

    contract_by_name = {v.name: v for v in contract_vars}
    rename_map = {v.rename_from: v.name for v in contract_vars if v.rename_from}

    # Values override defaults (non-secret only), with strict validation.
    for raw_key, raw_value in values.items():
        key = raw_key
        vdef = contract_by_name.get(raw_key)

        if vdef is None and raw_key in rename_map:
            key = rename_map[raw_key]
            if key in values:
                die(
                    f"Conflicting keys in values file {values_path}: both legacy {raw_key} and new {key} are set. Remove {raw_key}."
                )
            warnings.append(f"Legacy key used in values file {values_path}: {raw_key} -> {key} (migration.rename_from).")
            vdef = contract_by_name.get(key)

        if vdef is None:
            die(f"Unknown key in values file {values_path}: {raw_key} (only contract keys are allowed)")

        if vdef.state == "removed":
            die(f"Removed contract key set in values file {values_path}: {raw_key}")

        if vdef.secret:
            die(f"Values file must not include secret variable: {raw_key} (use env/secrets/{env}.ref.yaml)")

        if not is_in_scope(vdef, env):
            die(f"Values file sets out-of-scope key {raw_key} (resolved to {key}) for env '{env}'")

        if vdef.state == "deprecated":
            msg = f"Deprecated contract key set in values file {values_path}: {key}"
            if vdef.deprecate_after:
                msg += f" (deprecate_after={vdef.deprecate_after})"
            if vdef.replacement:
                msg += f" (replacement={vdef.replacement})"
            warnings.append(msg)

        t_err = type_check_value(vdef, raw_value)
        if t_err:
            die(f"Type check failed for {raw_key} in values file {values_path}: {t_err}")
        config[key] = raw_value

    # Force-set environment selector if present
    for v in contract_vars:
        if v.name == "APP_ENV" and v.state != "removed":
            config["APP_ENV"] = env
            break

    # Validate: ensure required keys exist
    for var in contract_vars:
        if not is_in_scope(var, env):
            continue
        if var.state == "removed":
            continue
        if var.secret:
            continue
        if var.required and (var.name not in config or config.get(var.name) in (None, '')):
            die(f"Missing required non-secret value for env '{env}': {var.name}")

    # Validate BWS refs after policy defaults are applied.
    for name, meta in secrets_ref.items():
        if meta.get("backend") != "bws":
            continue
        ref = str(meta.get("ref") or "").strip()
        key = meta.get("key")
        project_id = meta.get("project_id")
        project_name = meta.get("project_name")
        has_key = isinstance(key, str) and bool(key.strip())
        has_pid = isinstance(project_id, str) and bool(project_id.strip())
        has_pname = isinstance(project_name, str) and bool(project_name.strip())
        if not ref and not (has_key and (has_pid or has_pname)):
            die(
                f"Secret ref '{name}' backend 'bws' requires either ref (bws://...) "
                f"or (project_id|project_name) + key (policy defaults allowed)"
            )

    return DesiredState(
        env=env,
        provider=provider,
        runtime=runtime,
        runtime_target=runtime_target,
        workload=workload,
        config=config,
        secrets=secrets,
        var_to_secret_ref=var_to_secret,
        env_file=env_file,
        warnings=warnings,
        notes=notes,
    )


def state_dir(root: Path, env: str, *, provider: str) -> Path:
    # mockcloud state is stable and used by the system test suite.
    if provider == "mockcloud":
        return root / ".ai" / "mock-cloud" / env
    # Other providers may include environment-specific infrastructure details
    # (e.g., hostnames) and should not default to a committed path.
    return root / ".ai" / ".tmp" / "env-cloud" / env


def load_deployed_state(root: Path, env: str, *, provider: str) -> Optional[Dict[str, Any]]:
    sdir = state_dir(root, env, provider=provider)
    path = sdir / "state.json"
    if not path.exists():
        return None
    return load_json(path)


def write_deployed_state(root: Path, env: str, state: Dict[str, Any]) -> None:
    provider = str(state.get("provider") or "").strip() or "unknown"
    sdir = state_dir(root, env, provider=provider)
    sdir.mkdir(parents=True, exist_ok=True)
    path = sdir / "state.json"
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def diff_maps(old: Mapping[str, Any], new: Mapping[str, Any]) -> Dict[str, Any]:
    old_keys = set(old.keys())
    new_keys = set(new.keys())
    added = {k: new[k] for k in sorted(new_keys - old_keys)}
    removed = {k: old[k] for k in sorted(old_keys - new_keys)}
    changed: Dict[str, Dict[str, Any]] = {}
    for k in sorted(old_keys & new_keys):
        if old[k] != new[k]:
            changed[k] = {"from": old[k], "to": new[k]}
    return {"added": added, "removed": removed, "changed": changed}


def normalize_env_file(meta: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    if not isinstance(meta, dict):
        return {}
    # Ignore volatile fields.
    drop = {"mtime", "remote"}
    return {k: v for k, v in meta.items() if k not in drop}


def diff_env_file(old_meta: Optional[Mapping[str, Any]], new_meta: Optional[Mapping[str, Any]]) -> Optional[Dict[str, Any]]:
    old_norm = normalize_env_file(old_meta)
    new_norm = normalize_env_file(new_meta)
    if not old_norm and not new_norm:
        return None
    status = "NOOP" if old_norm == new_norm else "UPDATE"
    return {"status": status, "deployed": old_norm, "desired": new_norm}


def diff_state(desired: DesiredState, deployed: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if deployed is None:
        return {
            "env": desired.env,
            "provider": desired.provider,
            "status": "CREATE",
            "config": {"added": desired.config, "removed": {}, "changed": {}},
            "secrets": {"added": desired.secrets, "removed": {}, "changed": {}},
            "env_file": diff_env_file(None, desired.env_file),
        }

    old_cfg = deployed.get("config") or {}
    old_sec = deployed.get("secrets") or {}
    if not isinstance(old_cfg, dict):
        old_cfg = {}
    if not isinstance(old_sec, dict):
        old_sec = {}

    # Normalize deployed secret metadata to compare only stable fields.
    # Deployed state may include provider-side fields like version/rotated_at.
    normalized_old_sec: Dict[str, Any] = {}
    ephemeral_keys = {"version", "rotated_at"}
    for k, v in old_sec.items():
        if isinstance(v, dict):
            normalized_old_sec[k] = {kk: vv for kk, vv in v.items() if kk not in ephemeral_keys}
        else:
            normalized_old_sec[k] = v

    cfg_diff = diff_maps(old_cfg, desired.config)
    sec_diff = diff_maps(normalized_old_sec, desired.secrets)
    envfile_diff = diff_env_file(deployed.get("env_file") if isinstance(deployed, dict) else None, desired.env_file)
    last_apply_status = deployed.get("status") if isinstance(deployed, dict) else None

    status = "NOOP"
    if cfg_diff["added"] or cfg_diff["removed"] or cfg_diff["changed"] or sec_diff["added"] or sec_diff["removed"] or sec_diff["changed"]:
        status = "UPDATE"
    if envfile_diff and envfile_diff.get("status") == "UPDATE":
        status = "UPDATE"
    if last_apply_status == "FAIL":
        status = "UPDATE"

    return {
        "env": desired.env,
        "provider": desired.provider,
        "status": status,
        "config": cfg_diff,
        "secrets": sec_diff,
        "env_file": envfile_diff,
        "last_apply_status": last_apply_status,
        "deployed_at": deployed.get("applied_at"),
    }


def render_plan_md(desired: DesiredState, deployed: Optional[Dict[str, Any]], plan: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Cloud Environment Plan")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{utc_now_iso()}`")
    lines.append("- Status: **PASS**")
    lines.append(f"- Env: `{desired.env}`")
    lines.append(f"- Provider: `{desired.provider}`")
    if desired.runtime:
        lines.append(f"- Runtime: `{desired.runtime}`")
    if desired.runtime_target:
        lines.append(f"- Runtime target: `{desired.runtime_target}`")
    if desired.workload:
        lines.append(f"- Workload: `{desired.workload}`")
    lines.append(f"- Change status: **{plan['status']}**")
    if deployed is None:
        lines.append("- Deployed: (none)")
    else:
        lines.append(f"- Deployed at: `{deployed.get('applied_at')}`")
    lines.append("")

    if desired.notes:
        lines.append("## Routing notes")
        for n in desired.notes:
            lines.append(f"- {n}")
        lines.append("")

    if desired.warnings:
        lines.append("## Warnings")
        for w in desired.warnings:
            lines.append(f"- {w}")
        lines.append("")

    def _render_diff(title: str, d: Dict[str, Any]) -> None:
        lines.append(f"## {title}")
        lines.append("")
        lines.append(f"- Added: {len(d.get('added') or {})}")
        lines.append(f"- Removed: {len(d.get('removed') or {})}")
        lines.append(f"- Changed: {len(d.get('changed') or {})}")
        lines.append("")

    _render_diff("Config changes (non-secret)", plan["config"])
    _render_diff("Secret ref changes (no values)", plan["secrets"])
    if plan.get("env_file"):
        lines.append("## Env file changes (redacted)")
        lines.append("```json")
        lines.append(json.dumps(plan["env_file"], indent=2, sort_keys=True))
        lines.append("```")
        lines.append("")

    lines.append("## Plan JSON (redacted)")
    lines.append("```json")
    lines.append(json.dumps(plan, indent=2, sort_keys=True))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Secret values are never included. Only secret references are compared.")
    lines.append("- Apply requires explicit `--approve`.")
    return "\n".join(lines) + "\n"


def write_cloud_context(root: Path, desired: DesiredState) -> Path:
    out_path = root / "docs" / "context" / "env" / f"effective-cloud-{desired.env}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": utc_now_iso(),
        "env": desired.env,
        "provider": desired.provider,
        "runtime": desired.runtime,
        "runtime_target": desired.runtime_target,
        "workload": desired.workload,
        "config": desired.config,
        "secrets": desired.secrets,
        "var_to_secret_ref": desired.var_to_secret_ref,
        "env_file": desired.env_file,
        "notes": desired.notes,
        "redaction": {"secrets": "values omitted"},
    }
    out_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return out_path


def run_cmd(cmd: Sequence[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True)


def build_ssh_options(ssh: Mapping[str, Any]) -> List[str]:
    opts: List[str] = []
    if ssh.get("identity_file"):
        opts.extend(["-i", str(ssh["identity_file"])])
    if ssh.get("known_hosts"):
        opts.extend(["-o", f"UserKnownHostsFile={ssh['known_hosts']}"])
    strict = ssh.get("strict_host_key_checking")
    strict_val = "yes" if strict else "no"
    opts.extend(["-o", f"StrictHostKeyChecking={strict_val}"])
    opts.extend(["-o", "BatchMode=yes"])
    if ssh.get("connect_timeout") is not None:
        opts.extend(["-o", f"ConnectTimeout={int(ssh['connect_timeout'])}"])
    for opt in ssh.get("options") or []:
        opts.append(str(opt))
    return opts


def ssh_host_label(ssh: Mapping[str, Any], host: str) -> str:
    user = ssh.get("user")
    return f"{user}@{host}" if user else host


def run_ssh_sh(ssh: Mapping[str, Any], host: str, script: str) -> subprocess.CompletedProcess[str]:
    return run_cmd(
        [
            "ssh",
            *(["-p", str(ssh["port"])] if ssh.get("port") else []),
            *build_ssh_options(ssh),
            ssh_host_label(ssh, host),
            "sh",
            "-lc",
            script,
        ]
    )


def scp_copy(ssh: Mapping[str, Any], host: str, source: Path, target: str) -> subprocess.CompletedProcess[str]:
    args = ["scp"]
    if ssh.get("port"):
        args.extend(["-P", str(ssh["port"])])
    args.extend(build_ssh_options(ssh))
    args.append(str(source))
    args.append(f"{ssh_host_label(ssh, host)}:{target}")
    return run_cmd(args)


def remote_sha256(ssh: Mapping[str, Any], host: str, target: Path, *, sudo: bool) -> str:
    qpath = shell_quote(str(target))
    inner = (
        f"set -e; "
        f"if command -v sha256sum >/dev/null 2>&1; then sha256sum {qpath} | awk '{{print $1}}'; "
        f"elif command -v shasum >/dev/null 2>&1; then shasum -a 256 {qpath} | awk '{{print $1}}'; "
        f"elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 {qpath} | awk '{{print $NF}}'; "
        f"else echo 'missing sha256 tool' >&2; exit 2; fi"
    )
    script = f"sudo -n sh -lc {shell_quote(inner)}" if sudo else inner
    res = run_ssh_sh(ssh, host, script)
    if res.returncode != 0:
        return ""
    line = res.stdout.strip().splitlines()[0] if res.stdout.strip() else ""
    return line.strip() if line else ""


def apply_envfile_state(
    root: Path,
    env: str,
    desired: DesiredState,
    *,
    approve: bool,
    approve_remote: bool,
) -> Dict[str, Any]:
    if not approve:
        die("Apply requires --approve")

    inv, _notes = resolve_cloud_inventory(
        root,
        env=env,
        runtime_target=desired.runtime_target,
        workload=desired.workload,
    )
    cfg = parse_envfile_config(root, inv)
    meta, _warnings = build_envfile_meta(root, inv, require_exists=True)

    mode = str(cfg.get("mode") or "copy")
    transport = str(cfg.get("transport") or "local")
    source = Path(cfg["source"])
    target_str = str(cfg["target"])

    write_cfg = cfg.get("write") if isinstance(cfg.get("write"), dict) else {}
    sudo = bool(write_cfg.get("sudo"))
    chmod_mode = str(write_cfg.get("chmod") or "600").strip()
    remote_tmp_dir = str(write_cfg.get("remote_tmp_dir") or "/tmp").strip()

    status = "PASS"
    remote_results: List[Dict[str, Any]] = []

    if transport == "local":
        target = Path(target_str)
        if mode == "copy":
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            os.chmod(target, int(chmod_mode, 8))
        elif mode == "noop":
            pass
        else:
            die(f"Unsupported envfile injection mode: {mode!r}")
    elif transport == "ssh":
        ssh_cfg = cfg.get("ssh")
        if not isinstance(ssh_cfg, dict):
            die("ssh transport requires injection.ssh configuration.")

        if mode == "copy" and not approve_remote:
            die("Remote envfile injection requires --approve-remote")

        desired_hash = str(meta.get("sha256") or "")
        sudo_prefix = "sudo -n " if sudo else ""

        for host in ssh_cfg.get("hosts") or []:
            host_result: Dict[str, Any] = {"host": host, "status": "OK"}

            if mode == "copy":
                # Pre-commands (best-effort; fail-fast per host)
                for script in ssh_cfg.get("pre_commands") or []:
                    r = run_ssh_sh(ssh_cfg, host, str(script))
                    if r.returncode != 0:
                        host_result = {"host": host, "status": "FAIL", "step": "pre", "code": r.returncode}
                        break

            if host_result["status"] == "OK":
                if mode == "copy":
                    suffix = sha256_text(f"{env}:{host}:{time.time()}:{os.getpid()}")[:10]
                    remote_tmp = f"{remote_tmp_dir.rstrip('/')}/env-cloudctl-{env}-{suffix}.env"

                    # 1) Copy to remote temp location (no sudo required)
                    r_scp = scp_copy(ssh_cfg, host, source, remote_tmp)
                    if r_scp.returncode != 0:
                        host_result = {"host": host, "status": "FAIL", "step": "scp", "code": r_scp.returncode}
                    else:
                        # 2) Atomic-ish install into target (supports sudo via sudo -n)
                        remote_target = target_str
                        remote_dir = str(Path(remote_target).parent)
                        tmp_target = f"{remote_target}.tmp.env-cloudctl-{suffix}"

                        install_script = " && ".join(
                            [
                                f"{sudo_prefix}mkdir -p {shell_quote(remote_dir)}",
                                f"{sudo_prefix}cp {shell_quote(remote_tmp)} {shell_quote(tmp_target)}",
                                f"{sudo_prefix}chmod {chmod_mode} {shell_quote(tmp_target)}",
                                f"{sudo_prefix}mv {shell_quote(tmp_target)} {shell_quote(remote_target)}",
                                f"{sudo_prefix}rm -f {shell_quote(remote_tmp)}",
                            ]
                        )
                        r_install = run_ssh_sh(ssh_cfg, host, install_script)
                        if r_install.returncode != 0:
                            host_result = {"host": host, "status": "FAIL", "step": "install", "code": r_install.returncode}
                        else:
                            hash_remote = remote_sha256(ssh_cfg, host, Path(remote_target), sudo=sudo)
                            if not hash_remote:
                                host_result = {"host": host, "status": "FAIL", "step": "verify-hash"}
                            elif desired_hash and hash_remote != desired_hash:
                                host_result = {"host": host, "status": "FAIL", "step": "verify-hash", "hash": hash_remote}
                            else:
                                host_result = {"host": host, "status": "OK", "hash": hash_remote}
                elif mode == "noop":
                    # No remote operations in noop mode.
                    host_result = {"host": host, "status": "SKIP", "reason": "mode=noop"}
                else:
                    die(f"Unsupported envfile injection mode: {mode!r}")

            if mode == "copy":
                # Post-commands (only if host OK)
                if host_result["status"] == "OK":
                    for script in ssh_cfg.get("post_commands") or []:
                        r = run_ssh_sh(ssh_cfg, host, str(script))
                        if r.returncode != 0:
                            host_result = {"host": host, "status": "FAIL", "step": "post", "code": r.returncode}
                            break

            remote_results.append(host_result)

        if any(r.get("status") == "FAIL" for r in remote_results):
            status = "FAIL"
    else:
        die(f"Unsupported envfile transport: {transport!r}")

    now = utc_now_iso()
    state: Dict[str, Any] = {
        "env": env,
        "provider": desired.provider,
        "runtime": desired.runtime,
        "applied_at": now,
        "status": status,
        "config": desired.config,
        "secrets": desired.secrets,
        "var_to_secret_ref": desired.var_to_secret_ref,
        "env_file": meta,
    }
    if remote_results:
        state["remote"] = {"transport": "ssh", "results": remote_results}

    write_deployed_state(root, env, state)
    write_cloud_context(root, desired)
    return state


def apply_state(root: Path, env: str, desired: DesiredState, *, approve: bool, approve_remote: bool) -> Dict[str, Any]:
    if not approve:
        die("Apply requires --approve")
    if desired.provider in {"ecs-envfile", "envfile"}:
        return apply_envfile_state(root, env, desired, approve=approve, approve_remote=approve_remote)
    if desired.provider != "mockcloud":
        die(f"Provider '{desired.provider}' is not supported by this reference implementation. Implement an adapter for your provider.")

    deployed = load_deployed_state(root, env, provider=desired.provider)
    now = utc_now_iso()

    # Preserve existing secret versions if present.
    existing_secrets: Dict[str, Any] = {}
    if deployed and isinstance(deployed.get("secrets"), dict):
        existing_secrets = deployed["secrets"]

    secrets_with_meta: Dict[str, Any] = {}
    for name, meta in desired.secrets.items():
        prev = existing_secrets.get(name) if isinstance(existing_secrets.get(name), dict) else None
        version = 1
        rotated_at = None
        if prev:
            version = int(prev.get("version") or 1)
            rotated_at = prev.get("rotated_at")
        if not isinstance(meta, dict) or not meta.get("backend"):
            die(f"Desired secret '{name}' must be a mapping with a backend (check env/secrets/{env}.ref.yaml).")
        stable = {k: v for k, v in meta.items() if k not in {"version", "rotated_at"}}
        stable["version"] = version
        stable["rotated_at"] = rotated_at
        secrets_with_meta[name] = stable

    state = {
        "env": env,
        "provider": desired.provider,
        "runtime": desired.runtime,
        "applied_at": now,
        "config": desired.config,
        "secrets": secrets_with_meta,
        "var_to_secret_ref": desired.var_to_secret_ref,
    }
    write_deployed_state(root, env, state)
    write_cloud_context(root, desired)
    return state


def verify_state(root: Path, desired: DesiredState, deployed: Optional[Dict[str, Any]]) -> Tuple[bool, Dict[str, Any]]:
    plan = diff_state(desired, deployed)
    ok = plan["status"] == "NOOP"
    return ok, plan


def verify_envfile_remote(
    root: Path,
    env: str,
    desired: DesiredState,
    *,
    runtime_target: Optional[str],
    workload: Optional[str],
) -> Tuple[bool, List[Dict[str, Any]]]:
    inv, _notes = resolve_cloud_inventory(root, env=env, runtime_target=runtime_target, workload=workload)
    cfg = parse_envfile_config(root, inv)
    if cfg.get("mode") == "noop":
        return True, [{"status": "SKIP", "reason": "mode is noop"}]
    if cfg.get("transport") != "ssh":
        return True, [{"status": "SKIP", "reason": "transport is not ssh"}]
    if not desired.env_file or not desired.env_file.get("sha256"):
        return False, [{"status": "FAIL", "reason": "desired env_file hash missing"}]
    ssh_cfg = cfg.get("ssh")
    if not isinstance(ssh_cfg, dict):
        return False, [{"status": "FAIL", "reason": "ssh config missing"}]
    write_cfg = cfg.get("write") if isinstance(cfg.get("write"), dict) else {}
    sudo = bool(write_cfg.get("sudo"))
    target = Path(cfg["target"])
    expected = desired.env_file.get("sha256")
    results: List[Dict[str, Any]] = []
    ok = True
    for host in ssh_cfg.get("hosts") or []:
        hash_remote = remote_sha256(ssh_cfg, host, target, sudo=sudo)
        if not hash_remote:
            ok = False
            results.append({"host": host, "status": "FAIL", "reason": "missing remote hash"})
            continue
        if hash_remote != expected:
            ok = False
            results.append({"host": host, "status": "FAIL", "hash": hash_remote})
            continue
        results.append({"host": host, "status": "OK", "hash": hash_remote})
    return ok, results


def random_secret_value(length: int = 32) -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return "".join(random.choice(alphabet) for _ in range(length))


def write_secret_file(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Write atomically
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(value + "\n", encoding="utf-8")
    os.chmod(tmp, stat.S_IRUSR | stat.S_IWUSR)
    tmp.replace(path)


def rotate_secret(
    root: Path,
    env: str,
    secret_name: str,
    approve: bool,
    *,
    runtime_target: Optional[str],
    workload: Optional[str],
) -> Dict[str, Any]:
    if not approve:
        die("Rotate requires --approve")
    desired = build_desired_state(root, env, runtime_target=runtime_target, workload=workload)
    if desired.provider in {"ecs-envfile", "envfile"}:
        die("Secret rotation is not supported for envfile-based providers. Regenerate the env file and re-apply.")
    if desired.provider != "mockcloud":
        die(f"Provider '{desired.provider}' is not supported by this reference implementation. Implement an adapter for your provider.")

    deployed = load_deployed_state(root, env, provider=desired.provider)
    if deployed is None:
        die(f"No deployed state found for env '{env}'. Apply first.")

    # Ensure secret exists in desired state
    if secret_name not in desired.secrets:
        die(f"Secret '{secret_name}' not found in desired secrets for env '{env}'.")

    meta = desired.secrets[secret_name]
    backend = meta.get("backend")

    if backend != "mock":
        die(f"Rotation backend '{backend}' is not supported by this reference implementation.")

    # Update mock secret store value (never print old/new values)
    secret_path = root / "env" / ".secrets-store" / env / secret_name
    new_value = random_secret_value(40)
    write_secret_file(secret_path, new_value)

    # Update deployed state version
    if "secrets" not in deployed or not isinstance(deployed["secrets"], dict):
        deployed["secrets"] = {}

    prev = deployed["secrets"].get(secret_name)
    prev_version = 0
    if isinstance(prev, dict):
        prev_version = int(prev.get("version") or 0)

    deployed["secrets"][secret_name] = {
        **{k: v for k, v in meta.items() if k not in {"version", "rotated_at"}},
        "version": prev_version + 1,
        "rotated_at": utc_now_iso(),
    }

    deployed["applied_at"] = utc_now_iso()
    write_deployed_state(root, env, deployed)
    write_cloud_context(root, desired)
    return deployed


def decommission_env(root: Path, env: str, approve: bool) -> None:
    if not approve:
        die("Decommission requires --approve")

    inv = load_inventory(root, env)
    provider = str(inv.get("provider") or "").strip()
    if provider in {"ecs-envfile", "envfile"}:
        die("Decommission is not supported for envfile-based providers. Remove injected files manually if needed.")

    # Only decommission mock state in this reference implementation.
    sdir = state_dir(root, env, provider=provider)
    if not sdir.exists():
        # idempotent
        return
    shutil.rmtree(sdir)


def render_verify_md(ok: bool, plan: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Cloud Environment Verify")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{utc_now_iso()}`")
    lines.append(f"- Status: **{'PASS' if ok else 'FAIL'}**")
    lines.append("")
    lines.append("## Diff (redacted)")
    lines.append("```json")
    lines.append(json.dumps(plan, indent=2, sort_keys=True))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Secret values are never included.")
    return "\n".join(lines) + "\n"


def render_rotate_md(env: str, secret: str, deployed: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Secret Rotation Log")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{utc_now_iso()}`")
    lines.append(f"- Env: `{env}`")
    lines.append(f"- Secret: `{secret}`")

    # Do not print secret value.
    meta = None
    if isinstance(deployed.get("secrets"), dict):
        meta = deployed["secrets"].get(secret)
    if isinstance(meta, dict):
        lines.append(f"- New version: `{meta.get('version')}`")
        lines.append(f"- Rotated at: `{meta.get('rotated_at')}`")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Secret value was updated in the backend; not displayed here.")
    return "\n".join(lines) + "\n"


def render_apply_md(state: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Cloud Apply Execution Log")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{utc_now_iso()}`")
    lines.append(f"- Env: `{state.get('env')}`")
    lines.append(f"- Provider: `{state.get('provider')}`")
    lines.append(f"- Applied at: `{state.get('applied_at')}`")
    lines.append("")
    lines.append("## Deployed state (redacted)")
    lines.append("```json")
    lines.append(json.dumps(state, indent=2, sort_keys=True))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    lines.append("- This log intentionally excludes secret values.")
    return "\n".join(lines) + "\n"


def write_output(path: Optional[str], content: str) -> None:
    if path:
        out = Path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(content, encoding="utf-8")
    else:
        sys.stdout.write(content)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Cloud environment controller (mockcloud + envfile reference).")
    sub = parser.add_subparsers(dest="cmd", required=True)

    def add_common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--root", default=".", help="Project root")
        p.add_argument("--env", required=True, help="Environment name")
        p.add_argument(
            "--runtime-target",
            default="ecs",
            help="Runtime target for policy matching (default: ecs; supports: local|ecs, 'remote' is alias)",
        )
        p.add_argument("--workload", default="api", help="Workload name (default: api)")
        p.add_argument("--out", default=None, help="Write markdown report to this path")

    p_plan = sub.add_parser("plan", help="Plan changes (diff)")
    add_common(p_plan)

    p_drift = sub.add_parser("drift", help="Detect drift (alias of plan)")
    add_common(p_drift)

    p_apply = sub.add_parser("apply", help="Apply desired config to provider")
    add_common(p_apply)
    p_apply.add_argument("--approve", action="store_true", help="Explicit approval gate")
    p_apply.add_argument("--approve-remote", action="store_true", help="Explicit approval gate for executing remote commands (ssh/scp)")

    p_verify = sub.add_parser("verify", help="Verify desired == deployed")
    add_common(p_verify)
    p_verify.add_argument("--remote", action="store_true", help="For ssh envfile providers, verify remote file hash")
    p_verify.add_argument("--approve-remote", action="store_true", help="Explicit approval gate for executing remote commands (ssh)")

    p_rotate = sub.add_parser("rotate", help="Rotate a secret (backend-dependent)")
    add_common(p_rotate)
    p_rotate.add_argument("--secret", required=True, help="Secret ref name to rotate")
    p_rotate.add_argument("--approve", action="store_true", help="Explicit approval gate")

    p_decom = sub.add_parser("decommission", help="Decommission an environment")
    add_common(p_decom)
    p_decom.add_argument("--approve", action="store_true", help="Explicit approval gate")

    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    env = str(args.env)
    runtime_target = normalize_runtime_target(args.runtime_target)
    workload = str(args.workload)

    if args.cmd in {"plan", "drift"}:
        desired = build_desired_state(root, env, runtime_target=runtime_target, workload=workload)
        deployed = load_deployed_state(root, env, provider=desired.provider)
        plan = diff_state(desired, deployed)
        write_cloud_context(root, desired)
        write_output(args.out, render_plan_md(desired, deployed, plan))
        return 0

    if args.cmd == "apply":
        desired = build_desired_state(root, env, runtime_target=runtime_target, workload=workload)
        state = apply_state(root, env, desired, approve=bool(args.approve), approve_remote=bool(args.approve_remote))
        write_output(args.out, render_apply_md(state))
        return 0 if state.get("status") != "FAIL" else 1

    if args.cmd == "verify":
        desired = build_desired_state(root, env, runtime_target=runtime_target, workload=workload)
        deployed = load_deployed_state(root, env, provider=desired.provider)
        ok, plan = verify_state(root, desired, deployed)
        if args.remote:
            if not args.approve_remote:
                die("Remote verify requires --approve-remote")
            remote_ok, remote_results = verify_envfile_remote(
                root,
                env,
                desired,
                runtime_target=runtime_target,
                workload=workload,
            )
            plan["remote"] = remote_results
            ok = ok and remote_ok
        write_output(args.out, render_verify_md(ok, plan))
        return 0 if ok else 1

    if args.cmd == "rotate":
        deployed = rotate_secret(
            root,
            env,
            str(args.secret),
            approve=bool(args.approve),
            runtime_target=str(args.runtime_target),
            workload=str(args.workload),
        )
        write_output(args.out, render_rotate_md(env, str(args.secret), deployed))
        return 0

    if args.cmd == "decommission":
        decommission_env(root, env, approve=bool(args.approve))
        write_output(args.out, f"# Decommission\n\n- Timestamp (UTC): `{utc_now_iso()}`\n- Env: `{env}`\n- Status: **PASS**\n")
        return 0

    die(f"Unknown command: {args.cmd}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
