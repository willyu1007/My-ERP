import Link from 'next/link';
import { Section, StatusBadge } from '@my-erp/ui';
import { listContracts } from '@/lib/finance/data-source';
import { formatMoney } from '@/lib/finance/format';
import { CONTRACT_STATUS, CONTRACT_TYPE, contractStatusTone } from '@/lib/finance/contract-display';
import { ContractCreateForm } from './contract-create-form';

export const dynamic = 'force-dynamic';

/**
 * 合同 (T-005) — the transaction-lifecycle anchor. Create a contract and link
 * vouchers/payments to it (at entry); the detail page shows the merged timeline.
 */
export default async function ContractsPage() {
  const contracts = await listContracts();

  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <ContractCreateForm />

      <Section title="合同列表">
        {contracts.length === 0 ? (
          <p className="wb-muted">暂无合同。</p>
        ) : (
          <div className="wb-table-wrap">
            <table className="wb-table">
              <thead>
                <tr>
                  <th className="wb-table__th">合同号</th>
                  <th className="wb-table__th">名称</th>
                  <th className="wb-table__th">类型</th>
                  <th className="wb-table__th">对方</th>
                  <th className="wb-table__th wb-table__cell--end">金额</th>
                  <th className="wb-table__th">状态</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} className="wb-table__row">
                    <td>
                      <Link className="wb-mono" href={`/finance/contracts/${c.id}`}>
                        {c.code}
                      </Link>
                    </td>
                    <td>{c.title}</td>
                    <td>{CONTRACT_TYPE[c.type] ?? c.type}</td>
                    <td className="wb-muted">{c.counterparty}</td>
                    <td className="wb-table__cell--end wb-mono">{c.amount ? formatMoney(c.amount) : ''}</td>
                    <td>
                      <StatusBadge tone={contractStatusTone(c.status)} dot label={CONTRACT_STATUS[c.status] ?? c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
