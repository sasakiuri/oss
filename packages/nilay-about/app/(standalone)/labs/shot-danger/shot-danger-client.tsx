'use client';

import { useEffect, useId, useState } from 'react';
import { LuCrosshair, LuLocateFixed, LuPrinter, LuTarget } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  GeoMap,
  LanguageMenu,
  NumberField,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SelectField,
  ToolLayout,
  discardedSaveMessage,
  locationFaultText,
  useCurrentPosition,
  type MapShape,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave } from '@/lib/browser-storage';
import { compassPoint, inverseGeodesic } from '@/lib/geodesy';
import { gsiTilesCheckedOn } from '@/lib/gsi-tiles';
import { labsTool } from '@/lib/labs-tools';
import type { ShotDangerSettings } from '@/lib/schemas/shot-danger';
import { DANGER_SOURCE_CHECKED_ON, coneDangerZone, coneRow, pamphletRows } from '@/lib/shot-danger';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { storageKey, useShotDangerStore } from './_store';

type Picking = 'firing' | 'target' | null;

const colours = {
  dispersion: { stroke: '#b3261e', fill: 'rgba(179,38,30,0.28)' },
  ricochet: { stroke: '#e8710a', fill: 'rgba(232,113,10,0.22)' },
  areaA: { stroke: '#b58400', fill: 'rgba(249,203,64,0.22)' },
};

export function ShotDangerClient() {
  const { ammunition, firing, bearing } = useShotDangerStore();
  const { edit, reset } = useShotDangerStore.getState();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const discarded = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [picking, setPicking] = useState<Picking>(null);
  const { locate, locating, fault } = useCurrentPosition();
  const mapDescription = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useShotDangerStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const row = coneRow(ammunition);
  const zone = firing ? coneDangerZone(firing, bearing, ammunition) : null;
  const number = (value: number, digits = 0) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

  const shapes: MapShape[] = [];
  if (zone) {
    shapes.push(
      {
        kind: 'polygon',
        id: 'area-a-left',
        points: zone.areaA.left,
        colour: colours.areaA.stroke,
        fill: colours.areaA.fill,
        width: 1.5,
      },
      {
        kind: 'polygon',
        id: 'area-a-right',
        points: zone.areaA.right,
        colour: colours.areaA.stroke,
        fill: colours.areaA.fill,
        width: 1.5,
      },
      {
        kind: 'polygon',
        id: 'ricochet-left',
        points: zone.ricochet.left,
        colour: colours.ricochet.stroke,
        fill: colours.ricochet.fill,
        width: 1.5,
      },
      {
        kind: 'polygon',
        id: 'ricochet-right',
        points: zone.ricochet.right,
        colour: colours.ricochet.stroke,
        fill: colours.ricochet.fill,
        width: 1.5,
      },
      {
        kind: 'polygon',
        id: 'dispersion',
        points: zone.dispersion,
        colour: colours.dispersion.stroke,
        fill: colours.dispersion.fill,
        width: 1.5,
      },
      { kind: 'line', id: 'line-of-fire', points: zone.lineOfFire, colour: '#1b1b1f', width: 2, dashed: true },
    );
  }
  if (firing) shapes.push({ kind: 'marker', id: 'firing', at: firing, label: t('射', 'F'), colour: '#1b1b1f' });

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('shot-danger').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '射座・射向・弾の選択を初期値に戻します。',
                  en: 'Puts the firing point, bearing and ammunition back to the defaults.',
                }}
                onReset={() => {
                  setPicking(null);
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
        <p className="rounded-sm bg-surface-container p-4 text-sm">
          {t(
            '米陸軍の射撃場安全基準の図と表の値を地図に重ねた図です。範囲の外でも安全とは限りません。地形・硬い地面・水面・風は入っていません。撃つ前に、矢先（弾の行く先）とその向こうに人・人家・道路・家畜がないことを目で確かめてください。',
            'The US Army range safety pamphlet’s figure and table values laid on the map. Outside the area is not necessarily safe. Terrain, hard ground, water and wind are not included. Before every shot, see for yourself that there is no one, no house, road or livestock where the shot is going and beyond.',
          )}
        </p>
        <ToolLayout
          proportions="workspace"
          resultLabel={t('危険範囲', 'Danger area')}
          primary={
            <>
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="firing" className="text-xl font-medium">
                  {t('1. 射座と射向', '1. Firing point and bearing')}
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={locating}
                    onClick={() =>
                      void locate().then((position) => {
                        if (position) edit({ firing: { latitude: position.latitude, longitude: position.longitude } });
                      })
                    }
                  >
                    <LuLocateFixed aria-hidden="true" />
                    {locating ? t('取得中…', 'Locating…') : t('現在地を射座にする', 'Fire from my location')}
                  </Button>
                  <Button
                    variant={picking === 'firing' ? 'default' : 'outline'}
                    aria-pressed={picking === 'firing'}
                    onClick={() => setPicking(picking === 'firing' ? null : 'firing')}
                  >
                    <LuCrosshair aria-hidden="true" />
                    {t('地図で射座を選ぶ', 'Pick the firing point')}
                  </Button>
                  <Button
                    variant={picking === 'target' ? 'default' : 'outline'}
                    aria-pressed={picking === 'target'}
                    disabled={!firing}
                    onClick={() => setPicking(picking === 'target' ? null : 'target')}
                  >
                    <LuTarget aria-hidden="true" />
                    {t('地図で撃つ方向を選ぶ', 'Pick the direction')}
                  </Button>
                </div>
                {fault && (
                  <p role="alert" className="text-sm text-destructive">
                    {locationFaultText(fault, language)}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <NumberField
                    label={t('射向（真北から右回り）', 'Bearing (from true north)')}
                    value={bearing}
                    unit="°"
                    min={0}
                    max={360}
                    step={1}
                    invalid={!(Number.isFinite(bearing) && bearing >= 0 && bearing <= 360)}
                    errorText={t('0〜360 の角度です。', 'An angle from 0 to 360.')}
                    hint={Number.isFinite(bearing) ? compassPoint(bearing, language) : undefined}
                    onChange={(value) => edit({ bearing: value })}
                  />
                  <SelectField
                    label={t('弾（出典の表の行）', 'Ammunition (row of the tables)')}
                    value={ammunition}
                    options={pamphletRows
                      .filter((candidate) => candidate.figure === '4-1')
                      .map((candidate) => ({ value: candidate.id, label: candidate.label[language] }))}
                    onChange={(value) => edit({ ammunition: value as ShotDangerSettings['ammunition'] })}
                  />
                </div>
                <p className="text-xs text-on-surface-variant">
                  {t(
                    '12 番の 7½・8・9 号は、出典がクレー射撃場の落下区域の図（図 4-8）を使うとしているため描きません。方位は真北基準です。方位磁石が指す磁北は、真北から地域により数度ずれます。',
                    '12-gauge 7½, 8 and 9 shot is not drawn: the pamphlet uses the shotfall figure of a trap range (figure 4-8) for it. Bearings are from true north; a compass points to magnetic north, a few degrees off depending on the region.',
                  )}
                </p>
                {picking && (
                  <p className="rounded-sm bg-surface-container p-3 text-sm font-medium">
                    {picking === 'firing'
                      ? t('地図で射座をタップしてください。', 'Tap the firing point on the map.')
                      : t('地図で撃つ方向の地点をタップしてください。', 'Tap a point in the direction of fire.')}
                  </p>
                )}
                <GeoMap
                  language={language}
                  label={t('危険範囲の地図', 'Map of the danger area')}
                  describedBy={mapDescription}
                  shapes={shapes}
                  picking={picking !== null}
                  onPick={(point) => {
                    if (picking === 'firing') edit({ firing: point });
                    else if (picking === 'target' && firing) {
                      const path = inverseGeodesic(firing, point);
                      if (path && path.distanceMetres > 0) edit({ bearing: Math.round(path.initialBearing * 10) / 10 });
                    }
                    setPicking(null);
                  }}
                  fitKey={firing ? `${firing.latitude},${firing.longitude},${row.distanceXMetres}` : 'none'}
                />
                <p id={mapDescription} className="sr-only">
                  {t(
                    '黒い破線が射線、赤が散布域、橙が跳弾域、黄が緩衝帯（Area A）です。',
                    'Dashed black: line of fire. Red: dispersion area. Orange: ricochet areas. Yellow: buffer (Area A).',
                  )}
                </p>
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {t('危険範囲', 'Danger area')}
              </h2>
              <ResultPanel className="sm:grid-cols-2">
                <ResultFigure
                  size="lead"
                  label={t('Distance X（出典の表）', 'Distance X (the tables)')}
                  value={number(row.distanceXMetres)}
                  unit="m"
                  note={t(`表 ${row.table}・土または水面に着弾`, `Table ${row.table}, earth or water impact`)}
                />
                <ResultFigure
                  label={t('範囲の開き（射線の片側）', 'Width each side of the line')}
                  value={zone ? number(zone.outerHalfAngleDegrees, 1) : '—'}
                  unit={zone ? '°' : undefined}
                />
              </ResultPanel>
              {!firing && (
                <p className="text-sm">
                  {t('射座を決めると地図に範囲を描きます。', 'Choose a firing point to draw the area on the map.')}
                </p>
              )}
              <ul className="space-y-1 text-sm">
                {(
                  [
                    ['dispersion', t('散布域: 射線の左右 5°', 'Dispersion area: 5° each side')],
                    ['ricochet', t('跳弾域: その外側 5°', 'Ricochet areas: the next 5°')],
                    [
                      'areaA',
                      t(
                        `緩衝帯（Area A）: さらに外側 ${number(row.areaAMetres)} m、射座では 30° で開く`,
                        `Buffer (Area A): ${number(row.areaAMetres)} m beyond, opening at 30°`,
                      ),
                    ],
                  ] as const
                ).map(([key, text]) => (
                  <li key={key} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block size-4 shrink-0 rounded-sm border"
                      style={{ background: colours[key].fill, borderColor: colours[key].stroke }}
                    />
                    {text}
                  </li>
                ))}
              </ul>
              <Button variant="outline" onClick={() => window.print()}>
                <LuPrinter aria-hidden="true" />
                {t('印刷', 'Print')}
              </Button>
            </Card>
          }
          extras={
            <ConditionSection
              id="basis"
              title={t('根拠と限界', 'Basis and limits')}
              summary={t(
                '米陸軍 DA PAM 385-63 の図 4-1 と表 4-1・4-3',
                'US Army DA PAM 385-63, figure 4-1 and tables 4-1 and 4-3',
              )}
            >
              <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                <li>
                  {t(
                    '範囲の形は、米陸軍の射撃場安全の手引 DA PAM 385-63（2014 年 4 月 16 日版）図 4-1「炸裂しない弾を撃つ小火器の円錐形の危険区域」です。',
                    'The shape is figure 4-1 of DA PAM 385-63 (16 April 2014), the cone surface danger zone for small arms without exploding projectiles.',
                  )}
                </li>
                <li>
                  {t(
                    'Distance X と Area A の幅は、選んだ弾の表の行（表 4-1・4-3、土または水面に着弾）の値です。',
                    'Distance X and the width of Area A are the values in the chosen row of the tables (tables 4-1 and 4-3, earth or water impact).',
                  )}
                </li>
                <li>
                  {t(
                    '出典は米軍の訓練射場の設計基準で、日本の法令や狩猟の基準ではありません。円錐形は静止した射撃の射場のためのもので（4-1 b）、跳弾をより広く囲むバットウィング形（図 4-3）は描いていません。硬い地面や岩に当たった弾は、出典でもより広い角度に跳ねるとされています。',
                    'The source is a design standard for US military training ranges, not Japanese law or a hunting rule. The cone is for static ranges (paragraph 4-1 b); the batwing (figure 4-3), which contains more of the ricochets, is not drawn. The pamphlet gives wider ricochet angles for hard ground and rock.',
                  )}
                </li>
              </ul>
              <p className="text-xs text-on-surface-variant">
                {t(
                  `出典: Department of the Army, DA PAM 385-63 Range Safety（2014-04-16）図 4-1・4-3・4-8、4-1 b・d、4-2 d、表 4-1・4-3（${DANGER_SOURCE_CHECKED_ON} 確認）。地図: 地理院タイル（${gsiTilesCheckedOn} 確認）。`,
                  `Sources: Department of the Army, DA PAM 385-63 Range Safety (16 April 2014), figures 4-1, 4-3 and 4-8, paragraphs 4-1 b and d and 4-2 d, tables 4-1 and 4-3 (checked ${DANGER_SOURCE_CHECKED_ON}). Map: GSI Tiles (checked ${gsiTilesCheckedOn}).`,
                )}
              </p>
              <table className="text-sm">
                <caption className="text-left font-medium">
                  {t('出典の表の値（土・水面に着弾）', 'Values in the tables (earth or water impact)')}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="pr-4 text-left font-normal text-on-surface-variant">
                      {t('弾', 'Ammunition')}
                    </th>
                    <th scope="col" className="pr-4 text-left font-normal text-on-surface-variant">
                      Distance X
                    </th>
                    <th scope="col" className="pr-4 text-left font-normal text-on-surface-variant">
                      Area A
                    </th>
                    <th scope="col" className="text-left font-normal text-on-surface-variant">
                      {t('図', 'Figure')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pamphletRows.map((candidate) => (
                    <tr key={candidate.id}>
                      <th scope="row" className="pr-4 text-left font-normal">
                        {candidate.label[language]}
                      </th>
                      <td className="pr-4 tabular-nums">{number(candidate.distanceXMetres)} m</td>
                      <td className="pr-4 tabular-nums">
                        {candidate.areaAMetres === null ? '—' : `${number(candidate.areaAMetres)} m`}
                      </td>
                      <td>
                        {candidate.figure === '4-1'
                          ? '4-1'
                          : t('4-8（落下区域、描かない）', '4-8 (shotfall, not drawn)')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ConditionSection>
          }
        />
      </div>
    </AppLayout>
  );
}
