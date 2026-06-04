// Template: route file (Express-style)
// Intent: define paths and middleware; delegate to controller methods.

import { Router } from 'express';
import { ExampleController } from './controller';

export function createExampleRouter(controller: ExampleController): Router {
  const router = Router();

  // Example: GET /items/:id
  router.get('/:id', async (req, res) => controller.getById(req, res));

  // Example: POST /items
  router.post('/', async (req, res) => controller.create(req, res));

  return router;
}
