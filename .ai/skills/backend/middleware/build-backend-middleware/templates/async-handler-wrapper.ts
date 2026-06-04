// Template: async handler wrapper to forward rejected promises to next()

import type { Request, Response, NextFunction, RequestHandler } from 'express';

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
