import type { OffsetUnit } from '@/lib/schemas/sight-adjustment';
import { fromMillimeters, type AngularSize } from '@/lib/shot-group';

export type Language = 'ja' | 'en';

/**
 * Millimetres read to a tenth, centimetres to a hundredth and inches to a thousandth: each unit is
 * shown to about the same real precision, which is finer than the measurement itself can be.
 */
export const UNIT_DIGITS: Record<OffsetUnit, number> = { mm: 1, cm: 2, inch: 3 };

/**
 * The wording of a measured length, shared by the result panel and the statistics beside it so that
 * the same millimetres never appear in two different roundings or with two different direction words.
 */
export function createFormatters(language: Language, offsetUnit: OffsetUnit) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const format = (value: number, digits: number) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
  const length = (millimetres: number | null | undefined) =>
    millimetres === null || millimetres === undefined || !Number.isFinite(millimetres)
      ? '—'
      : `${format(fromMillimeters(millimetres, offsetUnit), UNIT_DIGITS[offsetUnit])} ${offsetUnit}`;
  const angle = (size: AngularSize | null) =>
    size === null ? '—' : `${format(size.moa, 2)} MOA / ${format(size.mil, 2)} mil`;
  const vertical = (millimetres: number) =>
    `${millimetres >= 0 ? t('上', 'up') : t('下', 'down')} ${length(Math.abs(millimetres))}`;
  const horizontal = (millimetres: number) =>
    `${millimetres >= 0 ? t('右', 'right') : t('左', 'left')} ${length(Math.abs(millimetres))}`;
  return { t, format, length, angle, vertical, horizontal };
}
