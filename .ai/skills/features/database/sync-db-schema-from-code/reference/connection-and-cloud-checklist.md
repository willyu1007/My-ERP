# Connection and cloud checklist (lightweight)

This reference is intentionally brief. The goal is to unblock schema synchronization with the minimum necessary setup.

## Minimum information to collect
- DB type: PostgreSQL / MySQL / SQLite
- Environment: dev / staging / prod
- Host / port (SQLite uses a file path)
- Database name (or SQLite file)
- Username and auth method (password / IAM / other)
- Network access: is the DB reachable from where commands will run?

## Connection string quick examples
> Prefer setting `DATABASE_URL` in the environment and keeping secrets out of chat logs.

- PostgreSQL
  - `postgresql://<user>:<password>@<host>:5432/<dbname>`
- MySQL/MariaDB
  - `mysql://<user>:<password>@<host>:3306/<dbname>`
- SQLite (local file)
  - `sqlite:////absolute/path/to/app.db`
  - `sqlite:///relative/path/to/app.db`

## Managed database (cloud) quick checklist
These are the common blockers. Do not over-tune; just clear the basics.

### AWS (RDS)
- Confirm the instance endpoint, port, and database name.
- Ensure the Security Group allows inbound traffic from the runner (your IP/VPC) on the DB port.
- Confirm the DB user has permissions to run migrations (DDL).

### Google Cloud (Cloud SQL)
- Decide connection mode: public IP, private IP, or a proxy.
- If using public IP, ensure authorized networks include the runner IP.
- Confirm the DB user has permissions to run migrations (DDL).

### Alibaba Cloud (RDS)
- Ensure a public connection address is enabled if connecting from the public internet.
- Add the runner IP to the instance whitelist.
- Confirm the DB user has permissions to run migrations (DDL).

## Safety notes
- Always redact credentials in logs.
- For prod changes, prefer a backup/snapshot and a maintenance window for destructive changes.
