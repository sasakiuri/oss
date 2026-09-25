'use client';

import { useState } from 'react';
import { LuCrosshair } from 'react-icons/lu';

import { PhotoAttachments } from '@/components/labs/photo-attachments';
import { Button } from '@/components/ui';
import { formatCoordinate, gibierLocationText, gibierMapUrl } from '@/lib/gibier-record';
import { savedAsShown } from '@/lib/persisted-store';
import { GIBIER_MAX_PHOTOS, type GibierRecord } from '@/lib/schemas/gibier-record';

import { GIBIER_RECORD_STORAGE_KEY, useGibierRecordStore } from './_store';

/**
 * The record's photos, kept by the shared photo storage under the record's id. At most
 * `GIBIER_MAX_PHOTOS`, which is the room the printed sheet has for them.
 */
/**
 * The record being filled in is only written once something in it changes, so a photo added to an
 * untouched record would outlive it: a reload opens a new record and the photo has nothing to show it.
 * Writing the record first, and checking it reached storage, keeps each photo with a saved record.
 */
function saveCurrentRecord(): boolean {
  useGibierRecordStore.setState((state) => ({ records: state.records, currentId: state.currentId }));
  return savedAsShown(useGibierRecordStore);
}

export function GibierPhotoField({ record, onChange }: { record: GibierRecord; onChange: () => void }) {
  return (
    <section aria-labelledby="gibier-photos" className="space-y-3">
      <h3 id="gibier-photos" className="text-base font-medium">
        写真（{GIBIER_MAX_PHOTOS} 枚まで）
      </h3>
      <p className="text-sm text-on-surface-variant">印刷すると記録票の最後に載ります。</p>
      <PhotoAttachments
        language="ja"
        tool="gibier-record"
        ownerId={record.id}
        savedIn={GIBIER_RECORD_STORAGE_KEY}
        ownerLabel="この個体"
        maxPhotos={GIBIER_MAX_PHOTOS}
        onChange={onChange}
        ensureOwnerSaved={saveCurrentRecord}
      />
    </section>
  );
}

type LocationProblem = 'unavailable' | 'denied' | 'failed';

export function GibierLocationField({ record }: { record: GibierRecord }) {
  const setLocation = useGibierRecordStore((state) => state.setLocation);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<LocationProblem | null>(null);
  const mapUrl = gibierMapUrl(record);

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setProblem('unavailable');
      return;
    }
    const recordId = record.id;
    setLocating(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        // The reader may have opened another animal while the device was looking.
        if (useGibierRecordStore.getState().currentId !== recordId) return;
        setLocation({
          latitude: formatCoordinate(position.coords.latitude),
          longitude: formatCoordinate(position.coords.longitude),
          accuracyM: String(Math.round(position.coords.accuracy)),
        });
      },
      (error) => {
        setLocating(false);
        setProblem(error.code === error.PERMISSION_DENIED ? 'denied' : 'failed');
      },
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 },
    );
  };

  const problemText =
    problem === 'unavailable'
      ? 'このブラウザーでは位置情報を使えません。'
      : problem === 'denied'
        ? '位置情報の使用が許可されていません。ブラウザーの設定でこのページに位置情報を許可してください。'
        : problem === 'failed'
          ? '現在地を取得できませんでした。空の見える場所でもう一度お試しください。'
          : '';

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">捕獲位置（端末の位置情報）</p>
      {record.latitude ? (
        <p className="text-sm">
          緯度・経度 {gibierLocationText(record)}
          {record.locationAccuracyM && `（誤差 約 ${record.locationAccuracyM} m）`}
        </p>
      ) : (
        <p className="text-sm text-on-surface-variant">未記録</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={locate} disabled={locating}>
          <LuCrosshair aria-hidden="true" />
          {locating ? '取得しています…' : record.latitude ? '現在地で記録し直す' : '現在地を記録する'}
        </Button>
        {record.latitude && (
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm('記録した位置を消しますか？')) setLocation(null);
            }}
          >
            位置を消す
          </Button>
        )}
      </div>
      {mapUrl && (
        <p className="text-xs text-on-surface-variant">
          <a href={mapUrl} target="_blank" rel="noreferrer" className="underline">
            地理院地図で確認する
          </a>
          （開くと座標が国土地理院のサイトに送られます）
        </p>
      )}
      <p role="status" className={problem ? 'text-sm text-destructive' : 'sr-only'}>
        {problemText}
      </p>
      <p className="text-xs text-on-surface-variant">
        様式 2 には位置の欄がありません。捕獲場所は市町村と地名でも記入します。
      </p>
    </div>
  );
}
