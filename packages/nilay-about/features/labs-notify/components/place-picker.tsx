'use client';

import { useId, useState } from 'react';
import { LuCrosshair, LuPlus } from 'react-icons/lu';

import { Button } from '@/components/ui';
import type { Language } from '@/store';

/**
 * A place as latitude and longitude: typed in, or read once from the device after a click. The
 * position read here stays in the form until the person registers it.
 */
export function PlacePicker({
  language,
  onAdd,
  children,
  disabled,
}: {
  language: Language;
  onAdd: (place: { latitude: number; longitude: number }) => void;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setError(t('この端末では現在地を取得できません。', 'This device cannot read its position.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(5));
        setLongitude(position.coords.longitude.toFixed(5));
        setError('');
      },
      () => setError(t('現在地を取得できませんでした。', 'Could not read the position.')),
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  };

  const add = () => {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (latitude.trim() === '' || longitude.trim() === '' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      setError(t('緯度と経度を 10 進数の度で入力してください。', 'Enter latitude and longitude in decimal degrees.'));
      return;
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setError(
        t('緯度は -90〜90、経度は -180〜180 です。', 'Latitude runs from -90 to 90 and longitude from -180 to 180.'),
      );
      return;
    }
    setError('');
    onAdd({ latitude: lat, longitude: lon });
    setLatitude('');
    setLongitude('');
  };

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{t('地点（10 進数の度）', 'Place (decimal degrees)')}</legend>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor={`${id}-lat`} className="block text-sm">
            {t('緯度', 'Latitude')}
          </label>
          <input
            id={`${id}-lat`}
            inputMode="decimal"
            value={latitude}
            placeholder="39.7186"
            onChange={(e) => setLatitude(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-lon`} className="block text-sm">
            {t('経度', 'Longitude')}
          </label>
          <input
            id={`${id}-lon`}
            inputMode="decimal"
            value={longitude}
            placeholder="140.1024"
            onChange={(e) => setLongitude(e.target.value)}
          />
        </div>
      </div>
      {children}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={locate} disabled={disabled}>
          <LuCrosshair aria-hidden="true" />
          {t('現在地を入れる', 'Use my position')}
        </Button>
        <Button variant="outline" onClick={add} disabled={disabled}>
          <LuPlus aria-hidden="true" />
          {t('地点を追加', 'Add place')}
        </Button>
      </div>
    </fieldset>
  );
}
