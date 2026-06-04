# Example: Transactional workflow (conceptual)

## Scenario
Creating an order requires:
- inserting an order row
- inserting order items
- reserving inventory

## Pattern
- Start transaction.
- Insert order.
- Insert items.
- Reserve inventory (or mark inventory rows) inside the same transaction.
- Commit.
- On failure: rollback and return a domain-specific error (e.g., `409` conflict).
