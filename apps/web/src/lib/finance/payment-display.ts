/** Display labels + tones for 出纳收付款 (T-007). Pure (no React). */
import type { CardTone } from '@my-erp/ui/contracts';

export const PAYMENT_DIRECTION: Record<string, string> = { receipt: '收款', payment: '付款' };

export const PAYMENT_STATUS: Record<string, string> = {
  pending_accounting: '待补录',
  draft: '草稿',
  pending_approval: '待审批',
  approved: '待确认',
  confirmed: '已确认',
  void: '已作废',
};

export function paymentStatusTone(status: string): CardTone {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'approved':
      return 'info';
    case 'pending_accounting':
    case 'pending_approval':
      return 'warning';
    case 'void':
      return 'muted';
    default:
      return 'muted';
  }
}
