# Local Environment Compile Report

- Timestamp (UTC): `2026-06-12T11:04:26Z`
- Env: `dev`
- Runtime target: `local`
- Workload: `api`
- Status: **PASS**
- Env file: `/Volumes/DataDisk/Project/My-ERP/.env.local`
- Effective context: `/Volumes/DataDisk/Project/My-ERP/docs/context/env/effective-dev.json`

## Warnings
- Preflight warning: No credential signals detected

## Key summary (redacted)
```json
{
  "APP_ENV": {
    "present": true,
    "secret": false,
    "type": "enum"
  },
  "PORT": {
    "present": true,
    "secret": false,
    "type": "int"
  },
  "SERVICE_NAME": {
    "present": true,
    "secret": false,
    "type": "string"
  }
}
```

## Notes
- Secret values are written only to the local env file.
- Do not commit the local env file.
