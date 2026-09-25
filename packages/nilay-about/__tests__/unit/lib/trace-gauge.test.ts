import { describe, expect, it } from 'vitest';

import { GAUGES, PAGE_MM, TRACE_SOURCES, gaugeSizeMm, layoutGauges } from '@/lib/trace-gauge';

describe('trace gauges', () => {
  it('draws prints length up and width across, in millimetres', () => {
    const bear = GAUGES.find((gauge) => gauge.id === 'bear-hind')!;
    expect(gaugeSizeMm(bear)).toEqual({ widthMm: 85, heightMm: 151 });
    const scat = GAUGES.find((gauge) => gauge.id === 'bear-scat')!;
    expect(gaugeSizeMm(scat)).toEqual({ widthMm: 50, heightMm: 50 });
  });

  it('gives every gauge a source and unique id', () => {
    const ids = GAUGES.map((gauge) => gauge.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const gauge of GAUGES) {
      expect(TRACE_SOURCES[gauge.source]).toBeDefined();
      expect(gauge.lengthCm !== null || gauge.widthCm !== null).toBe(true);
    }
  });

  it('keeps every gauge inside the page and none overlapping', () => {
    const pages = layoutGauges(GAUGES);
    expect(pages.flat()).toHaveLength(GAUGES.length);
    for (const page of pages) {
      for (const item of page) {
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.x + item.widthMm).toBeLessThanOrEqual(PAGE_MM.width);
        expect(item.y + item.heightMm).toBeLessThanOrEqual(PAGE_MM.height - 18);
      }
      for (const [index, a] of page.entries())
        for (const b of page.slice(index + 1)) {
          const apart =
            a.x + a.widthMm <= b.x || b.x + b.widthMm <= a.x || a.y + a.heightMm <= b.y || b.y + b.heightMm <= a.y;
          expect(apart).toBe(true);
        }
    }
  });

  it('lays out nothing when nothing is chosen', () => {
    expect(layoutGauges([])).toEqual([]);
  });
});
