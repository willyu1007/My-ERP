# Deployment Feature

## Purpose

This feature provides **multi-environment deployment** infrastructure supporting various deployment models.

## Deployment Models

| Model | Description | K8s Sub-modes |
|-------|-------------|---------------|
| `k8s` | Kubernetes | helm, kustomize, manifests |
| `serverless` | Cloud functions | - |
| `vm` | Virtual machines | - |
| `paas` | Platform-as-a-Service | - |

## Key Concepts

### Service Registration

Services must be registered before deployment:

```bash
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs add-service --id api --artifact api:v1.0.0
```

### Environment Configuration

Environments are configured in `ops/deploy/environments/`:

- `dev.yaml` - Development settings
- `staging.yaml` - Staging settings
- `prod.yaml` - Production settings

### Deployment Planning

AI generates deployment plans, but humans execute:

```bash
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs plan --service api --env staging
```

## Kubernetes Support

When using `k8s` model:

### Helm Charts

Place charts in `ops/deploy/k8s/helm/`

### Kustomize

Place overlays in `ops/deploy/k8s/kustomize/`

### Raw Manifests

Place YAML files in `ops/deploy/k8s/manifests/`

## AI/LLM Usage

When working with deployments, AI should:

1. **Register** services via `ctl-deploy add-service`
2. **Plan** deployments via `ctl-deploy plan`
3. **Document** decisions in `handbook/`
4. **Never** execute deployments directly

Humans execute and approve all deployments.

## Quick Reference

```bash
# Initialize
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs init --model k8s

# Add service
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs add-service --id api --artifact api:v1.0.0

# Plan deployment
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs plan --service api --env staging

# Check status
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs status --env staging
```
