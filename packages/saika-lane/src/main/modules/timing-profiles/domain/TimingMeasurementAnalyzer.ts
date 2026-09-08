// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  MAX_TIMING_MEASUREMENT_BYTES,
  TimingMeasurementRequestSchema,
  type TimingMeasurementRequest,
  type TimingMeasurementAnalysis,
} from '@/shared/ipc/contracts/timingMeasurements.schema';

const samplesSchema = z
  .array(
    z
      .object({
        kind: z.enum(['RECEIPT_DELAY', 'CLOCK_OFFSET']),
        valueMilliseconds: z.number().finite().min(-60_000).max(60_000),
        uncertaintyMilliseconds: z.number().finite().nonnegative().max(60_000),
      })
      .strict(),
  )
  .min(1)
  .max(2000);

/** Measurement interpretation is independent of scoring windows, device protocols and profile storage. */
export interface ITimingMeasurementAnalyzer {
  analyze(request: TimingMeasurementRequest): TimingMeasurementAnalysis;
}

export class TimingMeasurementAnalyzer implements ITimingMeasurementAnalyzer {
  analyze(input: TimingMeasurementRequest): TimingMeasurementAnalysis {
    const request = TimingMeasurementRequestSchema.parse(input);
    if (Buffer.byteLength(request.content, 'utf8') > MAX_TIMING_MEASUREMENT_BYTES)
      throw new Error('Timing measurement text exceeds the 256 KiB limit');
    const samples = samplesSchema.parse(JSON.parse(request.content.replace(/^\uFEFF/, '')));
    if (samples.some((sample) => sample.kind === 'RECEIPT_DELAY' && sample.valueMilliseconds < 0))
      throw new Error('Reception delay cannot be negative; verify the reference clock and measurement method');
    const receipt = samples.filter((sample) => sample.kind === 'RECEIPT_DELAY');
    const clock = samples.filter((sample) => sample.kind === 'CLOCK_OFFSET');
    const bound = (values: typeof samples, margin: number): number | null => {
      if (!values.length) return null;
      const maximum = Math.ceil(
        Math.max(...values.map((sample) => Math.abs(sample.valueMilliseconds) + sample.uncertaintyMilliseconds)) +
          margin,
      );
      if (maximum > 60_000) throw new Error('Calculated timing bounds exceed the supported 60000 ms limit');
      return maximum;
    };
    return {
      algorithm: 'SAMPLE_MAXIMUM_WITH_UNCERTAINTY_V1',
      sourceName: request.sourceName,
      sourceSha256: createHash('sha256').update(request.content, 'utf8').digest('hex'),
      receiptSamples: receipt.length,
      clockSamples: clock.length,
      settings: {
        mode: 'BOUNDED',
        maximumReceiptDelayMilliseconds: bound(receipt, request.receiptMarginMilliseconds),
        clockUncertaintyMilliseconds: bound(clock, request.clockMarginMilliseconds),
      },
    };
  }
}
