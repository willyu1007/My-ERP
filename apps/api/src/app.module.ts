import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { LedgerBooksController } from './ledger-books/ledger-books.controller';
import { OrganizationController } from './organization/organization.controller';

@Module({
  imports: [AuthModule],
  controllers: [HealthController, OrganizationController, LedgerBooksController],
  providers: [HealthService],
})
export class AppModule {}
