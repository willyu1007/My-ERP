'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Intake } from '@my-erp/api-client';
import type { CardTone, RowModel } from '@my-erp/ui/contracts';
import { useToast } from '@my-erp/ui/feedback';
import { EntityRow } from '@my-erp/ui/list';
import { DateButton, EmptyState, ExpandableTextField, Select } from '@my-erp/ui/primitives';
import { formatDate, formatMoney } from '@/lib/finance/format';
import {
  captureTicketAction,
  discardTicketAction,
  draftTicketAction,
  extractTicketAction,
  type IntakeActionResult,
} from './actions';
import styles from './intakes.module.css';

type IntakeQueueKey = 'open' | 'drafted' | 'confirmed' | 'discarded' | 'all';
type IntakeStatus = Intake['status'];
type ProcessingObject = 'invoice' | 'bank_slip' | 'receipt' | 'contract_attachment' | 'unknown';
type IntakeKind = 'image' | 'pdf';

const INTAKE_QUEUES: readonly { readonly key: IntakeQueueKey; readonly label: string }[] = [
  { key: 'open', label: '待生成' },
  { key: 'drafted', label: '待补全' },
  { key: 'confirmed', label: '已确认' },
  { key: 'discarded', label: '已作废' },
  { key: 'all', label: '全部' },
];

const PROCESSING_OBJECTS: readonly { readonly value: ProcessingObject; readonly label: string }[] =
  [
    { value: 'invoice', label: '发票' },
    { value: 'bank_slip', label: '银行回单' },
    { value: 'receipt', label: '收据' },
    { value: 'contract_attachment', label: '合同附件' },
    { value: 'unknown', label: '其他票据' },
  ];

const STATUS_LABELS: Record<IntakeStatus, string> = {
  received: '待生成',
  extracting: '识别中',
  extracted: '待生成',
  drafted: '待补全凭证',
  confirmed: '已确认',
  discarded: '已作废',
  failed: '待生成',
};

const KIND_LABELS: Record<Intake['kind'], string> = {
  image: '图片',
  pdf: 'PDF',
  text: '文本',
  structured: '结构化数据',
};

const DOC_TYPE_LABELS: Record<NonNullable<Intake['extraction']>['docType'], string> = {
  bank_slip: '银行回单',
  invoice: '发票',
  receipt: '收据',
  unknown: '票据',
};

const FIELD_LABELS: Record<
  ProcessingObject,
  readonly {
    readonly key: string;
    readonly label: string;
    readonly placeholder: string;
    readonly inputMode?: 'decimal';
  }[]
> = {
  invoice: [
    { key: 'date', label: '开票日期', placeholder: '年 / 月 / 日' },
    { key: 'docNo', label: '发票号码', placeholder: '发票号码' },
    { key: 'counterparty', label: '销售方/购买方', placeholder: '对方单位' },
    { key: 'amount', label: '价税合计', placeholder: '0.00', inputMode: 'decimal' },
    { key: 'taxAmount', label: '税额', placeholder: '0.00', inputMode: 'decimal' },
    { key: 'summary', label: '用途/摘要', placeholder: '用途或业务摘要' },
  ],
  bank_slip: [
    { key: 'date', label: '业务日期', placeholder: '年 / 月 / 日' },
    { key: 'direction', label: '收付方向', placeholder: '收款/付款' },
    { key: 'counterparty', label: '对方户名', placeholder: '对方户名' },
    { key: 'amount', label: '金额', placeholder: '0.00', inputMode: 'decimal' },
    { key: 'docNo', label: '银行流水号', placeholder: '流水号' },
    { key: 'summary', label: '摘要', placeholder: '交易摘要' },
  ],
  receipt: [
    { key: 'date', label: '收据日期', placeholder: '年 / 月 / 日' },
    { key: 'counterparty', label: '出具方', placeholder: '出具方' },
    { key: 'amount', label: '金额', placeholder: '0.00', inputMode: 'decimal' },
    { key: 'docNo', label: '收据号', placeholder: '收据号' },
    { key: 'summary', label: '事由', placeholder: '收款或付款事由' },
  ],
  contract_attachment: [
    { key: 'date', label: '签署/归档日期', placeholder: '年 / 月 / 日' },
    { key: 'counterparty', label: '对方单位', placeholder: '对方单位' },
    { key: 'docNo', label: '合同号/附件号', placeholder: '合同号或附件号' },
    { key: 'summary', label: '附件说明', placeholder: '版本、页数或归档说明' },
  ],
  unknown: [
    { key: 'date', label: '日期', placeholder: '年 / 月 / 日' },
    { key: 'counterparty', label: '对方', placeholder: '对方单位' },
    { key: 'amount', label: '金额', placeholder: '0.00', inputMode: 'decimal' },
    { key: 'docNo', label: '单号', placeholder: '票据号码' },
    { key: 'summary', label: '摘要', placeholder: '用途或业务摘要' },
  ],
};

function statusTone(status: IntakeStatus): CardTone {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'extracted':
    case 'drafted':
    case 'received':
      return 'warning';
    case 'failed':
      return 'danger';
    case 'discarded':
      return 'muted';
    case 'extracting':
      return 'info';
  }
}

function matchesQueue(intake: Intake, queue: IntakeQueueKey): boolean {
  if (queue === 'all') return true;
  if (queue === 'open') return isPendingGeneration(intake);
  return intake.status === queue;
}

function countOf(intakes: readonly Intake[], queue: IntakeQueueKey): number {
  return intakes.filter((intake) => matchesQueue(intake, queue)).length;
}

function isPendingGeneration(intake: Intake): boolean {
  return (
    intake.status === 'received' ||
    intake.status === 'extracting' ||
    intake.status === 'extracted' ||
    intake.status === 'failed'
  );
}

function statusRank(status: IntakeStatus): number {
  switch (status) {
    case 'received':
    case 'extracting':
    case 'extracted':
    case 'failed':
      return 0;
    case 'drafted':
      return 1;
    case 'confirmed':
      return 2;
    case 'discarded':
      return 3;
  }
}

function sortIntakes(items: readonly Intake[]): readonly Intake[] {
  return [...items].sort((a, b) => {
    const rankDiff = statusRank(a.status) - statusRank(b.status);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function fieldValue(intake: Intake, key: string): string {
  const fields = intake.extraction?.fields as
    | Record<string, { readonly value?: unknown } | undefined>
    | undefined;
  const field = fields?.[key];
  return field?.value ? String(field.value) : '';
}

function docTypeLabel(intake: Intake): string {
  return DOC_TYPE_LABELS[intake.extraction?.docType ?? 'unknown'];
}

function objectFromIntake(intake: Intake): ProcessingObject {
  const docType = intake.extraction?.docType;
  if (docType === 'invoice' || docType === 'bank_slip' || docType === 'receipt') return docType;
  return 'unknown';
}

function objectToCaptureKind(file: File): IntakeKind {
  return file.type === 'application/pdf' ? 'pdf' : 'image';
}

function intakeTitle(intake: Intake): string {
  const counterparty = fieldValue(intake, 'counterparty');
  const summary = fieldValue(intake, 'summary');
  if (summary && counterparty) return `${counterparty} · ${summary}`;
  if (summary) return summary;
  if (counterparty) return counterparty;
  return docTypeLabel(intake);
}

function actionLabel(intake: Intake): string {
  if (intake.status === 'extracted') return '生成凭证';
  if (intake.status === 'drafted' && intake.targetId) return '补全凭证';
  if (intake.status === 'received' || intake.status === 'failed') return '处理';
  return '查看';
}

function intakeToRow(intake: Intake): RowModel {
  const amount = fieldValue(intake, 'amount');
  const docNo = fieldValue(intake, 'docNo');
  const date = fieldValue(intake, 'date');
  const meta = [
    { text: formatDate(intake.createdAt.slice(0, 10)) },
    { text: KIND_LABELS[intake.kind] },
    ...(date ? [{ text: date }] : []),
    ...(amount ? [{ text: `${formatMoney(amount)} CNY` }] : []),
  ];

  return {
    title: intakeTitle(intake),
    sub: docNo || docTypeLabel(intake),
    meta,
    status: {
      tone: statusTone(intake.status),
      label: STATUS_LABELS[intake.status],
    },
  };
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

function ProcessingFields({
  object,
  intake,
}: {
  readonly object: ProcessingObject;
  readonly intake?: Intake;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextValues: Record<string, string> = {};
    for (const field of FIELD_LABELS[object]) {
      nextValues[field.key] = intake ? fieldValue(intake, field.key) : '';
    }
    setValues(nextValues);
  }, [intake, object]);

  function updateField(key: string, value: string): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className={styles.fieldGrid}>
      {FIELD_LABELS[object].map((field) => {
        const isSummary = field.key === 'summary';
        const isWideSummary = isSummary && object !== 'invoice' && object !== 'bank_slip';
        const fieldClassName = isWideSummary ? `${styles.field} ${styles.fieldWide}` : styles.field;

        return (
          <div key={field.key} className={fieldClassName}>
            <span className={styles.fieldLabel}>{field.label}</span>
            {field.key === 'date' ? (
              <DateButton
                value={values[field.key] ?? ''}
                ariaLabel={field.label}
                placeholder={field.placeholder}
                onChange={(value) => updateField(field.key, value)}
              />
            ) : isSummary ? (
              <ExpandableTextField
                value={values[field.key] ?? ''}
                ariaLabel={field.label}
                placeholder={field.placeholder}
                rows={5}
                onChange={(value) => updateField(field.key, value)}
              />
            ) : (
              <input
                className={styles.fieldInput}
                inputMode={field.inputMode}
                aria-label={field.label}
                placeholder={field.placeholder}
                value={values[field.key] ?? ''}
                onChange={(event) => updateField(field.key, event.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PreviewPane({ intake, file }: { readonly intake?: Intake; readonly file: File | null }) {
  const previewUrl = useMemo(() => {
    if (!file || !file.type.startsWith('image/')) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (previewUrl) {
    return (
      <div className={styles.previewPane}>
        <img className={styles.previewImage} src={previewUrl} alt="已选择票据预览" />
      </div>
    );
  }

  if (file) {
    return (
      <div className={styles.previewPane}>
        <div className={styles.previewPlaceholder}>
          <strong>{file.name}</strong>
          <span>
            {file.type || '文件'} · {Math.max(1, Math.round(file.size / 1024))} KB
          </span>
        </div>
      </div>
    );
  }

  if (intake) {
    return (
      <div className={styles.previewPane}>
        <div className={styles.previewPlaceholder}>
          <strong>{KIND_LABELS[intake.kind]}</strong>
          <span>附件已入库</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.previewPane}>
      <div className={styles.previewPlaceholder}>
        <strong>未上传</strong>
        <span>选择文件后可预览图片或确认文件信息</span>
      </div>
    </div>
  );
}

function ProcessingPanel({
  object,
  intake,
  pending,
  onCollapse,
  onUpload,
  onExtract,
  onDraft,
  onDiscard,
}: {
  readonly object: ProcessingObject;
  readonly intake?: Intake;
  readonly pending: boolean;
  readonly onCollapse: () => void;
  readonly onUpload: (file: File) => void;
  readonly onExtract: (intake: Intake) => void;
  readonly onDraft: (intake: Intake) => void;
  readonly onDiscard: (intake: Intake) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const canExtract = intake?.status === 'received' || intake?.status === 'failed';
  const canDraft = intake?.status === 'extracted';
  const targetHref = intake?.targetId ? `/finance/vouchers/${intake.targetId}` : null;

  function pickFile(): void {
    inputRef.current?.click();
  }

  function onFile(event: ChangeEvent<HTMLInputElement>): void {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    setFile(selected);
    onUpload(selected);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className={styles.processingPanel} aria-label="票据录入">
      <div className={styles.processingHeader}>
        <div className={styles.headerActionsLeft}>
          <button type="button" className="mt-btn mt-btn--ghost" onClick={onCollapse}>
            收起
          </button>
          <button type="button" className="mt-btn mt-btn--ghost" disabled={pending}>
            暂存
          </button>
        </div>
        <div className={styles.headerActionsRight}>
          {targetHref ? (
            <Link href={targetHref} className="mt-btn mt-btn--ghost">
              补全凭证
            </Link>
          ) : (
            <button
              type="button"
              className="mt-btn mt-btn--ghost"
              disabled={!canDraft || pending}
              onClick={() => intake && onDraft(intake)}
            >
              生成凭证
            </button>
          )}
          <button
            type="button"
            className="mt-btn mt-btn--ghost"
            disabled={
              !intake || intake.status === 'confirmed' || intake.status === 'discarded' || pending
            }
            onClick={() => intake && onDiscard(intake)}
          >
            作废
          </button>
        </div>
      </div>

      <div className={styles.processingBody}>
        <div className={styles.processingForm}>
          <ProcessingFields object={object} intake={intake} />
        </div>
        <aside className={styles.processingSide}>
          <div className={styles.uploadArea}>
            <PreviewPane intake={intake} file={file} />
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={onFile}
            />
            <div className={styles.sideActions}>
              <button
                type="button"
                className="mt-btn mt-btn--ghost"
                disabled={pending}
                onClick={pickFile}
              >
                {pending ? '处理中…' : intake ? '重新上传票据' : '上传票据'}
              </button>
              <button
                type="button"
                className="mt-btn mt-btn--ghost"
                disabled={!canExtract || pending}
                onClick={() => intake && onExtract(intake)}
              >
                识别
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function IntakesClient({ intakes }: { readonly intakes: readonly Intake[] }) {
  const router = useRouter();
  const toast = useToast();
  const [queue, setQueue] = useState<IntakeQueueKey>('open');
  const [selectedObject, setSelectedObject] = useState<ProcessingObject | ''>('');
  const [selectedIntakeId, setSelectedIntakeId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedIntake = selectedIntakeId
    ? intakes.find((intake) => intake.id === selectedIntakeId)
    : undefined;
  const activeObject =
    selectedObject || (selectedIntake ? objectFromIntake(selectedIntake) : undefined);
  const filtered = sortIntakes(intakes).filter((intake) => matchesQueue(intake, queue));

  function runAction(
    action: () => Promise<IntakeActionResult>,
    successTitle: string,
    after?: (intake: Intake) => void,
  ): void {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.notify('success', successTitle, STATUS_LABELS[result.intake.status]);
        setSelectedIntakeId(result.intake.id);
        after?.(result.intake);
        router.refresh();
      } else if (result.reason === 'unconfigured') {
        toast.notify('info', '暂不可执行', '当前环境未开放票据录入');
      } else {
        toast.notify('error', '操作失败', result.message);
      }
    });
  }

  function upload(file: File): void {
    if (!activeObject) return;
    startTransition(async () => {
      const contentType = file.type || 'application/octet-stream';
      const result = await captureTicketAction({
        source: 'web',
        kind: objectToCaptureKind(file),
        contentType,
        contentBase64: await readBase64(file),
      });
      if (result.ok) {
        toast.notify('success', '已上传票据', '待生成');
        setSelectedIntakeId(result.intake.id);
        router.refresh();
      } else if (result.reason === 'unconfigured') {
        toast.notify('info', '暂不可执行', '当前环境未开放票据录入');
      } else {
        toast.notify('error', '上传失败', result.message);
      }
    });
  }

  function selectObject(value: string): void {
    const next = value as ProcessingObject;
    setSelectedObject(next);
    setSelectedIntakeId(null);
  }

  function selectIntake(intake: Intake): void {
    setSelectedIntakeId(intake.id);
    setSelectedObject(objectFromIntake(intake));
  }

  return (
    <div className={styles.pageStack}>
      <div className={styles.queueHeader}>
        <div className={styles.objectField}>
          <Select
            value={selectedObject}
            ariaLabel="票据对象"
            placeholder="处理对象"
            options={PROCESSING_OBJECTS}
            variant="action"
            onChange={selectObject}
          />
        </div>
        <div className="wb-segmented" role="tablist" aria-label="票据录入队列">
          {INTAKE_QUEUES.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={queue === item.key}
              className={`wb-segmented__item${queue === item.key ? ' wb-segmented__item--active' : ''}`}
              onClick={() => setQueue(item.key)}
            >
              {item.label}
              <span className="wb-segmented__count">{countOf(intakes, item.key)}</span>
            </button>
          ))}
        </div>
      </div>

      {activeObject ? (
        <ProcessingPanel
          object={activeObject}
          intake={selectedIntake}
          pending={pending}
          onCollapse={() => {
            setSelectedObject('');
            setSelectedIntakeId(null);
          }}
          onUpload={upload}
          onExtract={(intake) => runAction(() => extractTicketAction(intake.id), '已识别')}
          onDraft={(intake) =>
            runAction(
              () => draftTicketAction(intake.id),
              '已生成凭证',
              (updated) => {
                if (updated.targetId) router.push(`/finance/vouchers/${updated.targetId}`);
              },
            )
          }
          onDiscard={(intake) => runAction(() => discardTicketAction(intake.id), '已作废')}
        />
      ) : null}

      <div className={styles.queueList}>
        {filtered.length === 0 ? (
          <div className={activeObject ? styles.queueEmptyCompact : styles.queueEmpty}>
            <EmptyState title="暂无票据" desc="当前队列没有需要处理的票据。" />
          </div>
        ) : (
          <div className="wb-list wb-list--framed">
            {filtered.map((intake) => (
              <EntityRow
                key={intake.id}
                model={{
                  ...intakeToRow(intake),
                  trailing: (
                    <button
                      type="button"
                      className="mt-btn mt-btn--secondary mt-btn--sm"
                      onClick={() => selectIntake(intake)}
                    >
                      {actionLabel(intake)}
                    </button>
                  ),
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
