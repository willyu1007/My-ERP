# 01 — Plan

## Locked decisions (2026-07-08)
- Attach window: confirm-time AND after-the-fact (any non-void line). Same endpoint, works regardless of executionStatus except void.
- In-app view: yes — add `ObjectStore.get` + an API download endpoint + a web proxy route so the receipt opens in-app. (A write-only attachment is pointless.)

## Approach (reuse, zero schema change)
- `fund_consumption.attachment_id` is already `uuid?`; `Attachment` + `ObjectStore` are already org+ledger dual-keyed (aligned with FundConsumption). No migration.
- Upload does NOT create an Intake: directly `objectStore.put` → `createAttachmentTx` → set `attachment_id` → audit. No outbox, no extraction (compliance).

## Steps
1. platform: add `get(storageKey): Promise<Uint8Array>` to `ObjectStore`; implement in `LocalObjectStore` (read file; throw NotFound if missing).
2. db: `setFundConsumptionAttachmentTx(tx, id, attachmentId)` — `UPDATE ... WHERE id=:id AND execution_status != 'void'`, NO version bump (evidence is orthogonal to the optimistic-consume version, so a confirm-then-attach or attach-then-confirm sequence needs no version dance). Returns updated row or null.
3. api (fund-consumptions):
   - `POST /v1/fund-consumptions/:id/attachment` — body `{contentType, contentBase64}`; validate image/* or application/pdf + ≤10MB; load row (404 if missing, 400 if void); `objectStore.put` + `createAttachmentTx` + `setFundConsumptionAttachmentTx` + audit `ATTACH_FUND_RECEIPT`. Returns the updated FundConsumption. NO outbox.
   - `GET /v1/fund-consumptions/:id/attachment` — `read FundConsumption`; load row → attachmentId → `getAttachmentTx` → `objectStore.get` → stream bytes with Content-Type + inline disposition. 404 when no attachment.
   - Inject `OBJECT_STORE` into the fund-consumptions module.
4. openapi/api-client/data-source: `UploadFundReceipt` schema + POST route; `uploadFundReceipt(id, body)` client method + data-source wrapper. GET download is binary → served through a web proxy route, documented as non-JSON (not an api-client method).
5. web:
   - `ReceiptUpload` component: `<input type=file accept="image/*,application/pdf" capture="environment">`; read base64; `uploadFundReceiptAction`; refresh; states 上传中 / 已上传回单 · 查看.
   - Wire into the fund queue inline form (T-013) + the voucher-detail panel (replace the free-text 附件编号 input).
   - `查看回单` → web route handler `GET /finance/attachments/fund/[id]` that server-side fetches `${API_BASE_URL}/v1/fund-consumptions/[id]/attachment` with the bearer token and streams the bytes (browser renders img/pdf); open in a new tab.
6. verify: integration tests; gates; live smoke; preview (desktop + mobile camera); docs; governance; commit.

## Risks & mitigations
- Binary streaming through the JSON api-client is awkward → the web proxy route does a raw fetch + pipe, bypassing api-client for the download only.
- Base64 inflates payload ~33%; keep the 10MB cap (matches intake) and validate server-side.
- MUST NOT emit outbox on attach — assert it in an integration test (outbox row count unchanged).

## Acceptance criteria
- [x] Upload + view work end to end on live data (desktop + mobile).
- [x] attach sets a real Attachment.id, writes an audit record, emits zero outbox events; void rejected.
- [x] download round-trips the exact bytes.
- [x] All gates + governance pass.
