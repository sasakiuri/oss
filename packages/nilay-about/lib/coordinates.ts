/**
 * One place written the ways Japanese hunters meet it: latitude and longitude in decimal degrees or
 * degrees, minutes and seconds, UTM, MGRS, the nineteen plane rectangular coordinate systems, and
 * the standard grid square (地域メッシュ) codes.
 *
 * Every conversion is on the Japanese geodetic datum (JGD2011, GRS80), which GPS positions on WGS84
 * match for practical use. Coordinates on the old Tokyo datum are not handled.
 */

import type { GeoPoint } from './geodesy';
import { inverseTransverseMercator, transverseMercator } from './transverse-mercator';

export type { GeoPoint };

export const COORDINATES_CHECKED_ON = '2026-09-24';

/* ------------------------------------------------------------------------------------------------
 * Degrees, minutes and seconds
 * --------------------------------------------------------------------------------------------- */

export interface Dms {
  sign: 1 | -1;
  degrees: number;
  minutes: number;
  seconds: number;
}

/** Splits an angle, rounding the seconds to `decimals` and carrying a rounded 60 upward. */
export function toDms(value: number, decimals = 2): Dms {
  const sign = value < 0 ? -1 : 1;
  const scale = 10 ** decimals;
  let totalSeconds = Math.round(Math.abs(value) * 3600 * scale) / scale;
  const degrees = Math.floor(totalSeconds / 3600);
  totalSeconds -= degrees * 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round((totalSeconds - minutes * 60) * scale) / scale;
  return { sign, degrees, minutes, seconds };
}

export function formatDms(value: number, kind: 'latitude' | 'longitude', language: 'ja' | 'en', decimals = 2): string {
  const { sign, degrees, minutes, seconds } = toDms(value, decimals);
  const secondsText = seconds.toFixed(decimals).padStart(decimals > 0 ? 3 + decimals : 2, '0');
  const minutesText = String(minutes).padStart(2, '0');
  if (language === 'ja') {
    const hemisphere = kind === 'latitude' ? (sign > 0 ? '北緯' : '南緯') : sign > 0 ? '東経' : '西経';
    return `${hemisphere} ${degrees}°${minutesText}′${secondsText}″`;
  }
  const hemisphere = kind === 'latitude' ? (sign > 0 ? 'N' : 'S') : sign > 0 ? 'E' : 'W';
  return `${degrees}°${minutesText}′${secondsText}″ ${hemisphere}`;
}

/* ------------------------------------------------------------------------------------------------
 * UTM and MGRS
 * --------------------------------------------------------------------------------------------- */

export interface Utm {
  zone: number;
  hemisphere: 'N' | 'S';
  easting: number;
  northing: number;
}

const UTM_SCALE = 0.9996;
const FALSE_EASTING = 500000;
const FALSE_NORTHING_SOUTH = 10000000;
/** UTM and MGRS cover 80° S to 84° N; the polar caps use UPS, which this tool does not. */
export const UTM_LATITUDE_LIMITS = { south: -80, north: 84 } as const;

/** The UTM zone of a point, with the exceptions around south-west Norway and Svalbard. */
export function utmZone(point: GeoPoint): number {
  const { latitude, longitude } = point;
  const normalised = longitude >= 180 ? longitude - 360 : longitude;
  let zone = Math.floor((normalised + 180) / 6) + 1;
  if (latitude >= 56 && latitude < 64 && normalised >= 3 && normalised < 12) zone = 32;
  if (latitude >= 72 && latitude < 84) {
    if (normalised >= 0 && normalised < 9) zone = 31;
    else if (normalised >= 9 && normalised < 21) zone = 33;
    else if (normalised >= 21 && normalised < 33) zone = 35;
    else if (normalised >= 33 && normalised < 42) zone = 37;
  }
  return Math.min(60, zone);
}

const centralMeridian = (zone: number) => zone * 6 - 183;

export function toUtm(point: GeoPoint, zone = utmZone(point)): Utm | null {
  if (point.latitude < UTM_LATITUDE_LIMITS.south || point.latitude > UTM_LATITUDE_LIMITS.north) return null;
  const { x, y } = transverseMercator(point, { latitude: 0, longitude: centralMeridian(zone) }, UTM_SCALE);
  const hemisphere = point.latitude < 0 ? 'S' : 'N';
  return {
    zone,
    hemisphere,
    easting: y + FALSE_EASTING,
    northing: hemisphere === 'S' ? x + FALSE_NORTHING_SOUTH : x,
  };
}

export function fromUtm(utm: Utm): GeoPoint {
  return inverseTransverseMercator(
    { x: utm.hemisphere === 'S' ? utm.northing - FALSE_NORTHING_SOUTH : utm.northing, y: utm.easting - FALSE_EASTING },
    { latitude: 0, longitude: centralMeridian(utm.zone) },
    UTM_SCALE,
  );
}

/** Latitude bands of 8° from 80° S, skipping I and O; X runs 12° to 84° N. */
const BAND_LETTERS = 'CDEFGHJKLMNPQRSTUVWX';
/** 100 km column letters, eight per zone, in three sets that repeat every third zone. */
const COLUMN_SETS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
/** 100 km row letters, repeating every 2,000 km; even zones start five letters on. */
const ROW_LETTERS = 'ABCDEFGHJKLMNPQRSTUV';

export function latitudeBand(latitude: number): string | null {
  if (latitude < UTM_LATITUDE_LIMITS.south || latitude > UTM_LATITUDE_LIMITS.north) return null;
  return BAND_LETTERS[Math.min(19, Math.floor((latitude + 80) / 8))]!;
}

export interface Mgrs {
  zone: number;
  band: string;
  square: string;
  /** Metres within the 100 km square, east and north. */
  easting: number;
  northing: number;
}

export function toMgrs(point: GeoPoint): Mgrs | null {
  const band = latitudeBand(point.latitude);
  const utm = toUtm(point);
  if (!band || !utm) return null;
  const column = COLUMN_SETS[(utm.zone - 1) % 3]![Math.floor(utm.easting / 100000) - 1];
  const rowOffset = utm.zone % 2 === 0 ? 5 : 0;
  const row = ROW_LETTERS[(Math.floor(utm.northing / 100000) + rowOffset) % 20];
  if (!column || !row) return null;
  return {
    zone: utm.zone,
    band,
    square: column + row,
    easting: utm.easting % 100000,
    northing: utm.northing % 100000,
  };
}

/**
 * MGRS to `digits` per axis (5 is 1 m, 4 is 10 m... 0 is the 100 km square alone), truncated as
 * the standard requires.
 */
export function formatMgrs(mgrs: Mgrs, digits = 5): string {
  const square = `${mgrs.zone}${mgrs.band} ${mgrs.square}`;
  if (digits === 0) return square;
  const divisor = 10 ** (5 - digits);
  const part = (value: number) => String(Math.floor(value / divisor)).padStart(digits, '0');
  return `${square} ${part(mgrs.easting)} ${part(mgrs.northing)}`;
}

/**
 * Reads an MGRS reference such as `54SUE 88095 49750`, with or without spaces, to 1 m down to 100 km
 * precision. Returns the centre of the square it names, as GeoTrans and GeographicLib do, and the
 * square's size in metres.
 */
export function parseMgrs(text: string): { point: GeoPoint; precisionMetres: number } | null {
  const compact = text.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
  const match = /^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z])([A-HJ-NP-V])(\d*)$/.exec(compact);
  if (!match) return null;
  const zone = Number(match[1]);
  const [band, column, row, digitsText] = [match[2]!, match[3]!, match[4]!, match[5]!];
  if (zone < 1 || zone > 60 || digitsText.length % 2 !== 0 || digitsText.length > 10) return null;
  const digits = digitsText.length / 2;
  const precisionMetres = 10 ** (5 - digits);
  const columnIndex = COLUMN_SETS[(zone - 1) % 3]!.indexOf(column);
  if (columnIndex < 0) return null;
  const rowOffset = zone % 2 === 0 ? 5 : 0;
  const rowIndex = (ROW_LETTERS.indexOf(row) - rowOffset + 20) % 20;
  if (ROW_LETTERS.indexOf(row) < 0) return null;
  const within = (value: string) => (digits === 0 ? 0 : Number(value) * precisionMetres);
  const easting = (columnIndex + 1) * 100000 + within(digitsText.slice(0, digits));
  // The row letter repeats every 2,000 km; the band says which repetition is meant.
  const bandIndex = BAND_LETTERS.indexOf(band);
  const bandSouth = -80 + bandIndex * 8;
  const hemisphere = bandSouth < 0 ? 'S' : 'N';
  const bandBottom = toUtm({ latitude: bandSouth, longitude: centralMeridian(zone) }, zone);
  if (!bandBottom) return null;
  let northing = rowIndex * 100000 + within(digitsText.slice(digits));
  // Up to one 100 km row of slack: a square can begin just south of its band's edge.
  while (northing < bandBottom.northing - 100000) northing += 2000000;
  const corner = fromUtm({ zone, hemisphere, easting, northing });
  // A reference whose band letter disagrees with where its square lies is not a real place.
  const northEdge = corner.latitude + precisionMetres / 111000;
  if (latitudeBand(corner.latitude) !== band && latitudeBand(Math.min(northEdge, 84)) !== band) return null;
  const half = precisionMetres / 2;
  return { point: fromUtm({ zone, hemisphere, easting: easting + half, northing: northing + half }), precisionMetres };
}

/* ------------------------------------------------------------------------------------------------
 * Plane rectangular coordinate systems (平面直角座標系)
 * --------------------------------------------------------------------------------------------- */

export interface PlaneSystem {
  /** 1 to 19, written I to XIX. */
  number: number;
  roman: string;
  origin: GeoPoint;
  /** Where the system applies, abridged from the notice. */
  area: { ja: string; en: string };
}

const dm = (degrees: number, minutes = 0) => degrees + minutes / 60;

/** 平成14年国土交通省告示第9号. The scale factor on the X axis is 0.9999 for every system. */
export const PLANE_SYSTEM_SCALE = 0.9999;
export const planeSystems: readonly PlaneSystem[] = [
  {
    number: 1,
    roman: 'I',
    origin: { latitude: 33, longitude: dm(129, 30) },
    area: { ja: '長崎県、鹿児島県の一部', en: 'Nagasaki, part of Kagoshima' },
  },
  {
    number: 2,
    roman: 'II',
    origin: { latitude: 33, longitude: 131 },
    area: {
      ja: '福岡・佐賀・熊本・大分・宮崎県、鹿児島県（I 系以外）',
      en: 'Fukuoka, Saga, Kumamoto, Oita, Miyazaki, Kagoshima (outside I)',
    },
  },
  {
    number: 3,
    roman: 'III',
    origin: { latitude: 36, longitude: dm(132, 10) },
    area: { ja: '山口・島根・広島県', en: 'Yamaguchi, Shimane, Hiroshima' },
  },
  {
    number: 4,
    roman: 'IV',
    origin: { latitude: 33, longitude: dm(133, 30) },
    area: { ja: '香川・愛媛・徳島・高知県', en: 'Kagawa, Ehime, Tokushima, Kochi' },
  },
  {
    number: 5,
    roman: 'V',
    origin: { latitude: 36, longitude: dm(134, 20) },
    area: { ja: '兵庫・鳥取・岡山県', en: 'Hyogo, Tottori, Okayama' },
  },
  {
    number: 6,
    roman: 'VI',
    origin: { latitude: 36, longitude: 136 },
    area: {
      ja: '京都・大阪府、福井・滋賀・三重・奈良・和歌山県',
      en: 'Kyoto, Osaka, Fukui, Shiga, Mie, Nara, Wakayama',
    },
  },
  {
    number: 7,
    roman: 'VII',
    origin: { latitude: 36, longitude: dm(137, 10) },
    area: { ja: '石川・富山・岐阜・愛知県', en: 'Ishikawa, Toyama, Gifu, Aichi' },
  },
  {
    number: 8,
    roman: 'VIII',
    origin: { latitude: 36, longitude: dm(138, 30) },
    area: { ja: '新潟・長野・山梨・静岡県', en: 'Niigata, Nagano, Yamanashi, Shizuoka' },
  },
  {
    number: 9,
    roman: 'IX',
    origin: { latitude: 36, longitude: dm(139, 50) },
    area: {
      ja: '東京都（XIV・XVIII・XIX 系以外）、福島・栃木・茨城・埼玉・千葉・群馬・神奈川県',
      en: 'Tokyo (outside XIV, XVIII, XIX), Fukushima, Tochigi, Ibaraki, Saitama, Chiba, Gunma, Kanagawa',
    },
  },
  {
    number: 10,
    roman: 'X',
    origin: { latitude: 40, longitude: dm(140, 50) },
    area: { ja: '青森・秋田・山形・岩手・宮城県', en: 'Aomori, Akita, Yamagata, Iwate, Miyagi' },
  },
  {
    number: 11,
    roman: 'XI',
    origin: { latitude: 44, longitude: dm(140, 15) },
    area: { ja: '北海道の西部（小樽市・函館市など）', en: 'Western Hokkaido (Otaru, Hakodate and others)' },
  },
  {
    number: 12,
    roman: 'XII',
    origin: { latitude: 44, longitude: dm(142, 15) },
    area: { ja: '北海道（XI・XIII 系以外）', en: 'Hokkaido (outside XI and XIII)' },
  },
  {
    number: 13,
    roman: 'XIII',
    origin: { latitude: 44, longitude: dm(144, 15) },
    area: {
      ja: '北海道の東部（北見市・帯広市・釧路市など）',
      en: 'Eastern Hokkaido (Kitami, Obihiro, Kushiro and others)',
    },
  },
  {
    number: 14,
    roman: 'XIV',
    origin: { latitude: 26, longitude: 142 },
    area: {
      ja: '東京都のうち北緯 28 度以南・東経 140 度 30 分〜143 度',
      en: 'Tokyo, south of 28° N between 140°30′ and 143° E',
    },
  },
  {
    number: 15,
    roman: 'XV',
    origin: { latitude: 26, longitude: dm(127, 30) },
    area: { ja: '沖縄県のうち東経 126 度〜130 度', en: 'Okinawa, 126° to 130° E' },
  },
  {
    number: 16,
    roman: 'XVI',
    origin: { latitude: 26, longitude: 124 },
    area: { ja: '沖縄県のうち東経 126 度以西', en: 'Okinawa, west of 126° E' },
  },
  {
    number: 17,
    roman: 'XVII',
    origin: { latitude: 26, longitude: 131 },
    area: { ja: '沖縄県のうち東経 130 度以東', en: 'Okinawa, east of 130° E' },
  },
  {
    number: 18,
    roman: 'XVIII',
    origin: { latitude: 20, longitude: 136 },
    area: {
      ja: '東京都のうち北緯 28 度以南・東経 140 度 30 分以西',
      en: 'Tokyo, south of 28° N and west of 140°30′ E',
    },
  },
  {
    number: 19,
    roman: 'XIX',
    origin: { latitude: 26, longitude: 154 },
    area: { ja: '東京都のうち北緯 28 度以南・東経 143 度以東', en: 'Tokyo, south of 28° N and east of 143° E' },
  },
];

export function planeSystem(number: number): PlaneSystem | null {
  return planeSystems.find((system) => system.number === number) ?? null;
}

/** X northward and Y eastward in metres, as the survey law writes them. */
export function toPlane(point: GeoPoint, system: PlaneSystem): { x: number; y: number } {
  return transverseMercator(point, system.origin, PLANE_SYSTEM_SCALE);
}

export function fromPlane(plane: { x: number; y: number }, system: PlaneSystem): GeoPoint {
  return inverseTransverseMercator(plane, system.origin, PLANE_SYSTEM_SCALE);
}

/* ------------------------------------------------------------------------------------------------
 * Standard grid squares (標準地域メッシュ, 昭和48年行政管理庁告示第143号)
 * --------------------------------------------------------------------------------------------- */

export type MeshLevel = 'first' | 'second' | 'fivefold' | 'twofold' | 'third' | 'half' | 'quarter' | 'eighth';

export const meshLevels: readonly MeshLevel[] = [
  'first',
  'second',
  'fivefold',
  'twofold',
  'third',
  'half',
  'quarter',
  'eighth',
];

/** The area Japan's standard grid is laid over: 20° to 46° N, 122° to 154° E. */
export const MESH_LIMITS = { south: 20, north: 46, west: 122, east: 154 } as const;

export interface MeshCell {
  level: MeshLevel;
  code: string;
  /** South-west corner. */
  south: number;
  west: number;
  /** Size in degrees. */
  height: number;
  width: number;
}

// Everything is counted in eighth-mesh steps, the finest division, so each level is a whole number of them.
const LAT_UNIT = 1 / (1.5 * 8 * 10 * 8); // the eighth mesh: 40′ / 8 / 10 / 8 = 3.75″
const LON_UNIT = 1 / (8 * 10 * 8); // 1° / 8 / 10 / 8 = 5.625″

/** Rounds a coordinate to its eighth-mesh cell index, tolerating the last binary digits. */
const cellIndex = (value: number, unit: number) => Math.floor(value / unit + 1e-9);

export function meshCode(point: GeoPoint, level: MeshLevel): MeshCell | null {
  const { latitude, longitude } = point;
  if (latitude < MESH_LIMITS.south || latitude >= MESH_LIMITS.north) return null;
  if (longitude < MESH_LIMITS.west || longitude >= MESH_LIMITS.east) return null;
  // Everything in eighth-mesh units so each division is an integer step.
  const row = cellIndex(latitude, LAT_UNIT);
  const column = cellIndex(longitude - 100, LON_UNIT);
  const p = Math.floor(row / 640);
  const u = Math.floor(column / 640);
  const q = Math.floor((row % 640) / 80);
  const v = Math.floor((column % 640) / 80);
  const r = Math.floor((row % 80) / 8);
  const w = Math.floor((column % 80) / 8);
  const s = Math.floor((row % 8) / 4);
  const x = Math.floor((column % 8) / 4);
  const t = Math.floor((row % 4) / 2);
  const y = Math.floor((column % 4) / 2);
  const s8 = row % 2;
  const x8 = column % 2;
  const pad = (value: number) => String(value).padStart(2, '0');
  const first = `${pad(p)}${pad(u)}`;
  const second = `${first}${q}${v}`;
  const third = `${second}${r}${w}`;
  const quadrant = (south: number, east: number) => String(south * 2 + east + 1);
  const cell = (code: string, rowUnits: number, columnUnits: number, size: number): MeshCell => ({
    level,
    code,
    south: Math.floor(row / size) * size * LAT_UNIT,
    west: 100 + Math.floor(column / size) * size * LON_UNIT,
    height: rowUnits * LAT_UNIT,
    width: columnUnits * LON_UNIT,
  });
  switch (level) {
    case 'first':
      return cell(first, 640, 640, 640);
    case 'second':
      return cell(second, 80, 80, 80);
    case 'fivefold': {
      const half = quadrant(Math.floor((row % 80) / 40), Math.floor((column % 80) / 40));
      return cell(`${second}${half}`, 40, 40, 40);
    }
    case 'twofold': {
      // Fifths of the second-level square, numbered 0, 2, 4, 6, 8 from the south and the west, then 5.
      const south = Math.floor((row % 80) / 16) * 2;
      const west = Math.floor((column % 80) / 16) * 2;
      return cell(`${second}${south}${west}5`, 16, 16, 16);
    }
    case 'third':
      return cell(third, 8, 8, 8);
    case 'half':
      return cell(`${third}${quadrant(s, x)}`, 4, 4, 4);
    case 'quarter':
      return cell(`${third}${quadrant(s, x)}${quadrant(t, y)}`, 2, 2, 2);
    case 'eighth':
      return cell(`${third}${quadrant(s, x)}${quadrant(t, y)}${quadrant(s8, x8)}`, 1, 1, 1);
  }
}

/**
 * Reads a grid square code of any level from its digits. The level follows from the length, except
 * that nine digits ending in 5 after two even digits is a twofold square rather than a half square.
 */
export function parseMeshCode(text: string): MeshCell | null {
  const code = text.normalize('NFKC').replace(/[\s-]/g, '');
  if (!/^\d+$/.test(code)) return null;
  const digit = (index: number) => Number(code[index]);
  const p = Number(code.slice(0, 2));
  const u = Number(code.slice(2, 4));
  if (code.length < 4) return null;
  let row = p * 640;
  let column = u * 640;
  const finish = (level: MeshLevel, size: number): MeshCell | null => {
    const cell: MeshCell = {
      level,
      code,
      south: row * LAT_UNIT,
      west: 100 + column * LON_UNIT,
      height: size * LAT_UNIT,
      width: size * LON_UNIT,
    };
    if (cell.south < MESH_LIMITS.south || cell.south >= MESH_LIMITS.north) return null;
    if (cell.west < MESH_LIMITS.west || cell.west >= MESH_LIMITS.east) return null;
    return cell;
  };
  if (code.length === 4) return finish('first', 640);
  if (code.length < 6 || digit(4) > 7 || digit(5) > 7) return null;
  row += digit(4) * 80;
  column += digit(5) * 80;
  if (code.length === 6) return finish('second', 80);
  const quadrant = (value: number) =>
    value >= 1 && value <= 4 ? { south: value > 2 ? 1 : 0, east: (value - 1) % 2 } : null;
  if (code.length === 7) {
    const half = quadrant(digit(6));
    if (!half) return null;
    row += half.south * 40;
    column += half.east * 40;
    return finish('fivefold', 40);
  }
  if (code.length === 9 && digit(8) === 5 && digit(6) % 2 === 0 && digit(7) % 2 === 0) {
    row += (digit(6) / 2) * 16;
    column += (digit(7) / 2) * 16;
    return finish('twofold', 16);
  }
  if (code.length < 8) return null;
  row += digit(6) * 8;
  column += digit(7) * 8;
  if (code.length === 8) return finish('third', 8);
  const levels: [MeshLevel, number][] = [
    ['half', 4],
    ['quarter', 2],
    ['eighth', 1],
  ];
  if (code.length > 11) return null;
  let size = 8;
  for (let index = 8; index < code.length; index += 1) {
    const part = quadrant(digit(index));
    if (!part) return null;
    size /= 2;
    row += part.south * size;
    column += part.east * size;
  }
  return finish(levels[code.length - 9]![0], size);
}

export function meshCentre(cell: MeshCell): GeoPoint {
  return { latitude: cell.south + cell.height / 2, longitude: cell.west + cell.width / 2 };
}

export function meshCorners(cell: MeshCell): GeoPoint[] {
  return [
    { latitude: cell.south, longitude: cell.west },
    { latitude: cell.south, longitude: cell.west + cell.width },
    { latitude: cell.south + cell.height, longitude: cell.west + cell.width },
    { latitude: cell.south + cell.height, longitude: cell.west },
  ];
}

/* ------------------------------------------------------------------------------------------------
 * Reading what was typed
 * --------------------------------------------------------------------------------------------- */

export type CoordinateFormat = 'latlon' | 'utm' | 'mgrs' | 'plane' | 'mesh';

export interface CoordinateInput {
  format: CoordinateFormat;
  latitude: string;
  longitude: string;
  utmZone: string;
  utmHemisphere: 'N' | 'S';
  utmEasting: string;
  utmNorthing: string;
  mgrs: string;
  planeSystem: number;
  planeX: string;
  planeY: string;
  mesh: string;
}

export type CoordinateProblem =
  | 'latitude'
  | 'longitude'
  | 'utm-zone'
  | 'utm-easting'
  | 'utm-northing'
  | 'mgrs'
  | 'plane-x'
  | 'plane-y'
  | 'plane-system'
  | 'mesh'
  | 'empty';

export type CoordinateReading =
  | { status: 'ok'; point: GeoPoint; cell: MeshCell | null; precisionMetres: number | null }
  | { status: 'invalid'; problems: CoordinateProblem[] };

const readNumber = (text: string): number | null => {
  const normalised = text.normalize('NFKC').trim().replace(/,/g, '').replace(/^−/, '-');
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return null;
  return Number(normalised);
};

/** The point the typed input names, in whichever format it was typed. */
export function readCoordinateInput(
  input: CoordinateInput,
  parseAngle: (text: string, kind: 'latitude' | 'longitude') => number | null,
): CoordinateReading {
  const problems: CoordinateProblem[] = [];
  switch (input.format) {
    case 'latlon': {
      if (input.latitude.trim() === '' && input.longitude.trim() === '')
        return { status: 'invalid', problems: ['empty'] };
      const latitude = parseAngle(input.latitude, 'latitude');
      const longitude = parseAngle(input.longitude, 'longitude');
      if (latitude === null) problems.push('latitude');
      if (longitude === null) problems.push('longitude');
      if (latitude === null || longitude === null) return { status: 'invalid', problems };
      return { status: 'ok', point: { latitude, longitude }, cell: null, precisionMetres: null };
    }
    case 'utm': {
      const zone = readNumber(input.utmZone);
      const easting = readNumber(input.utmEasting);
      const northing = readNumber(input.utmNorthing);
      if (zone === null || !Number.isInteger(zone) || zone < 1 || zone > 60) problems.push('utm-zone');
      // Eastings run from about 166 to 834 km at the equator, and only a little wider elsewhere.
      if (easting === null || easting < 100000 || easting > 900000) problems.push('utm-easting');
      if (northing === null || northing < 0 || northing > 10000000) problems.push('utm-northing');
      if (zone === null || easting === null || northing === null || problems.length > 0)
        return { status: 'invalid', problems };
      const point = fromUtm({ zone, hemisphere: input.utmHemisphere, easting, northing });
      if (point.latitude < UTM_LATITUDE_LIMITS.south || point.latitude > UTM_LATITUDE_LIMITS.north)
        return { status: 'invalid', problems: ['utm-northing'] };
      return { status: 'ok', point, cell: null, precisionMetres: null };
    }
    case 'mgrs': {
      if (input.mgrs.trim() === '') return { status: 'invalid', problems: ['empty'] };
      const parsed = parseMgrs(input.mgrs);
      if (!parsed) return { status: 'invalid', problems: ['mgrs'] };
      return { status: 'ok', point: parsed.point, cell: null, precisionMetres: parsed.precisionMetres };
    }
    case 'plane': {
      const system = planeSystem(input.planeSystem);
      const x = readNumber(input.planeX);
      const y = readNumber(input.planeY);
      if (!system) problems.push('plane-system');
      // Each system covers a few hundred kilometres; beyond 1,000 km from its origin is a typing slip.
      if (x === null || Math.abs(x) > 1000000) problems.push('plane-x');
      if (y === null || Math.abs(y) > 1000000) problems.push('plane-y');
      if (!system || x === null || y === null || problems.length > 0) return { status: 'invalid', problems };
      return { status: 'ok', point: fromPlane({ x, y }, system), cell: null, precisionMetres: null };
    }
    case 'mesh': {
      if (input.mesh.trim() === '') return { status: 'invalid', problems: ['empty'] };
      const cell = parseMeshCode(input.mesh);
      if (!cell) return { status: 'invalid', problems: ['mesh'] };
      return { status: 'ok', point: meshCentre(cell), cell, precisionMetres: null };
    }
  }
}
