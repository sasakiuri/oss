import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MeasureCanvas } from '@/app/(standalone)/labs/photo-measure/measure-canvas';

const props = (): ComponentProps<typeof MeasureCanvas> => ({
  photo: new Image(),
  imageSize: { width: 4000, height: 3000 },
  referenceA: { x: 100, y: 100 },
  referenceB: { x: 200, y: 100 },
  body: [
    { x: 200, y: 300 },
    { x: 800, y: 600 },
  ],
  antlers: [
    [
      { x: 200, y: 100 },
      { x: 300, y: 100 },
    ],
  ],
  prompts: [
    { x: 200, y: 200, foreground: true },
    { x: 300, y: 300, foreground: false },
  ],
  outline: null,
  mode: 'body',
  onPick: vi.fn(),
  onRelease: vi.fn(),
  label: 'Measurement photo',
  describedBy: 'instructions',
});
const canvas = () => screen.getByRole('img', { name: 'Measurement photo' }) as HTMLCanvasElement;
const point = (clientX: number, clientY: number) => ({ clientX, clientY, pointerId: 1 });

beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 410,
    bottom: 320,
    width: 400,
    height: 300,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('photo coordinates and touch interaction', () => {
  it('bounds the bitmap size and converts a tap into original-photo coordinates', () => {
    const callbacks = props();
    render(<MeasureCanvas {...callbacks} />);
    expect(canvas().width).toBe(1600);
    expect(canvas().height).toBe(1200);
    fireEvent.pointerDown(canvas(), point(110, 120));
    expect(callbacks.onPick).not.toHaveBeenCalled();
    fireEvent.pointerUp(canvas(), point(110, 120));
    expect(callbacks.onPick).toHaveBeenCalledWith({ x: 1000, y: 1000 });
  });

  it('does not add points when scrolling or after a cancelled pointer', () => {
    const callbacks = props();
    render(<MeasureCanvas {...callbacks} />);
    fireEvent.pointerDown(canvas(), point(110, 120));
    fireEvent.pointerMove(canvas(), point(110, 180));
    fireEvent.pointerUp(canvas(), point(110, 180));
    fireEvent.pointerDown(canvas(), point(110, 120));
    fireEvent.pointerCancel(canvas());
    fireEvent.pointerUp(canvas(), point(110, 120));
    expect(callbacks.onPick).not.toHaveBeenCalled();
  });

  it('drags a reference end continuously and releases pointer capture once', () => {
    const callbacks = props();
    render(<MeasureCanvas {...callbacks} mode="referenceA" />);
    canvas().setPointerCapture = vi.fn();
    canvas().releasePointerCapture = vi.fn();
    fireEvent.pointerDown(canvas(), point(110, 120));
    fireEvent.pointerMove(canvas(), point(210, 220));
    fireEvent.pointerUp(canvas(), point(210, 220));
    expect(callbacks.onPick).toHaveBeenNthCalledWith(1, { x: 1000, y: 1000 });
    expect(callbacks.onPick).toHaveBeenNthCalledWith(2, { x: 2000, y: 2000 });
    expect(callbacks.onRelease).toHaveBeenCalledOnce();
    expect(canvas().releasePointerCapture).toHaveBeenCalledOnce();
    fireEvent.pointerMove(canvas(), point(310, 220));
    expect(callbacks.onPick).toHaveBeenCalledTimes(2);
  });
});
