import { describe, expect, it } from 'vitest';
import { ExtractionResultSchema } from '@my-erp/contracts';
import { MockExtractor } from './mock-extractor';

describe('MockExtractor', () => {
  const extractor = new MockExtractor();

  it('returns a valid bank-slip ExtractionResult for image/pdf', async () => {
    for (const kind of ['image', 'pdf']) {
      const parsed = ExtractionResultSchema.parse(
        await extractor.extract({ storageKey: 'k', kind }),
      );
      expect(parsed.docType).toBe('bank_slip');
      expect(parsed.fields.amount?.value).toBe('1234.56');
      expect(parsed.needsReview).toBe(false);
    }
  });

  it('returns a low-confidence unknown result for other kinds', async () => {
    const parsed = ExtractionResultSchema.parse(
      await extractor.extract({ storageKey: 'k', kind: 'text' }),
    );
    expect(parsed.docType).toBe('unknown');
    expect(parsed.needsReview).toBe(true);
  });
});
