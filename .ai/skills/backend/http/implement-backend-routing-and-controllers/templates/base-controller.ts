// Template: BaseController utilities (Express-style)
// Intent: provide consistent success/error responses.

import type { Response } from 'express';
import { AppError } from './error-types';

export abstract class BaseController {
  protected ok<T>(res: Response, data: T): void {
    res.status(200).json({ data });
  }

  protected created<T>(res: Response, data: T): void {
    res.status(201).json({ data });
  }

  protected noContent(res: Response): void {
    res.status(204).send();
  }

  protected fail(res: Response, err: unknown): void {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  }
}
