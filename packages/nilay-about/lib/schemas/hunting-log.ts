import { z } from 'zod';

/** 都道府県（全国地方公共団体コードの順）. The report goes to the governor of the prefecture of registration. */
export const PREFECTURES = [
  '北海道',
  '青森県',
  '岩手県',
  '宮城県',
  '秋田県',
  '山形県',
  '福島県',
  '茨城県',
  '栃木県',
  '群馬県',
  '埼玉県',
  '千葉県',
  '東京都',
  '神奈川県',
  '新潟県',
  '富山県',
  '石川県',
  '福井県',
  '山梨県',
  '長野県',
  '岐阜県',
  '静岡県',
  '愛知県',
  '三重県',
  '滋賀県',
  '京都府',
  '大阪府',
  '兵庫県',
  '奈良県',
  '和歌山県',
  '鳥取県',
  '島根県',
  '岡山県',
  '広島県',
  '山口県',
  '徳島県',
  '香川県',
  '愛媛県',
  '高知県',
  '福岡県',
  '佐賀県',
  '長崎県',
  '熊本県',
  '大分県',
  '宮崎県',
  '鹿児島県',
  '沖縄県',
] as const;
export const prefectureSchema = z.enum(PREFECTURES);
export type Prefecture = z.infer<typeof prefectureSchema>;

/**
 * 狩猟鳥獣: 鳥獣保護管理法施行規則 別表第二（第三条関係）, in the order of the table.
 * `name` is what the report is written with; `qualifier` repeats the limit the table puts on the name.
 */
export const GAME_SPECIES = [
  { name: 'エゾライチョウ', group: 'bird' },
  { name: 'ヤマドリ', group: 'bird', qualifier: '亜種コシジロヤマドリを除く' },
  { name: 'キジ', group: 'bird' },
  { name: 'コジュケイ', group: 'bird' },
  { name: 'ヨシガモ', group: 'bird' },
  { name: 'ヒドリガモ', group: 'bird' },
  { name: 'マガモ', group: 'bird' },
  { name: 'カルガモ', group: 'bird' },
  { name: 'ハシビロガモ', group: 'bird' },
  { name: 'オナガガモ', group: 'bird' },
  { name: 'コガモ', group: 'bird' },
  { name: 'ホシハジロ', group: 'bird' },
  { name: 'キンクロハジロ', group: 'bird' },
  { name: 'スズガモ', group: 'bird' },
  { name: 'クロガモ', group: 'bird' },
  { name: 'キジバト', group: 'bird' },
  { name: 'カワウ', group: 'bird' },
  { name: 'ヤマシギ', group: 'bird' },
  { name: 'タシギ', group: 'bird' },
  { name: 'ミヤマガラス', group: 'bird' },
  { name: 'ハシボソガラス', group: 'bird' },
  { name: 'ハシブトガラス', group: 'bird' },
  { name: 'ヒヨドリ', group: 'bird' },
  { name: 'ムクドリ', group: 'bird' },
  { name: 'ニュウナイスズメ', group: 'bird' },
  { name: 'スズメ', group: 'bird' },
  { name: 'タヌキ', group: 'mammal' },
  { name: 'キツネ', group: 'mammal' },
  { name: 'ノイヌ', group: 'mammal' },
  { name: 'ノネコ', group: 'mammal' },
  { name: 'テン', group: 'mammal', qualifier: '亜種ツシマテンを除く' },
  { name: 'イタチ', group: 'mammal', qualifier: 'オスに限る' },
  { name: 'シベリアイタチ', group: 'mammal', qualifier: '長崎県対馬市の個体群以外の個体群' },
  { name: 'ミンク', group: 'mammal' },
  { name: 'アナグマ', group: 'mammal' },
  { name: 'アライグマ', group: 'mammal' },
  { name: 'ヒグマ', group: 'mammal' },
  { name: 'ツキノワグマ', group: 'mammal' },
  { name: 'ハクビシン', group: 'mammal' },
  { name: 'イノシシ', group: 'mammal' },
  { name: 'ニホンジカ', group: 'mammal' },
  { name: 'タイワンリス', group: 'mammal' },
  { name: 'シマリス', group: 'mammal' },
  { name: 'ヌートリア', group: 'mammal' },
  { name: 'ユキウサギ', group: 'mammal' },
  { name: 'ノウサギ', group: 'mammal' },
] as const satisfies readonly { name: string; group: 'bird' | 'mammal'; qualifier?: string }[];

export type GameSpecies = (typeof GAME_SPECIES)[number]['name'];
export const speciesSchema = z.enum(GAME_SPECIES.map((species) => species.name) as [GameSpecies, ...GameSpecies[]]);

/** 狩猟免許の種類（法第三十九条第二項）, in the order of 様式第十七. */
export const LICENSE_TYPES = ['net', 'trap', 'firstGun', 'secondGun'] as const;
export const licenseTypeSchema = z.enum(LICENSE_TYPES);
export type LicenseType = z.infer<typeof licenseTypeSchema>;

/** 様式第十七 備考 6 splits a first-class gun registrant's report between cartridge guns and air guns. */
export const gunKindSchema = z.enum(['powder', 'air']);
export type GunKind = z.infer<typeof gunKindSchema>;

export const HUNTING_LOG_MAX_COUNT = 999;
export const HUNTING_LOG_MAX_TEXT = 60;
export const HUNTING_LOG_MAX_NOTE = 200;
export const HUNTING_LOG_MAX_OUTINGS = 1000;

/** Year, month and day of a YYYY-MM-DD string, or null for anything else. */
export function splitIsoDate(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** A calendar date written as YYYY-MM-DD that exists. */
export const isoDateSchema = z.string().refine((value) => {
  const parts = splitIsoDate(value);
  if (!parts) return false;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
});

export const catchSchema = z.object({
  species: speciesSchema,
  count: z.number().int().min(1).max(HUNTING_LOG_MAX_COUNT),
  /**
   * The gun each take was made with, for a first-class gun licence only (様式第十七 備考 6): on one day
   * a hunter can use both. Every other licence stores null.
   */
  gun: gunKindSchema.nullable(),
});
export type HuntingCatch = z.infer<typeof catchSchema>;

export const outingSchema = z
  .object({
    id: z.string().min(1).max(64),
    date: isoDateSchema,
    prefecture: prefectureSchema,
    municipality: z.string().trim().max(HUNTING_LOG_MAX_TEXT),
    mesh: z.string().trim().max(HUNTING_LOG_MAX_TEXT),
    license: licenseTypeSchema,
    catches: z.array(catchSchema).max(GAME_SPECIES.length * 2),
    note: z.string().trim().max(HUNTING_LOG_MAX_NOTE),
  })
  .refine((outing) => outing.catches.every((item) => (outing.license === 'firstGun') === (item.gun !== null)), {
    path: ['catches'],
  })
  // One line per species and gun: the same pair twice would be two counts for one thing.
  .refine(
    (outing) => new Set(outing.catches.map((item) => `${item.species}/${item.gun}`)).size === outing.catches.length,
    { path: ['catches'] },
  );
export type HuntingOuting = z.infer<typeof outingSchema>;

export const outingsSchema = z.array(outingSchema).max(HUNTING_LOG_MAX_OUTINGS);

/**
 * The day each registration was granted, keyed by `${season}-${prefecture}`. Optional: without it
 * the period is taken to start on the earliest day the law allows.
 */
export const registrationDatesSchema = z.record(z.string().max(40), isoDateSchema);
