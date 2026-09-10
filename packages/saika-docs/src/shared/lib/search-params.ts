// SPDX-License-Identifier: MIT
export type SearchParams = Record<string, string | string[] | undefined>;
export function stringParam(params: SearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}
export function stringsParam(params: SearchParams, key: string): string[] {
  const value = params[key];
  return value === undefined ? [] : (Array.isArray(value) ? value : [value]).filter(Boolean);
}
export function positiveIntegerParam(params: SearchParams, key: string, fallback = 1): number {
  const value = stringParam(params, key);
  const number = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(number) ? number : fallback;
}
export function dateParam(params: SearchParams, key: string): string | undefined {
  const value = stringParam(params, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value) ? value : undefined;
}
