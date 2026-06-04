// Template: typed + validated configuration module

import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  // Add secrets and other settings here:
  // API_TOKEN: z.string().min(1),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Avoid printing sensitive values.
  throw new Error('Invalid configuration');
}

export const config = {
  env: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
};
