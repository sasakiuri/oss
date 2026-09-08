// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { TimingMeasurementAnalyzer } from '@/main/modules/timing-profiles/domain/TimingMeasurementAnalyzer';

const analyzer = new TimingMeasurementAnalyzer();
const request = (samples: unknown) => ({
  sourceName: 'measurement.json',
  content: JSON.stringify(samples),
  receiptMarginMilliseconds: 5.1,
  clockMarginMilliseconds: 2,
});
describe('timing measurement analysis', () => {
  it('uses the worst measured interval rather than averaging or discarding slow observations', () => {
    const input = request([
      { kind: 'RECEIPT_DELAY', valueMilliseconds: 1, uncertaintyMilliseconds: 0 },
      { kind: 'RECEIPT_DELAY', valueMilliseconds: 110.2, uncertaintyMilliseconds: 0.3 },
      { kind: 'CLOCK_OFFSET', valueMilliseconds: 3.1, uncertaintyMilliseconds: 0.2 },
      { kind: 'CLOCK_OFFSET', valueMilliseconds: -7.1, uncertaintyMilliseconds: 0.1 },
    ]);
    expect(analyzer.analyze(input)).toMatchObject({
      receiptSamples: 2,
      clockSamples: 2,
      sourceSha256: createHash('sha256').update(input.content).digest('hex'),
      settings: { mode: 'BOUNDED', maximumReceiptDelayMilliseconds: 116, clockUncertaintyMilliseconds: 10 },
    });
  });
  it('preserves unknown bounds for an unmeasured clock and accepts a UTF-8 BOM', () => {
    const input = request([{ kind: 'RECEIPT_DELAY', valueMilliseconds: 0, uncertaintyMilliseconds: 0 }]);
    input.content = '\uFEFF' + input.content;
    expect(analyzer.analyze(input).settings).toEqual({
      mode: 'BOUNDED',
      maximumReceiptDelayMilliseconds: 6,
      clockUncertaintyMilliseconds: null,
    });
  });
  it.each(
    (
      [
        [],
        [{ kind: 'RECEIPT_DELAY', valueMilliseconds: -1, uncertaintyMilliseconds: 0 }],
        [{ kind: 'RECEIPT_DELAY', valueMilliseconds: 1 }],
        [{ kind: 'CLOCK_OFFSET', valueMilliseconds: 1, uncertaintyMilliseconds: -1 }],
        [{ kind: 'CLOCK_OFFSET', valueMilliseconds: '1', uncertaintyMilliseconds: 0 }],
        [{ kind: 'CLOCK_OFFSET', valueMilliseconds: 60000, uncertaintyMilliseconds: 1 }],
        [{ kind: 'UNKNOWN', valueMilliseconds: 1, uncertaintyMilliseconds: 0 }],
      ] as unknown[]
    ).map((samples) => ({ samples })),
  )('rejects unusable measurements before producing a bound: %j', ({ samples }) => {
    expect(() => analyzer.analyze(request(samples))).toThrow();
  });
  it('rejects malformed text, negative margins and excessive input', () => {
    expect(() => analyzer.analyze({ ...request([]), content: '[' })).toThrow();
    expect(() => analyzer.analyze({ ...request([]), receiptMarginMilliseconds: -1 })).toThrow();
    expect(() => analyzer.analyze({ ...request([]), content: 'x'.repeat(262145) })).toThrow();
  });
});
