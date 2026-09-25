'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The device's position, read once or followed, for the field tools that put it on a map.
 *
 * The position stays in the page: nothing here saves or sends it.
 */

export type LocationFault = 'unsupported' | 'denied' | 'timeout' | 'failed';

export interface DevicePosition {
  latitude: number;
  longitude: number;
  /** Metres, the 95% radius the Geolocation API reports. */
  accuracy: number;
}

const faultOf = (error: GeolocationPositionError): LocationFault =>
  error.code === error.PERMISSION_DENIED ? 'denied' : error.code === error.TIMEOUT ? 'timeout' : 'failed';

const read = (result: GeolocationPosition): DevicePosition => ({
  latitude: result.coords.latitude,
  longitude: result.coords.longitude,
  accuracy: result.coords.accuracy,
});

export function locationFaultText(fault: LocationFault, language: 'ja' | 'en'): string {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  switch (fault) {
    case 'unsupported':
      return t('この端末では現在地を取得できません。', 'This device cannot report your location.');
    case 'denied':
      return t(
        '位置情報が許可されていません。ブラウザーの設定で許可してください。',
        'Location access is blocked. Allow it in the browser settings.',
      );
    case 'timeout':
      return t(
        '現在地を取得できませんでした（時間切れ）。空が開けた場所でもう一度試してください。',
        'Getting your location timed out. Try again with a clear view of the sky.',
      );
    default:
      return t('現在地を取得できませんでした。', 'Could not get your location.');
  }
}

/** One reading, on request. `locate` resolves with the position, or null after setting `fault`. */
export function useCurrentPosition() {
  const [locating, setLocating] = useState(false);
  const [fault, setFault] = useState<LocationFault | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const locate = useCallback(
    () =>
      new Promise<DevicePosition | null>((resolve) => {
        setFault(null);
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          setFault('unsupported');
          resolve(null);
          return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
          (result) => {
            if (!mounted.current) return resolve(null);
            setLocating(false);
            resolve(read(result));
          },
          (error) => {
            if (!mounted.current) return resolve(null);
            setLocating(false);
            setFault(faultOf(error));
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
        );
      }),
    [],
  );
  return { locate, locating, fault };
}
