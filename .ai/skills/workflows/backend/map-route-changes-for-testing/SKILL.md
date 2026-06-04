---
name: map-route-changes-for-testing
description: Map changed API routes into a testable inventory (method, path, request/response shapes, valid/invalid payloads) to drive smoke testing.
---

# Map Route Changes for Testing

## Purpose
Turn “routes changed in this work” into an actionable test inventory so you can efficiently smoke test what matters.

## When to use
Use this skill when:
- You changed route files and need to identify what to test
- You need to generate test cases for multiple endpoints quickly
- You want a structured record to hand off for verification

## Inputs
- Source of truth for changes:
  - version control diff/commit range
  - PR file list
  - local change list
- Optional: additional route hints from the user (paths or modules)
- Service routing configuration (prefixes, base path, API versioning)

## Outputs
- A deduplicated list of endpoints with:
  - method
  - path
  - authentication requirement (best-effort)
  - request shape notes
  - response shape notes
  - one valid payload example
  - one invalid payload example
- A short recommended test order (highest risk first)

## Steps
1. **Collect changed route candidates**
   - Use version control to list changed files in the route layer.
   - Include controller/service changes when they imply endpoint behavior changes.

2. **Resolve route base paths/prefixes**
   - Identify any global prefixes (e.g., `/api`, `/v1`) applied at the server level.
   - Normalize endpoint paths to the final externally visible path.

3. **Enumerate endpoints**
   - For each route definition, capture:
     - HTTP method
     - path pattern
     - required params/query/body

4. **Infer request/response shapes**
   - Prefer explicit validation schemas and DTOs as the source of truth.
   - If schemas are absent, infer from controller/service usage and note uncertainty.

5. **Generate payload examples**
   - Provide:
     - one valid example that should succeed
     - one invalid example that should fail validation (or permission)

6. **Produce a structured inventory**
   - Output as JSON records (one per endpoint) or a table.
   - Include “notes” fields where assumptions are made.

7. **Use the inventory to test**
   - Execute the happy path first for each endpoint.
   - Verify persistence side effects for write endpoints.

## Verification

- [ ] Route inventory includes all changed endpoints
- [ ] Each endpoint has method, path, and auth requirement documented
- [ ] Valid payload examples conform to expected request shapes
- [ ] Invalid payload examples trigger expected validation errors
- [ ] Route prefixes match actual deployed paths
- [ ] Inventory is usable for smoke testing (no missing critical info)

## Boundaries

- MUST NOT include real credentials or secrets in payload examples
- MUST NOT skip authentication requirements in the inventory
- MUST NOT assume route prefixes without verifying configuration
- SHOULD NOT generate inventory for unchanged routes (focus on changes)
- SHOULD NOT omit error cases (include at least one invalid example per endpoint)
- SHOULD NOT hand off inventory without verifying at least one endpoint works

## Included assets
- Templates: `./templates/route-inventory.json` provides a JSON shape for endpoint records.
- Examples: `./examples/` includes a sample inventory entry.
