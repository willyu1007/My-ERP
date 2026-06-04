// Template: Create vs Update validation schemas (Zod)

import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  age: z.number().int().min(18).max(120),
});

// For PATCH/PUT updates: allow partial fields
export const updateUserSchema = createUserSchema.partial();
