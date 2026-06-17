import { BadRequestException } from '@nestjs/common';

/** Calendar-aware date (rejects month 13 / day 99); periods use {@link PERIOD_RE}. */
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** A YYYY-MM accounting period. */
export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Assert a strict YYYY-MM-DD date string; throws 400 otherwise. */
export function assertDate(value: unknown, field = 'date'): string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date`);
  }
  return value;
}
