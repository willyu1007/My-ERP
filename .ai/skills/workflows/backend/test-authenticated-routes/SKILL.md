---
name: test-authenticated-routes
description: Execute and record end-to-end smoke tests for authenticated API routes with sanitized evidence, side-effect verification, and a lightweight implementation review.
---

# Test Authenticated Routes

## Purpose
Validate that protected API endpoints work end-to-end after changes, including authentication, authorization, request validation, business logic, and persistence side effects.

## When to use
Use this skill when:
- You added or changed a protected endpoint
- You refactored controller/service/repository code for an endpoint
- You added new permission checks
- You suspect a regression in route wiring or middleware order

Avoid using this skill when:
- You only need to define what to test (use an inventory/planning workflow)
- You are looking for unit-test-only guidance without any end-to-end request execution

## Inputs
- A list of endpoints to test (method + path)
- Expected request/response shapes (or a link to validation schemas)
- Test identities:
  - at least one authorized user
  - optionally one unauthorized/insufficient-role user for negative testing
- Expected persistence side effects for write endpoints
- Execution constraints:
  - environments you are allowed to hit
  - whether destructive operations are allowed

## Outputs
- A per-endpoint smoke test record (one row/section per endpoint):
  - sanitized request + response
  - at least one negative case + response
  - side-effect verification notes (for writes)
- A lightweight implementation review:
  - correctness/security risks
  - maintainability concerns
  - missing tests/validation

## Steps

### 1) Safety and scope check (required)
- Confirm the environment you will test against and any constraints.
- Do not test destructive endpoints unless you have safe test data and approval.

### 2) Inventory endpoints to test
- Prefer using a structured inventory (from diffs/PR notes).
- For each endpoint, note:
  - method
  - full external path (including global prefixes)
  - whether it is protected
  - whether it writes data

### 3) Understand the contract
For each endpoint:
- Required inputs (params/query/body)
- Expected success status + response shape
- Expected failure codes for common failures (`400`, `401`, `403`, `404`)

### 4) Execute the happy path and record evidence
- Call the endpoint using a real authenticated request.
- Record (sanitized):
  - the command or client invocation
  - status code
  - response body shape
  - any returned IDs

### 5) Verify persistence side effects (write endpoints)
- Verify records were created/updated/deleted as expected.
- Verify derived effects (queues/audit logs) if applicable.

### 6) Execute at least one negative case per endpoint
Choose one (or more if high risk):
- missing required field (validation)
- invalid enum/value range (validation)
- missing auth (expect `401`)
- insufficient permission (expect `403`)

### 7) Lightweight implementation review
Check quickly:
- route delegates to controller (no business logic in route)
- controller validates inputs
- service contains business rules
- repository isolates persistence
- errors map consistently to status codes and stable error shapes

## Verification
- [ ] Every listed endpoint has a completed test record
- [ ] Happy path returns expected status code and response shape
- [ ] Negative case(s) recorded with expected status and stable error shape
- [ ] Permission failures return `403` (or your convention) and do not create side effects
- [ ] Write endpoints have side-effect verification notes
- [ ] No secrets or real tokens are logged or recorded

## Boundaries
- MUST NOT use real production credentials
- MUST NOT run destructive writes without explicit approval and safe test data
- MUST NOT log or record secrets/tokens
- MUST NOT approve endpoints without understanding the implementation at a high level
- SHOULD NOT test only happy paths (include negative cases)
- SHOULD capture reproducible evidence so another engineer can re-run the test

## Included assets
- Templates: `./templates/endpoint-test-worksheet.md` is a per-endpoint test record format.
- Examples: `./examples/` includes a sample test record.
