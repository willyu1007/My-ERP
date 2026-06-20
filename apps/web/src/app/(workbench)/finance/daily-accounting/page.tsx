import {
  listAccounts,
  listCashFlowItems,
  listContracts,
  listVouchers,
} from '@/lib/finance/data-source';
import { getFinanceApi } from '@/lib/finance/request-scope';
import { DailyAccountingClient } from './daily-accounting-client';

export const dynamic = 'force-dynamic';

export default async function DailyAccountingPage() {
  const [vouchers, accounts, cashFlowItems, contracts] = await Promise.all([
    listVouchers(),
    listAccounts(),
    listCashFlowItems(),
    listContracts(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  // No backend configured → fixtures/demo mode; surface a "演示数据" badge.
  const demo = getFinanceApi() === null;
  return (
    <DailyAccountingClient
      vouchers={vouchers}
      accounts={accounts}
      cashFlowItems={cashFlowItems}
      contracts={contracts}
      initialDate={today}
      demo={demo}
    />
  );
}
