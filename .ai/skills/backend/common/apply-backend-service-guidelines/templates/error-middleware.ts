// Template: Express error middleware (TypeScript)
// Intent: map operational errors to consistent responses; log unknown errors.

import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error-types';

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // Unknown error: log via your logger / error tracker.
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Internal server error' },
  });
}
