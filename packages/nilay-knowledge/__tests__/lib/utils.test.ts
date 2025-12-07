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
});

describe('formatDate', () => {
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
  it('formats date in short format', () => {
    const result = formatDateShort('2024-01-15');
    // Format: YYYY/MM/DD
    expect(result).toMatch(/2024/);
    expect(result).toMatch(/01/);
    expect(result).toMatch(/15/);
  });
});
