# 03 — Implementation Notes

## Status
- Current status: `done`
- Last updated: 2026-07-08

## What changed
- **platform** (`capture.ts`): `ObjectStore` gained `get(storageKey): Promise<Uint8Array>` (read bytes back for an authorized reader). `LocalObjectStore` implements it (reads the file; 404 if missing).
- **db** (`packages/db/src/index.ts`): `setFundConsumptionAttachmentTx(tx, id, attachmentId)` — `UPDATE ... WHERE id AND execution_status != 'void'`, NOT version-guarded and NO version bump (the receipt is orthogonal to the optimistic-consume version, so attach-then-confirm needs no version dance). Reuses the existing `Attachment` table + `createAttachmentTx`/`getAttachmentTx` — **zero schema change** (`fund_consumption.attachment_id` was already `uuid?`).
- **api** (`fund-consumptions`): injects `OBJECT_STORE`.
  - `POST /v1/fund-consumptions/:id/attachment` (consume-gated): base64 JSON `{contentType, contentBase64}`, validates image/* or application/pdf + ≤10MB; `objectStore.put` → `createAttachmentTx` → `setFundConsumptionAttachmentTx` → audit `ATTACH_FUND_RECEIPT`. **NO Intake, NO outbox, NO OCR** — the receipt stays inside My-ERP (AGENTS.md §3). 400 on void, 404 on missing.
  - `GET /v1/fund-consumptions/:id/attachment` (read-gated): loads the row → Attachment → `objectStore.get` → streams via `StreamableFile` with Content-Type + `Content-Disposition: inline` + `no-store`.
- **openapi/api-client/data-source**: `UploadFundReceipt` schema + POST/GET routes; `uploadFundReceipt(id, body)` client method + data-source wrapper. The GET download is binary → served through a web route handler, not the JSON api-client.
- **web**:
  - New `_components/receipt-upload.tsx` (`ReceiptUpload`): hidden `<input type=file accept="image/*,application/pdf" capture="environment">` (rear camera on mobile) → base64 → `uploadFundReceiptAction` → refresh; shows 拍照/上传回单 → 重新上传回单 + 查看回单.
  - Wired into the fund queue inline form (T-013) + the voucher-detail panel — the panel's free-text 附件编号 input is **removed** and replaced by the upload control; executed (non-void) rows also expose it (after-the-fact attach). The queue's executed rows show 查看回单 when attached.
  - New route handler `finance/attachments/fund/[id]/route.ts` — server-side fetches the `/v1` download with the bearer token and streams the bytes to the browser (so `<img>`/tab render without a client-exposed token). `resolveApiEndpoint()` added to `request-scope` for this raw-fetch case.
  - `consume` no longer sends `attachmentId` (receipt is attached via its own endpoint; consume preserves any existing attachment).

## Decisions & tradeoffs
- See 01-plan. Key: reuse Attachment + ObjectStore (no schema change); upload bypasses Intake to keep the receipt out of the ecosystem (no outbox, no OCR). Attach is not version-guarded (evidence is low-stakes + orthogonal to consume) — avoids a two-step version dance at confirm-time.

## Deviations from plan
- None.

## Known issues / follow-ups
- OCR auto-fill of bankFlowRef/amount from the receipt (real extractor drop-in) — future slice.
