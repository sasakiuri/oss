// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { drawTarget } from '@/renderer/presentation/components/target/TargetRingRenderer';

function createMockCanvas(width = 800, height = 800) {
  const ctx = {
    canvas: { width, height },
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return ctx;
}

describe('TargetRingRenderer', () => {
  describe('canvas initialization', () => {
    it('clears the entire canvas', () => {
      const ctx = createMockCanvas(800, 600);
      drawTarget(ctx, 400, 300, 1, 'AIR_RIFLE_10M');

      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });

    it('fills the background with #1E1E1E', () => {
      const ctx = createMockCanvas(800, 600);
      const fillStyleHistory: string[] = [];

      Object.defineProperty(ctx, 'fillStyle', {
        set(value: string) {
          fillStyleHistory.push(value);
        },
        get() {
          return fillStyleHistory[fillStyleHistory.length - 1] || '';
        },
      });

      drawTarget(ctx, 400, 300, 1, 'AIR_RIFLE_10M');

      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
      // The first fillStyle set is the background color
      expect(fillStyleHistory[0]).toBe('#1E1E1E');
    });
  });

  describe('AIR_RIFLE_10M ring drawing', () => {
    it('draws 10 rings (fill + stroke calls arc twice per ring)', () => {
      const ctx = createMockCanvas();
      drawTarget(ctx, 400, 400, 1, 'AIR_RIFLE_10M');

      // 10 rings x 2 (fill + stroke) = 20 arc calls
      expect(ctx.arc).toHaveBeenCalledTimes(20);
    });

    it('draws all score (1-8) labels in 4 directions (32 fillText calls)', () => {
      const ctx = createMockCanvas();
      drawTarget(ctx, 400, 400, 1, 'AIR_RIFLE_10M');

      // Scores 1-8 x 4 directions = 32 fillText calls
      expect(ctx.fillText).toHaveBeenCalledTimes(32);

      const labelTexts = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0] as string);

      // Each score is drawn 4 times
      for (let score = 1; score <= 8; score++) {
        const count = labelTexts.filter((t) => t === `${score}`).length;
        expect(count).toBe(4);
      }
    });

    it('skips fill() for the 10-ring', () => {
      const ctx = createMockCanvas();
      const fillSpy = ctx.fill as ReturnType<typeof vi.fn>;

      drawTarget(ctx, 400, 400, 1, 'AIR_RIFLE_10M');

      // Of 10 rings, 9 are filled (excluding the 10-ring)
      // (1, 2, 3, 4, 5, 6, 7, 8, 9 = 9 calls)
      expect(fillSpy).toHaveBeenCalledTimes(9);
    });
  });

  describe('BEAM_RIFLE_10M color scheme', () => {
    it('uses OUTER_RINGS color for outer rings (1-3)', () => {
      const ctx = createMockCanvas();
      const fillStyleHistory: string[] = [];

      Object.defineProperty(ctx, 'fillStyle', {
        set(value: string) {
          fillStyleHistory.push(value);
        },
        get() {
          return fillStyleHistory[fillStyleHistory.length - 1] || '';
        },
      });

      drawTarget(ctx, 400, 400, 1, 'BEAM_RIFLE_10M');

      // OUTER_RINGS.fill (#E0E0E0) is set for score 1-3 ring drawing
      expect(fillStyleHistory).toContain('#E0E0E0');
    });

    it('uses INNER_RINGS color for inner rings (4-9)', () => {
      const ctx = createMockCanvas();
      const fillStyleHistory: string[] = [];

      Object.defineProperty(ctx, 'fillStyle', {
        set(value: string) {
          fillStyleHistory.push(value);
        },
        get() {
          return fillStyleHistory[fillStyleHistory.length - 1] || '';
        },
      });

      drawTarget(ctx, 400, 400, 1, 'BEAM_RIFLE_10M');

      // INNER_RINGS.fill (#02C38D) is set
      expect(fillStyleHistory).toContain('#02C38D');
    });

    it('uses INNER_TEN color for the inner 10-ring', () => {
      const ctx = createMockCanvas();
      const fillStyleHistory: string[] = [];
      const strokeStyleHistory: string[] = [];

      Object.defineProperty(ctx, 'fillStyle', {
        set(value: string) {
          fillStyleHistory.push(value);
        },
        get() {
          return fillStyleHistory[fillStyleHistory.length - 1] || '';
        },
      });

      Object.defineProperty(ctx, 'strokeStyle', {
        set(value: string) {
          strokeStyleHistory.push(value);
        },
        get() {
          return strokeStyleHistory[strokeStyleHistory.length - 1] || '';
        },
      });

      drawTarget(ctx, 400, 400, 1, 'BEAM_RIFLE_10M');

      // INNER_TEN.fill and INNER_TEN.stroke (#FFFFFF) are set
      expect(fillStyleHistory).toContain('#FFFFFF');
      expect(strokeStyleHistory).toContain('#FFFFFF');
    });
  });

  describe('BEAM_RIFLE_10M score labels', () => {
    it('draws scores 1-8 in 4 directions (= 32 fillText calls)', () => {
      const ctx = createMockCanvas();
      drawTarget(ctx, 400, 400, 1, 'BEAM_RIFLE_10M');

      // Scores 1-8, each in 4 directions = 8 x 4 = 32 calls
      expect(ctx.fillText).toHaveBeenCalledTimes(32);
    });

    it('uses correct text colors for labels (scores 1-3: OUTER labelText, 4-8: INNER labelText)', () => {
      const ctx = createMockCanvas();
      const fillStyleHistory: string[] = [];
      const fillTextCalls: Array<{ text: string; fillStyle: string }> = [];

      Object.defineProperty(ctx, 'fillStyle', {
        set(value: string) {
          fillStyleHistory.push(value);
        },
        get() {
          return fillStyleHistory[fillStyleHistory.length - 1] || '';
        },
      });

      const originalFillText = ctx.fillText;
      (ctx as any).fillText = vi.fn((...args) => {
        fillTextCalls.push({
          text: args[0] as string,
          fillStyle: fillStyleHistory[fillStyleHistory.length - 1] || '',
        });
        return originalFillText.apply(ctx, args as any);
      });

      drawTarget(ctx, 400, 400, 1, 'BEAM_RIFLE_10M');

      // Score 1-3 labels use #2D2D2D (OUTER labelText)
      const outerLabels = fillTextCalls.filter((call) => ['1', '2', '3'].includes(call.text));
      expect(outerLabels.every((label) => label.fillStyle === '#2D2D2D')).toBe(true);

      // Score 4-8 labels use #FFFFFF (INNER labelText)
      const innerLabels = fillTextCalls.filter((call) => ['4', '5', '6', '7', '8'].includes(call.text));
      expect(innerLabels.every((label) => label.fillStyle === '#FFFFFF')).toBe(true);
    });
  });

  describe('all disciplines zone-based coloring', () => {
    function createTrackedContext() {
      const ctx = createMockCanvas();
      const fillStyleHistory: string[] = [];
      const strokeStyleHistory: string[] = [];

      Object.defineProperty(ctx, 'fillStyle', {
        set(value: string) {
          fillStyleHistory.push(value);
        },
        get() {
          return fillStyleHistory[fillStyleHistory.length - 1] || '';
        },
      });

      Object.defineProperty(ctx, 'strokeStyle', {
        set(value: string) {
          strokeStyleHistory.push(value);
        },
        get() {
          return strokeStyleHistory[strokeStyleHistory.length - 1] || '';
        },
      });

      return { ctx, fillStyleHistory, strokeStyleHistory };
    }

    it('AIR_RIFLE_10M: boundary at score 3=outer(#E0E0E0), score 4=inner(#02C38D)', () => {
      const { ctx, fillStyleHistory } = createTrackedContext();
      drawTarget(ctx, 400, 400, 1, 'AIR_RIFLE_10M');
      // index 0 = background, index N = score N
      expect(fillStyleHistory[3]).toBe('#E0E0E0'); // score 3 = outer
      expect(fillStyleHistory[4]).toBe('#02C38D'); // score 4 = inner (boundary)
    });

    it('AIR_RIFLE_10M: boundary at score 9=inner(#02C38D), score 10=innerTen(#FFFFFF)', () => {
      const { ctx, fillStyleHistory } = createTrackedContext();
      drawTarget(ctx, 400, 400, 1, 'AIR_RIFLE_10M');
      expect(fillStyleHistory[9]).toBe('#02C38D'); // score 9 = inner
      expect(fillStyleHistory[10]).toBe('#FFFFFF'); // score 10 = innerTen
    });

    it('AIR_PISTOL_10M: boundary at score 6=outer(#E0E0E0), score 7=inner(#02C38D)', () => {
      const { ctx, fillStyleHistory } = createTrackedContext();
      drawTarget(ctx, 400, 400, 1, 'AIR_PISTOL_10M');
      expect(fillStyleHistory[6]).toBe('#E0E0E0'); // score 6 = outer
      expect(fillStyleHistory[7]).toBe('#02C38D'); // score 7 = inner (boundary)
    });

    it('RIFLE_50M: boundary at score 3=outer(#E0E0E0), score 4=inner(#02C38D)', () => {
      const { ctx, fillStyleHistory } = createTrackedContext();
      drawTarget(ctx, 400, 400, 1, 'RIFLE_50M');
      expect(fillStyleHistory[3]).toBe('#E0E0E0'); // score 3 = outer
      expect(fillStyleHistory[4]).toBe('#02C38D'); // score 4 = inner (boundary)
    });

    it('PISTOL_25M: boundary at score 6=outer(#E0E0E0), score 7=inner(#02C38D)', () => {
      const { ctx, fillStyleHistory } = createTrackedContext();
      drawTarget(ctx, 400, 400, 1, 'PISTOL_25M');
      expect(fillStyleHistory[6]).toBe('#E0E0E0'); // score 6 = outer
      expect(fillStyleHistory[7]).toBe('#02C38D'); // score 7 = inner (boundary)
    });

    it('all 5 disciplines draw 32 fillText labels', () => {
      const disciplines = ['AIR_RIFLE_10M', 'AIR_PISTOL_10M', 'RIFLE_50M', 'PISTOL_25M', 'BEAM_RIFLE_10M'] as const;

      for (const discipline of disciplines) {
        const ctx = createMockCanvas();
        drawTarget(ctx, 400, 400, 1, discipline);

        expect(ctx.fillText).toHaveBeenCalledTimes(32);
      }
    });
  });

  describe('edge cases', () => {
    it('works correctly with different scale values', () => {
      const ctx = createMockCanvas();

      // Draw with scale 0.5
      drawTarget(ctx, 400, 400, 0.5, 'AIR_RIFLE_10M');
      expect(ctx.arc).toHaveBeenCalled();

      // Reset arc calls
      (ctx.arc as ReturnType<typeof vi.fn>).mockClear();

      // Draw with scale 2.0
      drawTarget(ctx, 400, 400, 2.0, 'AIR_RIFLE_10M');
      expect(ctx.arc).toHaveBeenCalled();

      // Verify arc was called in both cases
      expect((ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    });
  });
});
