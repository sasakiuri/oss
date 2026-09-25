import type {
  GibierAbnormalityKey,
  GibierDisinfection,
  GibierHitSite,
  GibierMethod,
  GibierRecord,
  GibierSnareSite,
  GibierSpecies,
  GibierYesNo,
} from '@/lib/schemas/gibier-record';
import { GIBIER_ABNORMALITY_KEYS, isGibierLatitude, isGibierLongitude } from '@/lib/schemas/gibier-record';

/** The day the guideline and the handbook below were read. */
export const GIBIER_SOURCES_CHECKED_ON = '2026-09-23';

export const GIBIER_SOURCES = {
  guideline: {
    name: '野生鳥獣肉の衛生管理に関する指針（ガイドライン）',
    note: '厚生労働省、最終改正 令和 5 年 6 月 26 日（生食発 0626 第 2 号）',
    url: 'https://www.mhlw.go.jp/content/001455712.pdf',
  },
  handbookForms: {
    name: '小規模なジビエ処理施設向け HACCP の考え方を取り入れた衛生管理のための手引書（様式）',
    note: '一般社団法人日本ジビエ振興協会 作成、厚生労働省掲載。様式 2「捕獲・受入個体記録表（日報）」（手引書 p.62）',
    url: 'https://www.mhlw.go.jp/content/001560172.pdf',
  },
  handbookMethods: {
    name: '同手引書（衛生管理方法）',
    note: '「放血」の項（手引書 p.20）',
    url: 'https://www.mhlw.go.jp/content/001560170.pdf',
  },
  page: {
    name: 'ジビエ（野生鳥獣の肉）の衛生管理（厚生労働省）',
    note: '上記の資料の掲載ページ',
    url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/shokuhin/syokuchu/01_00021.html',
  },
} as const;

export interface GibierAbnormalityItem {
  /** The letter of the item in 第 2 の 2（1）. */
  letter: string;
  /** The wording of 様式 2 (手引書 p.62), which is the question the record answers. */
  form: string;
  /** The wording of the guideline, 第 2 の 2（1）イ〜ル. */
  guideline: string;
  /** Where the form says more than the guideline, or where its wording has been corrected here. */
  note?: string;
}

/**
 * The eleven items, asked in the wording of 様式 2 because this is a record along that form. The form
 * words most items a little differently from the guideline and widens ト, so both are kept.
 */
export const GIBIER_ABNORMALITIES: Record<GibierAbnormalityKey, GibierAbnormalityItem> = {
  unsteady: { letter: 'イ', form: '足取りがおぼつかない（捕獲時）', guideline: '足取りがおぼつかないもの' },
  neurological: {
    letter: 'ロ',
    form: '神経症状を呈し、挙動に異常がある（捕獲時）',
    guideline: '神経症状を呈し、挙動に異常があるもの',
  },
  deformity: {
    letter: 'ハ',
    form: '顔面その他に異常な形（奇形・腫瘤等）がある',
    guideline: '顔面その他に異常な形（奇形・腫瘤等）を有するもの',
  },
  parasites: {
    letter: 'ニ',
    form: 'ダニ類など外部寄生虫の寄生が著しい',
    guideline: 'ダニ類等の外部寄生虫の寄生が著しいもの',
  },
  hairLoss: { letter: 'ホ', form: '脱毛が著しい', guideline: '脱毛が著しいもの' },
  emaciation: { letter: 'ヘ', form: '痩せている度合いが著しい', guideline: '痩せている度合いが著しいもの' },
  wound: {
    letter: 'ト',
    form: '大きな外傷や化膿部位、皮膚の炎症やかさぶたが見られる',
    guideline: '大きな外傷が見られるもの',
    note: '様式 2 は、ガイドラインの ト（大きな外傷が見られるもの）に、化膿部位、皮膚の炎症、かさぶたを加えています。',
  },
  abscess: {
    letter: 'チ',
    form: '皮下に膿を含むできもの（膿瘍）が多くの部位で見られる',
    guideline: '皮下に膿を含むできもの（膿瘍）が多くの部位で見られるもの',
  },
  blisters: {
    letter: 'リ',
    form: '口腔、口唇、舌、乳房、ひづめ等に水ぶくれ（水疱）やただれ（びらん、潰瘍）が多く見られる',
    guideline: '口腔、口唇、舌、乳房、ひづめ等に水ぶくれ（水疱）やただれ（びらん、潰瘍）等が多く見られるもの',
    note: '様式 2 の「下」「水泡」は、ガイドラインの表記に合わせて「舌」「水疱」としています。',
  },
  diarrhoea: {
    letter: 'ヌ',
    form: '下痢を呈し尻周辺が著しく汚れている',
    guideline: '下痢を呈し尻周辺が著しく汚れているもの',
  },
  otherVisible: {
    letter: 'ル',
    form: 'その他、外見上明らかな異常がある',
    guideline: 'その他、外見上明らかな異常が見られるもの',
  },
};

/**
 * 様式 2 の注意事項「異常温度の目安：猪 42℃、鹿 40℃」, and the handbook's 放血 section: 「イノシシは
 * 42℃、シカは 40℃以上の場合は解体しない」. Neither source gives a figure for any other species.
 */
export const GIBIER_TEMPERATURE_REFERENCE_C: Partial<Record<GibierSpecies, number>> = { boar: 42, deer: 40 };

export const GIBIER_SPECIES_LABELS: Record<Exclude<GibierSpecies, ''>, string> = {
  boar: 'イノシシ',
  deer: 'シカ',
  other: 'その他',
};

export const GIBIER_METHOD_LABELS: Record<Exclude<GibierMethod, ''>, string> = {
  gun: '銃',
  box: '箱わな（檻）',
  snare: 'くくりわな',
  other: 'その他',
};

export const GIBIER_HIT_SITE_LABELS: Record<GibierHitSite, string> = {
  head: '頭部',
  neck: '頸部',
  chest: '胸部（心臓）',
  abdomen: '腹部',
  behindEar: '耳の後ろ',
  other: 'その他',
};

export const GIBIER_SNARE_SITE_LABELS: Record<GibierSnareSite, string> = {
  rightFore: '右前肢',
  leftFore: '左前肢',
  rightHind: '右後肢',
  leftHind: '左後肢',
  other: 'その他',
};

export const GIBIER_DISINFECTION_LABELS: Record<GibierDisinfection, string> = {
  alcohol: 'アルコール',
  flame: '火炎',
};

/** 有／無 on the form. */
export const presenceLabel = (value: GibierYesNo): string => (value === 'yes' ? '有' : value === 'no' ? '無' : '');
/** はい／いいえ on the form. */
export const answerLabel = (value: GibierYesNo): string => (value === 'yes' ? 'はい' : value === 'no' ? 'いいえ' : '');

/**
 * A non-negative decimal as typed, such as `41.5`. Empty text is `null`; so is anything else that is
 * not plainly a number, because a temperature or a weight read out of `1e2` or `4,1` would be a guess.
 */
export function parseGibierNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** True for text that is neither empty nor a number `parseGibierNumber` accepts. */
export const isInvalidGibierNumber = (text: string) => text.trim() !== '' && parseGibierNumber(text) === null;

/**
 * The value of an `<input type="datetime-local">` as a local time. A date that does not exist, such as
 * 2 月 30 日, is `null` rather than rolled over into March.
 */
export function parseLocalDateTime(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(year, month - 1, day, hour, minute);
  const exact =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute;
  return exact ? date : null;
}

export type GibierElapsed = { kind: 'missing' } | { kind: 'reversed' } | { kind: 'ok'; minutes: number };

/**
 * Whole minutes from the start of bleeding to `end`, which is the delivery time once it is entered
 * and the present moment before that (第 3（6）ヲ「放血後から食肉処理施設に搬入されるまでにかかった時間」).
 * An end before the start is reported rather than shown as a negative time.
 */
export function gibierElapsed(start: string, end: string | Date): GibierElapsed {
  const from = parseLocalDateTime(start);
  const to = typeof end === 'string' ? parseLocalDateTime(end) : end;
  if (!from || !to || Number.isNaN(to.getTime())) return { kind: 'missing' };
  const milliseconds = to.getTime() - from.getTime();
  if (milliseconds < 0) return { kind: 'reversed' };
  return { kind: 'ok', minutes: Math.floor(milliseconds / 60_000) };
}

/** `2 時間 5 分`, or `45 分` under an hour. */
export function formatGibierDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} 時間 ${rest} 分` : `${rest} 分`;
}

export type GibierTemperatureCheck =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  /** A temperature for a species neither source gives a figure for. */
  | { kind: 'noReference'; value: number }
  | { kind: 'atOrAbove'; value: number; reference: number }
  | { kind: 'below'; value: number; reference: number };

/** The measured temperature against the handbook's figure for the species. */
export function checkGibierTemperature(species: GibierSpecies, text: string): GibierTemperatureCheck {
  if (text.trim() === '') return { kind: 'empty' };
  const value = parseGibierNumber(text);
  if (value === null) return { kind: 'invalid' };
  const reference = GIBIER_TEMPERATURE_REFERENCE_C[species];
  if (reference === undefined) return { kind: 'noReference', value };
  return value >= reference ? { kind: 'atOrAbove', value, reference } : { kind: 'below', value, reference };
}

export interface GibierAbnormalityResult {
  /** `found` as soon as one item is はい, whatever is still unanswered. */
  status: 'found' | 'clear' | 'incomplete';
  found: GibierAbnormalityKey[];
  unanswered: GibierAbnormalityKey[];
}

/** 第 2 の 2（1）: one item is enough. `clear` needs every item answered いいえ. */
export function checkGibierAbnormalities(answers: Record<GibierAbnormalityKey, GibierYesNo>): GibierAbnormalityResult {
  const found = GIBIER_ABNORMALITY_KEYS.filter((key) => answers[key] === 'yes');
  const unanswered = GIBIER_ABNORMALITY_KEYS.filter((key) => answers[key] === '');
  const status = found.length > 0 ? 'found' : unanswered.length > 0 ? 'incomplete' : 'clear';
  return { status, found, unanswered };
}

/**
 * 第 2 の 1（1）ロ: a bullet in the abdomen. The site box of 様式 2 covers bullet wounds, the kill and an
 * electric stunner alike, so an abdominal site counts as a bullet when the animal was taken by gun or
 * killed with one after a trap, and is `unclear` while it is not recorded whether a gun was used.
 */
export function checkGibierAbdominalHit(
  record: Pick<GibierRecord, 'method' | 'hitSites' | 'slaughterByGun'>,
): 'bullet' | 'unclear' | 'none' {
  if (!record.hitSites.includes('abdomen')) return 'none';
  if (record.method === 'gun' || record.slaughterByGun === 'yes') return 'bullet';
  return record.slaughterByGun === '' ? 'unclear' : 'none';
}

/** `2026/09/23 06:30`, the way the list and the sheet show a date and time. */
export function formatGibierDateTime(text: string): string {
  const date = parseLocalDateTime(text);
  if (!date) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The species as the form writes it, with the text typed for その他. */
export function gibierSpeciesText(record: Pick<GibierRecord, 'species' | 'speciesOther'>): string {
  if (record.species === '') return '';
  if (record.species === 'other') {
    const other = record.speciesOther.trim();
    return other ? `その他（${other}）` : 'その他';
  }
  return GIBIER_SPECIES_LABELS[record.species];
}

/** A list of ticked sites, with the text typed for その他 in its place. */
export function gibierSitesText<T extends string>(sites: readonly T[], labels: Record<T, string>, other: string) {
  return sites
    .map((site) => (site === 'other' && other.trim() ? `その他（${other.trim()}）` : labels[site]))
    .join('、');
}

/** Newest capture first; a record without a capture time falls back to when it was started. */
export function sortGibierRecords(records: readonly GibierRecord[]): GibierRecord[] {
  const key = (record: GibierRecord) => {
    const captured = parseLocalDateTime(record.capturedAt);
    if (captured) return captured.getTime();
    const created = Date.parse(record.createdAt);
    return Number.isNaN(created) ? 0 : created;
  };
  return [...records].sort((a, b) => key(b) - key(a));
}

/**
 * The record as it stands, without the details of an answer that has since been changed: the start
 * and method of an evisceration answered 無, the note for その他 once その他 is unticked, and so on.
 *
 * The form hides such details and keeps them, so switching back restores what was typed. They must
 * not reach the sheet or the checks, where 「摘出：無」 beside a method of evisceration would be a
 * record that contradicts itself.
 */
export function gibierRecordInForce(record: GibierRecord): GibierRecord {
  const bled = record.bleeding === 'yes';
  const eviscerated = record.evisceration === 'yes';
  const cooled = record.cooling === 'yes';
  return {
    ...record,
    speciesOther: record.species === 'other' ? record.speciesOther : '',
    methodOther: record.method === 'other' ? record.methodOther : '',
    hitSiteOther: record.hitSites.includes('other') ? record.hitSiteOther : '',
    snareSiteOther: record.snareSites.includes('other') ? record.snareSiteOther : '',
    injurySite: record.injury === 'yes' ? record.injurySite : '',
    bleedingStartedAt: bled ? record.bleedingStartedAt : '',
    bleedingPlace: bled ? record.bleedingPlace : '',
    arteryCut: bled ? record.arteryCut : '',
    bloodAppearance: bled ? record.bloodAppearance : '',
    bloodAppearanceNote: bled && record.bloodAppearance === 'abnormal' ? record.bloodAppearanceNote : '',
    eviscerationStartedAt: eviscerated ? record.eviscerationStartedAt : '',
    eviscerationPlace: eviscerated ? record.eviscerationPlace : '',
    eviscerationMethod: eviscerated ? record.eviscerationMethod : '',
    organAbnormality: eviscerated ? record.organAbnormality : '',
    organAbnormalityNote: eviscerated && record.organAbnormality === 'yes' ? record.organAbnormalityNote : '',
    odorAbnormality: eviscerated ? record.odorAbnormality : '',
    odorAbnormalityNote: eviscerated && record.odorAbnormality === 'yes' ? record.odorAbnormalityNote : '',
    coolingStartedAt: cooled ? record.coolingStartedAt : '',
    coolingMethod: cooled ? record.coolingMethod : '',
    pregnant: record.sex === 'female' ? record.pregnant : '',
  };
}

/** Whether switching an answer has left typed details out of the record in force. */
export const hasGibierSetAsideDetails = (record: GibierRecord) =>
  JSON.stringify(gibierRecordInForce(record)) !== JSON.stringify(record);

/** `35.123456, 139.123456`, or empty while no position is recorded. */
export function gibierLocationText(record: Pick<GibierRecord, 'latitude' | 'longitude'>): string {
  return hasPosition(record) ? `${record.latitude}, ${record.longitude}` : '';
}

/** Whether a position is recorded, with the latitude and longitude inside their ranges. */
const hasPosition = (record: Pick<GibierRecord, 'latitude' | 'longitude'>) =>
  isGibierLatitude(record.latitude ?? '') && isGibierLongitude(record.longitude ?? '');

/**
 * The recorded position on the Geospatial Information Authority of Japan's map. Following the link
 * sends the coordinates to that site, which the page says beside it.
 */
export function gibierMapUrl(record: Pick<GibierRecord, 'latitude' | 'longitude'>): string | null {
  if (!hasPosition(record)) return null;
  return `https://maps.gsi.go.jp/#16/${record.latitude}/${record.longitude}/`;
}

/** Degrees rounded to six places (about 0.1 m), the precision the record keeps. */
export const formatCoordinate = (degrees: number) => degrees.toFixed(6);

/**
 * A spreadsheet cell. Text that a spreadsheet would read as a formula gets a leading apostrophe,
 * so a name typed as `=…` stays text when the file is opened.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const methodText = (record: GibierRecord) =>
  record.method === ''
    ? ''
    : record.method === 'other' && record.methodOther.trim()
      ? `その他（${record.methodOther.trim()}）`
      : GIBIER_METHOD_LABELS[record.method];

type CsvColumn = readonly [name: string, cell: (record: GibierRecord) => string];

/** The columns of the CSV, in the order of the printed sheet (様式 2), with what the form adds beside them. */
const CSV_COLUMNS: readonly CsvColumn[] = [
  ['個体番号', (r) => r.individualNumber ?? ''],
  ['捕獲獣種', (r) => gibierSpeciesText(r)],
  ['捕獲者名', (r) => r.hunterName],
  ['狩猟免許番号', (r) => r.licenseNumber],
  ['捕獲者の健康状態（発熱、下痢、嘔吐、風邪症状）', (r) => presenceLabel(r.hunterSymptoms)],
  ['止め刺し者名', (r) => r.slaughtererName],
  ['止め刺し者の健康状態（発熱、下痢、嘔吐、風邪症状）', (r) => presenceLabel(r.slaughtererSymptoms)],
  ['捕獲日時', (r) => formatGibierDateTime(r.capturedAt)],
  ['捕獲場所（市町村）', (r) => r.captureCity],
  ['捕獲場所（地区・地名など）', (r) => r.captureArea],
  ['緯度', (r) => r.latitude ?? ''],
  ['経度', (r) => r.longitude ?? ''],
  ['位置の精度（m）', (r) => r.locationAccuracyM ?? ''],
  ['捕獲時の天候', (r) => r.weather],
  ['捕獲方法', methodText],
  [
    '被弾または止め刺し、電気ショッカー行使部位',
    (r) => gibierSitesText(r.hitSites, GIBIER_HIT_SITE_LABELS, r.hitSiteOther),
  ],
  ['止め刺しに銃を使った', (r) => answerLabel(r.slaughterByGun)],
  ['止め刺しの方法', (r) => r.slaughterMethod],
  ['くくりわなのかかり部位', (r) => gibierSitesText(r.snareSites, GIBIER_SNARE_SITE_LABELS, r.snareSiteOther)],
  ['損傷の有無', (r) => presenceLabel(r.injury)],
  ['損傷部位', (r) => r.injurySite],
  ['放血用ナイフの消毒', (r) => r.knifeDisinfection.map((value) => GIBIER_DISINFECTION_LABELS[value]).join('、')],
  ['放血', (r) => presenceLabel(r.bleeding)],
  ['放血の開始日時', (r) => formatGibierDateTime(r.bleedingStartedAt)],
  ['放血の場所', (r) => r.bleedingPlace],
  ['心臓が動いている状態で頸動脈又は腕頭動脈を切断した', (r) => answerLabel(r.arteryCut)],
  ['放血液の性状', (r) => ({ normal: '異常なし', abnormal: '異常あり', '': '' })[r.bloodAppearance]],
  ['放血液の異常の内容', (r) => r.bloodAppearanceNote],
  ['放血後の体温（触診）', (r) => ({ high: '高温', normal: '異常なし', low: '低温', '': '' })[r.palpation]],
  ['放血後の体温（温度計測定、℃）', (r) => r.bodyTemperature],
  ['体温の計測部位', (r) => r.temperatureSite],
  ['内臓摘出', (r) => presenceLabel(r.evisceration)],
  ['内臓摘出の開始時刻', (r) => r.eviscerationStartedAt],
  ['内臓摘出の場所', (r) => r.eviscerationPlace],
  ['内臓摘出の方法', (r) => r.eviscerationMethod],
  ['内臓の異常', (r) => presenceLabel(r.organAbnormality)],
  ['内臓の異常の内容', (r) => r.organAbnormalityNote],
  ['臭気の異常', (r) => presenceLabel(r.odorAbnormality)],
  ['臭気の異常の内容', (r) => r.odorAbnormalityNote],
  ['運搬時の冷却', (r) => presenceLabel(r.cooling)],
  ['冷却の開始時刻', (r) => r.coolingStartedAt],
  ['冷却の方法', (r) => r.coolingMethod],
  ['施設への搬入日時', (r) => formatGibierDateTime(r.deliveredAt)],
  [
    '放血開始から搬入まで（分）',
    (r) => {
      const elapsed = gibierElapsed(r.bleedingStartedAt, r.deliveredAt);
      return elapsed.kind === 'ok' ? String(elapsed.minutes) : '';
    },
  ],
  ['その他特記事項', (r) => r.notes],
  ['性別', (r) => (r.sex === 'male' ? 'オス' : r.sex === 'female' ? 'メス' : '')],
  ['妊娠の有無', (r) => presenceLabel(r.pregnant)],
  ['推定年齢（歳前後）', (r) => r.estimatedAge],
  ['体重（kg）', (r) => r.weightKg],
  ...GIBIER_ABNORMALITY_KEYS.map((key): CsvColumn => [
    `異常の確認：${GIBIER_ABNORMALITIES[key].form}`,
    (r) => answerLabel(r.abnormalities[key]),
  ]),
];

/**
 * Every record as CSV, one animal per row in the order given, with the details set aside behind a
 * changed answer left out as on the sheet. UTF-8 with a byte order mark and CRLF line ends, which a
 * spreadsheet on Windows needs to read Japanese text as it is.
 */
export function gibierRecordsCsv(
  records: readonly GibierRecord[],
  /**
   * How many photos each record has, by record id: the photos are kept apart from the records. `null`
   * when they could not be read, which leaves the column blank rather than claim none.
   */
  photoCounts: ReadonlyMap<string, number> | null,
): string {
  const rows = [
    [...CSV_COLUMNS.map(([name]) => csvCell(name)), csvCell('写真の枚数')],
    ...records.map((entered) => {
      const record = gibierRecordInForce(entered);
      return [
        ...CSV_COLUMNS.map(([, cell]) => csvCell(cell(record))),
        csvCell(photoCounts === null ? '' : String(photoCounts.get(entered.id) ?? 0)),
      ];
    }),
  ];
  return `﻿${rows.map((row) => row.join(',')).join('\r\n')}\r\n`;
}
