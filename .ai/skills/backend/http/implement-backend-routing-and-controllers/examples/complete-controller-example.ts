// Example: Controller implementing validation + service delegation (TypeScript, Express-style)

import type { Request, Response } from 'express';
import { z } from 'zod';
import { BaseController } from '../templates/base-controller';
import { UserService } from './user-service';

const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  age: z.number().int().min(18).max(120),
});

export class UserController extends BaseController {
  constructor(private readonly userService: UserService) {
    super();
  }

  async getUser(req: Request, res: Response): Promise<void> {
    try {
      const user = await this.userService.findById(req.params.id);
      if (!user) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
        return;
      }
      this.ok(res, user);
    } catch (err) {
      this.fail(res, err);
    }
  }

  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const input = createUserSchema.parse(req.body);
      const created = await this.userService.create(input);
      this.created(res, created);
    } catch (err) {
      // In real code, map schema errors to a structured validation response.
      this.fail(res, err);
    }
  }
}
