import { EmptyState } from '@my-erp/ui';

export default function AccountsPage() {
  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <EmptyState
        title="会计科目 · 敬请期待"
        desc="科目体系（《小企业会计准则》模板 + 多级科目树 + 辅助核算）将在 W2 / M1 P2 落地。"
      />
    </div>
  );
}
