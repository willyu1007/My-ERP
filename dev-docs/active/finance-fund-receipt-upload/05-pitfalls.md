# 05 — Pitfalls (do not repeat)

## Do-not-repeat summary (keep current)
- Inherit ALL T-012/T-013 pitfalls (org-scoped work_item/outbox → withScope; RLS-sensitive behavior tested via the real controller under the app role; dev DB has RLS OFF; a `'use client'` module must not export non-component values consumed by a server component; vitest from repo root).
- The receipt upload MUST NOT emit an outbox event or go through the Intake flow — that would leak financial detail toward the ecosystem (AGENTS.md §3). Assert zero outbox rows in a test.
- Do NOT stream binary through the JSON api-client; use a web route handler that pipes the API download.

## Pitfall log (append-only)

### 2026-07-08 - Planning baseline
- Task opened; scope locked (attach at confirm + after-the-fact; in-app view). Reuses the T-004 object store + Attachment; bypasses Intake for compliance.
