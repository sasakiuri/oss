import { describe, expect, it } from 'vitest';

import {
  BearDataFormatError,
  distanceKm,
  newRecentSightings,
  normalizeAkita,
  parseAkitaDate,
  sightingsNear,
  type BearSighting,
} from '@/lib/bear-alerts';
import { parseDelimited } from '@/lib/delimited-text';

// The header and row shapes of Akita's file as downloaded on 2026-09-24 (addresses and texts shortened).
const HEADER =
  '\uFEFF出没情報ID,情報種別,市町村,地番情報,目撃日時,獣種,性別,単独か親子,頭数,目撃時の状況,x(緯度),y(経度)';
const AKITA = [
  HEADER,
  '27880,痕跡(その他),秋田市,秋田市寺内,2026/8/31 14:53,ツキノワグマ,不明,単独,1,"鳴き声が聞こえた,\n家の近く",39.73767533,140.0838375',
  '27879,目撃,鹿角市,鹿角市十和田大湯,2026/8/31 13:30,ツキノワグマ,不明,単独,1,"体長1ｍ程の""クマ""",40.29209669,140.8169174',
  '27800,目撃,大仙市,大仙市,2026/8/30 6:00,イノシシ,不明,単独,1,,39.45,140.47',
  '5733,目撃,大館市,大館市比内町,44663.41667,ツキノワグマ,不明,単独,1,横断した,40.14141,140.72823',
  '27000,目撃,秋田市,秋田市,2026/8/1 7:00,ツキノワグマ,不明,単独,1,,0,0',
].join('\r\n');

describe('parseDelimited', () => {
  it('keeps quoted commas, quotes and line breaks inside one field', () => {
    const rows = parseDelimited('a,"b,c","d""e"\r\n"f\ng",h', ',');
    expect(rows).toEqual([
      ['a', 'b,c', 'd"e'],
      ['f\ng', 'h'],
    ]);
    expect(parseDelimited('x\ty\n1\t2', '\t')).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ]);
  });
});

describe('parseAkitaDate', () => {
  it('reads slash dates and spreadsheet serials in Japan time', () => {
    expect(new Date(parseAkitaDate('2026/8/31 14:53') ?? 0).toISOString()).toBe('2026-08-31T05:53:00.000Z');
    expect(new Date(parseAkitaDate('2026/8/31') ?? 0).toISOString()).toBe('2026-08-30T15:00:00.000Z');
    // 44663 is 2022-04-12; .41667 of a day is 10:00.
    expect(new Date(parseAkitaDate('44663.41667') ?? 0).toISOString()).toBe('2022-04-12T01:00:00.000Z');
  });
  it.each(['2026/2/30 10:00', '2026/13/1', '8/31', ''])('refuses %j', (value) => {
    expect(parseAkitaDate(value)).toBeNull();
  });
});

describe('normalizeAkita', () => {
  it('keeps bear rows with usable coordinates and none of the free text', () => {
    const sightings = normalizeAkita(AKITA);
    expect(sightings.map((item) => item.id)).toEqual(['27880', '27879', '5733']);
    expect(sightings[0]).toEqual({
      id: '27880',
      source: 'akita',
      kind: '痕跡(その他)',
      municipality: '秋田市',
      observedAt: Date.parse('2026-08-31T14:53:00+09:00'),
      latitude: 39.73767533,
      longitude: 140.0838375,
    });
    expect(JSON.stringify(sightings)).not.toContain('鳴き声');
  });

  it('fails loudly when a column is renamed', () => {
    expect(() => normalizeAkita(HEADER.replace('x(緯度)', '緯度'))).toThrow(BearDataFormatError);
    expect(() => normalizeAkita('')).toThrow(BearDataFormatError);
  });
});

describe('distance and matching', () => {
  it('measures great-circle distance', () => {
    // Akita Station to Omagari Station: about 42 km in a straight line.
    const km = distanceKm({ latitude: 39.7167, longitude: 140.1297 }, { latitude: 39.4517, longitude: 140.4753 });
    expect(km).toBeGreaterThan(40);
    expect(km).toBeLessThan(45);
    expect(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(111.2, 1);
  });

  it('keeps the sightings inside the radius, nearest first', () => {
    const sightings = normalizeAkita(AKITA);
    const near = sightingsNear({ latitude: 39.72, longitude: 140.1, radiusKm: 5 }, sightings);
    expect(near.map((item) => item.sighting.id)).toEqual(['27880']);
    expect(
      sightingsNear({ latitude: 40.2, longitude: 140.8, radiusKm: 20 }, sightings).map((item) => item.sighting.id),
    ).toEqual([
      // About 9 km and 10 km away.
      '5733',
      '27879',
    ]);
  });
});

describe('newRecentSightings', () => {
  const sighting = (id: string, observedAt: string | null): BearSighting => ({
    id,
    source: 'akita',
    kind: '目撃',
    municipality: '秋田市',
    observedAt: observedAt === null ? null : Date.parse(observedAt),
    latitude: 39.7,
    longitude: 140.1,
  });
  const now = Date.parse('2026-09-24T12:00:00+09:00');

  it('announces rows not seen in the last run, even when dated weeks back', () => {
    const rows = [
      sighting('1', '2026-09-20T10:00:00+09:00'),
      sighting('2', '2026-09-01T10:00:00+09:00'),
      sighting('3', '2026-08-01T10:00:00+09:00'),
      sighting('4', null),
      sighting('5', '2026-09-25T10:00:00+09:00'),
    ];
    const { fresh, recentIds } = newRecentSightings(rows, new Set(['1']), now);
    expect(fresh.map((item) => item.id)).toEqual(['2']);
    expect(recentIds).toEqual(['1', '2']);
  });
});
