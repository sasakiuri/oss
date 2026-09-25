'use client';

import { useId } from 'react';

import { GeoMap, type MapShape } from '@/components/labs';
import { compassPoint, inverseGeodesic } from '@/lib/geodesy';
import type { EntryKind, TrailEntry } from '@/lib/schemas/wounded-game';
import { sortEntries } from '@/lib/wounded-game';
import type { Language } from '@/store';

const kindColours: Record<EntryKind, string> = {
  'shot-site': '#1b1b1f',
  blood: '#b3261e',
  sign: '#8430ce',
  lost: '#e8710a',
  recovered: '#146c2e',
  note: '#1a73e8',
};

interface TrailMapProps {
  language: Language;
  entries: readonly TrailEntry[];
  kindLabel: (kind: EntryKind) => string;
}

/**
 * The logged trail on the map: each entry with a position as a numbered point in time order,
 * joined by a line, with the distance and bearing of the last one from the shot site.
 */
export function TrailMap({ language, entries, kindLabel }: TrailMapProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const descriptionId = useId();
  const placed = sortEntries(entries).filter((entry) => entry.position !== null);
  if (placed.length === 0)
    return (
      <p className="text-sm text-on-surface-variant">
        {t('位置付きの記録はまだありません。', 'No entries with a location yet.')}
      </p>
    );

  const points = placed.map((entry) => ({ latitude: entry.position!.latitude, longitude: entry.position!.longitude }));
  const shapes: MapShape[] = [];
  if (points.length > 1) shapes.push({ kind: 'line', id: 'trail', points, colour: '#5f5f66', width: 2, dashed: true });
  placed.forEach((entry, index) => {
    const at = points[index]!;
    if (entry.position?.accuracyMeters)
      shapes.push({
        kind: 'circle',
        id: `accuracy-${entry.id}`,
        center: at,
        radiusMetres: entry.position.accuracyMeters,
        colour: kindColours[entry.kind],
        fill: 'rgba(0,0,0,0.04)',
        width: 1,
      });
    shapes.push({ kind: 'marker', id: entry.id, at, label: String(index + 1), colour: kindColours[entry.kind] });
  });

  const origin = placed.find((entry) => entry.kind === 'shot-site');
  const last = placed.at(-1)!;
  const leg = origin && origin.id !== last.id ? inverseGeodesic(origin.position!, last.position!) : null;
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 0 });

  return (
    <div className="space-y-2">
      <GeoMap
        language={language}
        label={t('追跡の地図', 'Map of the trail')}
        describedBy={descriptionId}
        shapes={shapes}
        fitKey={placed.map((entry) => entry.id).join(',')}
      />
      <ol id={descriptionId} className="grid gap-1 text-xs text-on-surface-variant sm:grid-cols-2">
        {placed.map((entry, index) => (
          <li key={entry.id} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block size-3 shrink-0 rounded-full"
              style={{ background: kindColours[entry.kind] }}
            />
            {`${index + 1}. ${kindLabel(entry.kind)}`}
          </li>
        ))}
      </ol>
      {leg && (
        <p className="text-sm">
          {t(
            `被弾地点から最後の記録まで 直線 ${number.format(leg.distanceMetres)} m・方位 ${number.format(leg.initialBearing)}°（${compassPoint(leg.initialBearing, 'ja')}、真北基準）`,
            `Last entry: ${number.format(leg.distanceMetres)} m from the shot site in a straight line, bearing ${number.format(leg.initialBearing)}° (${compassPoint(leg.initialBearing, 'en')}, true north)`,
          )}
        </p>
      )}
      <p className="text-xs text-on-surface-variant">
        {t(
          '番号は時刻の順、薄い円は位置の誤差（95%）。背景地図：国土地理院',
          'Numbers follow the time order; faint circles show location error (95%). Base map: GSI.',
        )}
      </p>
    </div>
  );
}
