# API Index

> Auto-generated at 2026-06-10T02:13:26.581Z — do NOT hand-edit.
> Source: `docs/context/api/openapi.yaml` (SHA-256: `8f63ca7ab21b...`)

Total endpoints: **9**

| Method | Path | Summary | Auth | Input (required) | Output (core) | Errors |
|--------|------|---------|------|------------------|---------------|--------|
| GET | /health | Liveness probe (includes a DB ping) | none | — | status, service, time | — |
| GET | /v1/organization | The caller's current organization (org-scoped) | bearer | — | id, name, createdAt | 401, 403 |
| GET | /v1/ledger-books | List ledger books in the caller's organization | bearer | — | — | 401, 403 |
| POST | /v1/ledger-books | Create a ledger book (账套) — admin/supervisor only | bearer | name, baseCurrency, fiscalYear | id, orgId, name, baseCurrency, fiscalYear, periodStructure, active, createdAt | 400, 401, 403 |
| GET | /v1/invitations | List invitations (admin/supervisor) | bearer | — | — | 401, 403 |
| POST | /v1/invitations | Invite a user by email with a role (admin/supervisor) | bearer | email, role | id, orgId, invitedEmail, role, status, invitedBy, expiresAt, createdAt, token, acceptedBy, acceptedAt | 400, 401, 403 |
| POST | /v1/invitations/accept | Accept an invitation (authenticated invitee — not yet a member) | bearer | token | id, orgId, userId, role, createdAt, email | 400, 401, 404, 409 |
| POST | /v1/invitations/{id}/revoke | Revoke a pending invitation (admin/supervisor) | bearer | id | — | 400, 401, 403, 404 |
| GET | /v1/members | List organization members (admin/supervisor) | bearer | — | — | 401, 403 |
