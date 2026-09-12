// SPDX-License-Identifier: MIT

export type ResultListClassificationCode = 'RPO' | 'MQS' | 'OOC' | 'DNS' | 'DNF' | 'DSQ' | 'DQB' | 'AD_DSQ';

/** Public result views retain the classification without publishing an ineligible score. */
export function classificationSuppressesScore(code: string | null): boolean {
  return code === 'DNS' || code === 'DSQ' || code === 'DQB' || code === 'AD_DSQ';
}
