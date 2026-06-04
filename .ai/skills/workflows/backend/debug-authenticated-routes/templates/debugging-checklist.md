# Template: Authenticated route debugging checklist

Use the following checklist to debug protected API routes that fail with `401`, `403`, or `404`.

**Redaction rule:** Do **not** paste real tokens, cookie values, API keys, or secrets. Replace values with placeholders like `<REDACTED>`.

## 1) Baseline capture (required)

- Endpoint: `<METHOD> <PATH>`
- Environment: `local | dev | staging | prod`
- Client: `curl | Postman | browser | test suite`
- Expected behavior:
  - Expected status:
  - Required role/permission (if known):

### Failing request evidence

- Request (sanitized) – include one of:
  - `curl ...` (preferred)
  - Postman collection export snippet
  - test invocation command
- Headers (names only if sensitive):
  - `Authorization: Bearer <REDACTED>` (if used)
  - `Cookie: <COOKIE_NAME>=<REDACTED>` (if used)
- Body/query/params (sanitized):

### Observed response evidence

- Status: `401 | 403 | 404 | 5xx`
- Response body (sanitized):
- Relevant server logs (sanitized):

## 2) Confirm auth context is actually attached

- [ ] If cookie/session auth:
  - [ ] Cookie **name** present in request
  - [ ] Cookie **scope** looks correct (domain/path)
  - [ ] Cookie flags are plausible for the environment (Secure/SameSite)
- [ ] If bearer token auth:
  - [ ] Authorization header is present and correctly formatted
  - [ ] Token is not expired (check `exp` claim if JWT)
  - [ ] Token audience/issuer match server expectations (if applicable)

## 3) Classify by status code (pick one path)

### A) `401 Unauthorized` path (auth not established)

Typical causes:
- Missing/stripped auth header or cookie
- Token expired or rejected
- Middleware not running (order/registration)

Checks:
- [ ] Confirm the request includes auth (Section 2)
- [ ] Confirm authentication middleware is mounted for the target route
- [ ] If behind a reverse proxy/gateway:
  - [ ] proxy preserves `Authorization` header
  - [ ] proxy forwards cookies
  - [ ] trusted proxy settings match deployment
- [ ] Confirm server-side token validation inputs (issuer/key/secret) are correct **for the current environment**

### B) `403 Forbidden` path (auth ok, authorization denied)

Typical causes:
- Role/permission mismatch
- Resource-level permission check failing (tenant/org/project id mismatch)
- Inconsistent policy between middleware and business layer

Checks:
- [ ] Confirm identity/claims used by the permission check (what field(s)?)
- [ ] Confirm required permission(s) for the target route are documented or discoverable
- [ ] Compare expected vs actual claims for the test user (sanitized)
- [ ] Check for mismatched identifiers in request context (e.g., tenant id)
- [ ] Confirm the permission check runs in the intended layer (middleware vs service)

### C) `404 Not Found` path (route matching / registration)

Typical causes:
- Wrong global prefix/versioning (`/api`, `/v1`, etc.)
- Method mismatch (`POST` vs `PUT`)
- Route shadowed by an earlier generic matcher
- Router not registered / file not imported

Checks:
- [ ] Confirm method and path are correct for external path (include base prefix)
- [ ] Confirm router/controller file is imported and registered
- [ ] Confirm route order does not shadow the path
- [ ] Confirm the handler is in the expected service/app (monorepos often have multiple servers)

## 4) Apply a minimal fix (approval checkpoint)

Before changing auth/permission policies or middleware behavior:

- [ ] Summarize root cause in 1–3 bullets
- [ ] Propose the **minimal** fix
- [ ] List side effects / risks
- [ ] **Obtain approval** to apply changes that impact authentication/authorization behavior

## 5) Verification evidence (required)

After the fix:

- [ ] Re-run the original failing request (same client, same identity)
  - Observed status:
  - Response body snippet (sanitized):
- [ ] Run at least one negative test:
  - no auth → expect `401`
  - insufficient permission → expect `403`
- [ ] If the route writes data: verify the expected side effects
- [ ] Capture relevant logs/metrics to confirm expected status codes

## 6) Regression prevention (recommended)

- [ ] Add or update an integration/smoke test for the target endpoint (auth + permission)
- [ ] Add a lightweight monitoring signal:
  - auth failure rate (401/403)
  - route not found rate (404)
