# Deployment Feature (Optional)

## Conclusions (read first)

- This feature provides **multi-environment deployment** infrastructure.
- Supports multiple deployment models: K8s, serverless, VM, PaaS.
- AI plans deployments; humans execute and approve.

## What this feature writes (blast radius)

New files/directories (created if missing):

- `ops/deploy/` (deployment root)
  - `ops/deploy/AGENTS.md` (LLM guidance)
  - `ops/deploy/http_services/` (HTTP service configs)
  - `ops/deploy/workloads/` (background workload configs)
  - `ops/deploy/clients/` (client application configs)
  - `ops/deploy/k8s/` (Kubernetes-specific, if enabled)
  - `ops/deploy/environments/` (environment configs)
  - `ops/deploy/scripts/` (deployment scripts)
- `ops/deploy/handbook/` (deployment plans)
- `.ai/skills/features/deployment/scripts/ctl-deploy.mjs` (deployment management)
- `.ai/skills/features/deployment/scripts/rollback.mjs` (rollback script)
- `.ai/skills/features/deployment/` (feature documentation)

## Install

### Manual

1. Copy templates from `.ai/skills/features/deployment/templates/` into the repo root (merge / copy-if-missing).
2. Initialize:

   ```bash
   node .ai/skills/features/deployment/scripts/ctl-deploy.mjs init
   ```
3. Optional verification:

   ```bash
   node .ai/skills/features/deployment/scripts/ctl-deploy.mjs verify
   ```

Optional (recommended for LLM routing): record the flag in project state:

```bash
node .ai/scripts/ctl-project-state.mjs init
node .ai/scripts/ctl-project-state.mjs set features.deployment true
```


## Usage

### Initialize Deployment

```bash
# Initialize with Kubernetes
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs init --model k8s

# Initialize for serverless
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs init --model serverless
```

### Register Services

```bash
# Register a service for deployment
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs add-service --id api --artifact api:v1.0.0

# List registered services
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs list
```

### Plan Deployment

```bash
# Generate deployment plan
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs plan --service api --env staging

# Show deployment status
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs status --env staging
```

### View History

```bash
# Show deployment history
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs history --service api
```

## Deployment Models

| Model | Description | K8s Sub-mode |
|-------|-------------|--------------|
| `k8s` | Kubernetes deployment | Yes (helm/kustomize/manifests) |
| `serverless` | Cloud functions | No |
| `vm` | Virtual machines | No |
| `paas` | Platform-as-a-Service | No |

## Kubernetes Sub-modes

When using `k8s` model:

- `helm` - Helm charts in `ops/deploy/k8s/helm/`
- `kustomize` - Kustomize overlays in `ops/deploy/k8s/kustomize/`
- `manifests` - Raw K8s manifests in `ops/deploy/k8s/manifests/`

## Verification

```bash
# Verify deployment configuration
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs verify

# Check status
node .ai/skills/features/deployment/scripts/ctl-deploy.mjs status --env staging
```

## Rollback / Uninstall

Delete these paths:

- `ops/deploy/`
- `.ai/skills/features/deployment/scripts/ctl-deploy.mjs`
- `.ai/skills/features/deployment/scripts/rollback.mjs`
- `.ai/skills/features/deployment/`
