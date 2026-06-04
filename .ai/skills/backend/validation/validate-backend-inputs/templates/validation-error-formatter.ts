// Template: Convert schema errors into a consistent response shape
// Example shown for Zod; adapt to your validator.

import type { ZodError } from 'zod';

export function formatValidationError(err: ZodError) {
  return {
    code: 'VALIDATION_ERROR',
    message: 'Invalid request',
    details: err.errors.map(e => ({
      path: e.path,
      message: e.message,
    })),
  };
}
