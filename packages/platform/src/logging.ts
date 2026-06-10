import { randomUUID } from 'node:crypto';

/**
 * Minimal structured (single-line JSON) logging + a tracing seam. SLS-ready as
 * is; the full OpenTelemetry SDK (spans → ARMS/SLS) wires in behind these same
 * call sites later without touching callers.
 */
export interface LogContext {
  readonly traceId?: string;
  readonly userId?: string;
  readonly orgId?: string;
  readonly ledgerBookId?: string;
  readonly action?: string;
  readonly [key: string]: unknown;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function newTraceId(): string {
  return randomUUID();
}

export function log(level: LogLevel, message: string, context: LogContext = {}): void {
  const entry = { level, message, time: new Date().toISOString(), ...context };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * Tracing seam — runs `fn` as a logical span (begin/ok|err + duration). Today
 * it emits structured logs; later it is backed by an OTel tracer/span with no
 * change at call sites.
 */
export async function withSpan<T>(
  name: string,
  context: LogContext,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    log('info', `span.ok ${name}`, { ...context, durationMs: Date.now() - start });
    return result;
  } catch (err) {
    log('error', `span.err ${name}`, {
      ...context,
      durationMs: Date.now() - start,
      error: (err as Error).message,
    });
    throw err;
  }
}
