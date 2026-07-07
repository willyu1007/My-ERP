'use client';

import { useRef, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui/feedback';
import { uploadFundReceiptAction } from '../vouchers/[id]/fund-actions';

/**
 * 银行回单上传 (T-014) — attach receipt evidence to a fund line. Reads the picked/taken
 * file as base64 and posts it; the backend stores it and points the line at it (NO
 * outbox, NO OCR — the receipt stays inside My-ERP). `capture="environment"` opens the
 * rear camera on mobile so the cashier can snap the receipt on the spot. When a receipt
 * is already attached, offers an in-app 查看 link + 重新上传.
 */
const ACCEPT = 'image/*,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024;

async function readBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return dataUrl.split(',')[1] ?? '';
}

export function ReceiptUpload({
  fundId,
  attachmentId,
  size = 'md',
}: {
  readonly fundId: string;
  readonly attachmentId: string | null | undefined;
  readonly size?: 'sm' | 'md';
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, start] = useTransition();
  const btn = `mt-btn mt-btn--secondary${size === 'sm' ? ' mt-btn--sm' : ''}`;
  const viewHref = `/finance/attachments/fund/${encodeURIComponent(fundId)}`;

  function pick(): void {
    inputRef.current?.click();
  }

  function onFile(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.notify('error', '回单过大', '文件不能超过 10MB');
      return;
    }
    start(async () => {
      const contentBase64 = await readBase64(file);
      const res = await uploadFundReceiptAction(fundId, {
        contentType: file.type || 'image/jpeg',
        contentBase64,
      });
      if (res.ok) {
        toast.notify('success', attachmentId ? '回单已更新' : '回单已上传', file.name);
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify('info', '演示模式', '未连接后端');
      } else if (res.reason === 'conflict') {
        toast.notify('info', '任务已变化', '已被处理或已作废，正在刷新…');
        router.refresh();
      } else {
        toast.notify('error', '上传失败', res.message);
      }
    });
  }

  return (
    <div className="wb-row wb-row--wrap">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        hidden
        onChange={onFile}
      />
      <button type="button" className={btn} disabled={pending} onClick={pick}>
        {pending ? '上传中…' : attachmentId ? '重新上传回单' : '拍照 / 上传回单'}
      </button>
      {attachmentId && (
        <a
          className={`mt-btn mt-btn--ghost${size === 'sm' ? ' mt-btn--sm' : ''}`}
          href={viewHref}
          target="_blank"
          rel="noreferrer"
        >
          查看回单
        </a>
      )}
    </div>
  );
}
