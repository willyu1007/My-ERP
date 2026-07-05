import {
  getAccountPreferences,
  listAccounts,
  listCashFlowItems,
  listContracts,
  listVouchers,
} from '@/lib/finance/data-source';
import { DailyAccountingClient } from './daily-accounting-client';

export const dynamic = 'force-dynamic';

export default async function DailyAccountingPage() {
  const [vouchers, accounts, cashFlowItems, contracts, accountPreferences] = await Promise.all([
    listVouchers(),
    listAccounts(),
    listCashFlowItems(),
    listContracts(),
    getAccountPreferences(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <DailyAccountingClient
      vouchers={vouchers}
      accounts={accounts}
      cashFlowItems={cashFlowItems}
      contracts={contracts}
      accountPreferences={accountPreferences}
      initialDate={today}
    />
  );
}
