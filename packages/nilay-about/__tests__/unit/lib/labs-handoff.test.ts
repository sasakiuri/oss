import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defineHandoff,
  enumParam,
  numberParam,
  plainDecimal,
  receiveHandoff,
  twistStabilityHandoff,
} from '@/lib/labs-handoff';

const handoff = defineHandoff('sight-adjustment', {
  distance: numberParam({ positive: true }),
  offset: numberParam({ min: -50, max: 50 }),
  unit: enumParam(['m', 'yd'] as const),
});

describe('defineHandoff', () => {
  it('builds a link to the receiving tool that reads back to the same values', () => {
    const href = handoff.href({ distance: 100, offset: -2.5, unit: 'm' });
    expect(href).toBe('/labs/sight-adjustment?distance=100&offset=-2.5&unit=m');
    expect(handoff.read(href.split('?')[1]!)).toEqual({
      state: 'received',
      values: { distance: 100, offset: -2.5, unit: 'm' },
    });
  });

  it('treats an address with none of its keys as an ordinary visit', () => {
    expect(handoff.read('')).toEqual({ state: 'none' });
    expect(handoff.read('?utm_source=x')).toEqual({ state: 'none' });
  });

  it('refuses the whole link when any value is missing or cannot be read', () => {
    expect(handoff.read('distance=100&unit=m')).toEqual({ state: 'invalid' });
    expect(handoff.read('distance=0&offset=1&unit=m')).toEqual({ state: 'invalid' });
    expect(handoff.read('distance=100&offset=51&unit=m')).toEqual({ state: 'invalid' });
    expect(handoff.read('distance=100&offset=1&unit=ft')).toEqual({ state: 'invalid' });
    // Number() would read these as 0, 100 and Infinity.
    expect(handoff.read('distance=&offset=1&unit=m')).toEqual({ state: 'invalid' });
    expect(handoff.read('distance=1e2&offset=1&unit=m')).toEqual({ state: 'invalid' });
    expect(handoff.read('distance=Infinity&offset=1&unit=m')).toEqual({ state: 'invalid' });
  });

  it('writes every number it can as a plain decimal that reads back to the same number', () => {
    for (const value of [0, 123, -0.5, 853.4, 1e-7, 1.5e-8, -2.345e-12, 9.99e20]) {
      const text = plainDecimal(value);
      expect(text).not.toMatch(/e/i);
      expect(numberParam().read(text)).toBe(value);
    }
    const tiny = defineHandoff('recoil', { value: numberParam({ positive: true }) });
    expect(tiny.read(tiny.href({ value: 3e-7 }).split('?')[1]!)).toEqual({
      state: 'received',
      values: { value: 3e-7 },
    });
  });

  it('refuses to write a number no link could carry', () => {
    expect(() => plainDecimal(1e21)).toThrow(RangeError);
    expect(() => plainDecimal(Number.NaN)).toThrow(RangeError);
    expect(() => plainDecimal(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('carries a mean velocity to twist rate and stability', () => {
    expect(twistStabilityHandoff.href({ muzzleSpeed: 853.4, speedUnit: 'mps' })).toBe(
      '/labs/twist-stability?muzzleSpeed=853.4&speedUnit=mps',
    );
  });
});

describe('receiveHandoff', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('applies what it received and takes its keys off the address, keeping the rest', () => {
    window.history.replaceState(null, '', '/labs/twist-stability?muzzleSpeed=820&speedUnit=fps&keep=1#notes');
    const apply = vi.fn();
    expect(receiveHandoff(twistStabilityHandoff, apply)).toEqual({
      state: 'received',
      values: { muzzleSpeed: 820, speedUnit: 'fps' },
    });
    expect(apply).toHaveBeenCalledWith({ muzzleSpeed: 820, speedUnit: 'fps' });
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      '/labs/twist-stability?keep=1#notes',
    );
  });

  it('applies nothing from a link it cannot read, and still clears it', () => {
    window.history.replaceState(null, '', '/labs/twist-stability?muzzleSpeed=-1&speedUnit=mps');
    const apply = vi.fn();
    expect(receiveHandoff(twistStabilityHandoff, apply)).toEqual({ state: 'invalid' });
    expect(apply).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('leaves an ordinary visit alone', () => {
    window.history.replaceState(null, '', '/labs/twist-stability?other=1');
    const apply = vi.fn();
    expect(receiveHandoff(twistStabilityHandoff, apply)).toEqual({ state: 'none' });
    expect(apply).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?other=1');
  });
});
