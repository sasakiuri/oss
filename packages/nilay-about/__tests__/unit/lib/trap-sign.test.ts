import { describe, expect, it } from 'vitest';

import { layoutSign, signLines, type SignFields } from '@/lib/trap-sign';

const fields = (overrides: Partial<SignFields> = {}): SignFields => ({
  headline: 'snare',
  target: '',
  period: '',
  setter: '',
  contact: '',
  english: false,
  ...overrides,
});

describe('the trap warning sign', () => {
  it('always warns and asks people to keep away, and adds only the details given', () => {
    expect(signLines(fields()).map((line) => line.text)).toEqual([
      '危険',
      'くくりわな設置中',
      'わなに近づかないでください',
    ]);
    expect(signLines(fields({ target: ' イノシシ ', contact: '000' })).map((line) => line.text)).toEqual([
      '危険',
      'くくりわな設置中',
      'わなに近づかないでください',
      '対象：イノシシ',
      '連絡先：000',
    ]);
  });

  it('adds English lines when asked', () => {
    const lines = signLines(fields({ english: true }));
    expect(lines.filter((line) => line.lang === 'en').map((line) => line.text)).toEqual([
      'DANGER - SNARES SET',
      'Keep away from the traps.',
    ]);
  });

  it('fits every line on A4 and squeezes a line too long for the margins', () => {
    const full = fields({
      english: true,
      target: 'イノシシ・ニホンジカ・アライグマ・ハクビシン・タヌキ・アナグマ',
      period: '令和8年11月15日〜令和9年2月15日',
      setter: '○○猟友会',
      contact: '000-0000-0000',
    });
    const layout = layoutSign(signLines(full), 'a4');
    expect(layout.fits).toBe(true);
    expect(layout.lines.find((line) => line.text.startsWith('対象'))?.squeezeToMm).toBeCloseTo(210 * 0.86, 10);
    expect(layout.lines[0]?.squeezeToMm).toBeNull();
    // A3 scales with the paper.
    expect(layoutSign(signLines(full), 'a3').lines[0]?.sizeMm).toBeCloseTo(297 * 0.16, 10);
  });
});
