import { Injectable } from '@nestjs/common';
import { pingDatabase } from '@my-erp/db';
import type { HealthStatus } from '@my-erp/contracts';

@Injectable()
export class HealthService {
  async check(): Promise<HealthStatus> {
    let dbOk = false;
    try {
      dbOk = await pingDatabase();
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      service: process.env.SERVICE_NAME ?? 'my-erp-api',
      time: new Date().toISOString(),
    };
  }
}
