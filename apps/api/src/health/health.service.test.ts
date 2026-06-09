import { describe, it, expect, vi } from 'vitest';

vi.mock('@my-erp/db', () => ({
  pingDatabase: vi.fn(async () => true),
}));

import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports ok when the db ping succeeds', async () => {
    const res = await new HealthService().check();
    expect(res.status).toBe('ok');
    expect(typeof res.service).toBe('string');
    expect(typeof res.time).toBe('string');
  });
});
