'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui/feedback';
import type { BusinessPartner } from '@my-erp/api-client';
import {
  DateButton,
  ExpandableTextField,
  IconChevronDown,
  IconChevronRight,
  IconPlus,
  Select,
} from '@my-erp/ui/primitives';
import { CONTRACT_TYPE } from '@/lib/finance/contract-display';
import { PartnerPicker } from '../_components/partner-picker';
import { createContractAction } from './actions';
import styles from './contracts.module.css';

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const CONTRACT_TYPE_OPTIONS = Object.entries(CONTRACT_TYPE).map(([value, label]) => ({
  value,
  label,
}));

interface TermSection {
  readonly key: 'paymentTerms' | 'acceptanceCriteria' | 'deliveryRequirements' | 'breachTerms';
  readonly label: string;
  readonly defaultOpen: boolean;
  readonly columns: readonly TermColumn[];
}

interface TermColumn {
  readonly key: string;
  readonly label: string;
  readonly placeholder: string;
  readonly inputMode?: 'decimal';
  readonly type?: 'date';
  readonly expandable?: boolean;
  readonly panelAlign?: 'start' | 'end';
}

interface TermRow {
  readonly id: string;
  readonly values: Record<string, string>;
}

const TERM_SECTIONS: readonly TermSection[] = [
  {
    key: 'paymentTerms',
    label: '付款/收款条款',
    defaultOpen: true,
    columns: [
      { key: 'stage', label: '阶段', placeholder: '预付款' },
      { key: 'trigger', label: '触发条件', placeholder: '合同签署', expandable: true },
      { key: 'amount', label: '比例/金额', placeholder: '30% / 10000.00' },
      { key: 'plannedDate', label: '计划日期', placeholder: '', type: 'date' },
      { key: 'note', label: '备注', placeholder: '付款说明', expandable: true, panelAlign: 'end' },
    ],
  },
  {
    key: 'acceptanceCriteria',
    label: '验收标准',
    defaultOpen: true,
    columns: [
      { key: 'item', label: '验收项', placeholder: '到货验收' },
      { key: 'standard', label: '标准', placeholder: '数量一致、外观无损', expandable: true },
      { key: 'material', label: '验收材料', placeholder: '验收单', expandable: true },
      { key: 'owner', label: '责任方', placeholder: '采购 / 业务' },
      { key: 'deadline', label: '时限', placeholder: '3 个工作日' },
    ],
  },
  {
    key: 'deliveryRequirements',
    label: '交付/履约要求',
    defaultOpen: false,
    columns: [
      { key: 'deliverable', label: '交付项', placeholder: '交付物 / 服务范围', expandable: true },
      { key: 'milestone', label: '里程碑/截止日', placeholder: '阶段节点' },
      { key: 'owner', label: '责任方', placeholder: '供应商 / 内部负责人' },
      { key: 'metric', label: '指标/SLA', placeholder: '响应时限 / 质量指标', expandable: true },
      { key: 'note', label: '备注', placeholder: '补充说明', expandable: true, panelAlign: 'end' },
    ],
  },
  {
    key: 'breachTerms',
    label: '违约/终止责任',
    defaultOpen: false,
    columns: [
      { key: 'scenario', label: '场景', placeholder: '逾期交付' },
      { key: 'trigger', label: '触发条件', placeholder: '超过约定期限', expandable: true },
      { key: 'liability', label: '责任/赔偿', placeholder: '违约金 / 赔偿方式', expandable: true },
      { key: 'handling', label: '处理方式', placeholder: '整改 / 终止', expandable: true },
      { key: 'note', label: '备注', placeholder: '补充说明', expandable: true, panelAlign: 'end' },
    ],
  },
];

type TermSectionKey = TermSection['key'];
type TermValues = Record<TermSectionKey, readonly TermRow[]>;
type TermOpenState = Record<TermSectionKey, boolean>;

let nextTermRowId = 0;

function nextRowId(sectionKey: TermSectionKey): string {
  nextTermRowId += 1;
  return `${sectionKey}-${Date.now().toString(36)}-${nextTermRowId}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function emptyRow(section: TermSection): TermRow {
  return {
    id: nextRowId(section.key),
    values: Object.fromEntries(section.columns.map((column) => [column.key, ''])),
  };
}

function emptyTerms(): TermValues {
  return {
    paymentTerms: [emptyRow(TERM_SECTIONS[0])],
    acceptanceCriteria: [emptyRow(TERM_SECTIONS[1])],
    deliveryRequirements: [emptyRow(TERM_SECTIONS[2])],
    breachTerms: [emptyRow(TERM_SECTIONS[3])],
  };
}

function defaultOpenTerms(): TermOpenState {
  return {
    paymentTerms: true,
    acceptanceCriteria: true,
    deliveryRequirements: false,
    breachTerms: false,
  };
}

function hasTermRowValue(row: TermRow): boolean {
  return Object.values(row.values).some((value) => value.trim() !== '');
}

function buildSummary(terms: TermValues): string {
  return TERM_SECTIONS.map((section) => {
    const lines = terms[section.key]
      .map((row) => {
        const parts = section.columns
          .map((column) => {
            const value = row.values[column.key]?.trim() ?? '';
            return value ? `${column.label}：${value}` : '';
          })
          .filter(Boolean);
        return parts.length > 0 ? parts.join('；') : '';
      })
      .filter(Boolean);
    return lines.length > 0
      ? `${section.label}：\n${lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}`
      : '';
  })
    .filter(Boolean)
    .join('\n\n');
}

/** 新建合同 — drafts a Contract (code auto-assigned), then routes to its detail/timeline. */
export function ContractCreateForm({
  partners,
}: {
  readonly partners: readonly BusinessPartner[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'sales' | 'purchase' | 'service' | 'other'>('sales');
  const [counterparty, setCounterparty] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [terms, setTerms] = useState<TermValues>(() => emptyTerms());
  const [termOpen, setTermOpen] = useState<TermOpenState>(() => defaultOpenTerms());

  const amountOk = amount === '' || AMOUNT_RE.test(amount);
  const dateOrderOk = startDate === '' || endDate === '' || startDate <= endDate;
  const canSubmit = !pending && title.trim() !== '' && amountOk && dateOrderOk;
  const summary = buildSummary(terms);

  function toggleTermSection(key: TermSectionKey): void {
    setTermOpen((current) => ({ ...current, [key]: !current[key] }));
  }

  function updateTermCell(
    sectionKey: TermSectionKey,
    rowId: string,
    columnKey: string,
    value: string,
  ): void {
    setTerms((current) => ({
      ...current,
      [sectionKey]: current[sectionKey].map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [columnKey]: value } } : row,
      ),
    }));
  }

  function addTermRow(section: TermSection): void {
    setTerms((current) => ({
      ...current,
      [section.key]: [...current[section.key], emptyRow(section)],
    }));
  }

  function removeTermRow(section: TermSection, rowId: string): void {
    setTerms((current) => {
      const rows = current[section.key];
      if (rows.length <= 1) {
        return { ...current, [section.key]: [emptyRow(section)] };
      }
      return { ...current, [section.key]: rows.filter((row) => row.id !== rowId) };
    });
  }

  function create(): void {
    start(async () => {
      const res = await createContractAction({
        title: title.trim(),
        type,
        counterparty: counterparty.trim(),
        ...(partnerId ? { partnerId } : {}),
        amount: amount === '' ? null : amount,
        startDate: startDate || null,
        endDate: endDate || null,
        summary,
      });
      if (res.ok && res.id) {
        toast.notify('success', '已创建', res.code ?? '');
        router.push(`/finance/contracts/${res.id}`);
      } else if (!res.ok && res.reason === 'unconfigured') {
        toast.notify(
          'info',
          '演示模式',
          '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可创建）',
        );
      } else if (!res.ok) {
        toast.notify('error', '创建失败', res.message);
      }
    });
  }

  return (
    <div className="mt-card wb-stack wb-stack--md">
      <div className={styles.formGrid}>
        <div className="mt-field">
          <span className="mt-label">类型</span>
          <Select
            value={type}
            options={CONTRACT_TYPE_OPTIONS}
            onChange={(value) => setType(value as typeof type)}
            ariaLabel="合同类型"
          />
        </div>
        <label className="mt-field">
          <span className="mt-label">合同名称</span>
          <input
            id="contract-title"
            name="title"
            className="mt-input"
            value={title}
            placeholder="如：年度供货合同"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="mt-field">
          <span className="mt-label">对方单位</span>
          <PartnerPicker
            partners={partners}
            partnerId={partnerId}
            text={counterparty}
            onSelect={(partner) => {
              setPartnerId(partner.id);
              setCounterparty(partner.name);
            }}
            onTextChange={(text) => {
              setPartnerId('');
              setCounterparty(text);
            }}
            ariaLabel="对方单位"
            placeholder="搜索或输入客户 / 供应商"
          />
        </div>
        <label className="mt-field">
          <span className="mt-label">合同金额（可选）</span>
          <input
            id="contract-amount"
            name="amount"
            className={`mt-input${amount !== '' && !amountOk ? ' mt-input--error' : ''}`}
            inputMode="decimal"
            value={amount}
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="mt-field">
          <span className="mt-label">生效日期</span>
          <DateButton
            value={startDate}
            ariaLabel="生效日期"
            className={styles.datePickerButton}
            onChange={setStartDate}
          />
        </label>
        <label className="mt-field">
          <span className="mt-label">到期日期</span>
          <DateButton
            value={endDate}
            ariaLabel="到期日期"
            className={styles.datePickerButton}
            invalid={!dateOrderOk}
            onChange={setEndDate}
          />
        </label>
        <div className={`mt-field ${styles.sourceField}`}>
          <span className="mt-label">合同原文</span>
          <div className={styles.sourceControl}>
            <button type="button" className="mt-btn mt-btn--secondary" disabled>
              上传原文
            </button>
            <span
              className={styles.sourceHelp}
              title="原文入库、OCR 与条款结构化后续接入"
              aria-label="原文入库、OCR 与条款结构化后续接入"
              role="img"
            >
              ?
            </span>
          </div>
        </div>
      </div>
      <div className={styles.termsSection}>
        <div className={styles.termTables}>
          {TERM_SECTIONS.map((section) => {
            const rows = terms[section.key];
            const isOpen = termOpen[section.key];
            const filledRows = rows.filter(hasTermRowValue).length;
            const tableId = `contract-${section.key}-table`;

            return (
              <section key={section.key} className={styles.termTableSection}>
                <div className={styles.termTableHeader}>
                  <button
                    type="button"
                    className={styles.termTableToggle}
                    aria-expanded={isOpen}
                    aria-controls={tableId}
                    onClick={() => toggleTermSection(section.key)}
                  >
                    <span className={styles.termChevron} aria-hidden="true">
                      {isOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                    </span>
                    <span>{section.label}</span>
                  </button>
                  {isOpen ? (
                    <button
                      type="button"
                      className={styles.termInlineAddButton}
                      aria-label={`添加${section.label}行`}
                      onClick={() => addTermRow(section)}
                    >
                      <IconPlus size={14} />
                      <span>添加行</span>
                    </button>
                  ) : null}
                  <span className={styles.termCount}>{filledRows}</span>
                </div>
                {isOpen ? (
                  <div id={tableId} className={styles.termTableWrap}>
                    <table className={`wb-table ${styles.termTable}`}>
                      <thead>
                        <tr>
                          {section.columns.map((column) => (
                            <th key={column.key} className="wb-table__th">
                              {column.label}
                            </th>
                          ))}
                          <th className={`wb-table__th ${styles.termActionHeader}`}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIndex) => (
                          <tr key={row.id} className="wb-table__row">
                            {section.columns.map((column) => (
                              <td key={column.key} className={styles.termCell}>
                                <span className={styles.termMobileLabel}>{column.label}</span>
                                {column.type === 'date' ? (
                                  <DateButton
                                    value={row.values[column.key] ?? ''}
                                    ariaLabel={`${section.label}第 ${rowIndex + 1} 行${column.label}`}
                                    density="compact"
                                    className={`${styles.termCellInput} ${styles.termDateButton}`}
                                    onChange={(value) =>
                                      updateTermCell(section.key, row.id, column.key, value)
                                    }
                                  />
                                ) : column.expandable ? (
                                  <ExpandableTextField
                                    value={row.values[column.key] ?? ''}
                                    inputMode={column.inputMode}
                                    placeholder={column.placeholder}
                                    ariaLabel={`${section.label}第 ${rowIndex + 1} 行${column.label}`}
                                    density="compact"
                                    className={styles.termCellInput}
                                    panelClassName={
                                      column.panelAlign === 'end' ? styles.termTextPanelEnd : ''
                                    }
                                    onChange={(value) =>
                                      updateTermCell(section.key, row.id, column.key, value)
                                    }
                                  />
                                ) : (
                                  <input
                                    className={`mt-input ${styles.termCellInput}`}
                                    value={row.values[column.key] ?? ''}
                                    inputMode={column.inputMode}
                                    placeholder={column.placeholder}
                                    aria-label={`${section.label}第 ${rowIndex + 1} 行${column.label}`}
                                    onChange={(e) =>
                                      updateTermCell(
                                        section.key,
                                        row.id,
                                        column.key,
                                        e.target.value,
                                      )
                                    }
                                  />
                                )}
                              </td>
                            ))}
                            <td className={styles.termActionCell}>
                              <button
                                type="button"
                                className={styles.termRemoveButton}
                                aria-label={`删除${section.label}第 ${rowIndex + 1} 行`}
                                onClick={() => removeTermRow(section, row.id)}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
      <div className={styles.actionGroup}>
        <button
          type="button"
          className={`mt-btn mt-btn--primary ${styles.primaryAction}${
            canSubmit ? '' : ' mt-btn--disabled'
          }`}
          disabled={!canSubmit}
          onClick={create}
        >
          {pending ? '登记中…' : '登记合同'}
        </button>
      </div>
    </div>
  );
}
