import { Module } from '@nestjs/common';
import { AccountPreferencesController } from './account-preferences/account-preferences.controller';
import { AccountsController } from './accounts/accounts.controller';
import { AuthModule } from './auth/auth.module';
import { BusinessPartnersController } from './business-partners/business-partners.controller';
import { BusinessPartnersService } from './business-partners/business-partners.service';
import { CashFlowController } from './cash-flow/cash-flow.controller';
import { CashFlowService } from './cash-flow/cash-flow.service';
import { ContractsController } from './contracts/contracts.controller';
import { ContractsService } from './contracts/contracts.service';
import { FundConsumptionsController } from './fund-consumptions/fund-consumptions.controller';
import { FundConsumptionsService } from './fund-consumptions/fund-consumptions.service';
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
import { MeController } from './me/me.controller';
import { MembersController } from './members/members.controller';
import { OpeningBalancesController } from './opening-balances/opening-balances.controller';
import { OrganizationController } from './organization/organization.controller';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { PeriodCloseController } from './period-close/period-close.controller';
import { PeriodCloseService } from './period-close/period-close.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
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
    MeController,
    MembersController,
    AccountsController,
    AccountPreferencesController,
    VouchersController,
    WorkItemsController,
    IntakesController,
    LedgerController,
    OpeningBalancesController,
    PeriodCloseController,
    CashFlowController,
    ReportsController,
    PaymentsController,
    ContractsController,
    BusinessPartnersController,
    FundConsumptionsController,
  ],
  providers: [
    HealthService,
    InvitationService,
    WorkItemsService,
    IntakeService,
    PeriodCloseService,
    CashFlowService,
    ReportsService,
    PaymentsService,
    ContractsService,
    BusinessPartnersService,
    FundConsumptionsService,
    { provide: OBJECT_STORE, useClass: LocalObjectStore },
    { provide: EXTRACTOR, useClass: MockExtractor },
  ],
})
export class AppModule {}
