'use client';

import { useEffect, useId, useState } from 'react';
import { LuCrosshair, LuLocateFixed } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  GeoMap,
  LanguageMenu,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SegmentedControl,
  SelectField,
  ToolLayout,
  discardedSaveMessage,
  locationFaultText,
  useCurrentPosition,
  type MapShape,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave } from '@/lib/browser-storage';
import {
  COORDINATES_CHECKED_ON,
  formatDms,
  formatMgrs,
  meshCode,
  meshCorners,
  planeSystem,
  planeSystems,
  readCoordinateInput,
  toMgrs,
  toPlane,
  toUtm,
  type CoordinateFormat,
  type CoordinateProblem,
  type MeshLevel,
} from '@/lib/coordinates';
import { gsiTilesCheckedOn } from '@/lib/gsi-tiles';
import { parseCoordinate } from '@/lib/hunter-map';
import { labsTool } from '@/lib/labs-tools';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { storageKey, useCoordinateConvertStore } from './_store';

const meshNames: Record<MeshLevel, { ja: string; en: string }> = {
  first: { ja: '1 次メッシュ（約 80 km）', en: 'First level (about 80 km)' },
  second: { ja: '2 次メッシュ（約 10 km）', en: 'Second level (about 10 km)' },
  fivefold: { ja: '5 倍地域メッシュ（約 5 km）', en: 'Fivefold (about 5 km)' },
  twofold: { ja: '2 倍地域メッシュ（約 2 km）', en: 'Twofold (about 2 km)' },
  third: { ja: '3 次メッシュ（約 1 km）', en: 'Third level (about 1 km)' },
  half: { ja: '2 分の 1 メッシュ（約 500 m）', en: 'Half (about 500 m)' },
  quarter: { ja: '4 分の 1 メッシュ（約 250 m）', en: 'Quarter (about 250 m)' },
  eighth: { ja: '8 分の 1 メッシュ（約 125 m）', en: 'Eighth (about 125 m)' },
};
const meshOrder: MeshLevel[] = ['first', 'second', 'fivefold', 'twofold', 'third', 'half', 'quarter', 'eighth'];

export function CoordinateConvertClient() {
  const input = useCoordinateConvertStore();
  const { edit, reset } = useCoordinateConvertStore.getState();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const discarded = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [picking, setPicking] = useState(false);
  const [outputSystem, setOutputSystem] = useState<number | null>(null);
  const { locate, locating, fault } = useCurrentPosition();
  const mapDescription = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useCoordinateConvertStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const reading = readCoordinateInput(input, parseCoordinate);
  const point = reading.status === 'ok' ? reading.point : null;
  const problems = reading.status === 'invalid' ? reading.problems : [];
  const problem = (key: CoordinateProblem) => problems.includes(key);

  const setPoint = (latitude: number, longitude: number) =>
    edit({ format: 'latlon', latitude: latitude.toFixed(7), longitude: longitude.toFixed(7) });

  const system = planeSystem(outputSystem ?? input.planeSystem) ?? planeSystems[8]!;
  const utm = point ? toUtm(point) : null;
  const mgrs = point ? toMgrs(point) : null;
  const plane = point ? toPlane(point, system) : null;
  const meshes = point ? meshOrder.map((level) => ({ level, cell: meshCode(point, level) })) : [];
  const number = (value: number, digits: number) =>
    new Intl.NumberFormat(language, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

  const shapes: MapShape[] = [];
  if (reading.status === 'ok' && reading.cell)
    shapes.push({
      kind: 'polygon',
      id: 'cell',
      points: meshCorners(reading.cell),
      colour: '#8430ce',
      fill: 'rgba(132,48,206,0.12)',
    });
  if (point) shapes.push({ kind: 'marker', id: 'point', at: point });

  const formats: { value: CoordinateFormat; label: string }[] = [
    { value: 'latlon', label: t('緯度経度', 'Lat/long') },
    { value: 'utm', label: 'UTM' },
    { value: 'mgrs', label: 'MGRS' },
    { value: 'plane', label: t('平面直角', 'Plane') },
    { value: 'mesh', label: t('メッシュ', 'Grid square') },
  ];

  const errorText: Record<CoordinateProblem, string> = {
    latitude: t('緯度を読み取れません（-90〜90）。', 'The latitude cannot be read (-90 to 90).'),
    longitude: t('経度を読み取れません（-180〜180）。', 'The longitude cannot be read (-180 to 180).'),
    'utm-zone': t('ゾーンは 1〜60 の整数です。', 'The zone is a whole number from 1 to 60.'),
    'utm-easting': t('東距は 100,000〜900,000 m です。', 'The easting is 100,000 to 900,000 m.'),
    'utm-northing': t('北距を確認してください。', 'Check the northing.'),
    mgrs: t(
      'MGRS として読めません（例: 54S UE 88095 49750）。',
      'This cannot be read as MGRS (for example 54S UE 88095 49750).',
    ),
    'plane-x': t('X を m で入力してください。', 'Enter X in metres.'),
    'plane-y': t('Y を m で入力してください。', 'Enter Y in metres.'),
    'plane-system': t('系を選んでください。', 'Choose a system.'),
    mesh: t(
      'メッシュコードとして読めません（4・6・7・8・9・10・11 桁）。',
      'This cannot be read as a grid square code (4, 6, 7, 8, 9, 10 or 11 digits).',
    ),
    empty: t('座標を入力してください。', 'Enter a coordinate.'),
  };

  const field = (
    key: keyof typeof input,
    label: string,
    invalid: boolean,
    error: string,
    placeholder?: string,
    inputMode: 'decimal' | 'text' = 'decimal',
  ) => (
    <TextField
      label={label}
      value={String(input[key])}
      invalid={invalid}
      error={error}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(value) => edit({ [key]: value })}
    />
  );

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('coordinate-convert').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{ ja: '入力した座標を初期値に戻します。', en: 'Puts the coordinate back to the default.' }}
                onReset={() => {
                  setPicking(false);
                  setOutputSystem(null);
                  reset();
                }}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language) : ''}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <ToolLayout
          proportions="workspace"
          resultLabel={t('変換結果', 'Converted')}
          primary={
            <>
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 className="text-xl font-medium">{t('入力', 'Input')}</h2>
                <SegmentedControl
                  legend={t('入力の形式', 'Input format')}
                  orientation="inline"
                  value={input.format}
                  options={formats}
                  onChange={(value) => edit({ format: value as CoordinateFormat })}
                />
                {input.format === 'latlon' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      {field(
                        'latitude',
                        t('緯度（北緯）', 'Latitude (north)'),
                        problem('latitude'),
                        errorText.latitude,
                      )}
                      {field(
                        'longitude',
                        t('経度（東経）', 'Longitude (east)'),
                        problem('longitude'),
                        errorText.longitude,
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      {t(
                        '10 進数（35.6581）か度分秒（35°39′29″・35 39 29・35度39分29秒）。南緯・西経は S・W かマイナス。',
                        'Decimal degrees (35.6581) or degrees, minutes and seconds (35°39′29″, 35 39 29). South and west with S, W or a minus sign.',
                      )}
                    </p>
                  </>
                )}
                {input.format === 'utm' && (
                  <div className="grid grid-cols-2 gap-4">
                    {field('utmZone', t('ゾーン', 'Zone'), problem('utm-zone'), errorText['utm-zone'], '54')}
                    <SelectField
                      label={t('半球', 'Hemisphere')}
                      value={input.utmHemisphere}
                      onChange={(value) => edit({ utmHemisphere: value })}
                      options={[
                        { value: 'N', label: t('北半球', 'North') },
                        { value: 'S', label: t('南半球', 'South') },
                      ]}
                    />
                    {field(
                      'utmEasting',
                      t('東距（m）', 'Easting (m)'),
                      problem('utm-easting'),
                      errorText['utm-easting'],
                    )}
                    {field(
                      'utmNorthing',
                      t('北距（m）', 'Northing (m)'),
                      problem('utm-northing'),
                      errorText['utm-northing'],
                    )}
                  </div>
                )}
                {input.format === 'mgrs' &&
                  field('mgrs', 'MGRS', problem('mgrs'), errorText.mgrs, '54S UE 88095 49750', 'text')}
                {input.format === 'plane' && (
                  <div className="grid grid-cols-2 gap-4">
                    <SelectField
                      className="col-span-2"
                      label={t('系', 'System')}
                      value={String(input.planeSystem)}
                      onChange={(value) => edit({ planeSystem: Number(value) })}
                      options={planeSystems.map((entry) => ({
                        value: String(entry.number),
                        label: `${entry.roman}（${entry.area[language]}）`,
                      }))}
                    />
                    {field('planeX', t('X（北向き、m）', 'X (north, m)'), problem('plane-x'), errorText['plane-x'])}
                    {field('planeY', t('Y（東向き、m）', 'Y (east, m)'), problem('plane-y'), errorText['plane-y'])}
                  </div>
                )}
                {input.format === 'mesh' &&
                  field(
                    'mesh',
                    t('メッシュコード', 'Grid square code'),
                    problem('mesh'),
                    errorText.mesh,
                    '53394611',
                    'text',
                  )}
                {problem('empty') && <p className="text-sm">{errorText.empty}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={locating}
                    onClick={() =>
                      void locate().then((position) => {
                        if (position) setPoint(position.latitude, position.longitude);
                      })
                    }
                  >
                    <LuLocateFixed aria-hidden="true" />
                    {locating ? t('取得中…', 'Locating…') : t('現在地を使う', 'Use my location')}
                  </Button>
                  <Button
                    variant={picking ? 'default' : 'outline'}
                    aria-pressed={picking}
                    onClick={() => setPicking(!picking)}
                  >
                    <LuCrosshair aria-hidden="true" />
                    {t('地図で選ぶ', 'Pick on the map')}
                  </Button>
                </div>
                {fault && (
                  <p role="alert" className="text-sm text-destructive">
                    {locationFaultText(fault, language)}
                  </p>
                )}
              </Card>
              <Card variant="outlined" className="space-y-3 rounded-md p-5 sm:p-6">
                <h2 className="text-xl font-medium">{t('地図', 'Map')}</h2>
                {picking && (
                  <p className="rounded-sm bg-surface-container p-3 text-sm font-medium">
                    {t(
                      '地図をタップした地点を入力します（キーボードでは中央の十字を Enter）。',
                      'Tap the map to use that spot (with a keyboard, Enter takes the crosshair in the centre).',
                    )}
                  </p>
                )}
                <GeoMap
                  language={language}
                  label={t('座標の地図', 'Map of the coordinate')}
                  describedBy={mapDescription}
                  shapes={shapes}
                  picking={picking}
                  onPick={(picked) => {
                    setPoint(picked.latitude, picked.longitude);
                    setPicking(false);
                  }}
                  fitKey={point ? `${input.format}:${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}` : 'none'}
                />
                <p id={mapDescription} className="text-xs text-on-surface-variant">
                  {t(
                    '赤い点が入力した地点、紫の枠がメッシュの範囲です。',
                    'Red dot: the point. Purple frame: the grid square.',
                  )}
                </p>
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 sm:p-6">
              <h2 className="text-xl font-medium">{t('変換結果', 'Converted')}</h2>
              {!point ? (
                <p className="text-sm">
                  {t('座標を読み取れると、ここに表示します。', 'Shown here once the input can be read.')}
                </p>
              ) : (
                <>
                  <ResultPanel>
                    <ResultFigure
                      size="lead"
                      label={t('緯度・経度（10 進）', 'Latitude, longitude (decimal)')}
                      value={
                        <span className="text-2xl select-all sm:text-3xl">{`${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`}</span>
                      }
                      note={
                        reading.status === 'ok' && reading.cell
                          ? t('メッシュの中心です。', 'The centre of the grid square.')
                          : reading.status === 'ok' && reading.precisionMetres
                            ? t(
                                `MGRS の ${reading.precisionMetres} m 四方の中心です。`,
                                `The centre of the ${reading.precisionMetres} m MGRS square.`,
                              )
                            : undefined
                      }
                    />
                    <ResultFigure
                      label={t('度分秒', 'Degrees, minutes, seconds')}
                      value={
                        <span className="text-lg select-all">
                          {formatDms(point.latitude, 'latitude', language)}{' '}
                          {formatDms(point.longitude, 'longitude', language)}
                        </span>
                      }
                    />
                  </ResultPanel>
                  <ResultPanel className="sm:grid-cols-2">
                    <ResultFigure
                      label="UTM"
                      value={
                        <span className="text-lg select-all">
                          {utm
                            ? `${utm.zone}${utm.hemisphere} ${number(utm.easting, 0)} E ${number(utm.northing, 0)} N`
                            : '—'}
                        </span>
                      }
                    />
                    <ResultFigure
                      label={t('MGRS（1 m）', 'MGRS (1 m)')}
                      value={<span className="text-lg select-all">{mgrs ? formatMgrs(mgrs) : '—'}</span>}
                    />
                  </ResultPanel>
                  <ResultPanel>
                    <SelectField
                      label={t('平面直角座標系の系', 'Plane rectangular system')}
                      value={String(system.number)}
                      onChange={(value) => setOutputSystem(Number(value))}
                      options={planeSystems.map((entry) => ({
                        value: String(entry.number),
                        label: `${entry.roman}（${entry.area[language]}）`,
                      }))}
                    />
                    <ResultFigure
                      label={t(`${system.roman} 系の X・Y`, `X, Y in system ${system.roman}`)}
                      value={
                        <span className="text-lg select-all">
                          {plane ? `X ${number(plane.x, 3)} m, Y ${number(plane.y, 3)} m` : '—'}
                        </span>
                      }
                    />
                  </ResultPanel>
                  <div className="space-y-2">
                    <h3 className="font-medium">{t('地域メッシュコード', 'Standard grid square codes')}</h3>
                    {meshes.every(({ cell }) => cell === null) ? (
                      <p className="text-sm">
                        {t(
                          '地域メッシュは北緯 20〜46 度・東経 122〜154 度の範囲だけです。',
                          'The standard grid covers only 20° to 46° N and 122° to 154° E.',
                        )}
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody>
                          {meshes.map(({ level, cell }) => (
                            <tr key={level} className="border-b border-outline-variant">
                              <th scope="row" className="py-1 pr-2 text-left font-normal text-on-surface-variant">
                                {meshNames[level][language]}
                              </th>
                              <td className="py-1 font-medium tabular-nums select-all">{cell?.code ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </Card>
          }
          extras={
            <ConditionSection
              id="notes"
              title={t('計算方法と出典', 'Method and sources')}
              summary={t('日本測地系 2011（GRS80）', 'JGD2011 (GRS80)')}
            >
              <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                <li>
                  {t(
                    '緯度経度は日本測地系 2011（世界測地系）です。スマートフォンの GPS の値（WGS84）とは実用上同じです。2002 年より前の旧日本測地系の座標は、東京付近で約 450 m ずれるので、換算してから入力してください。',
                    'Latitude and longitude are on JGD2011, which matches phone GPS (WGS84) in practice. Coordinates on the old Tokyo datum (before 2002) are about 450 m off around Tokyo; convert them first.',
                  )}
                </li>
                <li>
                  {t(
                    '平面直角座標系と UTM は、国土地理院が公開するガウス・クリューゲル図法の計算式（河瀬 2011）で計算しています。平面直角座標系の原点と系の区域は平成 14 年国土交通省告示第 9 号、縮尺係数は 0.9999、UTM は 0.9996 です。',
                    'Plane rectangular coordinates and UTM use the Gauss–Krüger formulae GSI publishes (Kawase 2011). The origins and areas of the plane systems are from MLIT Notice No. 9 of 2002, with a scale factor of 0.9999; UTM uses 0.9996.',
                  )}
                </li>
                <li>
                  {t(
                    'MGRS は UTM に 100 km 四方の記号を付けたもので、桁を切り捨てて表します（北緯 84 度〜南緯 80 度）。読み込んだ MGRS は、その桁が表す四方の中心の点として変換します。',
                    'MGRS labels UTM with 100 km square letters and truncates the digits (80° S to 84° N). An MGRS reference that is read is converted as the centre of the square its digits name.',
                  )}
                </li>
                <li>
                  {t(
                    '地域メッシュは昭和 48 年行政管理庁告示第 143 号（標準地域メッシュ）によります。狩猟の結果の報告の「メッシュ番号等」は都道府県の図面の番号で、標準地域メッシュと違うことがあります。都道府県の位置図で確かめてください。',
                    'Grid squares follow the Administrative Management Agency Notice No. 143 of 1973. The mesh number in the hunting results report is the one on the prefecture’s map, which may differ from the standard grid. Check the prefecture’s map.',
                  )}
                </li>
              </ul>
              <p className="text-xs text-on-surface-variant">
                {t(
                  `出典: 国土地理院「平面直角座標系（平成十四年国土交通省告示第九号）」「平面直角座標への換算」「緯度、経度への換算」、総務省統計局「地域メッシュ統計の概要」（行政管理庁告示第 143 号を収録）（いずれも ${COORDINATES_CHECKED_ON} 確認）。地図: 地理院タイル（${gsiTilesCheckedOn} 確認）。`,
                  `Sources: GSI, the plane rectangular coordinate notice and its conversion formulae; Statistics Bureau of Japan, overview of grid square statistics with Notice No. 143 (all checked ${COORDINATES_CHECKED_ON}). Map: GSI Tiles (checked ${gsiTilesCheckedOn}).`,
                )}
              </p>
            </ConditionSection>
          }
        />
      </div>
    </AppLayout>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  invalid: boolean;
  error: string;
  placeholder?: string;
  inputMode: 'decimal' | 'text';
  onChange: (value: string) => void;
}

/** Text, not number, so degrees–minutes–seconds, letters and thousands separators can be typed. */
function TextField({ label, value, invalid, error, placeholder, inputMode, onChange }: TextFieldProps) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={invalid ? 'border-destructive' : undefined}
      />
      {invalid && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
