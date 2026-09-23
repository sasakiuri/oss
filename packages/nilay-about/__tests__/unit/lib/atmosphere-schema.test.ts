import { describe, expect, it } from 'vitest';

import {
  altitudeInRange,
  altitudeRange,
  atmosphereSchema,
  temperatureInRange,
  temperatureRange,
  type AtmosphereSetting,
} from '@/lib/schemas/trajectory';

const atmosphere = (overrides: Partial<AtmosphereSetting> = {}): AtmosphereSetting => ({
  source: 'altitude',
  temperature: { value: 15, unit: 'c' },
  pressure: { value: 1013.25, unit: 'hpa' },
  altitude: { value: 0, unit: 'm' },
  ...overrides,
});

describe('atmosphere limits', () => {
  it('reads a temperature in the unit it was typed in', () => {
    // 70 °F is a warm day, 21 °C, not a number past the 60 °C limit.
    expect(temperatureInRange(70, 'f')).toBe(true);
    expect(temperatureInRange(140, 'f')).toBe(true);
    expect(temperatureInRange(141, 'f')).toBe(false);
    expect(temperatureInRange(-76, 'f')).toBe(true);
    expect(temperatureInRange(-77, 'f')).toBe(false);
    expect(temperatureInRange(60, 'c')).toBe(true);
    expect(temperatureInRange(61, 'c')).toBe(false);
    expect(temperatureInRange(Number.NaN, 'c')).toBe(false);
  });

  it('reads an altitude in the unit it was typed in', () => {
    expect(altitudeInRange(10000, 'ft')).toBe(true);
    expect(altitudeInRange(29527, 'ft')).toBe(true);
    expect(altitudeInRange(29600, 'ft')).toBe(false);
    expect(altitudeInRange(-1640, 'ft')).toBe(true);
    expect(altitudeInRange(-1650, 'ft')).toBe(false);
    expect(altitudeInRange(9000, 'm')).toBe(true);
    expect(altitudeInRange(9001, 'm')).toBe(false);
  });

  it('states the limits in the unit on screen, inside the range', () => {
    expect(temperatureRange('c')).toEqual({ min: -60, max: 60 });
    expect(temperatureRange('f')).toEqual({ min: -76, max: 140 });
    expect(altitudeRange('m')).toEqual({ min: -500, max: 9000 });
    expect(altitudeRange('ft')).toEqual({ min: -1640, max: 29527 });
    const ft = altitudeRange('ft');
    expect(altitudeInRange(ft.min, 'ft') && altitudeInRange(ft.max, 'ft')).toBe(true);
  });

  it('saves a Fahrenheit or feet reading that is inside the limits', () => {
    expect(atmosphereSchema.safeParse(atmosphere({ temperature: { value: 70, unit: 'f' } })).success).toBe(true);
    expect(atmosphereSchema.safeParse(atmosphere({ altitude: { value: 10000, unit: 'ft' } })).success).toBe(true);
    expect(atmosphereSchema.safeParse(atmosphere({ temperature: { value: 70, unit: 'c' } })).success).toBe(false);
    expect(atmosphereSchema.safeParse(atmosphere({ altitude: { value: 10000, unit: 'm' } })).success).toBe(false);
  });

  it('does not hold an unused altitude against a station reading', () => {
    expect(
      atmosphereSchema.safeParse(atmosphere({ source: 'station', altitude: { value: 99999, unit: 'm' } })).success,
    ).toBe(true);
  });
});
