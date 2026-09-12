import type { ResultListClassificationCode } from '@/shared/utils/resultClassification';

export { classificationSuppressesScore } from '@/shared/utils/resultClassification';
export type { ResultListClassificationCode } from '@/shared/utils/resultClassification';

export interface ResultListDisplayPolicy {
  readonly scoringPrecision: 0 | 1;
  readonly totalSeries: number;
}

export function createResultListDisplayPolicy(input: {
  scoringPrecision: number;
  totalSeries: number;
}): ResultListDisplayPolicy {
  if (input.scoringPrecision !== 0 && input.scoringPrecision !== 1) {
    throw new Error('Result-list scoring precision must be 0 or 1');
  }
  if (!Number.isInteger(input.totalSeries) || input.totalSeries <= 0) {
    throw new Error('Result-list total series must be a positive integer');
  }
  return Object.freeze({ scoringPrecision: input.scoringPrecision, totalSeries: input.totalSeries });
}

export function formatResultScore(value: number, policy: ResultListDisplayPolicy): string {
  if (!Number.isFinite(value)) throw new Error('Result-list score must be finite');
  return value.toFixed(policy.scoringPrecision);
}

export function formatClassificationCode(code: ResultListClassificationCode): string {
  return code === 'AD_DSQ' ? 'AD-DSQ' : code;
}
