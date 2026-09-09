// SPDX-License-Identifier: MIT
export function formatClockMetric(value: number | null): string {
  return value === null ? 'n/a' : `${value >= 0 ? '+' : ''}${value.toFixed(1)} ms`;
}
