import { describe, expect, it } from 'vitest';
import { STANDARD_CHART, STANDARD_CHART_VERSION } from './account';

/** Template shape invariants for the v2 standard chart (T-012 Phase 2, D6). */
describe('STANDARD_CHART v2', () => {
  it('is version 2 and broad enough for common SME needs', () => {
    expect(STANDARD_CHART_VERSION).toBe(2);
    expect(STANDARD_CHART.length).toBeGreaterThanOrEqual(90);
  });

  it('has unique, strictly ascending codes (tree pre-order)', () => {
    const codes = STANDARD_CHART.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (let i = 1; i < codes.length; i += 1) {
      expect(codes[i] > codes[i - 1], `${codes[i]} > ${codes[i - 1]}`).toBe(true);
    }
  });

  it('derives consistent tree fields: parent exists, level chains, leaf flags match', () => {
    const byCode = new Map(STANDARD_CHART.map((a) => [a.code, a]));
    for (const account of STANDARD_CHART) {
      if (account.parentCode === null) {
        expect(account.level).toBe(1);
      } else {
        const parent = byCode.get(account.parentCode);
        expect(parent, `parent of ${account.code}`).toBeDefined();
        expect(account.code.startsWith(account.parentCode)).toBe(true);
        expect(account.level).toBe((parent?.level ?? 0) + 1);
        expect(parent?.isLeaf).toBe(false);
      }
      const hasChildren = STANDARD_CHART.some((c) => c.parentCode === account.code);
      expect(account.isLeaf).toBe(!hasChildren);
    }
  });

  it('keeps every v1 account stable (codes/categories/directions unchanged)', () => {
    const v1 = [
      ['1001', 'asset', 'debit'],
      ['1002', 'asset', 'debit'],
      ['100201', 'asset', 'debit'],
      ['100202', 'asset', 'debit'],
      ['1122', 'asset', 'debit'],
      ['1601', 'asset', 'debit'],
      ['2202', 'liability', 'credit'],
      ['2211', 'liability', 'credit'],
      ['2221', 'liability', 'credit'],
      ['222101', 'liability', 'credit'],
      ['4001', 'equity', 'credit'],
      ['4103', 'equity', 'credit'],
      ['4104', 'equity', 'credit'],
      ['5001', 'cost', 'debit'],
      ['6001', 'profitLoss', 'credit'],
      ['6401', 'profitLoss', 'debit'],
      ['6601', 'profitLoss', 'debit'],
      ['6602', 'profitLoss', 'debit'],
    ] as const;
    const byCode = new Map(STANDARD_CHART.map((a) => [a.code, a]));
    for (const [code, category, direction] of v1) {
      const account = byCode.get(code);
      expect(account, code).toBeDefined();
      expect(account?.category).toBe(category);
      expect(account?.direction).toBe(direction);
    }
  });

  it('keeps counterparties/people out of the chart (aux hints only)', () => {
    // No per-customer/supplier/employee child accounts — those are BusinessPartner
    // / auxiliary dimensions (D6). Receivable/payable stay plain leaves with aux hints.
    for (const code of ['1122', '1123', '1221', '2202', '2203', '2241']) {
      const account = STANDARD_CHART.find((a) => a.code === code);
      expect(account?.isLeaf, code).toBe(true);
      expect(account?.auxTypes?.length, code).toBeGreaterThan(0);
    }
  });
});
