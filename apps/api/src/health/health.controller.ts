import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from '@my-erp/contracts';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async get(): Promise<HealthStatus> {
    return this.health.check();
  }
}
