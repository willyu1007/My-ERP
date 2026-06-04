# Example: Repository responsibilities

A repository implementation typically:
- applies consistent filters (e.g., “active only”)
- performs ordering and pagination
- performs joins/includes when appropriate
- hides transaction and ORM details from the service

Keep repository methods aligned with domain use cases, e.g.:
- `findActiveUsers()`
- `findByEmail(email)`
- `createUserWithProfile(data)`
