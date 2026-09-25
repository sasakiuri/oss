import { describe, expect, it } from 'vitest';

import {
  STANDARD_FEES,
  calculateHuntingCosts,
  registrationTax,
  registrationYearOf,
  reliefPeriod,
} from '@/lib/hunting-costs';
import { huntingCostsSettingsSchema, type HuntingCostsSettings } from '@/lib/schemas/hunting-costs';

const base: HuntingCostsSettings = {
  season: 2026,
  licenses: [
    { type: 'firstGun', partlyExempt: false },
    { type: 'trap', partlyExempt: true },
  ],
  lowIncome: false,
  registrations: [
    {
      id: 'r1',
      prefecture: '長野県',
      types: ['firstGun', 'trap'],
      releaseArea: 'none',
      relief: 'none',
      registeredOn: '',
    },
    { id: 'r2', prefecture: '山梨県', types: ['firstGun'], releaseArea: 'none', relief: 'half', registeredOn: '' },
  ],
  others: [{ id: 'o1', label: '猟友会費', amount: 12_000 }],
  fees: STANDARD_FEES,
};

describe('registrationTax (地方税法 第七百条の五十二、附則 第三十二条の二)', () => {
  const plain = { releaseArea: 'none', relief: 'none', registeredOn: '' } as const;

  it('uses the statutory rates', () => {
    expect(registrationTax('firstGun', plain, false, 2026).tax).toBe(16_500);
    expect(registrationTax('firstGun', plain, true, 2026).tax).toBe(11_000);
    expect(registrationTax('net', plain, false, 2026).tax).toBe(8_200);
    expect(registrationTax('trap', plain, true, 2026).tax).toBe(5_500);
    expect(registrationTax('secondGun', plain, false, 2026).tax).toBe(5_500);
  });

  it('applies the released-game area fractions of 第二項', () => {
    expect(
      registrationTax('firstGun', { releaseArea: 'releaseOnly', relief: 'none', registeredOn: '' }, false, 2026).tax,
    ).toBe(4_125);
    expect(
      registrationTax('firstGun', { releaseArea: 'releaseAdded', relief: 'none', registeredOn: '' }, false, 2026).tax,
    ).toBe(12_375);
  });

  it('halves or waives the tax under the relief until it ends', () => {
    expect(
      registrationTax('firstGun', { releaseArea: 'none', relief: 'half', registeredOn: '' }, false, 2026).tax,
    ).toBe(8_250);
    expect(
      registrationTax('trap', { releaseArea: 'none', relief: 'capturer', registeredOn: '' }, false, 2026).tax,
    ).toBe(0);
    expect(
      registrationTax('trap', { releaseArea: 'none', relief: 'certified', registeredOn: '2028-11-01' }, false, 2028)
        .tax,
    ).toBe(0);
    expect(
      registrationTax('trap', { releaseArea: 'none', relief: 'half', registeredOn: '' }, false, 2029),
    ).toMatchObject({
      error: 'reliefExpired',
    });
  });

  it('takes the relief by the day of registration in the year it ends (附則 第三十二条の二)', () => {
    const half = (registeredOn: string) =>
      registrationTax('firstGun', { releaseArea: 'none', relief: 'half', registeredOn }, false, 2028);
    // The 2028 registration year runs to 15 April 2029, past the end of the relief on 31 March 2029.
    expect(half('2029-03-31').tax).toBe(8_250);
    expect(half('2029-04-10')).toMatchObject({ tax: NaN, error: 'reliefExpired' });
    expect(
      registrationTax('trap', { releaseArea: 'none', relief: 'certified', registeredOn: '2029-04-01' }, false, 2028),
    ).toMatchObject({ error: 'reliefExpired' });
    // Without the day, the relief cannot be told in that year.
    expect(half('')).toMatchObject({ tax: NaN, error: 'registeredOnNeeded' });
    // A day outside the registration year is refused.
    expect(half('2028-04-15')).toMatchObject({ error: 'registeredOnOutsideYear' });
    expect(half('2029-04-16')).toMatchObject({ error: 'registeredOnOutsideYear' });
    // A day given in an earlier year is checked against that year too.
    expect(
      registrationTax('firstGun', { releaseArea: 'none', relief: 'half', registeredOn: '2026-11-01' }, false, 2026).tax,
    ).toBe(8_250);
  });

  it('does not combine the relief with a released-game area registration', () => {
    expect(
      registrationTax('trap', { releaseArea: 'releaseOnly', relief: 'half', registeredOn: '' }, false, 2026),
    ).toMatchObject({
      error: 'reliefWithReleaseArea',
    });
  });
});

describe('registration years', () => {
  it('begins on 16 April', () => {
    expect(registrationYearOf('2026-04-15')).toBe(2025);
    expect(registrationYearOf('2026-04-16')).toBe(2026);
    expect(reliefPeriod(2027)).toBe('whole');
    expect(reliefPeriod(2028)).toBe('part');
    expect(reliefPeriod(2029)).toBe('none');
  });
});

describe('calculateHuntingCosts', () => {
  it('totals the first year, a registration year and the renewal year', () => {
    const { scenarios, problems } = calculateHuntingCosts(base);
    expect(problems).toEqual([]);
    // Registrations: three at 1,800; tax 16,500 + 8,200 + 8,250 (half) = 32,950; club 12,000.
    const yearly = 3 * 1_800 + 32_950 + 12_000;
    expect(scenarios.regular.total).toBe(yearly);
    // First year: 5,200 + 3,900 (partly exempt).
    expect(scenarios.first.total).toBe(yearly + 5_200 + 3_900);
    expect(scenarios.renewal.total).toBe(yearly + 2 * 2_900);
    expect(scenarios.first.tax).toBe(32_950);
  });

  it('reports registrations for a licence not held and repeated prefectures', () => {
    const { problems } = calculateHuntingCosts({
      ...base,
      registrations: [
        { id: 'r1', prefecture: '長野県', types: ['net'], releaseArea: 'none', relief: 'none', registeredOn: '' },
        { id: 'r2', prefecture: '長野県', types: [], releaseArea: 'none', relief: 'none', registeredOn: '' },
      ],
    });
    expect(problems).toEqual([
      { kind: 'unlicensedType', registrationId: 'r1', type: 'net' },
      { kind: 'duplicatePrefecture', registrationId: 'r2' },
      { kind: 'noType', registrationId: 'r2' },
    ]);
  });

  it('accepts its own defaults and only real days of registration', () => {
    expect(huntingCostsSettingsSchema.safeParse(base).success).toBe(true);
    const withDay = (registeredOn: string) =>
      huntingCostsSettingsSchema.safeParse({
        ...base,
        registrations: [{ ...base.registrations[0], registeredOn }],
      }).success;
    expect(withDay('2026-11-01')).toBe(true);
    expect(withDay('2026-02-30')).toBe(false);
  });
});
