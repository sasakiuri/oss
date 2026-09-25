'use client';

import { LuPencilLine, LuTrash2 } from 'react-icons/lu';

import { Button } from '@/components/ui';
import type { ImagePoint } from '@/lib/hunter-map';
import { ZONE_NAME_MAX, maxZoneVertices, maxZones, type Zone } from '@/lib/schemas/hunter-map';
import type { Language } from '@/store';

interface ZoneEditorProps {
  language: Language;
  zones: readonly Zone[];
  /** The corners placed so far while tracing, or null when not tracing. */
  draft: readonly ImagePoint[] | null;
  canDraw: boolean;
  onStart: () => void;
  onUndo: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}

/** Tracing areas such as protected areas on the picture, and naming or deleting them. */
export function ZoneEditor({
  language,
  zones,
  draft,
  canDraw,
  onStart,
  onUndo,
  onFinish,
  onCancel,
  onRename,
  onRemove,
}: ZoneEditorProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        {t(
          '鳥獣保護区・特定猟具使用禁止区域など、入ってはいけない区域の角を位置図の上で順にタップします。',
          'Tap in order, on the map, the corners of an area you must not hunt in, such as a protected area.',
        )}
      </p>
      {draft ? (
        <div className="space-y-2 rounded-sm bg-surface-container p-3">
          <p className="text-sm font-medium">
            {t(
              `区域の角をタップしてください（${draft.length} 点）。3 点以上で完成できます。`,
              `Tap the corners of the area (${draft.length} so far). Three or more can be finished.`,
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={draft.length < 3} onClick={onFinish}>
              {t('区域を完成', 'Finish the area')}
            </Button>
            <Button variant="outline" disabled={draft.length === 0} onClick={onUndo}>
              {t('1 点戻す', 'Undo a corner')}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              {t('やめる', 'Cancel')}
            </Button>
          </div>
          {draft.length >= maxZoneVertices && (
            <p className="text-sm">{t(`角は ${maxZoneVertices} 点までです。`, `Up to ${maxZoneVertices} corners.`)}</p>
          )}
        </div>
      ) : (
        <Button variant="outline" disabled={!canDraw || zones.length >= maxZones} onClick={onStart}>
          <LuPencilLine aria-hidden="true" />
          {t('区域をなぞる', 'Trace an area')}
        </Button>
      )}
      {zones.length > 0 && (
        <ul className="space-y-2">
          {zones.map((zone, index) => (
            <li key={zone.id} className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <label htmlFor={`zone-${zone.id}`} className="block text-sm font-medium">
                  {t(`区域 ${index + 1} の名前`, `Name of area ${index + 1}`)}
                </label>
                <input
                  id={`zone-${zone.id}`}
                  type="text"
                  maxLength={ZONE_NAME_MAX}
                  value={zone.name}
                  onChange={(event) => onRename(zone.id, event.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t(`区域 ${index + 1} を削除`, `Delete area ${index + 1}`)}
                onClick={() => onRemove(zone.id)}
              >
                <LuTrash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
