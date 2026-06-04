# Template: Endpoint integration test checklist

- [ ] Start the service in a test mode (or use a test harness).
- [ ] Call the endpoint with a valid request.
- [ ] Assert on:
  - status code
  - response shape
  - persistence side effects (if applicable)
- [ ] Call the endpoint with an invalid request.
- [ ] Assert validation error shape and status code.
