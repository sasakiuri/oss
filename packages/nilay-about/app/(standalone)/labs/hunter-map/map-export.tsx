'use client';

import { useState } from 'react';
import { LuDownload } from 'react-icons/lu';

import { SelectField } from '@/components/labs';
import { Button } from '@/components/ui';
import type { Georeference } from '@/lib/hunter-map';
import { buildAreasKml, buildKmz, download } from '@/lib/hunter-map-export';
import type { SavedMapImage, Zone } from '@/lib/schemas/hunter-map';
import type { Language } from '@/store';

const splits = [1, 2, 3, 4] as const;

interface MapExportProps {
  language: Language;
  image: SavedMapImage;
  fitted: Extract<Georeference, { status: 'ok' }> | null;
  name: string;
  zones: readonly Zone[];
}

const fileName = (name: string) => (name.trim() || 'hunter-map').replace(/[\\/:*?"<>|]/g, '_');

/** Writes the aligned map as a KMZ (split if asked) and the traced areas as KML, for other map apps. */
export function MapExport({ language, image, fitted, name, zones }: MapExportProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [split, setSplit] = useState<(typeof splits)[number]>(1);
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');
  const [pieces, setPieces] = useState<{ name: string; bytes: number }[] | null>(null);
  const megabytes = (bytes: number) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(bytes / 1e6);

  if (!fitted)
    return (
      <p className="text-sm text-on-surface-variant">
        {t('位置合わせができると書き出せます。', 'Available once the map is aligned.')}
      </p>
    );

  const exportKmz = async () => {
    setState('working');
    try {
      const result = await buildKmz(image, fitted, name.trim() || image.name, split, zones);
      download(result.bytes, `${fileName(name)}.kmz`, 'application/vnd.google-earth.kmz');
      setPieces(result.pieces);
      setState('idle');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        {t(
          'アプリが大きな画像を読めないときは分割してください。',
          'Split it if the app cannot load one large picture.',
        )}
      </p>
      {fitted.mirrored && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            '裏返しに合わされた図は書き出せません。基準点を確認してください。',
            'A mirrored fit cannot be exported. Check the points.',
          )}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t('分割', 'Split')}
          value={String(split)}
          onChange={(value) => setSplit(Number(value) as (typeof splits)[number])}
          options={splits.map((count) => ({
            value: String(count),
            label: count === 1 ? t('分割しない', 'No split') : t(`縦横 ${count} × ${count}`, `${count} × ${count}`),
          }))}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={state === 'working' || fitted.mirrored} onClick={() => void exportKmz()}>
          <LuDownload aria-hidden="true" />
          {state === 'working' ? t('作成中…', 'Creating…') : t('KMZ を書き出す', 'Export KMZ')}
        </Button>
        <Button
          variant="outline"
          disabled={zones.length === 0}
          onClick={() =>
            download(
              buildAreasKml(fitted, name.trim() || image.name, zones),
              `${fileName(name)}-areas.kml`,
              'application/vnd.google-earth.kml+xml',
            )
          }
        >
          <LuDownload aria-hidden="true" />
          {t('区域を KML で書き出す', 'Export areas as KML')}
        </Button>
      </div>
      {state === 'failed' && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            'KMZ を作れませんでした。端末のメモリが足りない場合は、分割を増やしてください。',
            'The KMZ could not be made. If the device ran out of memory, split it into more pieces.',
          )}
        </p>
      )}
      {pieces && (
        <div role="status" className="text-sm">
          <p>
            {t(
              `書き出しました（画像 ${pieces.length} 枚、合計 ${megabytes(pieces.reduce((sum, piece) => sum + piece.bytes, 0))} MB）。`,
              `Exported (${pieces.length} picture${pieces.length === 1 ? '' : 's'}, ${megabytes(pieces.reduce((sum, piece) => sum + piece.bytes, 0))} MB in all).`,
            )}
          </p>
          <ul className="grid gap-x-4 text-xs text-on-surface-variant tabular-nums sm:grid-cols-2">
            {pieces.map((piece) => (
              <li key={piece.name}>
                {piece.name}: {megabytes(piece.bytes)} MB
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
