// SPDX-License-Identifier: MIT
/**
 * Pins the canvas output of the print series targets and the screen shot markers as display lists: every
 * context property set and drawing call in order. The same display list draws the same pixels.
 */
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { drawShots } from '@/renderer/presentation/components/target/ShotRenderer';
import { SeriesTargetCanvas } from '@/renderer/presentation/screens/print/components/SeriesTargetCanvas';
import type { ScoreSheetShotDto, ShotDto } from '@/shared/ipc/contracts';

/** One context operation, such as `arc(60, 60, 4.5, 0, 6.283185307179586)` or `fillStyle = "#FFFFFF"`. */
type Operation = string;

function recordingContext(canvas?: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; operations: Operation[] } {
  const operations: Operation[] = [];
  const properties: Record<string, unknown> = { canvas };
  const ctx = new Proxy(properties, {
    get(target, property) {
      if (typeof property !== 'string') return undefined;
      if (property in target) return target[property];
      return (...args: unknown[]) => {
        operations.push(`${property}(${args.map((arg) => JSON.stringify(arg)).join(', ')})`);
      };
    },
    set(target, property, value) {
      operations.push(`${String(property)} = ${JSON.stringify(value)}`);
      target[property as string] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, operations };
}

function sheetShot(shotNumber: number, x: number | null, y: number | null): ScoreSheetShotDto {
  return { shotNumber, seriesNumber: 1, value: 100, integerValue: 10, x, y };
}

function screenShot(id: string, shotNumber: number, score: number, x: number | null, y: number | null): ShotDto {
  return {
    id,
    shotNumber,
    x,
    y,
    score,
    innerTen: false,
    timestamp: '2026-01-01T00:00:00.000Z',
    mode: 'MATCH',
    isRecorded: true,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('print series target canvas', () => {
  let canvas: HTMLCanvasElement | undefined;

  function drawPrint(element: React.JSX.Element): Operation[] {
    let operations: Operation[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      const recording = recordingContext(this);
      canvas = recording.ctx.canvas;
      operations = recording.operations;
      return recording.ctx;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext);
    render(element);
    return operations;
  }

  it('draws the rings and grey numbered markers for a series', () => {
    const shots = [sheetShot(1, 1.5, -2.25), sheetShot(2, null, null), sheetShot(3, -4, 3.5), sheetShot(4, 0, 0)];

    expect(drawPrint(<SeriesTargetCanvas shots={shots} discipline="AIR_RIFLE_10M" size={96} />)).toMatchSnapshot();
  });

  it('draws the whole-match target with sequential numbers', () => {
    const shots = [sheetShot(1, 20, 10), sheetShot(1, -35, -5), sheetShot(2, 2, 2)];

    expect(
      drawPrint(<SeriesTargetCanvas shots={shots} discipline="PISTOL_25M" size={120} sequentialShotNumbers />),
    ).toMatchSnapshot();
  });

  it('caps the shot number font at 56px on a large target', () => {
    const operations = drawPrint(
      <SeriesTargetCanvas shots={[sheetShot(1, 0.1, 0.1)]} discipline="AIR_RIFLE_10M" size={1000} />,
    );

    expect(operations).toContain('font = "bold 56px sans-serif"');
    expect(operations).toMatchSnapshot();
  });

  it('scales the backing store and the drawing by the device pixel ratio', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    try {
      const operations = drawPrint(
        <SeriesTargetCanvas
          shots={[sheetShot(1, 1, 1), sheetShot(2, -2, 0.5)]}
          discipline="AIR_PISTOL_10M"
          size={80}
        />,
      );

      expect(canvas?.width).toBe(160);
      expect(canvas?.height).toBe(160);
      expect(canvas?.style.width).toBe('80px');
      expect(operations[0]).toBe('scale(2, 2)');
      expect(operations).toMatchSnapshot();
    } finally {
      if (original) Object.defineProperty(window, 'devicePixelRatio', original);
      else delete (window as { devicePixelRatio?: number }).devicePixelRatio;
    }
  });

  it('draws only the default view without coordinates', () => {
    expect(
      drawPrint(<SeriesTargetCanvas shots={[sheetShot(1, null, null)]} discipline="RIFLE_50M" />),
    ).toMatchSnapshot();
  });
});

describe('screen shot markers', () => {
  it('draws earlier shots grey and the latest 10 red, skipping misses', () => {
    const { ctx, operations } = recordingContext();
    const shots = [
      screenShot('a', 1, 95, 1, 1),
      screenShot('b', 2, 0, null, null),
      screenShot('c', 3, 80, -3.5, 2),
      screenShot('d', 4, 104, 0.25, -0.5),
    ];

    drawShots(ctx, 400, 300, 12.5, shots, 'AIR_RIFLE_10M');

    expect(operations).toMatchSnapshot();
  });

  it.each([
    ['yellow with black text for a 9', 95],
    ['blue for lower scores', 85],
    ['red with white text at exactly 10.0', 100],
    ['yellow with black text just below 10.0', 99],
    ['yellow with black text at exactly 9.0', 90],
    ['blue just below 9.0', 89],
  ])('draws the latest shot %s', (_name, score) => {
    const { ctx, operations } = recordingContext();

    drawShots(ctx, 200, 200, 8, [screenShot('a', 7, score, -2, 6)], 'PISTOL_25M', 4.825);

    expect(operations).toMatchSnapshot();
  });

  it('caps the shot number font at 56px for markers wider than 40px', () => {
    const { ctx, operations } = recordingContext();

    drawShots(ctx, 300, 300, 20, [screenShot('a', 1, 70, 0, 0), screenShot('b', 2, 100, 1, 1)], 'AIR_RIFLE_10M');

    expect(operations.filter((operation) => operation.startsWith('font ='))).toEqual([
      'font = "bold 56px sans-serif"',
      'font = "bold 56px sans-serif"',
    ]);
    expect(operations).toMatchSnapshot();
  });
});
