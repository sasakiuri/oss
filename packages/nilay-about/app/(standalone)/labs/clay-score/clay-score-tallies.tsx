'use client';

import type { ReactNode } from 'react';

import {
  firstBarrelRate,
  type BarrelTally,
  type DirectionTally,
  type HouseTally,
  type StationTally,
  type TrapDirection,
} from '@/lib/clay-score';

type Language = 'ja' | 'en';

export const directionName = (direction: TrapDirection, language: Language) =>
  ({
    left: { ja: '左', en: 'Left' },
    centre: { ja: '正面', en: 'Centre' },
    right: { ja: '右', en: 'Right' },
  })[direction][language];

export const percentFormat = (language: Language) => (value: number | null) =>
  value === null ? '—' : new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(value);

interface Row {
  key: string;
  label: ReactNode;
  hits: number;
  recorded: number;
  total?: number;
}

/** Hits over targets in rows, with the rate of each. `total` shows how many a full sheet would hold. */
function RateTable({
  caption,
  heading,
  rows,
  language,
}: {
  caption: string;
  heading: string;
  rows: Row[];
  language: Language;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const percent = percentFormat(language);
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="py-2 text-left font-medium">
            {heading}
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            {t('命中', 'Hits')}
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            {t('命中率', 'Rate')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-outline-variant">
            <th scope="row" className="py-2 text-left font-normal">
              {row.label}
            </th>
            <td className="py-2 text-right tabular-nums">
              {`${row.hits} / ${row.recorded}`}
              {row.total !== undefined && row.recorded < row.total && (
                <span className="text-on-surface-variant">{t(`（全 ${row.total}）`, ` (of ${row.total})`)}</span>
              )}
            </td>
            <td className="py-2 text-right tabular-nums">
              {percent(row.recorded > 0 ? row.hits / row.recorded : null)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface TalliesProps {
  language: Language;
  stations: StationTally[];
  barrels: BarrelTally;
  directions: DirectionTally[];
  houses: HouseTally[];
  /** Names the set counted, such as "this round" or "saved rounds", for the table captions. */
  subject: { ja: string; en: string };
  /** Show how many targets a complete sheet holds beside those recorded, for a round in progress. */
  showTotals: boolean;
}

/**
 * The rates by station, by barrel, by direction and by house. A table only appears once it has
 * something in it: the direction table waits for a recorded direction, the barrel line for a sheet
 * kept with barrels.
 */
export function ClayTallies({ language, stations, barrels, directions, houses, subject, showTotals }: TalliesProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const percent = percentFormat(language);
  const of = subject[language];
  const withDirections = directions.some((row) => row.recorded > 0);
  return (
    <div className="space-y-4">
      {barrels.recorded > 0 && (
        <p className="text-sm">
          {t(
            `初矢命中率 ${percent(firstBarrelRate(barrels))}（初矢 ${barrels.first}・二の矢 ${barrels.second}・失中 ${barrels.misses}）`,
            `First-barrel rate ${percent(firstBarrelRate(barrels))} (first ${barrels.first}, second ${barrels.second}, missed ${barrels.misses})`,
          )}
        </p>
      )}
      <RateTable
        language={language}
        caption={t(`${of}の射台別の命中`, `Hits by station, ${of}`)}
        heading={t('射台', 'Station')}
        rows={stations.map((row) => ({
          key: String(row.station),
          label: row.station,
          hits: row.hits,
          recorded: row.recorded,
          total: showTotals ? row.total : undefined,
        }))}
      />
      {withDirections && (
        <RateTable
          language={language}
          caption={t(`${of}の方向別の命中`, `Hits by direction, ${of}`)}
          heading={t('射出方向', 'Direction')}
          rows={directions.map((row) => ({
            key: row.direction,
            label: directionName(row.direction, language),
            hits: row.hits,
            recorded: row.recorded,
          }))}
        />
      )}
      {withDirections && (
        <p className="text-xs text-on-surface-variant">
          {t(
            `失中した方向：${directions.map((row) => `${directionName(row.direction, language)} ${row.recorded - row.hits}`).join('・')}。方向を記録した標的だけを数えます。`,
            `Missed by direction: ${directions.map((row) => `${directionName(row.direction, language)} ${row.recorded - row.hits}`).join(', ')}. Only targets with a direction recorded are counted.`,
          )}
        </p>
      )}
      {houses.some((row) => row.recorded > 0) && (
        <RateTable
          language={language}
          caption={t(`${of}のハウス別の命中`, `Hits by house, ${of}`)}
          heading={t('ハウス・種類', 'House and kind')}
          rows={houses.map((row) => ({
            key: `${row.house}-${row.kind}`,
            label: t(
              `${row.house === 'high' ? 'ハイ' : 'ロー'}・${row.kind === 'single' ? 'シングル' : 'ダブル'}`,
              `${row.house === 'high' ? 'High' : 'Low'}, ${row.kind}`,
            ),
            hits: row.hits,
            recorded: row.recorded,
            total: showTotals ? row.total : undefined,
          }))}
        />
      )}
    </div>
  );
}
