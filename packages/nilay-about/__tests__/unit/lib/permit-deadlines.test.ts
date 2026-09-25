import { describe, expect, it } from 'vitest';

import { addDays, ageOn, daysBetween, lastDayOfYears, shiftMonths } from '@/lib/calendar-days';
import {
  certificateLastDay,
  deadlineEvents,
  firearmPermitExpiry,
  huntingLicenseExpiry,
  judgeDormantGun,
  needsCognitiveTest,
  permitDeadlines,
  permitRenewalWindow,
  renewalChecklist,
} from '@/lib/permit-deadlines';

describe('calendar days', () => {
  it('moves by months to the last day of a shorter month', () => {
    expect(shiftMonths('2027-03-31', -1)).toBe('2027-02-28');
    expect(shiftMonths('2028-03-31', -1)).toBe('2028-02-29');
    expect(shiftMonths('2027-03-31', -2)).toBe('2027-01-31');
    expect(shiftMonths('2027-01-15', -2)).toBe('2026-11-15');
  });

  it('ends a period of years the day before the same date (民法 第百四十三条)', () => {
    expect(lastDayOfYears('2024-05-10', 3)).toBe('2027-05-09');
    // No 29 February in 2027: the period ends on the last day of that month.
    expect(lastDayOfYears('2024-02-29', 3)).toBe('2027-02-28');
    expect(lastDayOfYears('2024-03-01', 2)).toBe('2026-02-28');
  });

  it('counts days and ages', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-09-24', '2026-10-01')).toBe(7);
    expect(ageOn('1951-06-10', '2026-06-08')).toBe(74);
    expect(ageOn('1951-06-10', '2026-06-10')).toBe(75);
  });

  it('reaches an age on the day before the birthday (年齢計算ニ関スル法律, 民法 第百四十三条)', () => {
    // The age is reached at the end of the day before the birthday, and counts on that day.
    expect(ageOn('1951-06-10', '2026-06-09')).toBe(75);
    // Born on 29 February: the day before 29 February in a leap year, and the last day of February,
    // 28 February, in other years.
    expect(ageOn('1952-02-29', '2027-02-27')).toBe(74);
    expect(ageOn('1952-02-29', '2027-02-28')).toBe(75);
    expect(ageOn('1952-02-29', '2028-02-27')).toBe(75);
    expect(ageOn('1952-02-29', '2028-02-28')).toBe(76);
    expect(ageOn('1952-02-29', '1952-02-29')).toBe(0);
  });
});

describe('firearmPermitExpiry (銃刀法 第七条の二)', () => {
  it('runs to the third birthday after the day of the permit', () => {
    // Birthday 10 June; granted 1 April 2026: birthdays after it are 2026, 2027 and 2028.
    expect(firearmPermitExpiry('1980-06-10', '2026-04-01')).toBe('2028-06-10');
    // Granted on 20 June 2026: the first birthday after it is in 2027.
    expect(firearmPermitExpiry('1980-06-10', '2026-06-20')).toBe('2029-06-10');
  });

  it('does not count a birthday on the day of the permit, which is not after it', () => {
    expect(firearmPermitExpiry('1980-06-10', '2026-06-10')).toBe('2029-06-10');
  });

  it('runs a renewed permit to the third birthday after the old one ended', () => {
    expect(firearmPermitExpiry('1980-06-10', '2028-06-10')).toBe('2031-06-10');
  });

  it('treats a birthday on 29 February as 28 February in every year', () => {
    expect(firearmPermitExpiry('1988-02-29', '2026-01-10')).toBe('2028-02-28');
    expect(firearmPermitExpiry('1988-02-29', '2026-02-28')).toBe('2029-02-28');
  });
});

describe('permitRenewalWindow (施行規則 第三十四条)', () => {
  it('opens two months and closes one month before the last day', () => {
    expect(permitRenewalWindow('2028-06-10')).toEqual({ from: '2028-04-10', to: '2028-05-10' });
  });

  it('keeps to the last day of a month without the same date', () => {
    expect(permitRenewalWindow('2029-04-30')).toEqual({ from: '2029-02-28', to: '2029-03-30' });
  });
});

describe('needsCognitiveTest (法 第四条の三)', () => {
  it('asks for it from the age of 75 on the last day', () => {
    expect(needsCognitiveTest('1953-06-10', '2028-06-10')).toBe(true);
    expect(needsCognitiveTest('1953-06-12', '2028-06-10')).toBe(false);
  });

  it('asks it of a holder born on 29 February whose permit ends on the 28 February they turn 75', () => {
    expect(firearmPermitExpiry('1952-02-29', '2024-03-01')).toBe('2027-02-28');
    expect(needsCognitiveTest('1952-02-29', '2027-02-28')).toBe(true);
    expect(permitDeadlines('1952-02-29', '2024-03-01')?.cognitiveTest).toBe(true);
    // The same in a leap year, when the permit ends on 28 February by 第七条の二.
    expect(needsCognitiveTest('1953-02-28', '2028-02-28')).toBe(true);
    expect(needsCognitiveTest('1956-02-29', '2031-02-28')).toBe(true);
  });
});

describe('huntingLicenseExpiry (鳥獣保護管理法 第四十四条)', () => {
  it('ends on 14 September of the year three years after the examination', () => {
    expect(huntingLicenseExpiry('exam', '2026-07-20')).toBe('2029-09-14');
    // An autumn examination: three years pass in 2029 too, after 14 September, so the licence is shorter.
    expect(huntingLicenseExpiry('exam', '2026-10-05')).toBe('2029-09-14');
  });

  it('runs a renewed licence for three years from the day after it ended', () => {
    expect(huntingLicenseExpiry('renewed', '2029-09-14')).toBe('2032-09-14');
    expect(() => huntingLicenseExpiry('renewed', '2029-09-15')).toThrow();
  });
});

describe('certificateLastDay (法 第五条の二)', () => {
  // 「その交付を受けた日から起算して三年」: 「起算して」 makes the day of issue the first day of the three
  // years, in place of 民法第百四十条, and 第百四十三条第二項 ends them the day before the same date.
  it('counts three years including the day of issue', () => {
    expect(certificateLastDay('2025-11-20')).toBe('2028-11-19');
    // The day before 28 February 2028 is the 27th; 29 February is the first day after the three years.
    expect(certificateLastDay('2025-02-28')).toBe('2028-02-27');
    expect(certificateLastDay('2025-03-01')).toBe('2028-02-29');
  });
});

describe('judgeDormantGun (法 第十一条第五項、附則 第五条)', () => {
  it('flags every purpose after two years without use as grounds to revoke', () => {
    const result = judgeDormantGun({
      grantedOn: '2025-04-01',
      heldBeforeRuleStart: false,
      uses: [{ purpose: 'hunting', lastUsedOn: '2025-12-01' }],
      on: '2027-12-01',
    });
    expect(result).toMatchObject({
      ok: true,
      reading: 'standard',
      outcome: 'all',
      purposes: [{ unusedFrom: '2025-12-02', twoYearsEnd: '2027-12-01' }],
    });
  });

  it('is not reached the day before', () => {
    const result = judgeDormantGun({
      grantedOn: null,
      heldBeforeRuleStart: false,
      uses: [{ purpose: 'hunting', lastUsedOn: '2025-12-01' }],
      on: '2027-11-30',
    });
    expect(result).toMatchObject({ ok: true, outcome: 'none' });
  });

  it('flags only the unused purposes as grounds to narrow the permit', () => {
    const result = judgeDormantGun({
      grantedOn: '2025-04-01',
      heldBeforeRuleStart: false,
      uses: [
        { purpose: 'hunting', lastUsedOn: '2027-01-10' },
        { purpose: 'targetShooting', lastUsedOn: null },
      ],
      on: '2027-04-01',
    });
    expect(result).toMatchObject({ ok: true, outcome: 'partial' });
  });

  it('reads three years and all purposes for a permit held before 1 March 2025', () => {
    // Last hunted in January 2024; judged in September 2026: under three years, and two years since
    // 1 March 2025 have not yet run.
    const held = { grantedOn: null, heldBeforeRuleStart: true, on: '2026-09-24' } as const;
    expect(judgeDormantGun({ ...held, uses: [{ purpose: 'hunting', lastUsedOn: '2024-01-10' }] })).toMatchObject({
      ok: true,
      reading: 'transitional',
      outcome: 'none',
    });
    // Last hunted in 2023: three years have passed by September 2026.
    expect(judgeDormantGun({ ...held, uses: [{ purpose: 'hunting', lastUsedOn: '2023-06-10' }] })).toMatchObject({
      ok: true,
      reading: 'transitional',
      outcome: 'all',
    });
  });

  it('falls back to the rule as written once two years since 1 March 2025 have passed unused', () => {
    const result = judgeDormantGun({
      grantedOn: null,
      heldBeforeRuleStart: true,
      uses: [
        { purpose: 'hunting', lastUsedOn: '2026-12-01' },
        { purpose: 'pestControl', lastUsedOn: '2024-06-01' },
      ],
      on: '2027-03-01',
    });
    // Pest control: unused from 1 March 2025 to 28 February 2027, so the transitional reading no longer applies.
    expect(result).toMatchObject({ ok: true, reading: 'standard', outcome: 'partial' });
  });

  it('refuses a last use before the permit, which is not a use under it', () => {
    expect(
      judgeDormantGun({
        grantedOn: '2026-01-01',
        heldBeforeRuleStart: false,
        uses: [{ purpose: 'hunting', lastUsedOn: '2025-01-01' }],
        on: '2027-01-01',
      }),
    ).toEqual({ ok: false, reason: 'beforePermit' });
    // Not used since the permit: counted from the next day, two years end on 1 January 2028.
    expect(
      judgeDormantGun({
        grantedOn: '2026-01-01',
        heldBeforeRuleStart: false,
        uses: [{ purpose: 'hunting', lastUsedOn: null }],
        on: '2027-01-01',
      }),
    ).toMatchObject({ ok: true, outcome: 'none', purposes: [{ twoYearsEnd: '2028-01-01' }] });
  });

  it('asks for the day of the permit when a purpose has never been used', () => {
    expect(
      judgeDormantGun({
        grantedOn: null,
        heldBeforeRuleStart: false,
        uses: [{ purpose: 'hunting', lastUsedOn: null }],
        on: '2026-09-24',
      }),
    ).toEqual({ ok: false, reason: 'grantedOnMissing' });
    expect(judgeDormantGun({ grantedOn: null, heldBeforeRuleStart: false, uses: [], on: '2026-09-24' })).toEqual({
      ok: false,
      reason: 'noPurpose',
    });
    expect(
      judgeDormantGun({
        grantedOn: null,
        heldBeforeRuleStart: false,
        uses: [{ purpose: 'hunting', lastUsedOn: '2026-10-01' }],
        on: '2026-09-24',
      }),
    ).toEqual({ ok: false, reason: 'future' });
  });
});

describe('deadlineEvents', () => {
  it('lists every complete deadline in date order and skips unfinished ones', () => {
    const events = deadlineEvents(
      {
        birthDate: '1980-06-10',
        permitFrom: '2026-04-01',
        gun: 'airGun',
        courseIssuedOn: '2025-11-20',
        skillsIssuedOn: '2025-12-01',
        licenses: [
          { id: 'a', type: 'firstGun', basis: 'exam', date: '2026-07-20' },
          { id: 'b', type: 'trap', basis: 'renewed', date: '2026-09-15' },
          { id: 'c', type: 'net', basis: 'exam', date: '' },
        ],
      },
      { firstGun: { ja: '第一種銃猟', en: 'Class 1 gun' } },
    );
    // No skills course for an air gun; the renewed licence with a day other than 14 September is left out.
    expect(events.map((event) => [event.key, event.start, event.end])).toEqual([
      ['permit-renewal', '2028-04-10', '2028-05-10'],
      ['permit-expiry', '2028-06-10', undefined],
      ['course-certificate', '2028-11-19', undefined],
      ['license-a', '2029-09-14', undefined],
    ]);
  });

  it('waits for a birth date before the permit date', () => {
    expect(permitDeadlines('2026-05-01', '2026-04-01')).toBeNull();
    expect(permitDeadlines('', '2026-04-01')).toBeNull();
  });
});

describe('renewalChecklist', () => {
  it('lists the skills course only for a hunting gun, and the cognitive test only when due', () => {
    const ids = (gun: 'huntingGun' | 'airGun', test: boolean) => renewalChecklist(gun, test).map((item) => item.id);
    expect(ids('huntingGun', false)).toContain('skills');
    expect(ids('airGun', false)).not.toContain('skills');
    expect(ids('airGun', true)).toContain('cognitive');
    expect(ids('huntingGun', false)).not.toContain('cognitive');
  });
});
