// Example: Route file delegating to controller (TypeScript, Express-style)

import { Router } from 'express';
import { UserController } from './user-controller';

// Placeholder middleware names (auth, audit, etc.)
function requireAuth(_req: any, _res: any, next: any) { next(); }
function audit(_req: any, _res: any, next: any) { next(); }

export function createUserRouter(controller: UserController): Router {
  const router = Router();

  router.get('/:id', requireAuth, audit, async (req, res) => controller.getUser(req, res));
  router.post('/', requireAuth, audit, async (req, res) => controller.createUser(req, res));

  return router;
}
