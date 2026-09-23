import { describe, expect, it } from 'vitest';

import { getTargetLayout } from '@/lib/home-target';
import { generateTargetPdf } from '@/lib/home-target-pdf';
import { targetRequestSchema } from '@/lib/schemas/home-target';

describe('printable targets', () => {
  it('uses standard paper dimensions and rejects circles that exceed printable margins', () => {
    expect(getTargetLayout(10, 'a4')).toMatchObject({ width: 210, height: 297, fits: true });
    expect(getTargetLayout(10, 'letter')).toMatchObject({ width: 215.9, height: 279.4, fits: true });
    expect(getTargetLayout(191, 'a4').fits).toBe(false);
    expect(getTargetLayout(1000, 'target').fits).toBe(true);
    expect(() => generateTargetPdf(191, 'a4')).toThrow('Target does not fit');
  });
  it('keeps both small and large custom targets separate from the calibration line', () => {
    for (const diameter of [0.1, 50, 1000]) {
      const layout = getTargetLayout(diameter, 'target');
      expect(layout.width).toBeGreaterThanOrEqual(70);
      expect(layout.centerY + diameter / 2).toBeLessThan(layout.rulerY - 2);
    }
  });
  it('creates a PDF with correct byte offsets, A4 size and a 50 mm reference', () => {
    const bytes = generateTargetPdf(20, 'a4');
    const pdf = new TextDecoder().decode(bytes);
    expect(pdf).toContain('/MediaBox [0 0 595.2756 841.8898]');
    expect(pdf).toContain('(50 mm - Print at 100%)');
    const xref = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(new TextDecoder().decode(bytes.slice(xref, xref + 4))).toBe('xref');
    const entries = pdf.slice(xref).split('\n').slice(3, 9);
    entries.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(new TextDecoder().decode(bytes.slice(offset))).toMatch(new RegExp(`^${index + 1} 0 obj`));
    });
    // The reference line is 50 mm long in PDF points, independent of target diameter.
    const line = pdf.match(/([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/)!;
    expect(Number(line[3]) - Number(line[1])).toBeCloseTo((50 / 25.4) * 72, 3);
  });
  it('validates public input and retains custom paper for requests without a paper field', () => {
    expect(targetRequestSchema.parse({ blackAreaSize: { number: 2, unit: 'cm' } }).paper).toBe('target');
    for (const number of [0, -1, Infinity, NaN, 101])
      expect(targetRequestSchema.safeParse({ blackAreaSize: { number, unit: 'cm' } }).success).toBe(false);
  });
  it('lays out multiple actual-size targets with separate margins and optional conditions', () => {
    const options = { copies: 6 as const, conditions: { eyeCm: 170, distanceCm: 500, heightCm: 155 } };
    const layout = getTargetLayout(40, 'a4', options);
    expect(layout.fits).toBe(true);
    expect(layout.centers).toHaveLength(6);
    for (const center of layout.centers) {
      expect(center.x - 20).toBeGreaterThanOrEqual(10);
      expect(center.x + 20).toBeLessThanOrEqual(layout.width - 10);
      expect(center.y + 20).toBeLessThan(layout.height - 40);
    }
    const pdf = new TextDecoder().decode(generateTargetPdf(40, 'a4', options));
    expect(pdf.match(/c f/g)).toHaveLength(6);
    expect(pdf).toContain('(Eye: 170 cm   Distance: 5 m)');
    expect(pdf).toContain('(Center: 155 cm   Diameter: 4 cm)');
    expect(getTargetLayout(90, 'a4', options).fits).toBe(false);
    expect(getTargetLayout(90, 'target', options).fits).toBe(true);
    expect(targetRequestSchema.safeParse({ blackAreaSize: { number: 4, unit: 'cm' }, copies: 3 }).success).toBe(false);
  });
});
