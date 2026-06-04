# Rollback Procedure

## Quick Steps

1. Identify the issue
2. Check deployment history: `node .ai/skills/features/deployment/scripts/ctl-deploy.mjs history --service <id>`
3. Execute rollback (see below)

## Detailed Procedure

### 1. Assess Impact

- Check monitoring dashboards
- Review error logs
- Determine affected services
- Notify stakeholders if needed

### 2. Execute Rollback

#### Kubernetes

```bash
# Rollback to previous revision
kubectl rollout undo deployment/<service-name> -n <namespace>

# Rollback to specific revision
kubectl rollout undo deployment/<service-name> -n <namespace> --to-revision=<number>

# Check rollout history
kubectl rollout history deployment/<service-name> -n <namespace>
```

#### Helm

```bash
# List release history
helm history <release-name> -n <namespace>

# Rollback to previous
helm rollback <release-name> -n <namespace>

# Rollback to specific revision
helm rollback <release-name> <revision> -n <namespace>
```

### 3. Verify

- Check service health
- Monitor error rates
- Confirm user impact resolved
- Update status page if applicable

### 4. Post-Incident

- Document what happened
- Identify root cause
- Plan preventive measures
- Update this runbook if needed
