# Example: Sample test record (redacted)

## Endpoint
- `POST /resources`
- Protected: yes
- Writes data: yes

## Happy path
- Auth identity: test user with required role
- Request: `{ "name": "example" }`
- Response:
  - status: `201`
  - body shape: `{ data: { id, name } }`
- Side effects:
  - record exists with expected fields

## Negative case
- Missing `name`
- Response:
  - status: `400`
  - error shape: validation error with details
