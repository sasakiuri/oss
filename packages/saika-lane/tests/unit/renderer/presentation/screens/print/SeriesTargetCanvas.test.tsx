// SPDX-License-Identifier: MIT
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SeriesTargetCanvas } from '@/renderer/presentation/screens/print/components/SeriesTargetCanvas';
import type { ScoreSheetShotDto } from '@/shared/ipc/contracts';

vi.mock('@/renderer/presentation/components/target/TargetRingRenderer', () => ({
  drawTarget: vi.fn(),
}));

function createCanvasContext(): CanvasRenderingContext2D {
  return {
    scale: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createShot(shotNumber: number, seriesNumber: number): ScoreSheetShotDto {
  return {
    shotNumber,
    seriesNumber,
    value: 100,
    integerValue: 10,
    x: 0,
    y: 0,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SeriesTargetCanvas', () => {
  it('numbers all supplied shots sequentially when requested', () => {
    const context = createCanvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    const shots = [createShot(1, 1), createShot(2, 1), createShot(1, 2)];

    render(<SeriesTargetCanvas shots={shots} discipline="AIR_RIFLE_10M" sequentialShotNumbers />);

    const labels = (context.fillText as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
    expect(labels).toEqual(['1', '2', '3']);
  });

  it('uses each shot number by default', () => {
    const context = createCanvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    const shots = [createShot(1, 1), createShot(2, 1), createShot(1, 2)];

    render(<SeriesTargetCanvas shots={shots} discipline="AIR_RIFLE_10M" />);

    const labels = (context.fillText as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
    expect(labels).toEqual(['1', '2', '1']);
  });
});
