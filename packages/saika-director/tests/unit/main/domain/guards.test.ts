import { describe, expect, it } from 'vitest';
import { optionalText, requiredText, validDate } from '@/main/domain/guards';

describe('domain guards', () => {
  it('trims required text and names the missing field', () => {
    expect(requiredText('  Jury  ', 'decidedBy')).toBe('Jury');
    expect(() => requiredText('   ', 'decidedBy')).toThrow(new Error('decidedBy is required'));
  });

  it('turns missing or blank optional text into null', () => {
    expect(optionalText('  note ')).toBe('note');
    expect(optionalText('  ')).toBeNull();
    expect(optionalText(null)).toBeNull();
    expect(optionalText(undefined)).toBeNull();
  });

  it('copies valid dates and names an invalid one', () => {
    const source = new Date('2026-11-16T01:02:03.004Z');
    const copy = validDate(source, 'recordedAt');
    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    expect(() => validDate(new Date('invalid'), 'recordedAt')).toThrow(new Error('recordedAt must be valid'));
  });
});
