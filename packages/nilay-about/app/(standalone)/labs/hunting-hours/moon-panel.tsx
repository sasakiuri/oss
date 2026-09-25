'use client';

import { ResultFigure, ResultPanel } from '@/components/labs';
import { Card } from '@/components/ui';
import { getMoonTimes, moonAge, moonIlluminatedFraction, moonIsWaxing, type CalendarDate } from '@/lib/solar';
import type { Language } from '@/store';

export const MOON_CHECKED_ON = '2026-09-24';

interface MoonPanelProps {
  language: Language;
  date: CalendarDate | null;
  location: { latitude: number; longitude: number } | null;
}

/**
 * Moonrise, moonset and the age of the Moon for the day shown. Only for reference: the law sets
 * gun hunting by sunrise and sunset, and night shooting is not allowed whatever the moon.
 */
export function MoonPanel({ language, date, location }: MoonPanelProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const timeFormat = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' });
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  const figures = (() => {
    if (!date || !location) return null;
    // The day in this device's time zone, as the sun times are.
    const midnight = new Date(date.year, date.month - 1, date.day);
    const noon = new Date(date.year, date.month - 1, date.day, 12);
    try {
      const times = getMoonTimes(midnight, location.latitude, location.longitude);
      return {
        times,
        age: moonAge(noon),
        lit: moonIlluminatedFraction(noon),
        waxing: moonIsWaxing(noon),
      };
    } catch (error) {
      if (error instanceof RangeError) return 'out-of-range' as const;
      throw error;
    }
  })();

  // Rounded to the minute the way NAOJ tabulates them.
  const time = (value: Date | null) =>
    value ? timeFormat.format(new Date(Math.round(value.getTime() / 60000) * 60000)) : '—';

  return (
    <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 sm:p-6">
      <h2 id="moon" className="text-xl font-medium">
        {t('月の出入りと月齢', 'Moonrise, moonset and age')}
      </h2>
      {figures === 'out-of-range' ? (
        <p className="text-sm">
          {t('月は 1900〜2100 年の日付だけ計算します。', 'The Moon is calculated for 1900 to 2100 only.')}
        </p>
      ) : figures === null ? (
        <p className="text-sm">{t('日付と地点を入力してください。', 'Enter a date and a place.')}</p>
      ) : (
        <ResultPanel className="grid-cols-2">
          <ResultFigure
            label={t('月の出', 'Moonrise')}
            value={time(figures.times.moonrise)}
            note={figures.times.moonrise ? undefined : t('この日はありません', 'None on this day')}
          />
          <ResultFigure
            label={t('月の入り', 'Moonset')}
            value={time(figures.times.moonset)}
            note={figures.times.moonset ? undefined : t('この日はありません', 'None on this day')}
          />
          <ResultFigure
            label={t('月齢（正午）', 'Age at noon')}
            value={number.format(figures.age)}
            unit={t('日', 'days')}
          />
          <ResultFigure
            label={t('輝いて見える割合（正午）', 'Lit fraction at noon')}
            value={Math.round(figures.lit * 100)}
            unit="%"
            note={figures.waxing ? t('満ちていく月', 'Waxing') : t('欠けていく月', 'Waning')}
          />
        </ResultPanel>
      )}
      <p className="text-xs leading-relaxed text-on-surface-variant">
        {t(
          `月の中心が地平線（大気差 35′8″）に来る時刻で、国立天文台の暦と数分ずれることがあります（出典: 国立天文台 暦計算室「こよみ用語解説」、${MOON_CHECKED_ON} 確認）。`,
          `Times are for the Moon's centre on the horizon (35′8″ of refraction) and can be a few minutes off NAOJ's (source: NAOJ Ephemeris Computation Office glossary, checked ${MOON_CHECKED_ON}).`,
        )}
      </p>
    </Card>
  );
}
