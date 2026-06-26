# Migration Plan

Target environment: not selected.

Default apply strategy after approval:

```sh
PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm db:migrate
```

Rollback expectation:

- Before production/staging apply, take the normal DB backup/snapshot.
- Code rollback should be paired with a rollback migration if the column has already been deployed.
- The added column is nullable and not read by accounting/reporting calculations.

Approval required before any DB write.
