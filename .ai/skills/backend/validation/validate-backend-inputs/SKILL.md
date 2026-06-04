---
name: validate-backend-inputs
description: Validate backend HTTP inputs (params, query, body) with schemas and return consistent 4xx errors for invalid requests.
---

# Validate Backend Inputs

## Purpose
Standardize how backend services validate untrusted inputs at the HTTP boundary and how they communicate validation failures to clients.

## When to use
Use this skill when you are:
- Adding or modifying endpoint request shapes
- Introducing new query parameters or path params
- Implementing partial update endpoints (PATCH/PUT)
- Debugging validation errors or inconsistent error responses

## Inputs
- The endpoint contract (params/query/body)
- Validation rules (required fields, formats, min/max, allowed enums)
- Desired error response shape for invalid input

## Outputs
- Validation schemas for request inputs
- A consistent validation error response mapping (`400` / `422` depending on your convention)
- Examples of valid and invalid payloads

## Rules
- All external inputs MUST be validated (params, query, body).
- Validation MUST happen before calling the service layer.
- Validation failures MUST return consistent status codes and error shapes.
- Validation logic SHOULD be centralized and reusable to avoid divergence.

## Steps
1. Define request DTO(s) and choose a schema library (or built-in validation).
2. Implement schemas for:
   - params
   - query
   - body
3. Parse/validate at controller boundary.
4. Convert schema errors to your standard error response.
5. Add:
   - one example valid payload
   - one example invalid payload
6. Verify by hitting the endpoint with both payloads.

## Common patterns
- **Create vs update schemas**
  - Create schemas typically require fields.
  - Update schemas often use `.partial()` or optional fields.

- **Enums**
  - Prefer explicit enums instead of free-form strings.

- **Discriminated unions**
  - Use when request shape varies by a `type` field.

## Verification

- [ ] Valid payloads pass validation and reach the service layer
- [ ] Invalid payloads return consistent 400/422 with structured error details
- [ ] All external inputs (params, query, body) are validated
- [ ] Validation errors include field name and failure reason
- [ ] Schemas match API documentation / OpenAPI spec
- [ ] At least one valid and one invalid payload example exist

## Boundaries

- MUST NOT skip validation for any external input
- MUST NOT call service layer with unvalidated data
- MUST NOT expose internal validation library errors directly to clients
- MUST NOT use free-form strings where enums are appropriate
- SHOULD NOT duplicate validation logic across endpoints (centralize schemas)
- SHOULD NOT validate business rules in the validation layer (delegate to services)

## Included assets
- Templates: `./templates/` includes common schema patterns and a validation error formatter.
- Examples: `./examples/` includes DTO + schema examples with valid/invalid payloads.
