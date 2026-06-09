# API Index

> Auto-generated at 2026-06-09T22:53:39.222Z — do NOT hand-edit.
> Source: `docs/context/api/openapi.yaml` (SHA-256: `753e6f54f1d2...`)

Total endpoints: **3**

| Method | Path | Summary | Auth | Input (required) | Output (core) | Errors |
|--------|------|---------|------|------------------|---------------|--------|
| GET | /health | Liveness probe (includes a DB ping) | none | — | status, service, time | — |
| GET | /v1/ledger-books | List ledger books in the caller's scope (P0b skeleton) | bearer | — | ledgerBookId, roles, recentAuditCount | 401, 403 |
| POST | /v1/ledger-books/post-check | Operation-level authz demo (requires 过账 / post Voucher) | bearer | — | ok, actor | 401, 403 |
