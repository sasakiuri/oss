import { describe, it, expect } from 'vitest';

import { cn, formatDate, formatDateShort } from '@/lib/utils';

describe('cn (className merge utility)', () => {
  it('merges class names correctly', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('merges Tailwind classes with conflicts', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end');
  });

  it('keeps Tailwind 4 text shadows independent of text color', () => {
    expect(cn('text-shadow-sm text-red-500', 'text-shadow-lg text-blue-500')).toBe('text-shadow-lg text-blue-500');
  });

  it('merges Tailwind 4 inset shadows and rings', () => {
    expect(cn('inset-shadow-sm inset-ring-1', 'inset-shadow-lg inset-ring-2')).toBe('inset-shadow-lg inset-ring-2');
  });
});

describe('formatDate', () => {
  it.each([
    ['2024-01-15T00:30:00+09:00', '2024年1月15日'],
    ['2024-12-31T16:00:00Z', '2025年1月1日'],
    ['2024-01-15', '2024年1月15日'],
  ])('displays %s in Japan time independently of the server timezone', (input, expected) => {
    expect(formatDate(input)).toBe(expected);
  });

  it('formats date in Japanese locale', () => {
    const result = formatDate('2024-01-15');
    expect(result).toContain('2024');
    expect(result).toContain('1');
    expect(result).toContain('15');
  });

  it('handles ISO date strings', () => {
    const result = formatDate('2024-12-25T00:00:00Z');
    expect(result).toContain('2024');
  });
});

describe('formatDateShort', () => {
  it('keeps the same Japan calendar date as the full date at the UTC day boundary', () => {
    expect(formatDateShort('2024-01-15T00:30:00+09:00')).toBe('2024/01/15');
    expect(formatDateShort('2024-12-31T16:00:00Z')).toBe('2025/01/01');
  });

  it('formats date in short format', () => {
    const result = formatDateShort('2024-01-15');
    // Format: YYYY/MM/DD
    expect(result).toMatch(/2024/);
    expect(result).toMatch(/01/);
    expect(result).toMatch(/15/);
  });
});
