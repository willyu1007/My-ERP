/** Display labels + tones for 合同 (T-005). Pure (no React). */
import type { CardTone } from '@my-erp/ui/contracts';

export const CONTRACT_TYPE: Record<string, string> = {
  sales: '销售',
  purchase: '采购',
  service: '服务',
  other: '其他',
};

export const CONTRACT_STATUS: Record<string, string> = {
  draft: '草稿',
  active: '执行中',
  closed: '已归档',
};

export function contractStatusTone(status: string): CardTone {
  switch (status) {
    case 'active':
      return 'success';
    case 'closed':
      return 'muted';
    default:
      return 'info';
  }
}

export const TIMELINE_KIND: Record<string, string> = {
  contract: '合同',
  voucher: '凭证',
  payment: '收付款',
};
