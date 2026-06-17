# API Index

> Auto-generated at 2026-06-17T22:50:40.658Z — do NOT hand-edit.
> Source: `docs/context/api/openapi.yaml` (SHA-256: `d160da9e4be1...`)

Total endpoints: **58**

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
| GET | /v1/work-items | List task-kernel work items (org-scoped; ledger scope applies when present) | bearer | — | — | 400, 401, 403 |
| GET | /v1/work-items/{id} | Work item detail with backend-computed actions | bearer | id | id, orgId, ledgerBookId, moduleKey, workflowKey, workflowVersion, workItemType, sourceType, sourceId, status, subStatus, priority, assignedRole, assigneeUserId, availableAt, createdBy, version, titleKey, metadata, createdAt, updatedAt, availableActions, claimedAt, dueAt, completedAt, canceledAt, completedBy | 401, 403, 404 |
| POST | /v1/work-items/{id}/actions/{actionKey} | Execute a backend-authorized work item action | bearer | expectedVersion | workItem, source | 400, 401, 403, 404, 409 |
| GET | /v1/accounts | List chart of accounts (ledger-scoped, code order = tree pre-order) | bearer | — | — | 400, 401, 403 |
| POST | /v1/accounts | Create an account (accountant/admin) | bearer | code, name, category, direction | id, ledgerBookId, code, name, category, direction, level, isLeaf, auxTypes, active, createdAt, parentCode, defaultCashFlowItem | 400, 401, 403 |
| POST | /v1/accounts/seed-standard | Seed the 《小企业准则》 standard chart (idempotent) | bearer | — | seeded | 401, 403 |
| PATCH | /v1/accounts/{code} | Update an account's name / aux types (accountant/admin) | bearer | code | id, ledgerBookId, code, name, category, direction, level, isLeaf, auxTypes, active, createdAt, parentCode, defaultCashFlowItem | 400, 404 |
| POST | /v1/accounts/{code}/deactivate | Deactivate an account (blocked if it has active children) | bearer | code | id, ledgerBookId, code, name, category, direction, level, isLeaf, auxTypes, active, createdAt, parentCode, defaultCashFlowItem | 400, 404 |
| GET | /v1/vouchers | List journal vouchers (ledger-scoped; optional status filter) | bearer | — | — | 401, 403 |
| POST | /v1/vouchers | Create a draft voucher (accountant/cashier) | bearer | date, summary, lines | id, ledgerBookId, no, date, period, status, summary, totalDebit, totalCredit, maker, lines, checker, postedAt, reversalOf, reversedBy, attachments, contractId | 400, 401, 403 |
| GET | /v1/vouchers/{id} | Voucher detail (with lines) | bearer | id | id, ledgerBookId, no, date, period, status, summary, totalDebit, totalCredit, maker, lines, checker, postedAt, reversalOf, reversedBy, attachments, contractId | 404 |
| PATCH | /v1/vouchers/{id} | Replace a draft voucher's header + lines (only while draft) | bearer | date, summary, lines | id, ledgerBookId, no, date, period, status, summary, totalDebit, totalCredit, maker, lines, checker, postedAt, reversalOf, reversedBy, attachments, contractId | 400, 404 |
| POST | /v1/vouchers/{id}/submit | Submit a draft for review (draft → pending); enforces 借贷必平 | bearer | id | id, ledgerBookId, no, date, period, status, summary, totalDebit, totalCredit, maker, lines, checker, postedAt, reversalOf, reversedBy, attachments, contractId | 400, 404 |
| POST | /v1/vouchers/{id}/post | Post a pending voucher (pending → posted; SoD — maker ≠ poster) | bearer | id | id, ledgerBookId, no, date, period, status, summary, totalDebit, totalCredit, maker, lines, checker, postedAt, reversalOf, reversedBy, attachments, contractId | 400, 403, 404 |
| POST | /v1/vouchers/{id}/reverse | Reverse a posted voucher (红冲) — creates a posted reversal voucher | bearer | id | original, reversal | 400, 403, 404 |
| GET | /v1/intakes | List capture intakes (ledger-scoped; optional status filter) | bearer | — | — | 401, 403 |
| POST | /v1/intakes | Capture an economic event (photo/pdf/text) for extraction → voucher draft | bearer | kind, contentType, contentBase64 | id, orgId, ledgerBookId, source, kind, status, needsReview, createdBy, version, createdAt, updatedAt, attachmentId, extraction, confidence, targetType, targetId | 400, 401, 403 |
| GET | /v1/intakes/{id} | Intake detail (includes extraction; ERP-only, never sent to My-Chat) | bearer | id | id, orgId, ledgerBookId, source, kind, status, needsReview, createdBy, version, createdAt, updatedAt, attachmentId, extraction, confidence, targetType, targetId | 404 |
| POST | /v1/intakes/{id}/extract | Run extraction on a received intake (received → extracted) | bearer | id | id, orgId, ledgerBookId, source, kind, status, needsReview, createdBy, version, createdAt, updatedAt, attachmentId, extraction, confidence, targetType, targetId | 400, 404 |
| POST | /v1/intakes/{id}/draft | Build a voucher draft from an extracted intake (extracted → drafted) | bearer | id | id, orgId, ledgerBookId, source, kind, status, needsReview, createdBy, version, createdAt, updatedAt, attachmentId, extraction, confidence, targetType, targetId | 400, 404 |
| POST | /v1/intakes/{id}/discard | Discard an intake (→ discarded); any draft voucher remains a draft | bearer | id | id, orgId, ledgerBookId, source, kind, status, needsReview, createdBy, version, createdAt, updatedAt, attachmentId, extraction, confidence, targetType, targetId | 400, 404 |
| GET | /v1/ledger/trial-balance | Trial balance (试算平衡表) — derived from posted vouchers | bearer | — | rows, totals, balanced | 401, 403 |
| GET | /v1/ledger/accounts/{code} | Subsidiary ledger (明细分类账) for one account — derived, running balance | bearer | code | accountCode, accountName, opening, closing, rows | 401, 403 |
| GET | /v1/periods | List period-close records (会计期间结账状态) | bearer | — | — | — |
| GET | /v1/periods/{period}/readiness | Close-readiness for a period (未过账 / 前期未结账) | bearer | period | period, status, unpostedCount, unclosedPriorPeriods, untaggedCashFlowCount, canClose | 400 |
| POST | /v1/periods/{period}/close | 期末结账 — 结转损益 + lock the period | bearer | period | period, status, closeVoucherId, closedBy, closedAt, reopenedAt, netProfit | 400, 403 |
| POST | /v1/periods/{period}/reopen | 反结账 — 红冲 the 结转 voucher + reopen | bearer | period | period, status, closeVoucherId, closedBy, closedAt, reopenedAt | 400 |
| GET | /v1/cash-flow-items | List 现金流量项目 | bearer | — | — | — |
| POST | /v1/cash-flow-items/seed-standard | Seed the 《小企业准则》 CF items + chart defaults (idempotent) | bearer | — | seeded | — |
| GET | /v1/cash-flow/untagged | Pre-close worklist — untagged non-cash lines of cash vouchers | bearer | — | — | — |
| GET | /v1/cash-flow/tie-out | CF tie-out — tagged flows == net cash change over a range | bearer | — | cashNetChange, taggedFlows, difference, tied | — |
| POST | /v1/cash-flow/tag | Post-hoc 打标 — set 现金流量项目 on a voucher's non-cash line(s) (pre-close worklist) | bearer | voucherId, accountCode | tagged | 400, 404 |
| GET | /v1/reports/balance-sheet | 资产负债表 (as-of date) | bearer | — | asOf, lines, balanced | 400 |
| GET | /v1/reports/income-statement | 利润表 (range — 月/季/年/自定义) | bearer | — | from, to, lines, netProfit | 400 |
| GET | /v1/reports/cash-flow | 现金流量表 (direct method, range) | bearer | — | from, to, activities, netCashFlow, tied | 400 |
| GET | /v1/payments | List 出纳收付款单 (PaymentDoc) | bearer | — | — | — |
| POST | /v1/payments | Create a 收/付款单 draft | bearer | direction, date, counterparty, summary, amount, cashAccountCode, contraAccountCode | id, no, direction, date, period, counterparty, summary, amount, cashAccountCode, contraAccountCode, status, maker, version, createdAt, updatedAt, settlementVoucherId, contractId, approver, confirmer | 400 |
| GET | /v1/payments/{id} | Get a payment doc | bearer | id | id, no, direction, date, period, counterparty, summary, amount, cashAccountCode, contraAccountCode, status, maker, version, createdAt, updatedAt, settlementVoucherId, contractId, approver, confirmer | 404 |
| POST | /v1/payments/{id}/submit | draft → pending_approval (opens the approver task) | bearer | expectedVersion | id, no, direction, date, period, counterparty, summary, amount, cashAccountCode, contraAccountCode, status, maker, version, createdAt, updatedAt, settlementVoucherId, contractId, approver, confirmer | 400, 409 |
| POST | /v1/payments/{id}/approve | pending_approval → approved (SoD; opens the cashier task) | bearer | expectedVersion | id, no, direction, date, period, counterparty, summary, amount, cashAccountCode, contraAccountCode, status, maker, version, createdAt, updatedAt, settlementVoucherId, contractId, approver, confirmer | 400, 403, 409 |
| POST | /v1/payments/{id}/confirm | approved → confirmed — generate + post the settlement voucher | bearer | expectedVersion | id, no, direction, date, period, counterparty, summary, amount, cashAccountCode, contraAccountCode, status, maker, version, createdAt, updatedAt, settlementVoucherId, contractId, approver, confirmer, settlementVoucher | 400, 403, 409 |
| POST | /v1/payments/{id}/void | 作废 a pre-confirmed payment doc | bearer | expectedVersion | id, no, direction, date, period, counterparty, summary, amount, cashAccountCode, contraAccountCode, status, maker, version, createdAt, updatedAt, settlementVoucherId, contractId, approver, confirmer | 400, 409 |
| GET | /v1/contracts | List 合同 (Contract) | bearer | — | — | — |
| POST | /v1/contracts | Create a 合同 (code auto-assigned HT-{fiscalYear}-{NNN}) | bearer | title | id, ledgerBookId, code, title, type, counterparty, currency, status, summary, createdBy, version, createdAt, updatedAt, amount, startDate, endDate | 400 |
| GET | /v1/contracts/{id} | Get a contract | bearer | id | id, ledgerBookId, code, title, type, counterparty, currency, status, summary, createdBy, version, createdAt, updatedAt, amount, startDate, endDate | 404 |
| PATCH | /v1/contracts/{id} | Update a contract (status / fields; version-guarded) | bearer | expectedVersion | id, ledgerBookId, code, title, type, counterparty, currency, status, summary, createdBy, version, createdAt, updatedAt, amount, startDate, endDate | 400, 409 |
| GET | /v1/contracts/{id}/timeline | 合同时间线 — contract event ∪ linked vouchers ∪ payments (time-ordered) | bearer | id | contract, items | 404 |
| GET | /v1/opening-balances | Opening balances (期初余额) + the ledger's enabled period | bearer | — | openingPeriod, balances | 401, 403 |
| PUT | /v1/opening-balances | Set the enabled period + replace opening balances (期初建账) | bearer | openingPeriod, balances | openingPeriod, balances | 400, 401, 403 |
