# Ops

This folder holds DevOps-oriented configuration and handbook docs.

High-level split (created only when enabled):
- ops/packaging/  Build artifacts (often container images for services)
- ops/deploy/     Run artifacts in environments (deploy/rollback/runbooks)

Guidelines:
- Keep definitions small and structured.
- Prefer a small number of scripts as execution entry points.
- Record decisions and history under ops/*/handbook/.

