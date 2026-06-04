# Alert Runbooks

## Purpose
Store alert-specific runbooks under `observability/handbook/alert-runbooks/`.

## Runbook template (MUST include)
- Alert name (exact identifier used by your alerting system)
- Description (what it means)
- Impact (user/business impact)
- Investigation steps (fast triage → deep dive)
- Resolution steps (safe actions first; include rollback)
- Escalation (who to page; when to escalate)

## Boundaries
- No secrets in runbooks.
- Prefer linking to source-of-truth configs and dashboards by path/URL (redact private endpoints if needed).
