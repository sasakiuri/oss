// SPDX-License-Identifier: MIT
export function toQueryString(values: Record<string, string | number | boolean | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) value.filter(Boolean).forEach((item) => params.append(key, item));
    else params.set(key, String(value));
  }
  return params.size ? `?${params}` : '';
}
