import { z } from 'zod';

/**
 * Shared API/event contracts (zod). Generated OpenAPI types and event schemas
 * grow here across M1; P0a ships the health contract used by api + web.
 */
export const HealthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  service: z.string(),
  time: z.string(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
