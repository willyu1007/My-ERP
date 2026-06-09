import { EmptyState } from '@my-erp/ui';

export default function LedgerPage() {
  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <EmptyState
        title="账簿 · 敬请期待"
        desc="试算平衡表与总账 / 明细分类账将在 W2 / M1 P4 落地。"
      />
    </div>
  );
}
