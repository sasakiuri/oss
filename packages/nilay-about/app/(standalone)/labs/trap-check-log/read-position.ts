import { roundCoordinate } from '@/lib/trap-check-report';

export interface ReadPosition {
  latitude: number;
  longitude: number;
  accuracyM: number;
}

export type PositionError = 'unsupported' | 'denied' | 'unavailable';

/**
 * One reading of the device's position, asked for only when the person presses the button. Nothing
 * is watched or sent; the reading is written into the log on this device.
 */
export function readPosition(): Promise<ReadPosition> {
  return new Promise((resolve, reject: (reason: PositionError) => void) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject('unsupported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: roundCoordinate(position.coords.latitude),
          longitude: roundCoordinate(position.coords.longitude),
          accuracyM: Math.round(position.coords.accuracy),
        }),
      (error) => reject(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 },
    );
  });
}

export function positionErrorText(error: PositionError, language: 'ja' | 'en'): string {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  switch (error) {
    case 'unsupported':
      return t('この端末では位置情報を使えません。', 'This device cannot give its position.');
    case 'denied':
      return t(
        '位置情報の利用が許可されていません。ブラウザーの設定で許可してください。',
        'Location access is not allowed. Allow it in the browser settings.',
      );
    case 'unavailable':
      return t(
        '現在地を取得できませんでした。空の見える場所で、もう一度試してください。',
        'The position could not be read. Try again where the sky is open.',
      );
  }
}
