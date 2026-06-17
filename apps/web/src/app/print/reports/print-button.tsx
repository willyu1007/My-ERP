'use client';

import styles from './print.module.css';

/** Triggers the browser print dialog (→ 打印机 or 另存为 PDF). Hidden when printing. */
export function PrintButton() {
  return (
    <button type="button" className={styles.printBtn} onClick={() => window.print()}>
      打印 / 另存为 PDF
    </button>
  );
}
