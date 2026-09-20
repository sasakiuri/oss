import { format, formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

export type DateFormatStyle = 'full' | 'short' | 'relative';

const formats: Record<Exclude<DateFormatStyle, 'relative'>, string> = {
  full: 'yyyy年M月d日 HH:mm',
  short: 'yyyy年M月d日',
};

/**
 * 日付をフォーマットする
 */
export function formatDate(date: Date | string | number, style: DateFormatStyle = 'short'): string {
  const dateObj = date instanceof Date ? date : new Date(date);

  if (style === 'relative') {
    return formatDistanceToNow(dateObj, { addSuffix: true, locale: ja });
  }

  return format(dateObj, formats[style], { locale: ja });
}

/**
 * 日付が有効かどうかを判定
 */
export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}
