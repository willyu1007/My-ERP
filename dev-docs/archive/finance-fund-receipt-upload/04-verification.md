# 04 — Verification

## Automated checks
- `pnpm -r typecheck` / `pnpm lint` / `pnpm lint:css` / `pnpm test`
- `pnpm vitest run apps/api/src/fund-consumptions/fund-consumptions.integration.test.ts`
- `pnpm --filter @my-erp/api-client codegen` + `ctl-api-index generate --touch` after OpenAPI edits
- Governance: sync --apply + lint --check --project main

## Manual smoke checks
- Live `/v1`: upload a base64 image to a fund line → attachmentId set (a real Attachment.id); GET download returns the exact bytes (sha256 match); upload on a void row → 400; outbox_event count unchanged by the upload (compliance).
- Preview (desktop + mobile): upload control on the fund queue form + voucher panel; 查看回单 opens the image; mobile camera capture attribute present.

## Verification log
- 2026-07-08: bundle created; no code verification yet.
- 2026-07-08 (implementation):
  - `pnpm vitest run apps/api/src/fund-consumptions/fund-consumptions.integration.test.ts` -> 15/15 (3 new T-014: upload sets a real Attachment.id + streams the exact bytes back + emits ZERO outbox events (compliance) + leaves 1 audit record; attach works on an already-executed line but is rejected once void; non-image/pdf + empty content rejected, getReceipt 404 when none).
  - `pnpm -r typecheck` / `pnpm lint` / `pnpm lint:css` -> passed. `pnpm test` -> 48 files / 209 tests passed.
  - `pnpm --filter @my-erp/api-client codegen` + `ctl-api-index generate --touch` -> API context refreshed (75 endpoints; +UploadFundReceipt + POST/GET :id/attachment).
  - Live `/v1` smoke (packages rebuilt, API restarted fresh, token re-minted): posted a cash voucher -> pending fund row; `POST :id/attachment` with a 1x1 PNG -> attachmentId set to a real uuid; `GET :id/attachment` -> Content-Type image/png, Content-Disposition inline, downloaded base64 == uploaded (exact round-trip); reversed the voucher -> row void -> upload returns 400.
  - Preview walkthrough (dev server, live API):
    - Fund queue inline form: file input `accept="image/*,application/pdf" capture="environment"` (mobile rear camera); buttons 拍照/上传回单 · 确认到账 · 标记无需 · 查看凭证.
    - Simulated a file pick in-browser -> upload succeeded via the server action -> form flipped to 重新上传回单 + 查看回单; fetching the `/finance/attachments/fund/[id]` proxy route returned 200 image/png with bytes matching the uploaded PNG exactly.
    - Voucher-detail panel: free-text 附件编号 gone, replaced by 银行回单（可选）with the upload control; the attached row shows 重新上传回单 + 查看回单.
    - Mobile (375px): queue + form wrap cleanly, no horizontal overflow. Console: zero errors.
