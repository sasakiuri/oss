'use client';

import { useState } from 'react';
import { LuSave, LuTrash2 } from 'react-icons/lu';

import { Button } from '@/components/ui';
import { useStorageStatus } from '@/lib/browser-storage';
import { coordinatesSchema } from '@/lib/schemas/hunting-hours';
import { useLanguage } from '@/store';

import { useHuntingHoursStore } from './_store';

export function SavedPlaces() {
  const state = useHuntingHoursStore();
  const { locations, deletedLocation, saveLocation, loadLocation, deleteLocation, undoDelete } = state;
  const language = useLanguage();
  const available = useStorageStatus((status) => status.available);
  const valid = coordinatesSchema.safeParse(state).success;
  const [name, setName] = useState('');
  // Both wordings, picked at render, so the message follows a language change.
  const [message, setMessage] = useState<[ja: string, en: string] | null>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  // A write can fail on a full device, so report what storage says.
  const storedMessage = (done: [string, string]): [string, string] =>
    useStorageStatus.getState().available ? done : ['端末に保存できませんでした。', 'Could not save to this device.'];
  const coordinateFormat = new Intl.NumberFormat(language, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-on-surface-variant empty:hidden" role="status">
        {available
          ? ''
          : t(
              'このブラウザーでは地点を保存できません。緯度経度を控えてください。',
              'This browser cannot save places. Write the coordinates down.',
            )}
      </p>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const result = saveLocation(name);
          if (result !== 'saved') {
            setMessage(
              result === 'empty-name'
                ? ['地点名を入力してください。', 'Enter a name for this place.']
                : result === 'invalid-location'
                  ? ['緯度と経度を確認してください。', 'Check the latitude and longitude.']
                  : [
                      '同じ名前の地点があります。別の名前にしてください。',
                      'That name is already used. Choose another.',
                    ],
            );
            return;
          }
          setName('');
          setMessage(storedMessage(['保存しました。', 'Saved.']));
        }}
      >
        <label htmlFor="place-name" className="block text-sm font-medium">
          {t('地点名', 'Place name')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            id="place-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('例：裏山', 'e.g. Back ridge')}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary" disabled={!valid || !name.trim() || !available}>
            <LuSave aria-hidden="true" />
            {t('保存', 'Save')}
          </Button>
        </div>
      </form>
      {locations.length > 0 && (
        <ul className="divide-y divide-outline-variant border-y border-outline-variant">
          {locations.map((location) => (
            <li key={location.id} className="flex items-center gap-2 py-2">
              <Button
                variant="ghost"
                className="min-w-0 flex-1 flex-col items-start justify-center gap-0 whitespace-normal break-words text-left"
                onClick={() => {
                  loadLocation(location.id);
                  setMessage([`「${location.name}」を読み込みました。`, `Loaded “${location.name}”.`]);
                }}
              >
                <span>{location.name}</span>
                <span className="text-xs font-normal text-on-surface-variant tabular-nums">
                  {coordinateFormat.format(location.latitude)}, {coordinateFormat.format(location.longitude)}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t(`「${location.name}」を削除`, `Delete ${location.name}`)}
                onClick={() => {
                  deleteLocation(location.id);
                  setMessage(null);
                }}
              >
                <LuTrash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {/* Mounted empty so the first message is announced. Not atomic, so the undo offer is not
          read again with each message. */}
      <div role="status" aria-atomic="false" className={deletedLocation || message ? 'space-y-2 text-sm' : 'sr-only'}>
        {deletedLocation && (
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {t(`「${deletedLocation.location.name}」を削除しました。`, `Deleted “${deletedLocation.location.name}”.`)}
            </span>
            <Button
              variant="ghost"
              onClick={() => {
                undoDelete();
                setMessage(storedMessage(['元に戻しました。', 'Restored.']));
              }}
            >
              {t('元に戻す', 'Undo')}
            </Button>
          </div>
        )}
        {message && <p>{t(...message)}</p>}
      </div>
    </div>
  );
}
