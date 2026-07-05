'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@my-erp/ui/feedback';
import { Select } from '@my-erp/ui/primitives';
import type { Membership, PartnerPartyType, PartnerRole } from '@my-erp/api-client';
import { PARTNER_ROLE_OPTIONS } from '@/lib/finance/partner-display';
import { createBusinessPartnerAction } from './actions';
import styles from './partners.module.css';

const NO_MEMBER = '__none__';

/**
 * 新增往来单位 (T-012 D10: org-entered). Individuals may quick-select a joined
 * member (D2); non-member individuals require an explicit confirmation before save.
 */
export function PartnerCreateForm({
  members,
  onCreated,
}: {
  readonly members: readonly Membership[];
  readonly onCreated?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [partyType, setPartyType] = useState<PartnerPartyType>('organization');
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<readonly PartnerRole[]>([]);
  const [tags, setTags] = useState('');
  const [wechat, setWechat] = useState('');
  const [remark, setRemark] = useState('');
  const [memberUserId, setMemberUserId] = useState(NO_MEMBER);
  const [confirmNonMember, setConfirmNonMember] = useState(false);

  const isIndividual = partyType === 'individual';
  const memberLinked = isIndividual && memberUserId !== NO_MEMBER;
  const needsConfirm = isIndividual && !memberLinked;
  const canSubmit = !pending && name.trim() !== '' && (!needsConfirm || confirmNonMember);

  const memberOptions = [
    { value: NO_MEMBER, label: '不关联成员（组织外个人）' },
    ...members.map((m) => ({ value: m.userId, label: m.email ?? m.userId })),
  ];

  function toggleRole(role: PartnerRole): void {
    setRoles((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
    );
  }

  function switchPartyType(next: PartnerPartyType): void {
    setPartyType(next);
    if (next === 'organization') {
      setMemberUserId(NO_MEMBER);
      setConfirmNonMember(false);
    }
  }

  function create(): void {
    start(async () => {
      const res = await createBusinessPartnerAction({
        partyType,
        name: name.trim(),
        roles: [...roles],
        tags: tags
          .split(/[,，、]/)
          .map((t) => t.trim())
          .filter(Boolean),
        wechat: wechat.trim(),
        remark: remark.trim(),
        ...(memberLinked ? { memberUserId } : {}),
        ...(needsConfirm ? { confirmNonMember: true } : {}),
      });
      if (res.ok) {
        toast.notify('success', '已创建', res.name ?? '');
        setName('');
        setRoles([]);
        setTags('');
        setWechat('');
        setRemark('');
        setMemberUserId(NO_MEMBER);
        setConfirmNonMember(false);
        onCreated?.();
        router.refresh();
      } else if (res.reason === 'unconfigured') {
        toast.notify('info', '演示模式', '未连接后端（设置 API_BASE_URL / API_DEV_TOKEN 后可创建）');
      } else {
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
            value={partyType}
            options={[
              { value: 'organization', label: '单位（公司/组织）' },
              { value: 'individual', label: '个人' },
            ]}
            onChange={(value) => switchPartyType(value as PartnerPartyType)}
            ariaLabel="往来单位类型"
          />
        </div>
        <label className="mt-field">
          <span className="mt-label">名称</span>
          <input
            className="mt-input"
            value={name}
            autoComplete="off"
            placeholder={isIndividual ? '姓名' : '单位名称'}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="mt-field">
          <span className="mt-label">微信号（可选）</span>
          <input
            className="mt-input"
            value={wechat}
            autoComplete="off"
            placeholder="微信号"
            onChange={(e) => setWechat(e.target.value)}
          />
        </label>
        <label className="mt-field">
          <span className="mt-label">标签（可选，逗号分隔）</span>
          <input
            className="mt-input"
            value={tags}
            autoComplete="off"
            placeholder="如：华东, 老客户"
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
        {isIndividual ? (
          <div className="mt-field">
            <span className="mt-label">组织成员（可选）</span>
            <Select
              value={memberUserId}
              options={memberOptions}
              onChange={(value) => {
                setMemberUserId(value);
                if (value !== NO_MEMBER) setConfirmNonMember(false);
              }}
              ariaLabel="关联组织成员"
            />
          </div>
        ) : null}
        <label className="mt-field">
          <span className="mt-label">备注（可选）</span>
          <input
            className="mt-input"
            value={remark}
            autoComplete="off"
            placeholder="补充说明"
            onChange={(e) => setRemark(e.target.value)}
          />
        </label>
      </div>
      <div className="mt-field">
        <span className="mt-label">角色（可多选）</span>
        <div className={styles.roleChecks}>
          {PARTNER_ROLE_OPTIONS.map((option) => (
            <label key={option.value} className={styles.roleCheck}>
              <input
                type="checkbox"
                checked={roles.includes(option.value as PartnerRole)}
                onChange={() => toggleRole(option.value as PartnerRole)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
      {needsConfirm ? (
        <label className={styles.confirmRow}>
          <input
            type="checkbox"
            checked={confirmNonMember}
            onChange={(e) => setConfirmNonMember(e.target.checked)}
          />
          该个人不是组织成员，我确认手工录入
        </label>
      ) : null}
      <div className={styles.actionGroup}>
        <button
          type="button"
          className={`mt-btn mt-btn--primary ${styles.primaryAction}${
            canSubmit ? '' : ' mt-btn--disabled'
          }`}
          disabled={!canSubmit}
          onClick={create}
        >
          {pending ? '创建中…' : '创建往来单位'}
        </button>
      </div>
    </div>
  );
}
