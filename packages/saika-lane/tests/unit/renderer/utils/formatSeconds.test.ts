// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { formatSeconds } from '@/renderer/presentation/utils/formatSeconds';

describe('formatSeconds', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatSeconds(0)).toBe('00:00');
  });

  it('formats 59 seconds as 00:59', () => {
    expect(formatSeconds(59)).toBe('00:59');
  });

  it('formats 60 seconds as 01:00', () => {
    expect(formatSeconds(60)).toBe('01:00');
  });

  it('formats 125 seconds as 02:05', () => {
    expect(formatSeconds(125)).toBe('02:05');
  });

  it('formats 600 seconds as 10:00', () => {
    expect(formatSeconds(600)).toBe('10:00');
  });

  it('formats 4500 seconds as 75:00', () => {
    expect(formatSeconds(4500)).toBe('75:00');
  });

  it('formats 1 second as 00:01', () => {
    expect(formatSeconds(1)).toBe('00:01');
  });
});
