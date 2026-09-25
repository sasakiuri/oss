import { describe, expect, it } from 'vitest';

import {
  SAM_INPUT_SIZE,
  SAM_MASK_SIZE,
  bestMaskIndex,
  maskAtFit,
  maskCoverage,
  samFit,
  toSamPixelValues,
} from '@/lib/outline-segmentation';

describe('fitting a photo into the model input', () => {
  it('puts the longest side at 1024', () => {
    expect(samFit(4000, 3000)).toEqual({ scale: 0.256, width: 1024, height: 768 });
    expect(samFit(1080, 1920)).toMatchObject({ width: 576, height: 1024 });
    expect(samFit(0, 10)).toBeNull();
  });
  it('normalises the pixels by the ImageNet mean and deviation and pads with zeros', () => {
    const rgba = new Uint8Array([255, 0, 128, 255, 0, 0, 0, 255]);
    const values = toSamPixelValues(rgba, 2, 1);
    const plane = SAM_INPUT_SIZE * SAM_INPUT_SIZE;
    expect(values).toHaveLength(plane * 3);
    expect(values[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(values[plane]).toBeCloseTo((0 - 0.456) / 0.224, 5);
    expect(values[2 * plane]).toBeCloseTo((128 / 255 - 0.406) / 0.225, 5);
    expect(values[1]).toBeCloseTo(-0.485 / 0.229, 5);
    // Beyond the photo, the padding stays at zero.
    expect(values[2]).toBe(0);
    expect(values[SAM_INPUT_SIZE]).toBe(0);
  });
  it('refuses pixels that do not match the size', () => {
    expect(() => toSamPixelValues(new Uint8Array(12), 2, 1)).toThrow(RangeError);
  });
});

describe('reading a mask back', () => {
  it('takes the candidate the model rates best', () => {
    expect(bestMaskIndex([0.7, 0.95, 0.9])).toBe(1);
  });
  it('scales the low-resolution mask up to the fitted photo', () => {
    // Positive logits in the left half of the 256 grid only.
    const logits = new Float32Array(SAM_MASK_SIZE * SAM_MASK_SIZE).fill(-5);
    for (let y = 0; y < SAM_MASK_SIZE; y += 1) for (let x = 0; x < 128; x += 1) logits[y * SAM_MASK_SIZE + x] = 5;
    const fit = samFit(1024, 512)!;
    const mask = maskAtFit(logits, fit);
    expect(mask).toHaveLength(1024 * 512);
    expect(mask[10 * 1024 + 100]).toBe(1);
    expect(mask[10 * 1024 + 900]).toBe(0);
    expect(maskCoverage(mask)).toBeCloseTo(0.5, 2);
  });
  it('refuses a mask of the wrong size', () => {
    expect(() => maskAtFit(new Float32Array(10), samFit(10, 10)!)).toThrow(RangeError);
  });
});
