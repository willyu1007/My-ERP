# Approval gates (mandatory)

This skill enforces a strict split:

- `plan` and `drift` are read-only.
- `apply`, `rotate`, and `decommission` require explicit approval.
- Any operation that executes **remote commands** (SSH/SCP) requires an explicit remote approval flag.
  - `apply`: `--approve --approve-remote` (when `injection.transport=ssh`)
  - `verify --remote`: `--approve-remote`

## Human approval checklist

- Target env confirmed
- Change summary reviewed
- Rollback plan understood
- Maintenance window confirmed
- Identity/IAM impacts assessed separately
