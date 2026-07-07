# 05 — Pitfalls (do not repeat)

## Do-not-repeat summary (keep current)
- Inherit ALL T-012/T-013 pitfalls (org-scoped work_item/outbox → withScope; RLS-sensitive behavior tested via the real controller under the app role; dev DB has RLS OFF; a `'use client'` module must not export non-component values consumed by a server component; vitest from repo root).
- The receipt upload MUST NOT emit an outbox event or go through the Intake flow — that would leak financial detail toward the ecosystem (AGENTS.md §3). Assert zero outbox rows in a test.
- Do NOT stream binary through the JSON api-client; use a web route handler that pipes the API download.

## Pitfall log (append-only)

### 2026-07-08 - Dead-code / dual-track cleanup after the T-012/13/14 fund slices
- `attachment_id` must be set ONLY via `POST :id/attachment` (which stores real bytes + an Attachment). The old `consume` DTO also accepted a free-text `attachmentId` — a second, UNVALIDATED way to set the same FK (you could point it at any string). Removed from the entire consume chain (API DTO/controller, `ConsumeFundInput`, `consumeFundConsumptionTx` write branch, OpenAPI). Do not re-add it to consume.
- Reconciliation (`reconciliationStatus`/`reconciledBy`/`reconciledAt`) is repository-ready (`consumeFundConsumptionTx` + column + read list-filter) but NOT surfaced on the consume API/UI. When the 对账 feature lands it gets its OWN action calling that primitive — do NOT re-expose it on consume (that would recreate a dual-track). The consume-time `reconciliationStatus` input was removed as dead surface.
- `ObjectStore.getUrl` was removed — it was dead (zero callers) and its "signed URL" intent is served by `get()` + the streaming download endpoint + the web proxy route.
- Naming: the product name is 资金执行 (not 货币资金结算); code comments/OpenAPI summaries were aligned to it to avoid implying a separate concept.

### 2026-07-08 - Planning baseline
- Task opened; scope locked (attach at confirm + after-the-fact; in-app view). Reuses the T-004 object store + Attachment; bypasses Intake for compliance.
