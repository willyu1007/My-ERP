# API Index

> Auto-generated at 2026-06-10T03:28:29.205Z — do NOT hand-edit.
> Source: `docs/context/api/openapi.yaml` (SHA-256: `f9f3c613ed40...`)

Total endpoints: **19**

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
| GET | /v1/accounts | List chart of accounts (ledger-scoped, code order = tree pre-order) | bearer | — | — | 400, 401, 403 |
| POST | /v1/accounts | Create an account (accountant/admin) | bearer | code, name, category, direction | id, ledgerBookId, code, name, category, direction, level, isLeaf, auxTypes, active, createdAt, parentCode | 400, 401, 403 |
| POST | /v1/accounts/seed-standard | Seed the 《小企业准则》 standard chart (idempotent) | bearer | — | seeded | 401, 403 |
| PATCH | /v1/accounts/{code} | Update an account's name / aux types (accountant/admin) | bearer | code | id, ledgerBookId, code, name, category, direction, level, isLeaf, auxTypes, active, createdAt, parentCode | 400, 404 |
| POST | /v1/accounts/{code}/deactivate | Deactivate an account (blocked if it has active children) | bearer | code | id, ledgerBookId, code, name, category, direction, level, isLeaf, auxTypes, active, createdAt, parentCode | 400, 404 |
| GET | /v1/vouchers | List journal vouchers (ledger-scoped; optional status filter) | bearer | — | — | 401, 403 |
| POST | /v1/vouchers | Create a draft voucher (accountant/cashier) | bearer | date, summary, lines | id, ledgerBookId, no, date, period, status, summary, totalDebit, totalCredit, maker, lines, checker, postedAt, reversalOf, reversedBy, attachments | 400, 401, 403 |
| GET | /v1/vouchers/{id} | Voucher detail (with lines) | bearer | id | id, ledgerBookId, no, date, period, status, summary, totalDebit, totalCredit, maker, lines, checker, postedAt, reversalOf, reversedBy, attachments | 404 |
| PATCH | /v1/vouchers/{id} | Replace a draft voucher's header + lines (only while draft) | bearer | date, summary, lines | id, ledgerBookId, no, date, period, status, summary, totalDebit, totalCredit, maker, lines, checker, postedAt, reversalOf, reversedBy, attachments | 400, 404 |
| POST | /v1/vouchers/{id}/submit | Submit a draft for review (draft → pending); enforces 借贷必平 | bearer | id | id, ledgerBookId, no, date, period, status, summary, totalDebit, totalCredit, maker, lines, checker, postedAt, reversalOf, reversedBy, attachments | 400, 404 |
