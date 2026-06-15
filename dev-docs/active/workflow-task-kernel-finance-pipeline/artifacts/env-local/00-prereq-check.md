# Local Environment Doctor

- Timestamp (UTC): `2026-06-12T11:04:17Z`
- Env: `dev`
- Runtime target: `local`
- Workload: `api`
- Status: **PASS**

## Warnings
- Preflight warning: No credential signals detected

## Details (redacted)
```json
{
  "actions": [],
  "env": "dev",
  "errors": [],
  "preflight": {
    "auth_mode": "auto",
    "fallback_evidence": null,
    "fallback_used": false,
    "policy_path": "/Volumes/DataDisk/Project/My-ERP/docs/project/policy.yaml",
    "preflight_mode": "warn",
    "reasons": [
      "No credential signals detected"
    ],
    "rule_ids": [
      "dev-local"
    ],
    "signals": {
      "providers": {},
      "summary": {
        "has_ak": false,
        "has_sts": false
      }
    },
    "status": "WARN"
  },
  "runtime_target": "local",
  "status": "PASS",
  "timestamp_utc": "2026-06-12T11:04:17Z",
  "warnings": [
    "Preflight warning: No credential signals detected"
  ],
  "workload": "api"
}
```

## Notes
- Do not paste secret values into chat.
- Evidence files must not include secret values.
