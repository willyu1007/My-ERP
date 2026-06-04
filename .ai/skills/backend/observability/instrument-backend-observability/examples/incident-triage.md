# Example: Incident triage flow

1. Check error rate and latency dashboards.
2. Identify top failing endpoints/operations.
3. Inspect error tracker for:
   - stack traces
   - recent deploy correlation
   - common tags (endpoint, environment)
4. Use correlation IDs to connect:
   - request logs
   - database logs
5. Form a hypothesis and validate via:
   - reproduction in staging
   - feature flag rollback (if available)
   - targeted mitigation (rate limit, input validation)
