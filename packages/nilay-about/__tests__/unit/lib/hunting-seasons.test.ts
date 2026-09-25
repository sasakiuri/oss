import { describe, expect, it } from 'vitest';

import { isIsoDate } from '@/lib/calendar-days';
import {
  dataState,
  dayReport,
  nationalSeason,
  seasonEvents,
  seasonYearOf,
  type PrefectureSeasons,
} from '@/lib/hunting-seasons';
import { PREFECTURE_SEASONS } from '@/lib/hunting-seasons-data';

const sample: PrefectureSeasons = {
  prefecture: '長野県',
  status: 'confirmed',
  season: 2026,
  checkedOn: '2026-09-24',
  overviewUrl: 'https://example.jp/',
  rules: [
    {
      kind: 'extension',
      species: ['ニホンジカ'],
      period: { from: '2026-11-15', to: '2027-03-15' },
      periodText: '',
      area: '県内全域',
      methods: 'わな猟',
      limit: null,
      source: { title: 't', url: 'https://example.jp/a' },
      quote: 'q',
    },
    {
      kind: 'prohibition',
      species: ['ツキノワグマ'],
      period: null,
      periodText: '',
      area: '',
      methods: null,
      limit: null,
      source: { title: 't', url: 'https://example.jp/b' },
      quote: 'q',
    },
  ],
  notes: [],
};

describe('nationalSeason (施行規則 第九条)', () => {
  it('differs between Hokkaido and the rest, and inside hunting grounds', () => {
    expect(nationalSeason('長野県', 2026)).toEqual({ from: '2026-11-15', to: '2027-02-15' });
    expect(nationalSeason('北海道', 2026)).toEqual({ from: '2026-10-01', to: '2027-01-31' });
    expect(nationalSeason('長野県', 2026, true)).toEqual({ from: '2026-10-15', to: '2027-03-15' });
    expect(nationalSeason('北海道', 2027, true)).toEqual({ from: '2027-09-15', to: '2028-02-29' });
  });

  it('puts a day in January in the season that began the year before', () => {
    expect(seasonYearOf('2027-01-10')).toBe(2026);
    expect(seasonYearOf('2026-09-24')).toBe(2026);
  });
});

describe('dayReport', () => {
  it('places a day after 15 February inside a prefectural extension', () => {
    const report = dayReport('長野県', '2027-03-01', sample);
    expect(report.inNationalSeason).toBe(false);
    expect(report.onlyByExtension).toBe(true);
    expect(report.rules.map((rule) => rule.applies)).toEqual([true, null]);
  });

  it('does not carry a dated rule into a later season', () => {
    expect(dayReport('長野県', '2028-03-01', sample).onlyByExtension).toBe(false);
  });
});

describe('dataState', () => {
  it('flags data for an earlier season and prefectures not collected', () => {
    expect(dataState(sample, '2026-12-01')).toBe('current');
    expect(dataState(sample, '2027-05-01')).toBe('stale');
    expect(dataState(undefined, '2026-12-01')).toBe('missing');
    expect(dataState({ ...sample, status: 'unconfirmed', season: null }, '2026-12-01')).toBe('unconfirmed');
  });
});

describe('seasonEvents', () => {
  it('lists the national season and the dated extensions of that season', () => {
    expect(seasonEvents('長野県', 2026, sample).map((event) => event.period)).toEqual([
      { from: '2026-11-15', to: '2027-02-15' },
      { from: '2026-11-15', to: '2027-03-15' },
    ]);
    expect(seasonEvents('長野県', 2027, sample)).toHaveLength(1);
  });
});

describe('the collected data', () => {
  it('quotes a linked source for every rule and uses real dates', () => {
    for (const entry of PREFECTURE_SEASONS) {
      expect(isIsoDate(entry.checkedOn)).toBe(true);
      for (const rule of entry.rules) {
        expect(rule.quote.length).toBeGreaterThan(0);
        expect(rule.source.url).toMatch(/^https:\/\//);
        const dates = rule.period ? [rule.period.from, rule.period.to] : [];
        expect(dates.every(isIsoDate)).toBe(true);
      }
    }
    expect(new Set(PREFECTURE_SEASONS.map((entry) => entry.prefecture)).size).toBe(PREFECTURE_SEASONS.length);
  });

  it('keeps a ban on the females of the pheasants to the females (施行規則 第十条第一項)', () => {
    const rules = PREFECTURE_SEASONS.flatMap((entry) => entry.rules);
    const femaleBans = rules.filter((rule) => /メスキジ|メスヤマドリ/.test(rule.quote));
    expect(femaleBans.length).toBeGreaterThan(0);
    for (const rule of femaleBans) {
      expect(rule.species).not.toContain('キジ');
      expect(rule.species).not.toContain('ヤマドリ');
    }
    // Every prohibition names its species in the quote, so a species is not widened past the source.
    for (const rule of rules.filter((entry) => entry.kind === 'prohibition'))
      for (const species of rule.species) expect(rule.quote).toContain(species);
  });
});
