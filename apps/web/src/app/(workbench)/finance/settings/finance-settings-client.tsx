/**
 * FinanceSettingsClient — host wiring for the kit's <SettingsFrame>. Declares the
 * 账务 settings as a data schema (account-set / approval / cash sections); the kit
 * owns the draft / dirty / save lifecycle. This replaces the old card-grid
 * directory with real editable settings.
 *
 * Demo: onSave is mocked (W1 has no backend) — it resolves and toasts success.
 * Per the contract, a real onSave must REJECT on failure so the form stays dirty.
 */
'use client';

import { SettingsFrame, useToast, type SettingsSchema, type SettingsValues } from '@my-erp/ui';

const SCHEMA: SettingsSchema = {
  sections: [
    {
      key: 'period',
      label: '账套与期间',
      blocks: [
        {
          kind: 'group',
          label: '基本参数',
          fields: [
            {
              kind: 'select',
              key: 'baseCurrency',
              label: '本位币',
              desc: '所有金额单位基准；切换后影响报表展示。',
              options: [
                { value: 'CNY', label: '人民币（元）' },
                { value: 'USD', label: '美元' },
                { value: 'EUR', label: '欧元' },
              ],
            },
            {
              kind: 'select',
              key: 'periodStartMonth',
              label: '会计期间起始',
              desc: '确定每个会计年度的第一个月份。',
              options: [
                { value: '1', label: '1 月（自然年）' },
                { value: '4', label: '4 月（财年）' },
                { value: '7', label: '7 月（自定义）' },
              ],
            },
            {
              kind: 'toggle',
              key: 'autoPeriodClose',
              label: '期间自动封闭',
              desc: '月末自动锁定已过账凭证，禁止修改。',
            },
          ],
        },
      ],
    },
    {
      key: 'approval',
      label: '审批规则',
      blocks: [
        {
          kind: 'group',
          label: '工作流配置',
          fields: [
            {
              kind: 'toggle',
              key: 'enableMultiLevelApproval',
              label: '启用多级审批',
              desc: '凭证 / 收付款超过金额阈值时需多人依序审批。',
            },
            {
              kind: 'number',
              key: 'approvalAmountThreshold',
              label: '单笔金额阈值',
              min: 0,
              step: 100,
              placeholder: '例：50000',
              desc: '超过此金额的凭证需审批；单位为本位币。',
            },
            {
              kind: 'toggle',
              key: 'enforceResponsibilitySeparation',
              label: '职责分离（SoD）',
              desc: '制单人不可同时作为审核人、过账人。',
            },
          ],
        },
      ],
    },
    {
      key: 'cash',
      label: '资金账户',
      blocks: [
        {
          kind: 'group',
          label: '现金与银行',
          fields: [
            {
              kind: 'textarea',
              key: 'cashAccountCodes',
              label: '现金科目编码（每行一个）',
              rows: 4,
              placeholder: '例：\n1001\n1002',
              desc: '收付款单中“货币资金科目”的可选范围。',
            },
            {
              kind: 'toggle',
              key: 'requireCashFlowItem',
              label: '强制标记现金流量项目',
              desc: '现金相关凭证必须在非现金分录标注流量项目。',
            },
          ],
        },
      ],
    },
  ],
};

const INITIAL: SettingsValues = {
  baseCurrency: 'CNY',
  periodStartMonth: '1',
  autoPeriodClose: true,
  enableMultiLevelApproval: true,
  approvalAmountThreshold: 50000,
  enforceResponsibilitySeparation: true,
  cashAccountCodes: '1001\n1002',
  requireCashFlowItem: false,
};

export function FinanceSettingsClient(): React.ReactElement {
  const toast = useToast();
  return (
    <SettingsFrame
      schema={SCHEMA}
      values={INITIAL}
      onSave={async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 400);
        });
        toast.notify('success', '账务设置已保存', '演示：未连接后端');
      }}
      onError={(e) => toast.notify('error', '保存失败', String(e))}
    />
  );
}
