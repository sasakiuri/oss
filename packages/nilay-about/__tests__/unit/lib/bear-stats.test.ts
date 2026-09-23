import { describe, expect, it } from 'vitest';

import {
  EMERGENCY_SHOOTINGS,
  PREFECTURE_IDS,
  compiledThroughMonth,
  emergencyBoarCount,
  fiscalYearLabel,
  fiscalYearShortLabel,
  monthlySeries,
  nationalBySpecies,
  prefectureValues,
  rankPrefectures,
  resolveYear,
  samePeriodLastYear,
  sumCells,
  yearValue,
  yearlySeries,
} from '@/lib/bear-stats';

// Every expected figure below is copied from the 「計」 rows printed in the ministry's PDFs
// (published 令和8年9月9日 unless noted), not from the per-prefecture rows the tool adds up.
describe('personal injuries', () => {
  it('adds the prefectures up to the national totals the ministry prints', () => {
    // injury-qe.pdf: H20 52/55/3, H22 145/150/4, R05 198/219/6, R07 216/238/13, R08 56/60/6.
    expect(yearValue('injuries', 2008, 'national', 'cases')).toBe(52);
    expect(yearValue('injuries', 2008, 'national', 'victims')).toBe(55);
    expect(yearValue('injuries', 2008, 'national', 'deaths')).toBe(3);
    expect(yearValue('injuries', 2010, 'national', 'victims')).toBe(150);
    expect(yearValue('injuries', 2023, 'national', 'cases')).toBe(198);
    expect(yearValue('injuries', 2023, 'national', 'victims')).toBe(219);
    expect(yearValue('injuries', 2025, 'national', 'cases')).toBe(216);
    expect(yearValue('injuries', 2025, 'national', 'victims')).toBe(238);
    expect(yearValue('injuries', 2025, 'national', 'deaths')).toBe(13);
    expect(yearValue('injuries', 2026, 'national', 'cases')).toBe(56);
    expect(yearValue('injuries', 2026, 'national', 'deaths')).toBe(6);
  });

  it('reads one prefecture', () => {
    // R07 秋田 59 件 67 人 4 人, 岩手 39/40/5.
    expect(yearValue('injuries', 2025, 'akita', 'cases')).toBe(59);
    expect(yearValue('injuries', 2025, 'akita', 'victims')).toBe(67);
    expect(yearValue('injuries', 2025, 'iwate', 'deaths')).toBe(5);
  });

  it('matches the monthly national row of each year', () => {
    // r07injury-qe.pdf 計: 10月 78/89/7, 11月 32/33/1, 1月 0/0/0.
    const r07 = monthlySeries('injuries', 2025, 'national', 'cases')!;
    expect(r07.map((point) => point.month)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]);
    expect(r07.map((point) => point.value)).toEqual([9, 9, 13, 17, 14, 37, 78, 32, 5, 0, 1, 1]);
    const r07Victims = monthlySeries('injuries', 2025, 'national', 'victims')!;
    expect(r07Victims).toHaveLength(12);
    expect(r07Victims[6]!.value).toBe(89);
    const r07Deaths = monthlySeries('injuries', 2025, 'national', 'deaths')!;
    expect(r07Deaths).toHaveLength(12);
    expect(r07Deaths[6]!.value).toBe(7);
    // h26injury-qe.pdf 計 9月 31/34/0.
    const h26Victims = monthlySeries('injuries', 2014, 'national', 'victims')!;
    expect(h26Victims).toHaveLength(12);
    expect(h26Victims[5]!.value).toBe(34);
  });

  it('marks the months of the current year that are not compiled yet', () => {
    // r08injury-qe.pdf: 4月 6, 5月 13, 6月 19, 7月 11, 8月 7, nothing from September.
    const r08 = monthlySeries('injuries', 2026, 'national', 'cases')!;
    expect(r08.slice(0, 5).map((point) => point.value)).toEqual([6, 13, 19, 11, 7]);
    expect(r08.slice(5).every((point) => point.value === 'pending')).toBe(true);
    expect(compiledThroughMonth('injuries', 2026)).toBe(8);
    expect(compiledThroughMonth('injuries', 2025)).toBeNull();
  });

  it('has no monthly table before fiscal 2014', () => {
    expect(monthlySeries('injuries', 2013, 'national', 'cases')).toBeNull();
  });

  it('compares a part year with the same months of the year before', () => {
    // R07 April–August: 9 + 9 + 13 + 17 + 14 = 62.
    expect(samePeriodLastYear('injuries', 2026, 'national', 'cases')).toEqual({
      months: [4, 5, 6, 7, 8],
      current: 56,
      previous: 62,
    });
    expect(samePeriodLastYear('injuries', 2025, 'national', 'cases')).toBeNull();
  });

  it('splits the national figure by species as printed', () => {
    // R07 再掲: ツキノワグマ 211/232/11, ヒグマ 5/6/2.
    expect(nationalBySpecies('injuries', 2025, 'cases')).toEqual({ black: 211, brown: 5 });
    expect(nationalBySpecies('injuries', 2025, 'deaths')).toEqual({ black: 11, brown: 2 });
  });
});

describe('sightings', () => {
  it('adds up to the national totals, which leave Hokkaido out', () => {
    // syutubotu.pdf 合計: R04 11,136, R05 24,348, R06 20,513, R07 50,801, R08 17,362.
    expect(yearValue('sightings', 2022, 'national', 'count')).toBe(11136);
    expect(yearValue('sightings', 2023, 'national', 'count')).toBe(24348);
    expect(yearValue('sightings', 2024, 'national', 'count')).toBe(20513);
    expect(yearValue('sightings', 2025, 'national', 'count')).toBe(50801);
    expect(yearValue('sightings', 2026, 'national', 'count')).toBe(17362);
    // 10月 R07 15,998.
    const r07Sightings = monthlySeries('sightings', 2025, 'national', 'count')!;
    expect(r07Sightings).toHaveLength(12);
    expect(r07Sightings[6]!.value).toBe(15998);
  });

  it('keeps an unpublished figure apart from zero', () => {
    expect(yearValue('sightings', 2025, 'hokkaido', 'count')).toBe('unpublished');
    expect(yearValue('sightings', 2022, 'ibaraki', 'count')).toBe('unpublished');
    expect(yearValue('sightings', 2023, 'ibaraki', 'count')).toBe(0);
    // 秋田 R07 13,592.
    expect(yearValue('sightings', 2025, 'akita', 'count')).toBe(13592);
  });

  it('shows every Hokkaido month as unpublished, the current year included', () => {
    // syutubotu.pdf 注3: 北海道は、出没数の公表は行っていません。
    for (const year of [2022, 2023, 2024, 2025, 2026]) {
      const months = monthlySeries('sightings', year, 'hokkaido', 'count')!;
      expect(months.map((point) => point.value)).toEqual(Array(12).fill('unpublished'));
    }
    // Chiba is 「-」 in every column of the table as well.
    expect(monthlySeries('sightings', 2026, 'chiba', 'count')!.every((point) => point.value === 'unpublished')).toBe(
      true,
    );
    // A published prefecture keeps the months after July as not yet compiled, and so does the nation.
    expect(
      monthlySeries('sightings', 2026, 'akita', 'count')!
        .slice(4)
        .every((p) => p.value === 'pending'),
    ).toBe(true);
    expect(
      monthlySeries('sightings', 2026, 'national', 'count')!
        .slice(4)
        .every((p) => p.value === 'pending'),
    ).toBe(true);
  });

  it('has figures through July for the current year', () => {
    expect(compiledThroughMonth('sightings', 2026)).toBe(7);
    // 4–7月 of R07: 800 + 2,528 + 4,227 + 5,161 = 12,716.
    expect(samePeriodLastYear('sightings', 2026, 'national', 'count')).toEqual({
      months: [4, 5, 6, 7],
      current: 17362,
      previous: 12716,
    });
  });
});

describe('captures', () => {
  it('adds up to the national totals the ministry prints', () => {
    // capture-qe.pdf 計: H20 1,492/1,370/122, R05 9,271/9,094/177, R07 14,741/14,618/123, R08 3,363/3,322/41.
    expect(yearValue('captures', 2008, 'national', 'total')).toBe(1492);
    expect(yearValue('captures', 2008, 'national', 'released')).toBe(122);
    expect(yearValue('captures', 2023, 'national', 'total')).toBe(9271);
    expect(yearValue('captures', 2025, 'national', 'total')).toBe(14741);
    expect(yearValue('captures', 2025, 'national', 'killed')).toBe(14618);
    expect(yearValue('captures', 2026, 'national', 'total')).toBe(3363);
    expect(nationalBySpecies('captures', 2025, 'total')).toEqual({ black: 12602, brown: 2139 });
  });

  it('has no row for the prefectures the table leaves out, and no monthly table', () => {
    expect(yearValue('captures', 2025, 'kochi', 'total')).toBe('unpublished');
    expect(yearValue('captures', 2025, 'akita', 'total')).toBe(2691);
    expect(monthlySeries('captures', 2025, 'national', 'total')).toBeNull();
    expect(compiledThroughMonth('captures', 2026)).toBe(7);
  });
});

describe('emergency shootings', () => {
  it('counts bear cases and keeps wild boar apart', () => {
    // r07kinkyu-jishi.pdf: 60 cases, 3 of them wild boar. r08kinkyu-jishi.pdf: 27 cases, 2 wild boar.
    expect(yearValue('emergency', 2025, 'national', 'count')).toBe(57);
    expect(emergencyBoarCount(2025, 'national')).toBe(3);
    expect(yearValue('emergency', 2026, 'national', 'count')).toBe(25);
    expect(emergencyBoarCount(2026, 'national')).toBe(2);
    expect(nationalBySpecies('emergency', 2025, 'count')).toEqual({ black: 56, brown: 1 });
    // 山形県 R07: 17 cases, all Asian black bears.
    expect(yearValue('emergency', 2025, 'yamagata', 'count')).toBe(17);
  });

  it('names only prefectures the tables know', () => {
    expect(EMERGENCY_SHOOTINGS).toHaveLength(87);
    for (const entry of EMERGENCY_SHOOTINGS) expect(PREFECTURE_IDS).toContain(entry.prefecture);
  });

  it('shows no months before the scheme and none after the last update', () => {
    const r07 = monthlySeries('emergency', 2025, 'national', 'count')!;
    expect(r07.slice(0, 5).every((point) => point.value === 'notApplicable')).toBe(true);
    // September 0, October 11 (cases 1–11), November 30 (12–41), December 14 less one boar.
    expect(r07.slice(5, 9).map((point) => point.value)).toEqual([0, 11, 30, 14]);
    const r08 = monthlySeries('emergency', 2026, 'national', 'count')!;
    expect(r08).toHaveLength(12);
    expect(r08[5]!.value).toBe(1);
    expect(r08[6]!.value).toBe('pending');
    // Fiscal 2025 began before the scheme, so there is nothing to set the part year against.
    expect(samePeriodLastYear('emergency', 2026, 'national', 'count')).toBeNull();
  });
});

describe('helpers', () => {
  it('adds only counts and keeps the reason when there are none', () => {
    expect(sumCells([1, 'unpublished', 2, 'pending'])).toBe(3);
    expect(sumCells(['unpublished', 'unpublished'])).toBe('unpublished');
    expect(sumCells(['notApplicable', 'pending'])).toBe('pending');
    expect(sumCells(['unpublished', 'pending'])).toBe('pending');
    expect(sumCells(['notApplicable', 'unpublished'])).toBe('unpublished');
    expect(sumCells([])).toBe('notApplicable');
  });

  it('ranks prefectures largest first and drops zeros and gaps', () => {
    const ranked = rankPrefectures(prefectureValues('injuries', 2025, 'cases'));
    expect(ranked.slice(0, 3)).toEqual([
      { prefecture: 'akita', value: 59 },
      { prefecture: 'iwate', value: 39 },
      { prefecture: 'fukushima', value: 21 },
    ]);
    expect(ranked.every((row) => row.value > 0)).toBe(true);
  });

  it('moves a year the dataset lacks to the nearest one it has', () => {
    expect(resolveYear('sightings', 2010)).toBe(2022);
    expect(resolveYear('emergency', 2024)).toBe(2025);
    expect(resolveYear('injuries', 2010)).toBe(2010);
  });

  it('names fiscal years in both eras', () => {
    expect(fiscalYearLabel(2018, 'ja')).toBe('平成30年度');
    expect(fiscalYearLabel(2019, 'ja')).toBe('令和元年度');
    expect(fiscalYearLabel(2025, 'ja')).toBe('令和7年度');
    expect(fiscalYearLabel(2025, 'en')).toBe('FY2025');
    expect(fiscalYearShortLabel(2008, 'ja')).toBe('H20');
    expect(fiscalYearShortLabel(2026, 'ja')).toBe('R8');
  });

  it('lists every year of a dataset, the current one as partial', () => {
    const series = yearlySeries('captures', 'national', 'total');
    expect(series).toHaveLength(19);
    expect(series.at(-1)).toEqual({ year: 2026, value: 3363, partial: true });
  });
});
