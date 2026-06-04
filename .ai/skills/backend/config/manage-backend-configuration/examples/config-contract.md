# Example: Configuration contract

## Categories
- Runtime environment: `NODE_ENV`, `PORT`
- Persistence: `DATABASE_URL`
- Integrations: external endpoints and API keys
- Feature flags: enable/disable optional behaviors

## Secret handling
- Treat all credentials as secrets.
- Redact secrets in logs by default.
- Consider separate secrets management for production.
