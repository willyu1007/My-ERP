/** Display vocabulary for 往来单位 (BusinessPartner, T-012). */

export const PARTNER_PARTY_TYPE: Record<string, string> = {
  organization: '单位',
  individual: '个人',
};

export const PARTNER_ROLE: Record<string, string> = {
  customer: '客户',
  supplier: '供应商',
  employee: '员工',
  reimbursee: '报销人',
  contractor: '外包/承包',
  shareholder: '股东',
  other: '其他',
};

export const PARTNER_ROLE_OPTIONS = Object.entries(PARTNER_ROLE).map(([value, label]) => ({
  value,
  label,
}));

export function partnerRolesLabel(roles: readonly string[]): string {
  if (roles.length === 0) return '未分类';
  return roles.map((role) => PARTNER_ROLE[role] ?? role).join('、');
}
