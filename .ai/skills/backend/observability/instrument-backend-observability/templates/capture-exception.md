# Template: Exception capture checklist

When capturing an exception:
- include a stable operation name (endpoint/job)
- include correlation ID
- include safe identifiers (entity IDs) when useful
- avoid logging secrets or raw tokens
- attach sanitized request metadata (method/path/status)
