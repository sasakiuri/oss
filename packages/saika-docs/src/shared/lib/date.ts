// SPDX-License-Identifier: MIT
import { parseISO } from 'date-fns';

export function formatDate(value: string): string {
  const date = parseISO(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date');
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export function exclusiveEndDate(value: string): string {
  const date = parseISO(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
