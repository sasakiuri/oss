import { describe, expect, it } from 'vitest';

import { generateTargetPdf } from './pdf';
import { targetPdfRequestSchema } from './schema';

describe('target PDF', () => {
  it('uses byte offsets for every object and startxref, including the binary header', () => {
    const bytes = generateTargetPdf(30.5);
    const pdf = Buffer.from(bytes).toString('latin1');
    const xrefStart = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
    expect(pdf.slice(xrefStart, xrefStart + 4)).toBe('xref');
    const entries = [...pdf.matchAll(/^(\d{10}) 00000 n /gm)];
    expect(entries).toHaveLength(5);
    entries.forEach((entry, index) => {
      const offset = Number(entry[1]);
      expect(pdf.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj\\n`));
    });
    expect(pdf).toContain('/Info 5 0 R');
    const stream = pdf.match(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/);
    expect(Buffer.byteLength(stream?.[2] ?? '', 'latin1')).toBe(Number(stream?.[1]));
  });

  it('preserves physical target dimensions and the surrounding margin', () => {
    const pdf = new TextDecoder().decode(generateTargetPdf(25.4));
    expect(pdf).toContain('/MediaBox [0 0 86.400000 86.400000]');
    expect(pdf).toContain('79.2000 43.2000 m');
  });

  it.each([0, -1, NaN, Infinity, 1001])('rejects invalid PDF sizes (%s)', (size) => {
    expect(() => generateTargetPdf(size)).toThrow(RangeError);
  });

  it('validates the public cm request contract and its upper bound', () => {
    expect(targetPdfRequestSchema.safeParse({ blackAreaSize: { number: 100, unit: 'cm' } }).success).toBe(true);
    for (const blackAreaSize of [
      { number: 101, unit: 'cm' },
      { number: 0, unit: 'cm' },
      { number: 1, unit: 'm' },
    ]) {
      expect(targetPdfRequestSchema.safeParse({ blackAreaSize }).success).toBe(false);
    }
  });
});
