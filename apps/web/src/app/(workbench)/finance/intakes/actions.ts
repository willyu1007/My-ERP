'use server';

import type { CaptureIntake, Intake } from '@my-erp/api-client';
import {
  captureIntake,
  discardIntake,
  draftIntake,
  extractIntake,
} from '@/lib/finance/data-source';

type ActionFailure = {
  readonly ok: false;
  readonly reason: 'unconfigured' | 'error';
  readonly message: string;
};

export type IntakeActionResult = { readonly ok: true; readonly intake: Intake } | ActionFailure;

function toFailure(err: unknown): ActionFailure {
  const message = err instanceof Error ? err.message : String(err);
  const reason = message.includes('not configured') ? 'unconfigured' : 'error';
  return { ok: false, reason, message };
}

export async function captureTicketAction(input: CaptureIntake): Promise<IntakeActionResult> {
  try {
    return { ok: true, intake: await captureIntake(input) };
  } catch (err) {
    return toFailure(err);
  }
}

export async function extractTicketAction(id: string): Promise<IntakeActionResult> {
  try {
    return { ok: true, intake: await extractIntake(id) };
  } catch (err) {
    return toFailure(err);
  }
}

export async function draftTicketAction(id: string): Promise<IntakeActionResult> {
  try {
    return { ok: true, intake: await draftIntake(id) };
  } catch (err) {
    return toFailure(err);
  }
}

export async function discardTicketAction(id: string): Promise<IntakeActionResult> {
  try {
    return { ok: true, intake: await discardIntake(id) };
  } catch (err) {
    return toFailure(err);
  }
}
