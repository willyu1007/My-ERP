# Connection Check

No target database connection was used in this turn.

Reason: this change creates a Prisma migration and refreshes generated context, but applying the migration is a DB write and requires explicit user approval per `sync-db-schema-from-code`.
