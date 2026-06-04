# Example: Feature/module layout

A common layout that scales:

```
features/
  feature-name/
    api/            # API client for this feature
    components/     # UI components (feature-scoped)
    hooks/          # feature-specific hooks
    helpers/        # pure helpers and formatting
    types/          # feature types/DTOs
    routes/         # feature route configuration (optional)
    index.ts        # public exports for the feature
```

Notes:
- Keep feature internals private by default; export only what other modules need.
- Co-locate tests with the module they validate (or keep a parallel test tree).
