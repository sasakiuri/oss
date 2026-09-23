import { z } from 'zod';

/** The 39 prefectures the ministry's bear tables list, in the order the tables list them. */
export const PREFECTURE_IDS = [
  'hokkaido',
  'aomori',
  'iwate',
  'miyagi',
  'akita',
  'yamagata',
  'fukushima',
  'ibaraki',
  'tochigi',
  'gunma',
  'saitama',
  'chiba',
  'tokyo',
  'kanagawa',
  'niigata',
  'toyama',
  'ishikawa',
  'fukui',
  'yamanashi',
  'nagano',
  'gifu',
  'shizuoka',
  'aichi',
  'mie',
  'shiga',
  'kyoto',
  'osaka',
  'hyogo',
  'nara',
  'wakayama',
  'tottori',
  'shimane',
  'okayama',
  'hiroshima',
  'yamaguchi',
  'tokushima',
  'kagawa',
  'ehime',
  'kochi',
] as const;
export const prefectureIdSchema = z.enum(PREFECTURE_IDS);
export type PrefectureId = z.infer<typeof prefectureIdSchema>;

export const bearAreaSchema = z.union([z.literal('national'), prefectureIdSchema]);
export type BearArea = z.infer<typeof bearAreaSchema>;

export const bearDatasetSchema = z.enum(['injuries', 'sightings', 'captures', 'emergency']);
export type BearDataset = z.infer<typeof bearDatasetSchema>;

export const injuryMetricSchema = z.enum(['cases', 'victims', 'deaths']);
export type InjuryMetric = z.infer<typeof injuryMetricSchema>;

export const captureMetricSchema = z.enum(['total', 'killed', 'released']);
export type CaptureMetric = z.infer<typeof captureMetricSchema>;

/** Fiscal years run April to March and are named by the calendar year they start in. */
export const FIRST_FISCAL_YEAR = 2008;
export const LAST_FISCAL_YEAR = 2026;

export const bearStatsSettingsSchema = z.object({
  dataset: bearDatasetSchema,
  area: bearAreaSchema,
  year: z.number().int().min(FIRST_FISCAL_YEAR).max(LAST_FISCAL_YEAR),
  injuryMetric: injuryMetricSchema,
  captureMetric: captureMetricSchema,
});
export type BearStatsSettings = z.infer<typeof bearStatsSettingsSchema>;
