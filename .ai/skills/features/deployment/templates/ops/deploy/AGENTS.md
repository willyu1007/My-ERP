# Deployment - AI Guidance

## Conclusions (read first)

- `ops/deploy/` contains all deployment configuration.
- Use `ctl-deploy.mjs` to manage deployments.
- AI plans deployments; humans execute and approve.

## AI Workflow

1. **Register** services: `node .ai/skills/features/deployment/scripts/ctl-deploy.mjs add-service --id <id>`
2. **Plan** deployment: `node .ai/skills/features/deployment/scripts/ctl-deploy.mjs plan --service <id> --env <env>`
3. **Document** in `handbook/`
4. **Request human** to execute deployment

## Environment Rules

| Environment | AI Permissions |
|-------------|---------------|
| `dev` | Can propose direct deployment |
| `staging` | Requires review |
| `prod` | Requires formal approval |

## Deployment Models

- `k8s` - Kubernetes (helm/kustomize/manifests)
- `serverless` - Cloud functions
- `vm` - Virtual machines
- `paas` - Platform-as-a-Service

## Forbidden Actions

- Direct deployment execution
- Credential handling
- Production changes without approval
- Skipping environment progression
