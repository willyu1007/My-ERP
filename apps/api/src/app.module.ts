import { Module } from '@nestjs/common';
import { AccountsController } from './accounts/accounts.controller';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { InvitationsController } from './invitations/invitations.controller';
import { InvitationService } from './invitations/invitation.service';
import { LedgerController } from './ledger/ledger.controller';
import { LedgerBooksController } from './ledger-books/ledger-books.controller';
import { MembersController } from './members/members.controller';
import { OpeningBalancesController } from './opening-balances/opening-balances.controller';
import { OrganizationController } from './organization/organization.controller';
import { VouchersController } from './vouchers/vouchers.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    HealthController,
    OrganizationController,
    LedgerBooksController,
    InvitationsController,
    MembersController,
    AccountsController,
    VouchersController,
    LedgerController,
    OpeningBalancesController,
  ],
  providers: [HealthService, InvitationService],
})
export class AppModule {}
