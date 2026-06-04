# Packaging Feature

## Purpose

This feature provides **container and artifact packaging** infrastructure for building, tagging, and managing Docker images.

## Key Concepts

### Target Types

| Type | Location | Purpose |
|------|----------|---------|
| `service` | `ops/packaging/services/` | Long-running services (APIs, web servers) |
| `job` | `ops/packaging/jobs/` | Batch jobs, cron tasks |
| `app` | `ops/packaging/apps/` | CLI tools, utilities |

### Registry

All packaging targets are tracked in `docs/packaging/registry.json`:

```json
{
  "targets": [
    {
      "id": "api",
      "type": "service",
      "module": "apps/backend",
      "dockerfile": "ops/packaging/services/api.Dockerfile"
    }
  ]
}
```

### Templates

Dockerfile templates are available for common languages:

- `Dockerfile.node` - Node.js applications
- `Dockerfile.python` - Python applications
- `Dockerfile.go` - Go applications

## AI/LLM Usage

When working with packaging, AI should:

1. **Register** new targets via `ctl-packaging`
2. **Customize** Dockerfiles based on application needs
3. **Document** decisions in `handbook/`
4. **Never** execute builds directly (human responsibility)

## Quick Reference

```bash
# Initialize
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs init

# Add service
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs add-service --id api --module apps/backend

# List targets
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs list

# Verify
node .ai/skills/features/packaging/scripts/ctl-packaging.mjs verify
```
