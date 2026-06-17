'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui';
import { setContractStatusAction } from '../actions';

/** draft → 执行中 → 已归档 (simple MVP status; D2 lifecycle deferred). */
export function ContractStatusActions({
  id,
  version,
  status,
}: {
  readonly id: string;
  readonly version: number;
  readonly status: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  function run(label: string, next: 'active' | 'closed'): void {
    start(async () => {
      const res = await setContractStatusAction(id, version, next);
      if (res.ok) {
        toast.notify('success', `已${label}`, res.code ?? '');
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify('info', '演示模式', '未连接后端');
      } else if (res.reason === 'conflict') {
        toast.notify('info', '合同已变化', '版本过期，正在刷新…');
        router.refresh();
      } else {
        toast.notify('error', `${label}失败`, res.message);
      }
    });
  }

  if (status === 'closed') return <span className="wb-muted">合同已归档。</span>;

  return (
    <div className="wb-row wb-row--wrap">
      {status === 'draft' && (
        <button type="button" className="mt-btn mt-btn--primary" disabled={pending} onClick={() => run('启用', 'active')}>
          启用合同
        </button>
      )}
      {status === 'active' && (
        <button type="button" className="mt-btn mt-btn--secondary" disabled={pending} onClick={() => run('归档', 'closed')}>
          归档合同
        </button>
      )}
    </div>
  );
}
