// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { drawShots } from '@/renderer/presentation/components/target/ShotRenderer';
import type { Discipline, ShotDto } from '@/shared/ipc/contracts';

function createMockCanvas(): CanvasRenderingContext2D {
  return {
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createShot(overrides: Partial<ShotDto> = {}): ShotDto {
  return {
    id: 'test-shot-1',
    shotNumber: 1,
    x: 0,
    y: 0,
    score: 105,
    innerTen: false,
    timestamp: '2026-01-01T00:00:00.000Z',
    mode: 'MATCH',
    isRecorded: true,
    ...overrides,
  };
}

describe('ShotRenderer', () => {
  describe('bullet size per discipline', () => {
    const disciplines: Array<{ discipline: Discipline; expectedRadius: number }> = [
      { discipline: 'BEAM_RIFLE_10M', expectedRadius: 3.0 },
      { discipline: 'AIR_RIFLE_10M', expectedRadius: 2.25 },
      { discipline: 'AIR_PISTOL_10M', expectedRadius: 2.25 },
      { discipline: 'RIFLE_50M', expectedRadius: 2.8 },
      { discipline: 'PISTOL_25M', expectedRadius: 4.5 },
    ];

    disciplines.forEach(({ discipline, expectedRadius }) => {
      it(`bullet radius for ${discipline} is ${expectedRadius}mm`, () => {
        const ctx = createMockCanvas();
        const shots = [createShot()];
        const scale = 1;

        drawShots(ctx, 400, 400, scale, shots, discipline);

        // arc is called twice per shot: once for fill and once for stroke
        const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls;
        expect(arcCalls.length).toBeGreaterThanOrEqual(2);
        // Check the radius argument (index 2) of the first arc call
        expect(arcCalls[0]![2]).toBeCloseTo(expectedRadius * scale, 2);
      });
    });
  });

  describe('shot drawing', () => {
    it('does not call arc when there are 0 shots', () => {
      const ctx = createMockCanvas();
      drawShots(ctx, 400, 400, 1, [], 'AIR_RIFLE_10M');
      expect(ctx.arc).not.toHaveBeenCalled();
    });

    it('latest shot is color-coded (red for score 10 or above)', () => {
      const ctx = createMockCanvas();
      const fillStyleHistory: string[] = [];
      Object.defineProperty(ctx, 'fillStyle', {
        set(v: string) {
          fillStyleHistory.push(v);
        },
        get() {
          return fillStyleHistory[fillStyleHistory.length - 1] || '';
        },
      });

      const shots = [createShot({ shotNumber: 1, score: 105 })];
      drawShots(ctx, 400, 400, 1, shots, 'AIR_RIFLE_10M');

      expect(fillStyleHistory).toContain('rgba(254, 1, 0, 0.7)');
    });

    it('previous shots are drawn in gray', () => {
      const ctx = createMockCanvas();
      const fillStyleHistory: string[] = [];
      Object.defineProperty(ctx, 'fillStyle', {
        set(v: string) {
          fillStyleHistory.push(v);
        },
        get() {
          return fillStyleHistory[fillStyleHistory.length - 1] || '';
        },
      });

      const shots = [createShot({ shotNumber: 1, score: 100 }), createShot({ shotNumber: 2, score: 90 })];
      drawShots(ctx, 400, 400, 1, shots, 'AIR_RIFLE_10M');

      expect(fillStyleHistory).toContain('rgba(68, 68, 68, 0.7)');
    });

    it('scale value is applied to bullet size', () => {
      const ctx = createMockCanvas();
      const shots = [createShot()];
      const scale = 2;

      drawShots(ctx, 400, 400, scale, shots, 'AIR_RIFLE_10M');

      const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls;
      expect(arcCalls[0]![2]).toBeCloseTo(2.25 * 2, 2);
    });
  });
});
