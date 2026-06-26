import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  assertVoucherSummaryForSubmit,
  parseVoucherBody,
  parseVoucherLines,
} from './vouchers.controller';

describe('voucher input parsing', () => {
  it('sanitizes fast-entry draft payload and ignores no-account lines for normalized entries', () => {
    const parsed = parseVoucherBody({
      date: '2026-06-26',
      summary: '',
      draftPayload: {
        version: 1,
        summary: '临时记录',
        extra: 'ignored',
        lines: [
          {
            summary: '只有摘要',
            debit: '',
            extra: 'ignored',
          },
          {
            accountCode: '1001',
            accountName: '库存现金',
            summary: '现金',
            debit: '10.00',
          },
        ],
      },
      lines: [
        { summary: '只有摘要', debit: '10.00' },
        { accountCode: '1001', summary: '现金', debit: '10.00' },
      ],
    });

    expect(parsed.summary).toBe('');
    expect(parsed.draftPayload).toEqual({
      version: 1,
      summary: '临时记录',
      lines: [
        {
          summary: '只有摘要',
          debit: '',
        },
        {
          accountCode: '1001',
          accountName: '库存现金',
          summary: '现金',
          debit: '10.00',
        },
      ],
    });

    const normalized = parseVoucherLines(parsed.rawLines);
    expect(normalized.lines).toEqual([
      { accountCode: '1001', summary: '现金', debit: '10.00', credit: null },
    ]);
    expect(normalized.totalDebit).toBe('10.00');
    expect(normalized.totalCredit).toBe('0.00');
  });

  it('rejects unsupported draft payload versions and invalid draft amounts', () => {
    expect(() =>
      parseVoucherBody({
        date: '2026-06-26',
        draftPayload: { version: 2 },
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      parseVoucherBody({
        date: '2026-06-26',
        draftPayload: { version: 1, lines: [{ debit: '1.001' }] },
      }),
    ).toThrow(BadRequestException);
  });

  it('requires a header summary before voucher submit', () => {
    expect(() => assertVoucherSummaryForSubmit('')).toThrow(BadRequestException);
    expect(() => assertVoucherSummaryForSubmit('   ')).toThrow(BadRequestException);
    expect(() => assertVoucherSummaryForSubmit('确认销售收入')).not.toThrow();
  });
});
