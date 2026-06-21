import { FinanceSettingsClient } from './finance-settings-client';

export const dynamic = 'force-dynamic';

export default function FinanceSettingsPage() {
  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <FinanceSettingsClient />
    </div>
  );
}
