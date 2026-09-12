// SPDX-License-Identifier: MIT
export function updateErrorSummary(message: string): string {
  if (message.startsWith('Cannot find ') && message.includes('latest release artifacts')) {
    return 'Update information is unavailable. Try again later.';
  }
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim() || 'The update could not be completed.';
  return firstLine.length > 240 ? `${firstLine.slice(0, 237)}…` : firstLine;
}
