import {
  GAME_SPECIES,
  HUNTING_LOG_MAX_COUNT,
  HUNTING_LOG_MAX_NOTE,
  HUNTING_LOG_MAX_TEXT,
  LICENSE_TYPES,
  PREFECTURES,
  isoDateSchema,
  outingSchema,
  splitIsoDate,
  type GameSpecies,
  type GunKind,
  type HuntingOuting,
  type LicenseType,
  type Prefecture,
} from './schemas/hunting-log';

/** The wording of the licence column of 様式第十七. */
export const LICENSE_LABELS: Record<LicenseType, string> = {
  net: '網猟',
  trap: 'わな猟',
  firstGun: '第一種銃猟',
  secondGun: '第二種銃猟',
};

export const GUN_KIND_LABELS = { powder: '装薬銃', air: '空気銃' } as const;

/**
 * 法第五十五条第二項: a registration runs from 15 October (15 September in Hokkaido), or from the
 * day it was granted if that is the 16th or later, to 15 April of the next year.
 */
export function registrationStart(prefecture: Prefecture): { month: number; day: number } {
  return prefecture === '北海道' ? { month: 9, day: 15 } : { month: 10, day: 15 };
}
export const REGISTRATION_END = { month: 4, day: 15 } as const;

const pad = (value: number) => String(value).padStart(2, '0');
const isoOf = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

export interface RegistrationPeriod {
  /** The year in which the registration begins. The registration year of the card is this year. */
  season: number;
  start: string;
  end: string;
  /** False when no day of registration was given and `start` is the earliest the law allows. */
  fromRegistrationDate: boolean;
}

/** The earliest and the latest day a registration of this season can be granted and still run. */
export function registrationDateRange(season: number): { min: string; max: string } {
  // A registration can be applied for and granted before the period opens; the period then opens as usual.
  return { min: isoOf(season, 1, 1), max: isoOf(season + 1, REGISTRATION_END.month, REGISTRATION_END.day) };
}

export function isRegistrationDateInRange(date: string, season: number): boolean {
  if (!isoDateSchema.safeParse(date).success) return false;
  const { min, max } = registrationDateRange(season);
  return date >= min && date <= max;
}

/**
 * The period of one registration. Given the day it was granted, a day after the earliest start
 * moves the start to that day (法第五十五条第二項 後段); an earlier day leaves the usual start.
 */
export function registrationPeriod(
  season: number,
  prefecture: Prefecture,
  registeredOn?: string | null,
): RegistrationPeriod {
  const start = registrationStart(prefecture);
  const earliest = isoOf(season, start.month, start.day);
  const granted = registeredOn && isRegistrationDateInRange(registeredOn, season) ? registeredOn : null;
  return {
    season,
    start: granted && granted > earliest ? granted : earliest,
    end: isoOf(season + 1, REGISTRATION_END.month, REGISTRATION_END.day),
    fromRegistrationDate: granted !== null,
  };
}

/**
 * The registration period a date falls in, or null for a date that no registration in that
 * prefecture can cover (16 April to 14 October, or to 14 September in Hokkaido).
 */
export function seasonOf(date: string, prefecture: Prefecture): number | null {
  const parts = splitIsoDate(date);
  if (!parts) return null;
  const [year, month, day] = parts;
  const start = registrationStart(prefecture);
  const monthDay = month * 100 + day;
  if (monthDay >= start.month * 100 + start.day) return year;
  if (monthDay <= REGISTRATION_END.month * 100 + REGISTRATION_END.day) return year - 1;
  return null;
}

/** A prefecture's own statement of the report deadline, the basis of `reportDeadline`'s reading. */
export const REPORT_DEADLINE_GUIDE = {
  name: '愛媛県「狩猟者登録証の返納等について」',
  url: 'https://www.pref.ehime.jp/page/111683.html',
  checkedOn: '2026-09-25',
} as const;

/**
 * 法第六十六条 「その狩猟者登録の有効期間が満了したときは、…その日から起算して三十日を経過する日までに」.
 * The starting point is the expiry of the period, not a day named by date: the period runs to the end of
 * its last day (法第五十五条第二項, 15 April), so it has expired from the next day, which is day 1 of the
 * thirty. A registration that ends on 15 April is reported by 15 May, as 愛媛県 gives the date
 * (`REPORT_DEADLINE_GUIDE`). This differs from 銃刀法 第五条の二 「その交付を受けた日から起算して」, where
 * the day named, the day of issue, is itself day 1 (see `certificateLastDay`). One that ends early
 * (returned or cancelled) ends on another day.
 */
export function reportDeadline(expiry: string): string {
  const parts = splitIsoDate(expiry);
  if (!parts) throw new Error(`Not a YYYY-MM-DD date: ${expiry}`);
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day + 30));
  return isoOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** 2025-10-15 → 2025年10月15日 */
export function formatJapaneseDate(date: string): string {
  const parts = splitIsoDate(date);
  if (!parts) return date;
  const [year, month, day] = parts;
  return `${year}年${month}月${day}日`;
}

/** The place column is written as the mesh number of the prefecture's map (様式第十七 備考 7). */
export function reportPlace(outing: Pick<HuntingOuting, 'mesh' | 'municipality'>): string {
  return outing.mesh.trim() || outing.municipality.trim();
}

export interface ReportRow {
  license: LicenseType;
  place: string;
  species: GameSpecies;
  count: number;
}

export interface ReportGroup {
  prefecture: Prefecture;
  season: number;
}

export const reportGroupKey = (group: ReportGroup) => `${group.season}-${group.prefecture}`;

export interface ReportDraft {
  period: RegistrationPeriod;
  deadline: string;
  /**
   * The left-hand columns. When a first-class gun registrant took game with both a cartridge gun
   * and an air gun, the air-gun takes go to `air`, the right-hand columns (様式第十七 備考 6).
   */
  main: ReportRow[];
  air: ReportRow[];
  split: boolean;
  totals: { species: GameSpecies; count: number }[];
  outings: HuntingOuting[];
  /** Outings of the season dated before the day of registration, left out of the report. */
  beforeRegistration: HuntingOuting[];
  /** Distinct days out, for reference; the form itself has no column for them. */
  days: number;
  /** Outings with game taken but no mesh number, whose place falls back to the municipality or is blank. */
  withoutMesh: number;
  withoutPlace: number;
}

const speciesOrder = new Map<string, number>(GAME_SPECIES.map((species, index) => [species.name, index]));
const licenseOrder = new Map<string, number>(LICENSE_TYPES.map((license, index) => [license, index]));
const placeCollator = new Intl.Collator('ja', { numeric: true });

const compareRows = (a: ReportRow, b: ReportRow) =>
  (licenseOrder.get(a.license) ?? 0) - (licenseOrder.get(b.license) ?? 0) ||
  placeCollator.compare(a.place, b.place) ||
  (speciesOrder.get(a.species) ?? 0) - (speciesOrder.get(b.species) ?? 0);

function sumRows(entries: { license: LicenseType; place: string; species: GameSpecies; count: number }[]) {
  const rows = new Map<string, ReportRow>();
  for (const entry of entries) {
    const key = JSON.stringify([entry.license, entry.place, entry.species]);
    const row = rows.get(key);
    if (row) row.count += entry.count;
    else rows.set(key, { ...entry });
  }
  return [...rows.values()].sort(compareRows);
}

export const compareOutings = (a: HuntingOuting, b: HuntingOuting) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

/** Every prefecture and registration period that holds an outing, the latest first. */
export function reportGroups(outings: readonly HuntingOuting[]): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const outing of outings) {
    const season = seasonOf(outing.date, outing.prefecture);
    if (season === null) continue;
    groups.set(`${season}-${outing.prefecture}`, { prefecture: outing.prefecture, season });
  }
  return [...groups.values()].sort(
    (a, b) => b.season - a.season || PREFECTURES.indexOf(a.prefecture) - PREFECTURES.indexOf(b.prefecture),
  );
}

/** Outings whose date no registration can cover, so they belong to no report. */
export function outingsOutsideRegistration(outings: readonly HuntingOuting[]): HuntingOuting[] {
  return outings.filter((outing) => seasonOf(outing.date, outing.prefecture) === null).sort(compareOutings);
}

export function buildReportDraft(
  outings: readonly HuntingOuting[],
  group: ReportGroup,
  registeredOn?: string | null,
): ReportDraft {
  const period = registrationPeriod(group.season, group.prefecture, registeredOn);
  const ofSeason = outings
    .filter(
      (outing) => outing.prefecture === group.prefecture && seasonOf(outing.date, outing.prefecture) === group.season,
    )
    .sort(compareOutings);
  const inGroup = ofSeason.filter((outing) => outing.date >= period.start);
  const withGame = inGroup.filter((outing) => outing.catches.length > 0);
  const takes = withGame.flatMap((outing) =>
    outing.catches.map((item) => ({
      license: outing.license,
      place: reportPlace(outing),
      species: item.species,
      count: item.count,
      gun: item.gun,
    })),
  );
  const firstGun = takes.filter((take) => take.license === 'firstGun');
  const split = firstGun.some((take) => take.gun === 'powder') && firstGun.some((take) => take.gun === 'air');
  const isAir = (take: (typeof takes)[number]) => split && take.license === 'firstGun' && take.gun === 'air';
  const row = ({ license, place, species, count }: (typeof takes)[number]) => ({ license, place, species, count });
  const totals = new Map<GameSpecies, number>();
  for (const take of takes) totals.set(take.species, (totals.get(take.species) ?? 0) + take.count);
  return {
    period,
    deadline: reportDeadline(period.end),
    main: sumRows(takes.filter((take) => !isAir(take)).map(row)),
    air: sumRows(takes.filter(isAir).map(row)),
    split,
    totals: [...totals.entries()]
      .map(([species, count]) => ({ species, count }))
      .sort((a, b) => (speciesOrder.get(a.species) ?? 0) - (speciesOrder.get(b.species) ?? 0)),
    outings: inGroup,
    beforeRegistration: ofSeason.filter((outing) => outing.date < period.start),
    days: new Set(inGroup.map((outing) => outing.date)).size,
    withoutMesh: withGame.filter((outing) => !outing.mesh.trim()).length,
    withoutPlace: withGame.filter((outing) => !reportPlace(outing)).length,
  };
}

export function createOutingId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The form as typed: every choice can still be empty, and a count can be blank (NaN). */
export interface OutingDraft {
  date: string;
  prefecture: Prefecture | '';
  municipality: string;
  mesh: string;
  license: LicenseType | '';
  /** The gun is asked on each line for a first-class gun licence, and null for every other licence. */
  catches: { species: GameSpecies | ''; count: number; gun: GunKind | null }[];
  note: string;
}

export type OutingDraftField = 'date' | 'prefecture' | 'license' | 'municipality' | 'mesh' | 'note';
export type OutingDraftError = 'required' | 'invalid' | 'tooLong';
export type CatchError = 'species' | 'gun' | 'duplicate' | 'count';

export interface OutingDraftResult {
  outing: HuntingOuting | null;
  errors: Partial<Record<OutingDraftField, OutingDraftError>>;
  /** One entry per catch line, null where the line is fine. */
  catchErrors: (CatchError | null)[];
}

export function emptyOutingDraft(date: string, prefecture: Prefecture | null): OutingDraft {
  return {
    date,
    prefecture: prefecture ?? '',
    municipality: '',
    mesh: '',
    license: '',
    catches: [],
    note: '',
  };
}

export function draftOfOuting(outing: HuntingOuting): OutingDraft {
  return {
    date: outing.date,
    prefecture: outing.prefecture,
    municipality: outing.municipality,
    mesh: outing.mesh,
    license: outing.license,
    catches: outing.catches.map((item) => ({ ...item })),
    note: outing.note,
  };
}

export function parseOutingDraft(draft: OutingDraft, id: string): OutingDraftResult {
  const errors: Partial<Record<OutingDraftField, OutingDraftError>> = {};
  if (!draft.date) errors.date = 'required';
  else if (!isoDateSchema.safeParse(draft.date).success) errors.date = 'invalid';
  if (!draft.prefecture) errors.prefecture = 'required';
  if (!draft.license) errors.license = 'required';
  if (draft.municipality.trim().length > HUNTING_LOG_MAX_TEXT) errors.municipality = 'tooLong';
  if (draft.mesh.trim().length > HUNTING_LOG_MAX_TEXT) errors.mesh = 'tooLong';
  if (draft.note.trim().length > HUNTING_LOG_MAX_NOTE) errors.note = 'tooLong';
  const seen = new Set<string>();
  const catchErrors = draft.catches.map((item): CatchError | null => {
    if (!item.species) return 'species';
    const firstGun = draft.license === 'firstGun';
    if (firstGun && item.gun === null) return 'gun';
    const key = `${item.species}/${firstGun ? item.gun : null}`;
    if (seen.has(key)) return 'duplicate';
    seen.add(key);
    return Number.isInteger(item.count) && item.count >= 1 && item.count <= HUNTING_LOG_MAX_COUNT ? null : 'count';
  });
  if (Object.keys(errors).length > 0 || catchErrors.some(Boolean)) return { outing: null, errors, catchErrors };
  const parsed = outingSchema.safeParse({
    id,
    date: draft.date,
    prefecture: draft.prefecture,
    municipality: draft.municipality.trim(),
    mesh: draft.mesh.trim(),
    license: draft.license,
    catches: draft.catches.map((item) => ({ ...item, gun: draft.license === 'firstGun' ? item.gun : null })),
    note: draft.note.trim(),
  });
  // Every rule of the schema is checked above, so a failure here is a gap between the two.
  if (!parsed.success) throw new Error('The outing passed the form checks but not the schema.');
  return { outing: parsed.data, errors, catchErrors };
}

/** One outing's takes in a line, such as 「キジ 1（装薬銃）、キジバト 2（空気銃）」, or null for none. */
export function describeCatches(outing: Pick<HuntingOuting, 'catches'>): string | null {
  if (outing.catches.length === 0) return null;
  return outing.catches
    .map((item) => `${item.species} ${item.count}${item.gun ? `（${GUN_KIND_LABELS[item.gun]}）` : ''}`)
    .join('、');
}
