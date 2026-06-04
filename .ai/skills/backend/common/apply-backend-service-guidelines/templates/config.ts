// Template: typed configuration module (TypeScript)
// Intent: centralize configuration and validate at startup.

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast so misconfigurations are detected early.
  // In production you may want to redact values in logs.
  throw new Error('Invalid environment configuration');
}

export const config = {
  env: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
};
