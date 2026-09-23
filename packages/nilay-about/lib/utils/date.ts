import { format, formatDistanceToNow } from 'date-fns';
import { enGB, ja } from 'date-fns/locale';

export type DateFormatStyle = 'full' | 'short' | 'relative';
export type DateFormatLanguage = 'ja' | 'en';

const formats: Record<DateFormatLanguage, Record<Exclude<DateFormatStyle, 'relative'>, string>> = {
  ja: { full: 'yyyy年M月d日 HH:mm', short: 'yyyy年M月d日' },
  // A date the English page can read at a glance, with the month named so that 3/4 is never
  // ambiguous between the two sides of the Atlantic.
  en: { full: 'd MMMM yyyy HH:mm', short: 'd MMMM yyyy' },
};

const locales = { ja, en: enGB };

/**
 * 日付をフォーマットする
 */
export function formatDate(
  date: Date | string | number,
  style: DateFormatStyle = 'short',
  language: DateFormatLanguage = 'ja',
): string {
  const dateObj = date instanceof Date ? date : new Date(date);
  const locale = locales[language];

  if (style === 'relative') {
    return formatDistanceToNow(dateObj, { addSuffix: true, locale });
  }

  return format(dateObj, formats[language][style], { locale });
}
