# Example: Architecture review report (API + UI change)

## Summary
- What changed: Added `POST /api/orders` and a new `CreateOrderForm` in the UI.
- Overall risk: medium (auth + persistence path)
- Recommended next action: request changes

## Must fix (blocking)
1) **Auth/permission check is incomplete**
   - Evidence: the controller checks "logged in" but does not verify the required role/permission for creating orders.
   - Why it matters: enables privilege escalation in multi-tenant contexts.
   - Proposed fix: enforce a role/permission requirement in a single place (middleware or service) and add a negative test.
   - Verification: request as unauthorized role returns `403` and does not create data.

## Should fix (important)
1) **Input validation is only partial**
   - Evidence: `quantity` is not validated for min/max and can be negative.
   - Proposed fix: add a schema validator and return a consistent validation error shape.
   - Verification: invalid payload returns `400` with stable error code.

2) **Service leaks database-specific types into controller**
   - Evidence: controller directly returns the ORM entity including internal fields.
   - Proposed fix: map to a response DTO and keep ORM types internal.
   - Verification: response only includes documented fields.

## May fix (optional)
- Use a shared error helper to reduce duplicated `try/catch` and ensure consistent status mapping.

## Verification checklist
- [ ] Build/typecheck
- [ ] Unit tests for validation
- [ ] Integration test for `POST /api/orders` (auth + happy path)
- [ ] Manual UI smoke check for form submission

## Notes
- Assumption: order creation is restricted to users with `orders:write` (or equivalent).
