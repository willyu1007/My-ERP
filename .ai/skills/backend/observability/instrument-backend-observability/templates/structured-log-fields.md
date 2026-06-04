# Template: Structured log fields

Recommended fields (adjust to your stack):
- `timestamp`
- `level`
- `service`
- `environment`
- `requestId` / `correlationId`
- `method`
- `path`
- `status`
- `durationMs`
- `userId` / `tenantId` (only if safe; consider hashing or redaction)
- `operation` (domain operation name)
- `errorCode` (for operational errors)
