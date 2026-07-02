import type { ReactElement } from 'react';

export default function WorkbenchLoading(): ReactElement {
  return (
    <div className="wb-scene wb-stack wb-stack--lg" aria-busy="true" aria-live="polite">
      <div className="wb-stats wb-stats--compact">
        <div className="wb-stat">
          <span className="wb-stat__label">正在切换</span>
          <span className="wb-stat__value">...</span>
        </div>
        <div className="wb-stat">
          <span className="wb-stat__label">加载工作区</span>
          <span className="wb-stat__value">...</span>
        </div>
      </div>

      <section className="wb-section">
        <div className="wb-section__head">
          <h2 className="wb-section__title">正在加载</h2>
        </div>
        <div className="wb-stack wb-stack--sm">
          <p className="wb-muted">正在打开当前工作界面。</p>
          <div className="wb-row wb-row--wrap">
            <span className="wb-muted">请稍候</span>
            <span className="wb-mono">...</span>
          </div>
        </div>
      </section>
    </div>
  );
}
