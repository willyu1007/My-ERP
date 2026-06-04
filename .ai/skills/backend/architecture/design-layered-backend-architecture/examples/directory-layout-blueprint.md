# Example: Directory layout blueprint

This is a generic layout that maps to route/controller/service/repository layering.

```
src/
  app/                 # app composition (wiring)
    http/              # HTTP bootstrap and server wiring
  routes/              # route registration only
  controllers/         # HTTP controllers
  services/            # business logic
  repositories/        # data access
  middleware/          # cross-cutting HTTP middleware
  validators/          # input schemas
  types/               # shared types and DTOs
  utils/               # small reusable utilities
  tests/               # tests (or colocate by module)
```

Notes:
- Adjust naming to match existing conventions.
- Prefer feature/module grouping if the codebase is large.
