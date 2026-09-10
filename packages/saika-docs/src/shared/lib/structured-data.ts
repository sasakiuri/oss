// SPDX-License-Identifier: MIT
export function structuredData(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
