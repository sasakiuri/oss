import { describe, expect, it } from 'vitest';

import {
  convertAltitudeValue,
  convertMassValue,
  convertPressureValue,
  convertSightHeightValue,
  convertSpeedValue,
  convertTemperatureValue,
  convertWindSpeedValue,
} from '@/lib/trajectory-units';

describe('rewriting a measured value into another unit', () => {
  it('says the same quantity another way, and comes back to it', () => {
    expect(convertSpeedValue(800, 'mps', 'fps')).toBe(2624.7);
    expect(convertSpeedValue(2624.7, 'fps', 'mps')).toBe(800);
    expect(convertMassValue(10.9, 'g', 'grain')).toBe(168.21);
    expect(convertMassValue(168.21, 'grain', 'g')).toBe(10.9);
    expect(convertMassValue(168, 'grain', 'g')).toBe(10.886);
    expect(convertSightHeightValue(40, 'mm', 'inch')).toBe(1.575);
    expect(convertSightHeightValue(1.575, 'inch', 'mm')).toBe(40);
    expect(convertWindSpeedValue(4, 'mps', 'mph')).toBe(8.9);
    expect(convertWindSpeedValue(8.9, 'mph', 'mps')).toBe(4);
    expect(convertTemperatureValue(15, 'c', 'f')).toBe(59);
    expect(convertTemperatureValue(59, 'f', 'c')).toBe(15);
    expect(convertPressureValue(1013.25, 'hpa', 'inhg')).toBe(29.921);
    // Three decimals of an inch of mercury is a hundredth of a hectopascal, so the way back can
    // move the last digit; that is well inside what any barometer reads to.
    expect(convertPressureValue(29.92, 'inhg', 'hpa')).toBe(1013.21);
    expect(convertAltitudeValue(1000, 'm', 'ft')).toBe(3281);
    expect(convertAltitudeValue(3281, 'ft', 'm')).toBe(1000);
    // The top and bottom of the accepted range stay accepted in the other unit.
    expect(convertAltitudeValue(9000, 'm', 'ft')).toBe(29527);
    expect(convertAltitudeValue(-500, 'm', 'ft')).toBe(-1640);
    expect(convertAltitudeValue(29527, 'ft', 'm')).toBe(9000);
    expect(convertAltitudeValue(Number.NaN, 'm', 'ft')).toBeNaN();
  });

  it('leaves the number alone when the unit does not change', () => {
    expect(convertSpeedValue(800.00001, 'mps', 'mps')).toBe(800.00001);
    expect(convertTemperatureValue(15.04, 'c', 'c')).toBe(15.04);
  });

  it('keeps a field that is still empty empty', () => {
    expect(convertSpeedValue(Number.NaN, 'mps', 'fps')).toBeNaN();
    expect(convertPressureValue(Number.NaN, 'hpa', 'inhg')).toBeNaN();
  });
});
