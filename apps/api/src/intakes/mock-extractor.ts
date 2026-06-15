import { Injectable } from '@nestjs/common';
import type { ExtractInput, Extractor } from '@my-erp/platform';
import type { ExtractionResult } from '@my-erp/contracts';

/**
 * Deterministic mock Extractor (T-004 decision A). Returns an `ExtractionResult`
 * keyed by intake kind so the capture→extract→draft loop can be proven without a
 * real vision/LLM model. The real Dashscope/通义 adapter is a drop-in behind the
 * same `Extractor` seam; the output schema is the contract callers rely on.
 */
@Injectable()
export class MockExtractor implements Extractor {
  async extract(input: ExtractInput): Promise<ExtractionResult> {
    if (input.kind === 'image' || input.kind === 'pdf') {
      return {
        docType: 'bank_slip',
        fields: {
          amount: { value: '1234.56', confidence: 0.97 },
          direction: { value: 'in', confidence: 0.95 },
          date: { value: '2026-06-15', confidence: 0.98 },
          counterparty: { value: '示例往来单位', confidence: 0.9 },
          summary: { value: '银行收款', confidence: 0.9 },
        },
        confidence: 0.95,
        needsReview: false,
        raw: 'MOCK BANK SLIP · 收款 · 1234.56 · 2026-06-15',
        extractor: { name: 'mock', version: 'v1' },
      };
    }
    return {
      docType: 'unknown',
      fields: {},
      confidence: 0.2,
      needsReview: true,
      extractor: { name: 'mock', version: 'v1' },
    };
  }
}
