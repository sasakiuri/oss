// SPDX-License-Identifier: MIT
type SearchParams = Record<string, string | string[] | undefined>;
function stringParam(params: SearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}
export function positiveIntegerParam(params: SearchParams, key: string, fallback = 1): number {
  const value = stringParam(params, key);
  const number = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(number) ? number : fallback;
}
