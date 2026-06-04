# Example: Request lifecycle map

## Scenario
You want a consistent mental model for “how a request becomes a database write”.

## Lifecycle (conceptual)
1. **HTTP request arrives**
2. **Route matches** (path + method)
3. **Middleware chain runs**
   - authentication / session
   - authorization / permissions
   - request logging / correlation IDs
   - input pre-processing (optional)
4. **Controller executes**
   - validates input
   - calls service
5. **Service executes**
   - enforces business rules
   - orchestrates repositories / integrations
6. **Repository executes**
   - performs queries and mutations
   - uses transactions when required
7. **Controller formats response**
   - success: `2xx` with expected shape
   - known error: consistent `4xx`
   - unknown error: consistent `5xx` (and logs/tracking)
