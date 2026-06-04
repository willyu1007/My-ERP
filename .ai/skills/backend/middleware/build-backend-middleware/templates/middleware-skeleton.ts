// Template: middleware skeleton (Express-style)

import type { Request, Response, NextFunction } from 'express';

export function exampleMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    // Read inputs from req
    // Optionally write context to res.locals
    next();
  } catch (err) {
    next(err);
  }
}
