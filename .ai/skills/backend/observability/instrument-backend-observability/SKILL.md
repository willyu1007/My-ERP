---
name: instrument-backend-observability
description: Instrument backend services with logging, error tracking, metrics, and tracing to diagnose failures and performance issues.
---

# Instrument Backend Observability

## Purpose
Make backend services diagnosable in production by standardizing logs, error tracking, metrics, and tracing.

## When to use
Use this skill when you are:
- Adding new endpoints or background jobs that require monitoring
- Debugging production incidents (5xx spikes, latency regressions)
- Integrating an error tracker or APM solution
- Standardizing log formats and correlation IDs

## Inputs
- The runtime environment(s) and deployment model
- Current logging and monitoring stack (if any)
- What “good” looks like: SLOs, latency targets, error budgets

## Outputs
- A consistent logging and error tracking plan
- Standard fields for correlation and debugging
- A minimal alert strategy for critical signals

## Core rules
- Unknown errors MUST be captured by an error tracker (or equivalent) with context.
- Logs MUST be structured and SHOULD include a correlation/request ID.
- Sensitive data MUST NOT be logged (tokens, passwords, secrets, raw PII beyond what is required).
- Observability MUST NOT change business behavior (instrumentation should be side-effect free).

## Recommended signals
- **Errors**
  - rate of `5xx`
  - rate of domain-specific `4xx` (for detecting client issues or abuse)
- **Latency**
  - p50/p95/p99 per endpoint
- **Saturation**
  - CPU, memory, DB connection pool utilization
- **Traffic**
  - request volume per endpoint

## Steps
1. Ensure a request/correlation ID exists for every request.
2. Add structured logs at key boundaries:
   - request start/end (method, path, status, duration)
   - key domain actions (entity IDs, operation names)
3. Capture exceptions with context:
   - endpoint name
   - user/tenant identifiers (redacted as needed)
   - correlation ID
4. Add metrics for:
   - request duration
   - error counts
5. Define alerts for:
   - sustained 5xx rate
   - sustained latency regression
6. Verify by simulating:
   - a known operational error
   - an unknown exception

## Verification

- [ ] All requests have a correlation/request ID in logs
- [ ] Structured logs include method, path, status, and duration
- [ ] Exceptions are captured with correlation ID and endpoint context
- [ ] Sensitive data (tokens, passwords, PII) is not present in logs
- [ ] Alerts fire for sustained 5xx rates (test with simulated errors)
- [ ] Latency metrics are recorded per endpoint

## Boundaries

- MUST NOT log secrets, tokens, passwords, or raw PII
- MUST NOT allow observability code to change business behavior
- MUST NOT create high-cardinality metric labels (e.g., user IDs as labels)
- SHOULD NOT log request/response bodies in production (except for debugging)
- SHOULD NOT rely solely on logs for error tracking (use a dedicated tracker)
- SHOULD NOT skip correlation ID propagation in async operations

## Included assets
- Templates: `./templates/` includes recommended log fields and exception capture patterns.
- Examples: `./examples/` includes incident triage checklists.
