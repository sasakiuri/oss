/**
 * Bear sighting alerts: reading a municipality's open data and matching it against the places
 * people have registered. Pure functions; fetching and storage live in the feature's server code.
 */

import { parseDelimited } from './delimited-text';

export interface BearSource {
  id: 'akita';
  name: { ja: string; en: string };
  /** The catalog page that states the licence. */
  datasetUrl: string;
  /** The file fetched. Its URL has stayed the same across updates of the dataset. */
  dataUrl: string;
  license: { name: string; url: string };
  /** The credit shown with every sighting, as CC BY asks. */
  attribution: string;
  checkedOn: string;
}

export const BEAR_SOURCES: readonly BearSource[] = [
  {
    id: 'akita',
    name: { ja: '秋田県', en: 'Akita Prefecture' },
    datasetUrl: 'https://ckan.pref.akita.lg.jp/dataset/050008_shizenhogoka_003',
    dataUrl:
      'https://ckan.pref.akita.lg.jp/dataset/f801a10f-f076-47e4-b5a6-0bb5569639e0/resource/0678f9b3-4bf7-4212-9c0e-c0cb9b09b3cf/download/050008_kumadas.csv',
    license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/deed.ja' },
    attribution: '出典：秋田県「ツキノワグマ等情報マップシステム『クマダス』データ」（CC BY 4.0）を加工して作成',
    checkedOn: '2026-09-24',
  },
];

export interface BearSighting {
  /** Unique within its source. */
  id: string;
  source: BearSource['id'];
  /** 目撃, 痕跡(食害), 人身被害 and so on, as the source writes it. */
  kind: string;
  municipality: string;
  /** Milliseconds since the epoch, or null when the date could not be read. */
  observedAt: number | null;
  latitude: number;
  longitude: number;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
// Spreadsheet serial dates count days from 1899-12-30.
const SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** `2026/8/31 14:53` or a spreadsheet serial such as `44663.41667`, both in Japan time. */
export function parseAkitaDate(value: string): number | null {
  const text = value.trim();
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(text);
  if (match) {
    const [year, month, day, hour = '0', minute = '0'] = match.slice(1);
    const [y, mo, d, h, mi] = [year, month, day, hour, minute].map(Number) as [number, number, number, number, number];
    if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate() || h > 23 || mi > 59) return null;
    return Date.UTC(y, mo - 1, d, h, mi) - JST_OFFSET_MS;
  }
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    // Rounded to the minute: the serials carry five decimal places.
    return Math.round((SERIAL_EPOCH_MS + Number(text) * 86_400_000) / 60_000) * 60_000 - JST_OFFSET_MS;
  }
  return null;
}

const AKITA_COLUMNS = {
  id: '出没情報ID',
  kind: '情報種別',
  municipality: '市町村',
  observedAt: '目撃日時',
  species: '獣種',
  latitude: 'x(緯度)',
  longitude: 'y(経度)',
} as const;

export class BearDataFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BearDataFormatError';
  }
}

/**
 * The bear rows of Akita's data. The file also holds wild boar and deer, which are left out.
 * A changed header is an error rather than an empty result, so a renamed column cannot quietly
 * stop every alert. The free-text columns (address, circumstances) are not read at all.
 */
export function normalizeAkita(text: string): BearSighting[] {
  const [header, ...rows] = parseDelimited(text, ',');
  if (!header) throw new BearDataFormatError('Empty file');
  const column = Object.fromEntries(
    Object.entries(AKITA_COLUMNS).map(([key, name]) => {
      const index = header.indexOf(name);
      if (index < 0) throw new BearDataFormatError(`Missing column ${name}`);
      return [key, index];
    }),
  ) as Record<keyof typeof AKITA_COLUMNS, number>;

  const sightings: BearSighting[] = [];
  for (const row of rows) {
    if (row.length < header.length) continue;
    if (row[column.species]?.trim() !== 'ツキノワグマ') continue;
    const latitude = Number(row[column.latitude]);
    const longitude = Number(row[column.longitude]);
    const id = row[column.id]?.trim() ?? '';
    // Akita lies between 38.8° and 40.6° N and 139.6° and 141.0° E; anything far outside is a typo.
    if (!/^\d+$/.test(id) || !(latitude > 37 && latitude < 42) || !(longitude > 138 && longitude < 142)) continue;
    sightings.push({
      id,
      source: 'akita',
      kind: (row[column.kind] ?? '').trim().slice(0, 20),
      municipality: (row[column.municipality] ?? '').trim().slice(0, 20),
      observedAt: parseAkitaDate(row[column.observedAt] ?? ''),
      latitude,
      longitude,
    });
  }
  return sightings;
}

const EARTH_RADIUS_KM = 6371.0088;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance on a sphere of the mean Earth radius; well under 0.5 % off at these ranges. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const RADIUS_KM_OPTIONS = [1, 3, 5, 10, 20] as const;
/** Sightings older than this when they first appear in the data are not announced as news. */
export const RECENT_DAYS = 30;

export interface BearWatch {
  latitude: number;
  longitude: number;
  radiusKm: number;
}

/** The sightings within a watch's radius, nearest first. */
export function sightingsNear(watch: BearWatch, sightings: readonly BearSighting[]) {
  return sightings
    .map((sighting) => ({ sighting, distanceKm: distanceKm(watch, sighting) }))
    .filter((item) => item.distanceKm <= watch.radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * The recent sightings not in the previous run. A dataset updated in bulk can add rows dated weeks
 * back, so novelty is judged by id against the last run rather than by date.
 */
export function newRecentSightings(
  sightings: readonly BearSighting[],
  previousRecentIds: ReadonlySet<string>,
  nowMs: number,
): { fresh: BearSighting[]; recentIds: string[] } {
  const since = nowMs - RECENT_DAYS * 86_400_000;
  const recent = sightings.filter(
    (item) => item.observedAt !== null && item.observedAt >= since && item.observedAt <= nowMs,
  );
  return {
    fresh: recent.filter((item) => !previousRecentIds.has(item.id)),
    recentIds: recent.map((item) => item.id),
  };
}
