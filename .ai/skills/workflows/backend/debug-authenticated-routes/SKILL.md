---
name: debug-authenticated-routes
description: Debug authenticated API route failures (401/403/404) by capturing a reproducible request, tracing auth and routing layers, applying minimal fixes with approval gates, and verifying with negative tests.
---

# Debug Authenticated Routes

## Purpose
Systematically diagnose and fix failures on protected API routes, especially:
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found` that only occurs under auth

## When to use
Use this skill when:
- A protected endpoint returns `401` even after login
- A protected endpoint returns `403` unexpectedly (permission mismatch)
- A route returns `404` despite being implemented (registration/prefix/method mismatch)
- Cookie/session or bearer token auth behaves inconsistently
- An auth middleware change caused broad regressions

## Inputs
Provide (or collect) the following:
- Endpoint: method + path
- A failing request example (sanitized):
  - headers (redact secrets)
  - cookie names (redact values)
  - body/query/params
- Observed response:
  - status code
  - response body (sanitized)
- Expected behavior:
  - required user role/permission
  - expected status code and response shape
- Environment context:
  - local vs staging vs production
  - reverse proxy / gateway presence (if any)

## Outputs
- Root-cause diagnosis (which layer is failing and why)
- Minimal fix proposal (code/config changes)
- Verification evidence (how to confirm the fix)
- Optional: regression-prevention recommendation (test/monitoring)

## Steps

### 1) Capture a reproducible failing case (evidence-first)
- Use the request capture template to record a sanitized request + response.
- Ensure the request is reproducible (curl/Postman/test invocation).

### 2) Confirm the auth context is actually attached
- Cookie auth: cookie name present, expected scope/flags for the environment.
- Bearer auth: `Authorization` header present, correctly formatted, token not expired.

### 3) Classify by status code and trace the request path
- `401`: authentication not established or not recognized.
- `403`: authentication established, authorization denies.
- `404`: routing/registration/prefix/method mismatch or route shadowing.
- `5xx`: unhandled exception or downstream dependency failure.

Trace the request through these layers:
1. Request parsing (body, content-type)
2. Authentication middleware
3. Authorization middleware (roles/permissions)
4. Validation middleware (if any)
5. Route matching (method + path + prefix)
6. Controller and service execution

### 4) Identify the smallest change that fixes the root cause
Common root-cause categories:
- Cookie/session transport issues (flags, proxy behavior)
- Bearer token validation issues (expiry, issuer/audience, signing keys)
- Permission checks (role/claims mismatch, wrong tenant/org id)
- Route registration issues (prefix, method, import/registration order)

### 5) Approval checkpoint (required for auth/policy changes)
Before applying any change that impacts authentication/authorization behavior:
- Summarize the root cause in 1–3 bullets.
- Propose the **minimal** fix.
- List expected side effects / risks.
- Obtain explicit approval.

### 6) Apply the minimal fix
- Prefer fixing root causes (wiring, order, prefix, permission rule) over bypasses.
- Avoid weakening production controls.

### 7) Verify with evidence
- Re-run the original failing request using the same auth context.
- Run at least one negative test:
  - invalid/missing auth → expect `401`
  - insufficient permission → expect `403`
- If the route writes data: verify expected side effects (created/updated records, downstream triggers).
- Capture sanitized logs/metrics that confirm expected status codes.

## Verification
- [ ] A sanitized, reproducible failing request is captured (command + response)
- [ ] Root cause is identified (which layer fails and why)
- [ ] Fix resolves the original failure
- [ ] Re-running the request returns expected status and response shape
- [ ] Negative tests behave correctly (`401` for missing auth, `403` for insufficient permission)
- [ ] Side effects verified for write endpoints (if applicable)
- [ ] No secrets/tokens were recorded in outputs

## Boundaries
- MUST NOT paste real tokens, session cookies, API keys, or credentials into artifacts
- MUST NOT weaken production auth/permission checks to “make the request work”
- MUST gate auth/permission policy changes behind explicit approval
- SHOULD add a regression test when the issue was systemic (middleware order, shared auth logic)
- SHOULD NOT assume cookie/token is attached without confirming

## Included assets
- Templates:
  - `./templates/request-capture.md`: sanitize and capture a failing request/response
  - `./templates/debugging-checklist.md`: step-by-step diagnostic checklist with approval gate
- Examples: `./examples/` includes typical 401/403/404 triage notes.
