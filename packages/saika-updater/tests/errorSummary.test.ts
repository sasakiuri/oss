// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { updateErrorSummary } from '../src/errorSummary';

describe('update error summaries', () => {
  it('replaces missing release artifact diagnostics only when both markers match', () => {
    expect(updateErrorSummary('Cannot find platform in latest release artifacts: private detail')).toBe(
      'Update information is unavailable. Try again later.',
    );
    expect(updateErrorSummary('Cannot find settings')).toBe('Cannot find settings');
    expect(updateErrorSummary('Invalid latest release artifacts')).toBe('Invalid latest release artifacts');
    expect(updateErrorSummary('Info: Cannot find latest release artifacts')).toBe(
      'Info: Cannot find latest release artifacts',
    );
  });

  it.each(['', ' ', '\nsecond line', '\r\nsecond line', ' \t\nsecond line'])(
    'provides a fallback for an empty first line (%j)',
    (message) => {
      expect(updateErrorSummary(message)).toBe('The update could not be completed.');
    },
  );

  it.each(['\n', '\r\n'])('keeps only the trimmed first line with %j line endings', (separator) => {
    expect(updateErrorSummary(`  Download failed \t${separator}internal detail`)).toBe('Download failed');
  });

  it('keeps the 240-character boundary and truncates longer messages', () => {
    expect(updateErrorSummary('x'.repeat(240))).toBe('x'.repeat(240));
    expect(updateErrorSummary('x'.repeat(241))).toBe(`${'x'.repeat(237)}…`);
  });
});
