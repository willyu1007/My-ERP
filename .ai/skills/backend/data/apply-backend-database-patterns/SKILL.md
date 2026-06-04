---
name: apply-backend-database-patterns
description: Apply safe and maintainable backend database patterns (transactions, pagination, soft deletes, query optimization, data consistency).
---

# Apply Backend Database Patterns

## Purpose
Provide practical patterns for safe data access and persistence: transactional workflows, consistent querying, and predictable performance.

## When to use
Use this skill when you are:
- Implementing repository methods or complex queries
- Adding transactional “all-or-nothing” workflows
- Debugging performance issues (slow queries, N+1)
- Introducing pagination, filtering, or sorting
- Designing idempotent writes for retries
- Implementing soft delete or archival behavior

## Inputs
- Data model (entities/relations) and invariants
- Expected read/write volume and latency requirements
- Failure modes that must be handled (conflicts, duplicates, timeouts)
- The query layer used by the codebase (ORM, query builder, raw SQL)

## Outputs
- Repository method designs (inputs/outputs and invariants)
- A transaction strategy (where transactions start/end)
- Query patterns for pagination/filtering
- A verification checklist for correctness and performance

## Core rules
- Persistence code MUST be isolated behind repositories (or a clearly defined data-access layer).
- Transactions MUST be used when partial failure would corrupt state.
- Writes SHOULD be idempotent when requests can be retried.
- Queries MUST be scoped and paginated for potentially large datasets.

## Common patterns

### Transactions
Use a transaction when:
- multiple writes must commit together
- you need consistency across reads and writes
- you need to prevent partial side effects

Avoid long-lived transactions:
- keep them as short as possible
- do not call external services inside a transaction unless the design explicitly accounts for it

### Pagination
- Use cursor pagination when:
  - datasets are large
  - stable ordering is required
- Use offset pagination when:
  - datasets are small
  - simplicity matters more than absolute correctness under concurrent writes

### Soft delete
Soft delete is appropriate when:
- you need auditability or recovery
- external systems may reference records

When using soft delete:
- queries MUST consistently filter out deleted rows unless explicitly requested
- unique constraints MAY need to include “deleted” flags

### Avoid N+1 queries
- Fetch related entities via joins/includes when appropriate.
- Consider batching, caching, or explicit query composition.

## Steps
1. Define data invariants (what MUST always be true).
2. Define repository contract:
   - inputs
   - outputs
   - error cases
3. Choose transaction boundaries for multi-step workflows.
4. Implement queries with:
   - explicit filters
   - explicit ordering
   - pagination for large lists
5. Validate performance assumptions:
   - expected query count
   - indexes required
   - hot paths
6. Add verification:
   - one correctness test
   - one performance sanity check (where practical)

## Verification

- [ ] Repository methods return expected results for valid inputs
- [ ] Transactions roll back completely on failure (no partial commits)
- [ ] Pagination returns correct page sizes and cursor/offset handling
- [ ] Soft delete queries correctly exclude deleted records by default
- [ ] Query performance meets latency targets (check query plans if needed)
- [ ] N+1 queries are not introduced (verify query count in tests)

## Boundaries

- MUST NOT call external services inside database transactions
- MUST NOT expose ORM-specific types to service layer (unless intentionally standardized)
- MUST NOT skip transaction boundaries for multi-write operations
- MUST NOT use unbounded queries on large datasets
- SHOULD NOT use offset pagination for large or frequently-updated datasets
- SHOULD NOT hold transactions open longer than necessary

## Included assets
- Templates: `./templates/` includes pagination and transaction scaffolds.
- Examples: `./examples/` includes transactional workflow patterns.
