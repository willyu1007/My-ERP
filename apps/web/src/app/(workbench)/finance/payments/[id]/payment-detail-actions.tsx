'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui';
import {
  approvePaymentAction,
  confirmPaymentAction,
  submitPaymentAction,
  voidPaymentAction,
  type PaymentActionResult,
} from '../actions';

/**
 * Status-driven actions for a payment doc (T-007 C3). Buttons match the state
 * machine; the backend enforces SoD + version, surfaced here as toasts.
 */
export function PaymentDetailActions({
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

  function run(label: string, fn: () => Promise<PaymentActionResult>): void {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.notify(
          'success',
          `已${label}`,
          res.postedNo ? `结算凭证 ${res.postedNo}` : (res.no ?? ''),
        );
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify('info', '演示模式', '未连接后端');
      } else if (res.reason === 'conflict') {
        toast.notify('info', '单据已变化', '已被处理或版本过期，正在刷新…');
        router.refresh();
      } else {
        toast.notify('error', `${label}失败`, res.message);
      }
    });
  }

  if (status === 'confirmed' || status === 'void') {
    return <span className="wb-muted">单据已{status === 'confirmed' ? '确认' : '作废'}，无可用操作。</span>;
  }

  return (
    <div className="wb-row wb-row--wrap">
      {status === 'draft' && (
        <button
          type="button"
          className="mt-btn mt-btn--primary"
          disabled={pending}
          onClick={() => run('提交', () => submitPaymentAction(id, version))}
        >
          提交审批
        </button>
      )}
      {status === 'pending_approval' && (
        <button
          type="button"
          className="mt-btn mt-btn--primary"
          disabled={pending}
          onClick={() => run('审批', () => approvePaymentAction(id, version))}
        >
          审批通过
        </button>
      )}
      {status === 'approved' && (
        <button
          type="button"
          className="mt-btn mt-btn--primary"
          disabled={pending}
          onClick={() => run('确认收付', () => confirmPaymentAction(id, version))}
        >
          确认收付并过账
        </button>
      )}
      <button
        type="button"
        className="mt-btn mt-btn--ghost"
        disabled={pending}
        onClick={() => run('作废', () => voidPaymentAction(id, version))}
      >
        作废
      </button>
    </div>
  );
}
