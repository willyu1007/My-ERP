# Packaging

Goal: turn code into runnable artifacts.

Repository layout:
- ops/packaging/services/   Packaging definitions per HTTP service
- ops/packaging/jobs/       Packaging definitions per workload/job
- ops/packaging/apps/       Packaging definitions per client/distribution app
- ops/packaging/scripts/    Shared build scripts (preferred entry points)
- ops/packaging/handbook/   Plans, checklists, and build records

Guidelines:
- Keep definitions small and structured.
- For services, container images are a common packaging target.
- Treat artifact naming, versioning, and provenance as first-class.

