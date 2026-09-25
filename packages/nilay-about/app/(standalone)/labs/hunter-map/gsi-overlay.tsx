'use client';

import { useId, useState } from 'react';

import { GeoMap, type MapPosition, type MapShape } from '@/components/labs';
import type { GeoPoint } from '@/lib/geodesy';
import { imageToGeo, type Georeference } from '@/lib/hunter-map';
import type { SavedMapImage, Zone } from '@/lib/schemas/hunter-map';
import type { Language } from '@/store';

interface GsiOverlayProps {
  language: Language;
  image: SavedMapImage;
  fitted: Extract<Georeference, { status: 'ok' }> | null;
  zones: readonly Zone[];
  position: MapPosition | null;
  /** While set, a tap on the GSI map gives this reference point its latitude and longitude. */
  pickingLabel: string | null;
  onPick: (point: GeoPoint) => void;
  onCancelPick: () => void;
}

/**
 * The aligned picture laid over the GSI map, so the fit can be checked against roads and rivers,
 * with the traced areas and the device position. The GSI map is also where a reference point's
 * latitude and longitude can be picked.
 */
export function GsiOverlay({
  language,
  image,
  fitted,
  zones,
  position,
  pickingLabel,
  onPick,
  onCancelPick,
}: GsiOverlayProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [opacity, setOpacity] = useState(60);
  const opacityId = useId();
  const descriptionId = useId();

  const shapes: MapShape[] = [];
  if (fitted)
    for (const zone of zones) {
      const ring = zone.points.map((point) => imageToGeo(fitted, point));
      if (ring.every((point): point is GeoPoint => point !== null))
        shapes.push({
          kind: 'polygon',
          id: zone.id,
          points: ring,
          colour: '#b3261e',
          fill: 'rgba(179,38,30,0.12)',
          width: 2,
        });
    }

  return (
    <div className="space-y-3">
      {fitted ? (
        <div className="space-y-2">
          <label htmlFor={opacityId} className="block text-sm font-medium">
            {t(`位置図の不透明度 ${opacity}%`, `Map opacity ${opacity}%`)}
          </label>
          <input
            id={opacityId}
            type="range"
            min={0}
            max={100}
            step={5}
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
            className="w-full"
          />
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">
          {t('位置合わせが済むと、位置図をここに重ねます。', 'Once aligned, the map is laid over this one.')}
        </p>
      )}
      {pickingLabel && (
        <p className="rounded-sm bg-surface-container p-3 text-sm font-medium">
          {t(
            `国土地理院の地図で「${pickingLabel}」の地点をタップしてください（キーボードでは中央の十字を Enter）。`,
            `Tap where “${pickingLabel}” is on the GSI map (with a keyboard, Enter takes the crosshair).`,
          )}{' '}
          <button type="button" className="text-primary underline" onClick={onCancelPick}>
            {t('やめる', 'Cancel')}
          </button>
        </p>
      )}
      <GeoMap
        language={language}
        label={t('国土地理院の地図', 'GSI map')}
        describedBy={descriptionId}
        shapes={shapes}
        position={position}
        picking={pickingLabel !== null}
        onPick={onPick}
        imageOverlay={
          fitted
            ? {
                data: image.data,
                type: image.type,
                width: image.width,
                height: image.height,
                toGeo: (point) => imageToGeo(fitted, point),
                opacity: opacity / 100,
              }
            : null
        }
        fitKey={
          fitted
            ? `${image.id}:${fitted.origin.latitude.toFixed(4)},${fitted.origin.longitude.toFixed(4)}`
            : `${image.id}:none`
        }
        initialView={fitted ? { center: fitted.origin, zoom: 12 } : undefined}
      />
      <p id={descriptionId} className="text-xs text-on-surface-variant">
        {t('赤い枠はなぞった区域、青い点は現在地です。', 'Red outlines: traced areas. Blue dot: your position.')}
      </p>
    </div>
  );
}
