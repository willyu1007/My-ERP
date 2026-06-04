// Template: HTTP controller skeleton (TypeScript)
// Framework-agnostic intent: validate input, call service, map errors to HTTP responses.

import type { Request, Response } from 'express';
import { z } from 'zod';
import { ExampleService } from './service';

const createThingSchema = z.object({
  name: z.string().min(1),
});

export class ExampleController {
  constructor(private readonly service: ExampleService) {}

  async create(req: Request, res: Response): Promise<void> {
    try {
      const input = createThingSchema.parse(req.body);
      const result = await this.service.createThing(input);
      res.status(201).json({ data: result });
    } catch (err) {
      // Delegate to a shared error mapper in real projects.
      res.status(400).json({ error: { message: 'Invalid request' } });
    }
  }
}
