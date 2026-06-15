import { Module } from '@nestjs/common';
import { AccountsController } from './accounts/accounts.controller';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { IntakesController } from './intakes/intakes.controller';
import { IntakeService } from './intakes/intakes.service';
import { LocalObjectStore } from './intakes/local-object-store';
import { MockExtractor } from './intakes/mock-extractor';
import { EXTRACTOR, OBJECT_STORE } from './intakes/tokens';
import { InvitationsController } from './invitations/invitations.controller';
import { InvitationService } from './invitations/invitation.service';
import { LedgerController } from './ledger/ledger.controller';
import { LedgerBooksController } from './ledger-books/ledger-books.controller';
import { MembersController } from './members/members.controller';
import { OpeningBalancesController } from './opening-balances/opening-balances.controller';
import { OrganizationController } from './organization/organization.controller';
import { VouchersController } from './vouchers/vouchers.controller';
import { WorkItemsController } from './work-items/work-items.controller';
import { WorkItemsService } from './work-items/work-items.service';

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
    WorkItemsController,
    IntakesController,
    LedgerController,
    OpeningBalancesController,
  ],
  providers: [
    HealthService,
    InvitationService,
    WorkItemsService,
    IntakeService,
    { provide: OBJECT_STORE, useClass: LocalObjectStore },
    { provide: EXTRACTOR, useClass: MockExtractor },
  ],
})
export class AppModule {}
