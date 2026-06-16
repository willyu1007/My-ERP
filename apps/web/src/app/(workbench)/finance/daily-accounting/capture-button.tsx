'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui';
import { captureAction } from './actions';

function kindFor(contentType: string): 'image' | 'pdf' {
  return contentType === 'application/pdf' ? 'pdf' : 'image';
}

async function readBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return dataUrl.split(',')[1] ?? '';
}

/** Capture a bill/slip (photo or PDF) → the server extracts it and auto-drafts a
 *  voucher (high confidence), which then appears in the queue to confirm. */
export function CaptureButton() {
  const toast = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const contentType = file.type || 'application/octet-stream';
      const res = await captureAction({
        source: 'web',
        kind: kindFor(contentType),
        contentType,
        contentBase64: await readBase64(file),
      });
      if (res.ok) {
        toast.notify(
          'success',
          '已捕获票据',
          res.voucherId ? '已自动生成凭证草稿，待补全确认' : `已识别（${res.status}）`,
        );
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify('info', '演示模式', '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可真实捕获）');
      } else {
        toast.notify('error', '捕获失败', res.message);
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={onFile}
      />
      <button
        type="button"
        className="mt-btn mt-btn--secondary mt-btn--sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? '识别中…' : '拍照/上传票据'}
      </button>
    </>
  );
}
