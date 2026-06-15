/**
 * T-004 capture seams (domain-agnostic). The platform kernel knows how an intake
 * is captured and extracted, but NOT finance account codes or voucher shape (that
 * is the finance posting template). Real adapters — object-storage archival and a
 * vision/LLM extractor — are deferred; S4 ships a local `ObjectStore` and a mock
 * `Extractor` behind these interfaces, so the real model/backend is a drop-in.
 */

export interface StoredObject {
  storageKey: string;
  sha256: string;
  byteSize: number;
}

export interface PutObjectInput {
  orgId: string;
  ledgerBookId: string;
  bytes: Uint8Array;
  contentType: string;
}

/** Append-only object storage for capture attachments (accounting-archive intent). */
export interface ObjectStore {
  put(input: PutObjectInput): Promise<StoredObject>;
  /** A signed/ephemeral URL for an authorized reader; ERP-side only. */
  getUrl(storageKey: string): Promise<string>;
}

export interface ExtractInput {
  storageKey: string;
  /** Intake kind: `image` | `pdf` | `text` | `structured`. */
  kind: string;
}

/**
 * Extracts fields from a captured document. The returned value MUST validate
 * against the contracts `ExtractionResultSchema` (ERP-internal; financial detail
 * allowed, never sent toward My-Chat). Typed as `unknown` to keep the platform
 * kernel decoupled from the finance/contracts layer; the API validates it.
 */
export interface Extractor {
  extract(input: ExtractInput): Promise<unknown>;
}
