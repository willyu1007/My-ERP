# Debug Mode — Privacy & Redaction Guidelines

## Principle
Collect the minimum evidence needed to debug the issue while avoiding exposure of secrets or PII.

## Do not log
- passwords, access tokens, refresh tokens, API keys,
- private keys, certificates, auth headers,
- full payment details, government IDs, medical info,
- full request/response bodies by default,
- raw email/phone/address unless essential.

## Prefer safe proxies
Instead of logging sensitive values:
- presence flags: `token_present=true`
- lengths: `token_len=32`
- stable hashes: `user_hash=sha256(user_id + salt)` (salt stored securely, not in logs)
- categories: `error_kind=timeout|validation|auth`

## Redaction patterns
If you must log a string that may contain sensitive content:
- redact tokens:
  - `abcd...wxyz` (first 4 + last 4)
- redact emails:
  - `j***@example.com`
- redact phone:
  - `***-***-1234`

## Journal-specific rules
The debug journal at `.ai/.tmp/<task_id>/journal.md` must be safe to persist and share:
- Do not paste raw/full logs; store only short **redacted** excerpts (max 10 lines).
- Keep “Evidence summary” concise (<= 8 bullets).
- Replace any secrets with `***REDACTED***` (tokens, keys, passwords, auth headers).
- Replace emails/phones with stable placeholders if correlation is needed:
  - `user_1@example.com` → `<email:user1>`
  - `+1-202-555-0199` → `<phone:user1>`
- Avoid copying full request/response bodies; prefer metadata (status codes, durations, counts).

## Safe logging examples
- ✅ `logger.info("[DBG:<run_id>] refresh_token_present=%s", refreshToken != null)`
- ✅ `logger.info("[DBG:<run_id>] response_status=%d duration_ms=%d", status, duration)`
- ❌ `logger.info("[DBG:<run_id>] refresh_token=%s", refreshToken)`

## Handling user-provided logs
If a user pastes logs containing secrets:
- advise them to rotate/revoke as needed,
- continue debugging using redacted values.

## Data minimization for mobile logs
Mobile logs often include device identifiers. Prefer:
- app version/build number,
- OS version,
- device model category (e.g., “iPhone 13”) if needed,
and avoid unique identifiers unless necessary.
