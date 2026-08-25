import { describe, it, expect } from 'vitest';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

describe('ErrorCatalog', () => {
  it('has all expected top-level categories', () => {
    const categories = Object.keys(ErrorCatalog);
    expect(categories).toContain('COMPETITION');
    expect(categories).toContain('CHANNEL');
    expect(categories).toContain('SCORE');
    expect(categories).toContain('TIMER');
    expect(categories).toContain('SHOT');
    expect(categories).toContain('LANE');
    expect(categories).toContain('SHOOTOFF');
    expect(categories).toContain('FINAL_RESULT');
    expect(categories).toContain('IPC');
    expect(categories).toContain('GENERAL');
    expect(categories).toContain('PARSE');
    expect(categories).toContain('DATA');
  });

  it('every entry has code and message strings', () => {
    for (const [category, entries] of Object.entries(ErrorCatalog)) {
      for (const [key, entry] of Object.entries(entries as Record<string, { code: string; message: string }>)) {
        expect(entry.code, `${category}.${key}.code`).toEqual(expect.any(String));
        expect(entry.message, `${category}.${key}.message`).toEqual(expect.any(String));
        expect(entry.code.length, `${category}.${key}.code length`).toBeGreaterThan(0);
        expect(entry.message.length, `${category}.${key}.message length`).toBeGreaterThan(0);
      }
    }
  });

  it('has no duplicate error codes', () => {
    const codes = new Set<string>();
    for (const entries of Object.values(ErrorCatalog)) {
      for (const entry of Object.values(entries as Record<string, { code: string }>)) {
        expect(codes.has(entry.code), `Duplicate code: ${entry.code}`).toBe(false);
        codes.add(entry.code);
      }
    }
  });
});
