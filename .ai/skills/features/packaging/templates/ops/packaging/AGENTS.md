# Packaging - AI Guidance

## Conclusions (read first)

- `ops/packaging/` contains all containerization artifacts.
- Use `ctl-packaging.mjs` to manage packaging configuration.
- AI proposes changes; humans execute builds.

## AI Workflow

1. **Register** targets: `node .ai/skills/features/packaging/scripts/ctl-packaging.mjs add-service --id <id> --module <path>`
2. **Customize** Dockerfile if needed (copy from template)
3. **Document** decisions in `handbook/`
4. **Request human** to build and push

## Dockerfile Templates

Use templates from `templates/` as starting points:

- `Dockerfile.node` - Node.js applications
- `Dockerfile.python` - Python applications
- `Dockerfile.go` - Go applications

## Build Commands (Human)

```bash
# Build a single target
docker build -f ops/packaging/services/<name>.Dockerfile -t <registry>/<name>:<tag> .

# Push to registry
docker push <registry>/<name>:<tag>
```

## Registry

All targets are tracked in `docs/packaging/registry.json`.
