import { BadRequestException } from '@nestjs/common';

/** Parse a non-negative, ≤ 2-decimal money string; null for empty/absent. */
export function parseAmount(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new BadRequestException(`${field} must be a non-negative decimal (≤ 2dp)`);
  }
  return value;
}
