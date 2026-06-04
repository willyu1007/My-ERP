# Template: Lazy route scaffold (conceptual)

- Use `lazy()` (or your router’s lazy mechanism) to split route bundles.
- Wrap lazy routes in a Suspense boundary with a consistent loading UI.
- Provide an error boundary for chunk-load failures where supported.
