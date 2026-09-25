/**
 * The hunting season and bag limits on a given day: the national rules of the Enforcement Regulation,
 * with what each prefecture has published on top of them.
 *
 * The national rules were read on e-Gov on NATIONAL_CHECKED_ON. The prefectural rules are static data
 * (hunting-seasons-data.ts), quoted from each prefecture's own pages on the day recorded for it, and
 * they go out of date every year: a prefecture whose data is for an earlier season is flagged, and one
 * not yet collected links to its own page instead.
 */

import { isIsoDate, isoDate, parseIsoDate } from './calendar-days';
import { registrationYearOf } from './hunting-costs';
import type { Prefecture } from './schemas/hunting-log';

export const NATIONAL_CHECKED_ON = '2026-09-24';
export const WILDLIFE_REGULATION_URL = 'https://laws.e-gov.go.jp/law/414M60001000028';

export interface DateRange {
  from: string;
  to: string;
}

/**
 * 施行規則 第九条: 15 November to 15 February outside Hokkaido, 1 October to 31 January in Hokkaido.
 * Inside a hunting ground (猟区), 15 October to 15 March, and 15 September to the end of February.
 */
export function nationalSeason(prefecture: Prefecture, season: number, huntingGround = false): DateRange {
  if (prefecture === '北海道')
    return huntingGround
      ? { from: isoDate(season, 9, 15), to: lastOfFebruary(season + 1) }
      : { from: isoDate(season, 10, 1), to: isoDate(season + 1, 1, 31) };
  return huntingGround
    ? { from: isoDate(season, 10, 15), to: isoDate(season + 1, 3, 15) }
    : { from: isoDate(season, 11, 15), to: isoDate(season + 1, 2, 15) };
}

function lastOfFebruary(year: number): string {
  return isoDate(year, 2, new Date(Date.UTC(year, 2, 0)).getUTCDate());
}

/** The season a day belongs to: the year the season that day falls in, or the next one, begins. */
export function seasonYearOf(day: string): number {
  return registrationYearOf(day);
}

export function inRange(range: DateRange, day: string): boolean {
  return day >= range.from && day <= range.to;
}

/** 施行規則 第十条第二項: daily limits outside hunting grounds. */
export const NATIONAL_DAILY_LIMITS: readonly { species: string; limit: string }[] = [
  { species: 'エゾライチョウ', limit: '2 羽' },
  { species: 'ヤマドリ・キジ', limit: '合計 2 羽' },
  { species: 'コジュケイ', limit: '5 羽' },
  {
    species:
      'ヨシガモ・ヒドリガモ・マガモ・カルガモ・ハシビロガモ・オナガガモ・コガモ・ホシハジロ・キンクロハジロ・スズガモ・クロガモ',
    limit: '合計 5 羽（網を使用する場合は猟期ごとに合計 200 羽）',
  },
  { species: 'キジバト', limit: '10 羽' },
  { species: 'ヤマシギ・タシギ', limit: '合計 5 羽' },
];

/** 施行規則 第十条第一項: species the Minister bans, where and until when. */
export const NATIONAL_PROHIBITIONS: readonly { species: string; area: string; until: string }[] = [
  {
    species: 'ヤマドリの雌（亜種コシジロヤマドリを除く）・キジの雌（亜種コウライキジを除く）',
    area: '全国（放鳥獣をされた雌の捕獲を目的に含む放鳥獣猟区を除く）',
    until: '2027-09-14',
  },
  { species: 'ヒヨドリ', area: '東京都小笠原村、鹿児島県奄美市及び大島郡並びに沖縄県', until: '2027-09-14' },
  {
    species: 'ツキノワグマ',
    area: '三重県、奈良県、和歌山県、島根県、広島県、山口県、徳島県、香川県、愛媛県、高知県',
    until: '2027-09-14',
  },
  { species: 'シマリス', area: '北海道', until: '2027-09-14' },
];

export type SeasonRuleKind = 'extension' | 'shortening' | 'bagLimit' | 'prohibition' | 'other';

export interface SeasonSource {
  title: string;
  url: string;
}

export interface SeasonRule {
  kind: SeasonRuleKind;
  species: readonly string[];
  /** Null when the documents give no dates that can be pinned to this season. */
  period: DateRange | null;
  periodText: string;
  area: string;
  methods: string | null;
  limit: string | null;
  source: SeasonSource;
  /** Verbatim from the source. */
  quote: string;
}

export interface PrefectureSeasons {
  prefecture: Prefecture;
  /** `unconfirmed`: no document could be read, so only `overviewUrl` is known. */
  status: 'confirmed' | 'unconfirmed';
  /** The season the documents are for, by the year it begins. */
  season: number | null;
  checkedOn: string;
  overviewUrl: string | null;
  rules: readonly SeasonRule[];
  notes: readonly string[];
}

export type DataState =
  /** Collected for the season `today` falls in. */
  | 'current'
  /** Collected for an earlier season: the prefecture may have changed its rules since. */
  | 'stale'
  | 'unconfirmed'
  | 'missing';

export function dataState(data: PrefectureSeasons | undefined, today: string): DataState {
  if (!data) return 'missing';
  if (data.status === 'unconfirmed' || data.season === null) return 'unconfirmed';
  return data.season < seasonYearOf(today) ? 'stale' : 'current';
}

export interface DayRule {
  rule: SeasonRule;
  /** Whether the day is in the rule's period; null when the rule has no dates. */
  applies: boolean | null;
}

export interface DayReport {
  season: number;
  national: DateRange;
  inNationalSeason: boolean;
  rules: DayRule[];
  /** True when the day is outside the national season but inside a prefectural extension. */
  onlyByExtension: boolean;
  prohibitions: typeof NATIONAL_PROHIBITIONS;
  prohibitionsExpired: boolean;
}

/**
 * What the rules say about `day` in `prefecture`. A rule's period is a set of dated days, so a rule
 * collected for an earlier season simply does not reach a day of a later one.
 */
export function dayReport(prefecture: Prefecture, day: string, data: PrefectureSeasons | undefined): DayReport {
  if (!isIsoDate(day)) throw new Error(`Not an ISO date: ${day}`);
  const season = seasonYearOf(day);
  const national = nationalSeason(prefecture, season);
  const rules: DayRule[] = (data?.rules ?? []).map((rule) => ({
    rule,
    applies: rule.period ? inRange(rule.period, day) : null,
  }));
  const inNationalSeason = inRange(national, day);
  return {
    season,
    national,
    inNationalSeason,
    rules,
    onlyByExtension:
      !inNationalSeason && rules.some((entry) => entry.rule.kind === 'extension' && entry.applies === true),
    prohibitions: NATIONAL_PROHIBITIONS,
    prohibitionsExpired: NATIONAL_PROHIBITIONS.some((entry) => day > entry.until),
  };
}

export interface SeasonEvent {
  key: string;
  period: DateRange;
  ja: string;
  en: string;
  url?: string;
}

/**
 * The periods of one season to put in a calendar: the national season, and each dated extension or
 * shortening the prefecture published for that season.
 */
export function seasonEvents(
  prefecture: Prefecture,
  season: number,
  data: PrefectureSeasons | undefined,
): SeasonEvent[] {
  const events: SeasonEvent[] = [
    {
      key: `national-${season}`,
      period: nationalSeason(prefecture, season),
      ja: `狩猟期間（${prefecture}、法定）`,
      en: `Hunting season (${prefecture}, national)`,
      url: WILDLIFE_REGULATION_URL,
    },
  ];
  const national = nationalSeason(prefecture, season);
  (data?.rules ?? []).forEach((rule, index) => {
    if ((rule.kind !== 'extension' && rule.kind !== 'shortening') || !rule.period) return;
    // Only periods that fall on this season; a multi-year plan is not put on the calendar as one event.
    if (rule.period.to < national.from || rule.period.from > isoDate(season + 1, 4, 15)) return;
    const species = rule.species.join('・');
    events.push({
      key: `${rule.kind}-${season}-${index}`,
      period: rule.period,
      ja: `${rule.kind === 'extension' ? '猟期の延長' : '猟期の短縮'}：${species}（${prefecture}）`,
      en: `${rule.kind === 'extension' ? 'Extended season' : 'Shortened season'}: ${species} (${prefecture})`,
      url: rule.source.url,
    });
  });
  return events;
}

export function formatRange(range: DateRange): string {
  const format = (value: string) => {
    const parsed = parseIsoDate(value);
    return parsed ? `${parsed[0]}年${parsed[1]}月${parsed[2]}日` : value;
  };
  return `${format(range.from)}〜${format(range.to)}`;
}
