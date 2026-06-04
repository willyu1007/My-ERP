# Example: DTO + schema + valid/invalid payloads

## DTO (TypeScript)
```ts
export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  age: number;
}
```

## Valid payload
```json
{ "email": "a@example.com", "firstName": "A", "lastName": "B", "age": 25 }
```

## Invalid payload
```json
{ "email": "not-an-email", "firstName": "", "age": 10 }
```

## Expected response for invalid payload (example)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [
      { "path": ["email"], "message": "Invalid email" },
      { "path": ["firstName"], "message": "String must contain at least 1 character(s)" },
      { "path": ["age"], "message": "Number must be greater than or equal to 18" }
    ]
  }
}
```
