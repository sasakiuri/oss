'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LuCrosshair, LuImage, LuLocateFixed, LuMapPin, LuPlus, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SectionNav,
  SegmentedControl,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave } from '@/lib/browser-storage';
import {
  effectiveModel,
  accuracyEllipse,
  fitGeoreference,
  geoToImage,
  isInsideImage,
  parseCoordinate,
  type Georeference,
  type Model,
  type Projection,
  type ReferencePair,
} from '@/lib/hunter-map';
import { readImageSize } from '@/lib/hunter-map-storage';
import { labsTool } from '@/lib/labs-tools';
import { hunterMapImageTypes, maxReferencePoints, type ReferencePoint } from '@/lib/schemas/hunter-map';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { newImageId, storageKey, useHunterMapStore } from './_store';
import { MapView, type MapMarker } from './map-view';
import { prefectureMaps, prefectureMapsCheckedOn } from './prefecture-maps';

type LocationFault = 'unsupported' | 'denied' | 'timeout' | 'failed';
type ImageNotice = 'reading' | 'pdf' | 'unsupported' | 'unreadable' | 'saved-unreadable' | null;

interface DevicePosition {
  latitude: number;
  longitude: number;
  /** Metres, at 95% confidence according to the Geolocation API. */
  accuracy: number;
}

const zoomLevels = [1, 2, 4, 8] as const;
const checkedOn = '2026-09-23';

export function HunterMapClient() {
  const { image, points, model, projection, storageFault } = useHunterMapStore();
  const { setImage, addPoint, updatePoint, removePoint, setModel, setProjection, reset } = useHunterMapStore.getState();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [imageNotice, setImageNotice] = useState<ImageNotice>(null);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<(typeof zoomLevels)[number]>(1);
  const [locatingPointId, setLocatingPointId] = useState<string | null>(null);
  const [pointFault, setPointFault] = useState<{ id: string; fault: LocationFault } | null>(null);
  const [watching, setWatching] = useState(false);
  const [position, setPosition] = useState<DevicePosition | null>(null);
  const [positionFault, setPositionFault] = useState<LocationFault | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const watchId = useRef<number | null>(null);
  const onThisPage = useRef(true);
  const mapDescriptionId = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useHunterMapStore.getState().hydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  // Ignore late positions and stop the watch on unmount.
  useEffect(() => {
    onThisPage.current = true;
    return () => {
      onThisPage.current = false;
      if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
    };
  }, []);

  const faultOf = (error: GeolocationPositionError): LocationFault =>
    error.code === error.PERMISSION_DENIED ? 'denied' : error.code === error.TIMEOUT ? 'timeout' : 'failed';

  const locationFaultText = (fault: LocationFault) =>
    fault === 'unsupported'
      ? t('この端末では現在地を取得できません。', 'This device cannot report your location.')
      : fault === 'denied'
        ? t(
            '位置情報が許可されていません。ブラウザーの設定で許可してください。',
            'Location access is blocked. Allow it in the browser settings.',
          )
        : fault === 'timeout'
          ? t(
              '現在地を取得できませんでした（時間切れ）。空が開けた場所でもう一度試してください。',
              'Getting your location timed out. Try again with a clear view of the sky.',
            )
          : t('現在地を取得できませんでした。', 'Could not get your location.');

  const choosePicture = async (file: File | null) => {
    if (!file) return;
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setImageNotice('pdf');
      return;
    }
    if (!(hunterMapImageTypes as readonly string[]).includes(file.type)) {
      setImageNotice('unsupported');
      return;
    }
    if (points.length > 0) {
      const ok = window.confirm(
        t(
          '図を替えると、置いた基準点はすべて消えます。続けますか？',
          'Changing the map deletes all reference points. Continue?',
        ),
      );
      if (!ok) return;
    }
    setImageNotice('reading');
    const size = await readImageSize(file);
    if (!onThisPage.current) return;
    if (!size) {
      setImageNotice('unreadable');
      return;
    }
    setImageNotice(null);
    setActivePointId(null);
    setZoom(1);
    setImage({ id: newImageId(), blob: file, name: file.name, width: size.width, height: size.height });
  };

  const locateForPoint = (id: string) => {
    setPointFault(null);
    if (!navigator.geolocation) {
      setPointFault({ id, fault: 'unsupported' });
      return;
    }
    setLocatingPointId(id);
    navigator.geolocation.getCurrentPosition(
      (result) => {
        if (!onThisPage.current) return;
        setLocatingPointId(null);
        updatePoint(id, {
          latitude: result.coords.latitude.toFixed(6),
          longitude: result.coords.longitude.toFixed(6),
          accuracy: Math.round(result.coords.accuracy),
        });
        // Wait for the tap that places it on the map.
        const point = useHunterMapStore.getState().points.find((entry) => entry.id === id);
        if (point && point.x === null) setActivePointId(id);
      },
      (error) => {
        if (!onThisPage.current) return;
        setLocatingPointId(null);
        setPointFault({ id, fault: faultOf(error) });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const startWatching = () => {
    setPositionFault(null);
    if (!navigator.geolocation) {
      setPositionFault('unsupported');
      return;
    }
    setWatching(true);
    watchId.current = navigator.geolocation.watchPosition(
      (result) => {
        if (!onThisPage.current) return;
        setPositionFault(null);
        setPosition({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.coords.accuracy,
        });
      },
      (error) => {
        if (!onThisPage.current) return;
        const fault = faultOf(error);
        setPositionFault(fault);
        // Only a refusal stops the watch; a slow fix may still arrive.
        if (fault === 'denied') stopWatching();
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 },
    );
  };

  function stopWatching() {
    if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
    watchId.current = null;
    setWatching(false);
    setPosition(null);
  }

  // Typed pixels place the point, so cancel the pending tap.
  const typePixels = (id: string, changes: { x?: number | null; y?: number | null }) => {
    updatePoint(id, changes);
    const placed = useHunterMapStore.getState().points.find((entry) => entry.id === id);
    if (
      activePointId === id &&
      image &&
      placed?.x != null &&
      placed.y != null &&
      isInsideImage({ x: placed.x, y: placed.y }, image)
    )
      setActivePointId(null);
  };

  const readPoint = (point: ReferencePoint) => ({
    latitude: parseCoordinate(point.latitude, 'latitude'),
    longitude: parseCoordinate(point.longitude, 'longitude'),
  });
  const pairs: { id: string; pair: ReferencePair }[] = points.flatMap((point) => {
    const { latitude, longitude } = readPoint(point);
    return point.x !== null &&
      point.y !== null &&
      image !== null &&
      isInsideImage({ x: point.x, y: point.y }, image) &&
      latitude !== null &&
      longitude !== null
      ? [{ id: point.id, pair: { image: { x: point.x, y: point.y }, geo: { latitude, longitude } } }]
      : [];
  });
  const georeference: Georeference = fitGeoreference(
    pairs.map(({ pair }) => pair),
    model,
    projection,
  );
  const fitted = georeference.status === 'ok' ? georeference : null;
  const residualOf = (id: string) => {
    const index = pairs.findIndex((entry) => entry.id === id);
    return fitted && index >= 0 ? fitted.residuals[index] : null;
  };

  const positionOnMap =
    fitted && position && image
      ? (() => {
          const point = geoToImage(fitted, position);
          const { a, b, d, e } = fitted.transform;
          return {
            point,
            metres: position.accuracy,
            linear: { a, b, d, e },
            ellipse: accuracyEllipse(fitted.transform, position.accuracy),
            inside: isInsideImage(point, image),
          };
        })()
      : null;

  const number = (value: number, digits = 0) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
  const modelName = (value: Model) => (value === 'affine' ? t('アフィン変換', 'Affine') : t('相似変換', 'Similarity'));

  const fitMessage = (() => {
    switch (georeference.status) {
      case 'too-few':
        return t(
          `図上の位置と緯度経度がそろった基準点を 2 点以上置いてください（現在 ${pairs.length} 点）。`,
          `Place at least two reference points with both a map position and coordinates (${pairs.length} so far).`,
        );
      case 'coincident':
        return t(
          '基準点が同じ場所に重なっています。離して置いてください。',
          'The reference points overlap. Place them apart.',
        );
      case 'collinear':
        return t(
          '基準点がほぼ一直線に並んでいます。線から外れた点を加えるか、相似変換を選んでください。',
          'The reference points are almost in a line. Add a point off the line, or choose Similarity.',
        );
      case 'out-of-range':
        return t(
          'Web メルカトルでは緯度 ±90 度（極）を扱えません。基準点の緯度を確認してください。',
          'Web Mercator cannot handle latitude ±90° (the poles). Check the latitudes.',
        );
      default:
        return null;
    }
  })();

  const positionText = (() => {
    if (!watching && !position) return t('現在地は表示していません。', 'Your position is not shown.');
    if (!position) return t('現在地を取得しています…', 'Getting your position…');
    if (!fitted) return t('位置合わせ後に図の上に表示します。', 'Shown on the map once it is aligned.');
    if (!positionOnMap?.inside) return t('現在地はこの図の範囲外です。', 'Your position is outside this map.');
    return t('現在地を図の上に表示しています。', 'Your position is shown on the map.');
  })();

  const summary = image
    ? [
        fitted
          ? t(
              `${modelName(fitted.model)}、基準点 ${pairs.length} 点${fitted.checkable ? `、残差 RMS 約 ${number(fitted.rmsMetres)} m` : ''}。`,
              `${modelName(fitted.model)} fit on ${pairs.length} points${fitted.checkable ? `, RMS residual about ${number(fitted.rmsMetres)} m` : ''}.`,
            )
          : (fitMessage ?? ''),
        watching || position ? positionText : '',
      ]
        .filter(Boolean)
        .join(' ')
    : t('位置図の画像を読み込んでください。', 'Load a map image.');

  useEffect(() => {
    // Debounced so each keystroke is not read out.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [summary]);

  const scrollToPosition = () => {
    const viewport = viewportRef.current;
    if (!viewport || !positionOnMap || !image) return;
    const content = viewport.firstElementChild as HTMLElement | null;
    if (!content) return;
    viewport.scrollTo({
      left: (positionOnMap.point.x / image.width) * content.offsetWidth - viewport.clientWidth / 2,
      top: (positionOnMap.point.y / image.height) * content.offsetHeight - viewport.clientHeight / 2,
      behavior: 'smooth',
    });
  };

  const markers: MapMarker[] = points.flatMap((point, index) =>
    point.x !== null && point.y !== null
      ? [
          {
            id: point.id,
            label: String(index + 1),
            point: { x: point.x, y: point.y },
            predicted: fitted?.checkable ? (residualOf(point.id)?.predicted ?? null) : null,
            active: point.id === activePointId,
          },
        ]
      : [],
  );

  const activeIndex = points.findIndex((point) => point.id === activePointId);
  const imageStatus = (() => {
    switch (imageNotice) {
      case 'reading':
        return t('画像を読み込んでいます…', 'Reading the image…');
      case 'pdf':
        return t(
          'PDF は読み込めません。必要な範囲を PNG か JPEG で保存するか、スクリーンショットを撮って読み込んでください。',
          'PDFs cannot be loaded. Save the part you need as a PNG or JPEG, or take a screenshot, and load that.',
        );
      case 'unsupported':
        return t('PNG または JPEG の画像を選んでください。', 'Choose a PNG or JPEG image.');
      case 'saved-unreadable':
        return t(
          '保存していた図を表示できませんでした。図の画像を選び直してください。',
          'The saved map could not be shown. Choose the map image again.',
        );
      case 'unreadable':
        return t(
          'この画像を読み込めませんでした。別の画像を選んでください。',
          'Could not read this image. Choose another.',
        );
      default:
        return image
          ? t(
              `「${image.name}」（${image.width} × ${image.height} ピクセル）`,
              `“${image.name}” (${image.width} × ${image.height} pixels)`,
            )
          : t('位置図は読み込まれていません。', 'No map is loaded.');
    }
  })();

  const storageText =
    storageFault === 'unavailable'
      ? t(
          'このブラウザーでは図を保存できません。次回は図と基準点を読み込み直してください。',
          'This browser cannot save the map. Next time, load it and place the points again.',
        )
      : storageFault === 'write-failed'
        ? t(
            '最後の変更を保存できませんでした。端末の空き容量を確認してください。',
            'The last change could not be saved. Check the free space on this device.',
          )
        : null;

  // Beside the map once there is one, where the position appears; in the result card before that.
  const watchControls = watching ? (
    <Button variant="outline" onClick={stopWatching}>
      {t('現在地の表示を止める', 'Stop showing my position')}
    </Button>
  ) : (
    <Button onClick={startWatching}>
      <LuLocateFixed aria-hidden="true" />
      {t('現在地を表示', 'Show my position')}
    </Button>
  );
  const watchFault = positionFault && (
    <p role="alert" className="text-sm text-destructive">
      {locationFaultText(positionFault)}
    </p>
  );

  const pointProblem = (point: ReferencePoint) => {
    const { latitude, longitude } = readPoint(point);
    if (point.x === null || point.y === null) return t('図の上の位置がまだありません。', 'Not yet placed on the map.');
    if (image && !isInsideImage({ x: point.x, y: point.y }, image))
      return t('図の上の位置が図の外です。', 'The position is outside the image.');
    if (point.latitude.trim() === '' || point.longitude.trim() === '')
      return t('緯度と経度を入力してください。', 'Enter the latitude and longitude.');
    if (latitude === null) return t('緯度を読み取れません。', 'The latitude cannot be read.');
    if (longitude === null) return t('経度を読み取れません。', 'The longitude cannot be read.');
    return null;
  };

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'map', label: t('1. 位置図', '1. Map') },
            { id: 'points', label: t('2. 基準点', '2. Points') },
            { id: 'position', label: t('3. 現在地', '3. Position') },
            { id: 'method', label: t('位置合わせの方法', 'Alignment method') },
            { id: 'prefecture-maps', label: t('位置図の入手先', 'Where to get maps') },
            { id: 'notes', label: t('測地系', 'Datum') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('hunter-map').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '保存した位置図の画像と基準点をすべて削除します。',
                  en: 'Deletes the saved map image and all reference points.',
                }}
                onReset={() => {
                  stopWatching();
                  setPosition(null);
                  setActivePointId(null);
                  setImageNotice(null);
                  setZoom(1);
                  reset();
                }}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty: a status region inserted with text is not announced. */}
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {announcement}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        {storageText && (
          <p role="status" className="text-sm text-on-surface-variant">
            {storageText}
          </p>
        )}
        <p className="rounded-sm bg-surface-container p-4 text-sm">
          {t(
            '区域の正否は保証しません。鳥獣保護区等は毎年見直されるので、都道府県の最新の位置図を使ってください。表示位置には位置情報・基準点・図の誤差が重なります。境界の近くでは、都道府県・市町村の担当窓口や現地の標識で確認してください。',
            'Boundaries are not guaranteed. Protected areas are revised every year, so use the prefecture’s latest map. The position shown carries location, reference point and map errors: near a boundary, check with the prefecture or municipality and the signs on site.',
          )}
        </p>
        <ToolLayout
          proportions="workspace"
          resultLabel={t('位置合わせと現在地', 'Alignment and position')}
          primary={
            <>
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="map" className="text-xl font-medium">
                  {t('1. 位置図を読み込む', '1. Load the map')}
                </h2>
                {!image && (
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      '都道府県の鳥獣保護区等位置図を PNG か JPEG の画像にして選びます。画像はこのブラウザーにだけ保存します。',
                      'Choose the prefecture’s protected-area map as a PNG or JPEG image. It stays in this browser.',
                    )}{' '}
                    <a href="#prefecture-maps" className="text-primary underline">
                      {t('都道府県別の入手先', 'Where to get it')}
                    </a>
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {/* Drawn as its label so the wording follows the page language. */}
                  <input
                    id="map-file"
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    className="peer sr-only"
                    onChange={(event) => {
                      void choosePicture(event.target.files?.[0] ?? null);
                      event.target.value = '';
                    }}
                  />
                  <label
                    htmlFor="map-file"
                    className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-outline px-6 text-sm font-medium text-primary hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
                  >
                    <LuImage aria-hidden="true" className="size-[18px]" />
                    {image ? t('別の図に替える', 'Choose another map') : t('位置図の画像を選ぶ', 'Choose a map image')}
                  </label>
                </div>
                <p role="status" className="text-sm">
                  {imageStatus}
                </p>
                {image && (
                  <>
                    <div className="flex flex-wrap items-end gap-4">
                      {watchControls}
                      <div className="w-56">
                        <SegmentedControl
                          legend={t('拡大', 'Zoom')}
                          orientation="inline"
                          value={String(zoom)}
                          options={zoomLevels.map((level) => ({ value: String(level), label: `${level}×` }))}
                          onChange={(value) => setZoom(Number(value) as (typeof zoomLevels)[number])}
                        />
                      </div>
                      {positionOnMap?.inside && (
                        <Button variant="outline" onClick={scrollToPosition}>
                          <LuLocateFixed aria-hidden="true" />
                          {t('現在地へ移動', 'Go to my position')}
                        </Button>
                      )}
                    </div>
                    {watchFault}
                    {activeIndex >= 0 && (
                      <p className="rounded-sm bg-surface-container p-3 text-sm font-medium">
                        {t(
                          `図の上で基準点 ${activeIndex + 1} の位置をタップしてください。`,
                          `Tap the map where reference point ${activeIndex + 1} is.`,
                        )}{' '}
                        <button type="button" className="text-primary underline" onClick={() => setActivePointId(null)}>
                          {t('やめる', 'Cancel')}
                        </button>
                      </p>
                    )}
                    <MapView
                      blob={image.blob}
                      size={image}
                      markers={markers}
                      position={positionOnMap?.inside ? positionOnMap : null}
                      placing={activeIndex >= 0}
                      zoom={zoom}
                      viewportRef={viewportRef}
                      onPick={(point) => {
                        if (!activePointId) return;
                        updatePoint(activePointId, { x: Math.round(point.x), y: Math.round(point.y) });
                        setActivePointId(null);
                      }}
                      label={t('位置図', 'Map')}
                      describedBy={mapDescriptionId}
                      onImageError={() => setImageNotice('saved-unreadable')}
                    />
                    <p id={mapDescriptionId} className="text-xs text-on-surface-variant">
                      {t(
                        '紫の番号は基準点、青い点は現在地、薄い青の円は位置情報の誤差（95%、図の縮尺どおり）。破線は、基準点から緯度経度で計算した位置までのずれです。',
                        'Purple numbers: reference points. Blue dot: your position, with its 95% uncertainty to scale in pale blue. Dashed lines: from each point to where its coordinates put it.',
                      )}
                    </p>
                  </>
                )}
              </Card>

              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="points" className="text-xl font-medium">
                  {t('2. 基準点を置く', '2. Place reference points')}
                </h2>
                {(image || points.length > 0) && (
                  <>
                    <p className="text-sm text-on-surface-variant">
                      {t(
                        '緯度経度のわかる地点（図の四隅や交差点）を図の上でタップし、緯度経度を入力します。図全体に離して 3 点以上置くとよく合います。',
                        'Tap a spot whose coordinates you know (a map corner or a junction) and enter them. Three or more points spread across the map fit best.',
                      )}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {t(
                        '10 進数（35.6812）か度分秒（35°40′52″・35 40 52・35度40分52秒）で入力します。',
                        'Decimal degrees (35.6812) or degrees, minutes and seconds (35°40′52″, 35 40 52).',
                      )}
                    </p>
                  </>
                )}
                {points.length === 0 && (
                  <p className="text-sm">
                    {image
                      ? t('基準点はまだありません。', 'No reference points yet.')
                      : t('位置図を読み込むと、図の上で基準点を置けます。', 'Load a map to place points on it.')}
                  </p>
                )}
                <ol className="space-y-4">
                  {points.map((point, index) => {
                    const residual = residualOf(point.id);
                    const problem = pointProblem(point);
                    const latitudeValue = readPoint(point).latitude;
                    // Web Mercator is undefined at ±90°.
                    const poleInWebMercator =
                      projection === 'web-mercator' && latitudeValue !== null && Math.abs(latitudeValue) >= 90;
                    const latitudeInvalid =
                      (point.latitude.trim() !== '' && latitudeValue === null) || poleInWebMercator;
                    const longitudeInvalid = point.longitude.trim() !== '' && readPoint(point).longitude === null;
                    return (
                      <li
                        key={point.id}
                        className="space-y-3 rounded-sm border border-outline-variant p-4"
                        aria-label={t(`基準点 ${index + 1}`, `Reference point ${index + 1}`)}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">
                            {t(`基準点 ${index + 1}`, `Point ${index + 1}`)}
                            <span className="ml-2 text-sm font-normal text-on-surface-variant tabular-nums">
                              {point.x !== null && point.y !== null
                                ? t(`図の (${point.x}, ${point.y})`, `at (${point.x}, ${point.y}) on the map`)
                                : t('図の上で未指定', 'not placed')}
                            </span>
                          </p>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t(`基準点 ${index + 1} を削除`, `Delete point ${index + 1}`)}
                            onClick={() => {
                              if (activePointId === point.id) setActivePointId(null);
                              removePoint(point.id);
                            }}
                          >
                            <LuTrash2 aria-hidden="true" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <CoordinateField
                            label={t('緯度（北緯）', 'Latitude (north)')}
                            value={point.latitude}
                            invalid={latitudeInvalid}
                            errorText={
                              poleInWebMercator
                                ? t(
                                    'Web メルカトルでは緯度 ±90 度を扱えません。',
                                    'Web Mercator cannot handle latitude ±90°.',
                                  )
                                : t('-90 から 90 の角度で入力してください。', 'Enter an angle from -90 to 90.')
                            }
                            onChange={(latitude) => updatePoint(point.id, { latitude, accuracy: null })}
                          />
                          <CoordinateField
                            label={t('経度（東経）', 'Longitude (east)')}
                            value={point.longitude}
                            invalid={longitudeInvalid}
                            errorText={t(
                              '-180 から 180 の角度で入力してください。',
                              'Enter an angle from -180 to 180.',
                            )}
                            onChange={(longitude) => updatePoint(point.id, { longitude, accuracy: null })}
                          />
                        </div>
                        {image && (
                          // Keyboard alternative to tapping.
                          <div className="grid grid-cols-2 gap-4">
                            <PixelField
                              label={t('図上の X（左端からのピクセル）', 'X on the map (pixels from the left)')}
                              value={point.x}
                              max={image.width}
                              errorText={t(
                                `0 から ${image.width} の数で入力してください。`,
                                `Enter a number from 0 to ${image.width}.`,
                              )}
                              onChange={(x) => typePixels(point.id, { x })}
                            />
                            <PixelField
                              label={t('図上の Y（上端からのピクセル）', 'Y on the map (pixels from the top)')}
                              value={point.y}
                              max={image.height}
                              errorText={t(
                                `0 から ${image.height} の数で入力してください。`,
                                `Enter a number from 0 to ${image.height}.`,
                              )}
                              onChange={(y) => typePixels(point.id, { y })}
                            />
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant={activePointId === point.id ? 'default' : 'outline'}
                            disabled={!image}
                            aria-pressed={activePointId === point.id}
                            onClick={() => setActivePointId(activePointId === point.id ? null : point.id)}
                          >
                            <LuCrosshair aria-hidden="true" />
                            {point.x === null
                              ? t('図の上で指定', 'Place on the map')
                              : t('図の上で置き直す', 'Move on the map')}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={locatingPointId !== null}
                            onClick={() => locateForPoint(point.id)}
                          >
                            <LuMapPin aria-hidden="true" />
                            {locatingPointId === point.id
                              ? t('取得中…', 'Locating…')
                              : t('いまいる場所を基準点にする', 'Use my location')}
                          </Button>
                        </div>
                        {pointFault?.id === point.id && (
                          <p role="alert" className="text-sm text-destructive">
                            {locationFaultText(pointFault.fault)}
                          </p>
                        )}
                        {point.accuracy !== null && (
                          <p className="text-xs text-on-surface-variant">
                            {t(
                              `現在地から入力（誤差 ±${number(point.accuracy)} m）。図の上で、いまいる場所をタップしてください。`,
                              `From your location (±${number(point.accuracy)} m). Tap where you are on the map.`,
                            )}
                          </p>
                        )}
                        <p className="text-sm tabular-nums">
                          {problem ??
                            (residual && fitted?.checkable
                              ? t(
                                  `残差 約 ${number(residual.metres)} m（図上 ${number(residual.pixels, 1)} ピクセル）`,
                                  `Residual about ${number(residual.metres)} m (${number(residual.pixels, 1)} px on the map)`,
                                )
                              : t('位置合わせに使っています。', 'Used in the alignment.'))}
                        </p>
                      </li>
                    );
                  })}
                </ol>
                <Button
                  variant="outline"
                  disabled={points.length >= maxReferencePoints}
                  onClick={() => {
                    const id = addPoint();
                    if (id && image) setActivePointId(id);
                  }}
                >
                  <LuPlus aria-hidden="true" />
                  {t('基準点を追加', 'Add a reference point')}
                </Button>
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="position" className="text-xl font-medium">
                {t('3. 現在地を図に重ねる', '3. Show your position on the map')}
              </h2>
              {!image && <div className="flex flex-wrap gap-2">{watchControls}</div>}
              <p className="text-sm font-medium">{positionText}</p>
              {!image && watchFault}
              {position && (
                <ResultPanel className="sm:grid-cols-2">
                  <ResultFigure
                    label={t('緯度・経度', 'Latitude, longitude')}
                    value={`${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`}
                  />
                  <ResultFigure
                    label={t('位置情報の誤差（95%）', 'Position uncertainty (95%)')}
                    value={`±${number(position.accuracy)}`}
                    unit="m"
                    note={
                      positionOnMap?.inside
                        ? positionOnMap.ellipse.major - positionOnMap.ellipse.minor <=
                          positionOnMap.ellipse.major * 0.01
                          ? t(
                              `図上では半径 約 ${number(positionOnMap.ellipse.major, 1)} ピクセルの円です。`,
                              `On the map, a circle of about ${number(positionOnMap.ellipse.major, 1)} px radius.`,
                            )
                          : t(
                              `図上では、長い方の半径 約 ${number(positionOnMap.ellipse.major, 1)} ピクセル・短い方 約 ${number(positionOnMap.ellipse.minor, 1)} ピクセルの楕円です。`,
                              `On the map, an ellipse with semi-axes of about ${number(positionOnMap.ellipse.major, 1)} and ${number(positionOnMap.ellipse.minor, 1)} px.`,
                            )
                        : undefined
                    }
                  />
                </ResultPanel>
              )}
              <div className="space-y-2">
                <h3 className="font-medium">{t('位置合わせ', 'Alignment')}</h3>
                {fitted ? (
                  <ResultPanel className="sm:grid-cols-2">
                    <ResultFigure
                      label={t('方法', 'Method')}
                      value={modelName(fitted.model)}
                      note={t(`基準点 ${pairs.length} 点`, `${pairs.length} points`)}
                    />
                    <ResultFigure
                      label={t('残差（RMS・最大）', 'Residual (RMS, largest)')}
                      value={fitted.checkable ? `${number(fitted.rmsMetres)} / ${number(fitted.maxMetres)}` : '—'}
                      unit={fitted.checkable ? 'm' : undefined}
                      note={
                        fitted.checkable
                          ? t(
                              '緯度経度から計算した位置と、置いた位置の差',
                              'Distance between computed and placed positions',
                            )
                          : t(
                              `基準点が ${fitted.model === 'affine' ? 3 : 2} 点では残差は必ず 0 です。精度を確かめるには 1 点加えてください。`,
                              `With ${fitted.model === 'affine' ? 3 : 2} points the residual is always zero. Add a point to check accuracy.`,
                            )
                      }
                    />
                  </ResultPanel>
                ) : (
                  <p className="text-sm">{fitMessage}</p>
                )}
                {fitted?.mirrored && (
                  <p role="alert" className="text-sm text-destructive">
                    {t(
                      '図が裏返しに合わされています。緯度と経度の入れ違いや、基準点の置き間違いがないか確認してください。',
                      'The map is fitted as a mirror image. Check for swapped latitude and longitude, or points placed in the wrong spot.',
                    )}
                  </p>
                )}
              </div>
            </Card>
          }
          secondary={
            <ConditionSection
              id="method"
              title={t('位置合わせの方法', 'Alignment method')}
              summary={`${modelName(effectiveModel(model, pairs.length))}・${projection === 'transverse-mercator' ? t('横メルカトル', 'Transverse Mercator') : t('Web メルカトル', 'Web Mercator')}`}
            >
              <SegmentedControl
                legend={t('変換（基準点 3 点以上のとき）', 'Fit (with three or more points)')}
                value={model}
                options={[
                  { value: 'affine', label: t('アフィン変換', 'Affine') },
                  { value: 'similarity', label: t('相似変換', 'Similarity') },
                ]}
                onChange={(value) => setModel(value as Model)}
              />
              <p className="text-sm text-on-surface-variant">
                {t(
                  'アフィン変換は縦横の縮尺の違いや歪みも合わせ、相似変換は拡大・回転・移動だけです。基準点が 2 点なら相似変換を使います。斜めから撮った写真の歪みはどちらでも取れません。',
                  'Affine also corrects unequal scales and skew; Similarity only scales, rotates and shifts. Two points always use Similarity. Neither corrects a photo taken at an angle.',
                )}
              </p>
              <SegmentedControl
                legend={t('図法', 'Projection')}
                value={projection}
                options={[
                  {
                    value: 'transverse-mercator',
                    label: t('横メルカトル（紙の地形図など）', 'Transverse Mercator (printed maps)'),
                  },
                  {
                    value: 'web-mercator',
                    label: t('Web メルカトル（Web 地図の画面）', 'Web Mercator (web map screens)'),
                  },
                ]}
                onChange={(value) => setProjection(value as Projection)}
              />
              <p className="text-sm text-on-surface-variant">
                {t(
                  '国土地理院の 1:25,000・1:50,000 地形図は UTM 図法、1:200,000 地勢図は UTM 図法（一部は多面体図法）、地理院地図などの Web 地図の画面は Web メルカトルです（国土地理院）。わからないときは基準点を 4 点以上置き、残差の小さいほうを選んでください。',
                  'GSI 1:25,000 and 1:50,000 topographic maps use UTM, 1:200,000 regional maps UTM (a few sheets polyhedric), and web maps such as GSI Maps Web Mercator (Geospatial Information Authority of Japan). If unsure, place four or more points and pick the one with the smaller residual.',
                )}
              </p>
            </ConditionSection>
          }
          extras={
            <>
              <ConditionSection
                id="prefecture-maps"
                title={t('都道府県の位置図の入手先', 'Where prefectures publish their maps')}
                summary={t(
                  `${prefectureMaps.length} 都道府県（${prefectureMapsCheckedOn} 確認）`,
                  `${prefectureMaps.length} prefectures (checked ${prefectureMapsCheckedOn})`,
                )}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '多くは PDF です。必要な範囲を画像にして読み込んでください。載っていない都道府県は未確認です。',
                    'Pages in Japanese. Most maps are PDFs: save the part you need as an image. Prefectures not listed have not been checked.',
                  )}
                </p>
                <ul className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  {prefectureMaps.map((entry) => (
                    <li key={entry.url}>
                      <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                        {language === 'ja' ? entry.prefecture : entry.prefectureEn}
                      </a>
                    </li>
                  ))}
                </ul>
              </ConditionSection>

              <ConditionSection
                id="notes"
                title={t('測地系と計算方法', 'Datum and method')}
                summary={t(
                  '世界測地系（WGS84）で計算。図と基準点はこのブラウザーにだけ保存。',
                  'WGS84 coordinates. The map and points stay in this browser.',
                )}
              >
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '位置図の画像と基準点は、このブラウザーの IndexedDB に保存します。「現在地を表示」の現在地は保存しません。どこにも送信せず、地図タイルも使いません。',
                      'The map image and reference points are saved in this browser’s IndexedDB. The position from “Show my position” is not saved. Nothing is sent and no map tiles are used.',
                    )}
                  </li>
                  <li>
                    {t(
                      '端末の位置情報は世界測地系（WGS84）の緯度経度で、誤差は 95% の半径です（W3C Geolocation 仕様）。日本測地系 2011・2024 とは実用上同じです（国土地理院）。',
                      'Device positions are WGS84 latitude and longitude, with uncertainty as a 95% radius (W3C Geolocation). For practical use this matches the Japanese geodetic datums JGD2011 and JGD2024 (Geospatial Information Authority of Japan).',
                    )}
                  </li>
                  <li>
                    {t(
                      '2002 年の測量法改正前の日本測地系（旧測地系）で書かれた緯度経度は、東京付近で北西へ約 450 m ずれます（国土地理院）。古い図の経緯度を使うときは、世界測地系に換算してから入力してください。',
                      'Coordinates on the old Tokyo datum (before the 2002 survey law revision) are about 450 m off to the north-west around Tokyo (Geospatial Information Authority of Japan). Convert them to the world datum before entering them.',
                    )}
                  </li>
                  <li>
                    {t(
                      '横メルカトル図法の計算は、国土地理院が公開する平面直角座標への換算式（GRS80 楕円体）によります。位置合わせは基準点を使った最小二乗法です。',
                      'Transverse Mercator uses the Geospatial Information Authority of Japan formula for plane rectangular coordinates (GRS80). The alignment is a least-squares fit to the reference points.',
                    )}
                  </li>
                </ul>
                <p className="text-xs text-on-surface-variant">
                  {t(
                    `出典: 国土地理院「平面直角座標への換算」計算式・「日本測地系と世界測地系の違い」・「測地基準系」・「地図の一般的事項」（刊行地図の図法）、W3C「Geolocation」、各都道府県の鳥獣保護区等位置図の公開ページ（いずれも ${checkedOn} 確認）。`,
                    `Sources: Geospatial Information Authority of Japan, the plane rectangular coordinate formula, the Tokyo and world datum comparison, the geodetic reference system page and the map FAQ (projections of its maps); W3C Geolocation; each prefecture's map page (all checked ${checkedOn}).`,
                  )}
                </p>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}

interface CoordinateFieldProps {
  label: string;
  value: string;
  invalid: boolean;
  errorText: string;
  onChange: (value: string) => void;
}

/** Text, not number, so degrees, minutes and seconds can be typed. */
function CoordinateField({ label, value, invalid, errorText, onChange }: CoordinateFieldProps) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={invalid ? 'border-destructive' : undefined}
      />
      {invalid && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {errorText}
        </p>
      )}
    </div>
  );
}

interface PixelFieldProps {
  label: string;
  value: number | null;
  max: number;
  errorText: string;
  onChange: (value: number | null) => void;
}

/** A pixel coordinate from the top left of the picture. Empty means not placed. */
function PixelField({ label, value, max, errorText, onChange }: PixelFieldProps) {
  const id = useId();
  const invalid = value !== null && (value < 0 || value > max);
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={1}
        min={0}
        max={max}
        value={value ?? ''}
        onChange={(event) => {
          const next = event.target.value === '' ? null : Number(event.target.value);
          onChange(next !== null && Number.isFinite(next) ? next : null);
        }}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={invalid ? 'border-destructive' : undefined}
      />
      {invalid && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {errorText}
        </p>
      )}
    </div>
  );
}
