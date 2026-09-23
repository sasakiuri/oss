'use client';

import { useEffect, useState } from 'react';
import { LuArrowDown, LuArrowLeft, LuArrowRight, LuArrowUp, LuMinus } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  StorageUnavailableNotice,
  ResultPanel,
  SegmentedControl,
  SelectField,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import {
  calculateSightAdjustment,
  calculateSlant,
  conversionTable,
  fromMeters,
  type AxisAdjustment,
  type ClickPreset,
  type ConversionRow,
  type DistanceUnit,
  type HorizontalImpact,
  type ImpactDirection,
  type OffsetUnit,
  type TurretDirection,
  type VerticalImpact,
} from '@/lib/sight-adjustment';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialSightAdjustmentSettings, storageKey, useSightAdjustmentStore } from './_store';

const turnIcon = { up: LuArrowUp, down: LuArrowDown, left: LuArrowLeft, right: LuArrowRight } as const;

export function SightAdjustmentClient() {
  const {
    distance,
    offsetUnit,
    vertical,
    horizontal,
    click,
    slant,
    setDistance,
    setOffsetUnit,
    setVertical,
    setHorizontal,
    setClick,
    setSlant,
  } = useSightAdjustmentStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useSightAdjustmentStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const result = calculateSightAdjustment({ distance, offsetUnit, vertical, horizontal, click });
  const slantResult = calculateSlant(slant.value, distance.unit, slant.angleDegrees);
  const rows = result ? conversionTable(click, result.distanceMeters) : [];

  const distanceInvalid = !Number.isFinite(distance.value) || distance.value <= 0;
  const verticalInvalid = !Number.isFinite(vertical.value) || vertical.value < 0;
  const horizontalInvalid = !Number.isFinite(horizontal.value) || horizontal.value < 0;
  const customInvalid =
    click.preset === 'custom' && (!Number.isFinite(click.customMmPer100m) || click.customMmPer100m <= 0);
  const slantInvalid = !Number.isFinite(slant.value) || slant.value <= 0;
  const angleInvalid = !Number.isFinite(slant.angleDegrees) || Math.abs(slant.angleDegrees) > 90;
  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const nonNegativeError = t('0 以上の数値を入力してください。', 'Enter a number of zero or more.');
  const angleError = t('-90 から 90 の範囲で入力してください。', 'Enter an angle between -90 and 90.');

  const number = (value: number, digits = 2) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
  const turnName = (turn: TurretDirection) =>
    ({
      up: 'UP',
      down: 'DOWN',
      left: 'LEFT',
      right: 'RIGHT',
    })[turn];
  const impactName = (impact: ImpactDirection) =>
    ({ high: t('上', 'high'), low: t('下', 'low'), right: t('右', 'right'), left: t('左', 'left') })[impact];
  const rowName = (key: ConversionRow['key']) =>
    ({ moa: '1 MOA', mil: '1 mil', click: t('1 クリック', '1 click') })[key];
  const residualText = (axis: AxisAdjustment) =>
    axis.residualImpact === null
      ? t(`計算値 ${number(axis.exactClicks)} クリック`, `Calculated ${number(axis.exactClicks)} clicks`)
      : t(
          `計算値 ${number(axis.exactClicks)} クリック。丸めで約 ${number(Math.abs(axis.residualMm))} mm ${impactName(axis.residualImpact)}に残ります。`,
          `Calculated ${number(axis.exactClicks)} clicks. Rounding leaves about ${number(Math.abs(axis.residualMm))} mm ${impactName(axis.residualImpact)}.`,
        );

  // Zero clicks is no turn, so no direction is named.
  const noTurn = t('調整なし', 'No change');
  const axes = result
    ? [
        { axis: result.vertical, name: t('上下', 'Elevation') },
        { axis: result.horizontal, name: t('左右', 'Windage') },
      ].filter((entry): entry is { axis: AxisAdjustment; name: string } => entry.axis !== null)
    : [];
  const summary = axes.length
    ? `${axes
        .map(({ axis, name }) =>
          axis.clicks === 0
            ? t(`${name}は${noTurn}`, `${name}: no change`)
            : t(
                `${turnName(axis.turn)} ${number(axis.clicks, 0)} クリック`,
                `${turnName(axis.turn)} ${number(axis.clicks, 0)} ${axis.clicks === 1 ? 'click' : 'clicks'}`,
              ),
        )
        .join(t('、', ', '))}${t('。', '.')}`
    : t('射距離とズレを入力してください。', 'Enter the distance and the offset.');

  useEffect(() => {
    if (!ready) return;
    // Announce once typing settles, not on every keystroke.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [ready, summary]);

  const axisResult = (axis: AxisAdjustment | null, label: string) => {
    const Icon = axis && axis.clicks !== 0 ? turnIcon[axis.turn] : LuMinus;
    return (
      <div className="min-w-0">
        <p className="text-sm text-on-surface-variant">{label}</p>
        {axis ? (
          <>
            <div className="mt-1 flex items-center gap-3">
              <Icon aria-hidden="true" className="size-10 shrink-0 text-primary" />
              {axis.clicks === 0 ? (
                <p className="text-3xl font-medium">{noTurn}</p>
              ) : (
                <p className="font-medium tabular-nums">
                  <span className="block text-xl">{turnName(axis.turn)}</span>{' '}
                  <span className="text-4xl">{number(axis.clicks, 0)}</span>{' '}
                  <span className="text-base font-normal">{t('クリック', axis.clicks === 1 ? 'click' : 'clicks')}</span>
                </p>
              )}
            </div>
            <p className="mt-2 text-sm text-on-surface-variant">{residualText(axis)}</p>
          </>
        ) : (
          <p className="mt-1 text-3xl font-medium">—</p>
        )}
      </div>
    );
  };

  // One unit for both offsets, offered in both fields.
  const offsetUnits = {
    value: offsetUnit,
    label: t('ズレの単位（上下・左右共通）', 'Offset unit (both axes)'),
    options: [
      { value: 'mm', label: 'mm' },
      { value: 'cm', label: 'cm' },
      { value: 'inch', label: 'inch' },
    ] as const,
    onChange: (unit: OffsetUnit) => setOffsetUnit(unit),
  };

  const rowSize = (key: ConversionRow['key']) => rows.find((row) => row.key === key)?.mm ?? NaN;
  const inclineSummary = slantResult
    ? t(
        `斜距離 ${number(slant.value)} ${distance.unit}・${number(slant.angleDegrees)}° → 水平距離 ${number(fromMeters(slantResult.horizontalMeters, distance.unit))} ${distance.unit}`,
        `${number(slant.value)} ${distance.unit} at ${number(slant.angleDegrees)}° → ${number(fromMeters(slantResult.horizontalMeters, distance.unit))} ${distance.unit} horizontal`,
      )
    : t('斜距離と傾斜角を入力してください。', 'Enter the slant distance and angle.');
  const sizeSummary = result
    ? t(
        `${number(distance.value)} ${distance.unit} で 1 MOA = ${number(rowSize('moa'))} mm・1 mil = ${number(rowSize('mil'))} mm・1 クリック = ${number(rowSize('click'))} mm`,
        `At ${number(distance.value)} ${distance.unit}: 1 MOA = ${number(rowSize('moa'))} mm, 1 mil = ${number(rowSize('mil'))} mm, 1 click = ${number(rowSize('click'))} mm`,
      )
    : t('射距離を入力してください。', 'Enter the distance.');

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('sight-adjustment').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: 'すべての入力を初期値に戻します。',
                  en: 'All inputs return to their defaults.',
                }}
                onReset={() =>
                  useSightAdjustmentStore.setState({
                    ...initialSightAdjustmentSettings,
                    lastValidSettings: initialSightAdjustmentSettings,
                  })
                }
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty so the text is announced when it arrives; separate from the result summary. */}
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {announcement}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('計算結果', 'Results')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="clicks" className="text-xl font-medium">
                {t('着弾のズレ', 'Where the group landed')}
              </h2>
              <div className="grid grid-cols-2 items-start gap-4">
                {/* The number is reread in the new unit; the store converts the incline's slant distance. */}
                <NumberField
                  label={t('射距離', 'Distance')}
                  value={distance.value}
                  onChange={(value) => setDistance({ ...distance, value })}
                  units={{
                    value: distance.unit,
                    label: t('距離の単位', 'Distance unit'),
                    options: [
                      { value: 'm', label: 'm' },
                      { value: 'yd', label: 'yd' },
                    ],
                    onChange: (unit: DistanceUnit) => setDistance({ ...distance, unit }),
                  }}
                  min={0}
                  invalid={distanceInvalid}
                  errorText={positiveError}
                />
                <SelectField
                  label={t('照準器の調整単位', 'Turret click value')}
                  value={click.preset}
                  onChange={(value) => setClick({ ...click, preset: value as ClickPreset })}
                  options={[
                    { value: '1/8-moa', label: '1/8 MOA' },
                    { value: '1/4-moa', label: '1/4 MOA' },
                    { value: '1/2-moa', label: '1/2 MOA' },
                    { value: '1-moa', label: '1 MOA' },
                    { value: '0.05-mil', label: '0.05 mil' },
                    { value: '0.1-mil', label: '0.1 mil' },
                    { value: 'custom', label: t('カスタム', 'Custom') },
                  ]}
                />
              </div>
              {click.preset === 'custom' && (
                <NumberField
                  label={t('100 m あたりの移動量', 'Travel per 100 m')}
                  unit="mm"
                  value={click.customMmPer100m}
                  onChange={(customMmPer100m) => setClick({ ...click, customMmPer100m })}
                  min={0}
                  invalid={customInvalid}
                  errorText={positiveError}
                />
              )}
              {/* Which way beside how far, one row per axis. */}
              <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-4">
                <SegmentedControl
                  legend={t('着弾の上下', 'Vertical impact')}
                  orientation="inline"
                  value={vertical.direction}
                  options={[
                    { value: 'high', label: t('上', 'High') },
                    { value: 'low', label: t('下', 'Low') },
                  ]}
                  onChange={(value) => setVertical({ ...vertical, direction: value as VerticalImpact })}
                />
                <NumberField
                  label={t('上下のズレ', 'Vertical offset')}
                  value={vertical.value}
                  onChange={(value) => setVertical({ ...vertical, value })}
                  units={offsetUnits}
                  min={0}
                  invalid={verticalInvalid}
                  errorText={nonNegativeError}
                />
                <SegmentedControl
                  legend={t('着弾の左右', 'Horizontal impact')}
                  orientation="inline"
                  value={horizontal.direction}
                  options={[
                    { value: 'right', label: t('右', 'Right') },
                    { value: 'left', label: t('左', 'Left') },
                  ]}
                  onChange={(value) => setHorizontal({ ...horizontal, direction: value as HorizontalImpact })}
                />
                <NumberField
                  label={t('左右のズレ', 'Horizontal offset')}
                  value={horizontal.value}
                  onChange={(value) => setHorizontal({ ...horizontal, value })}
                  units={offsetUnits}
                  min={0}
                  invalid={horizontalInvalid}
                  errorText={nonNegativeError}
                />
              </div>
              <p className="text-xs text-on-surface-variant">
                {t(
                  '狙点から、数発の群の中心までを測ります。',
                  'Measure from the aim point to the centre of a group of several shots.',
                )}
              </p>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {t('回す向きとクリック数', 'Direction and clicks')}
              </h2>
              <ResultPanel className="sm:grid-cols-2">
                {axisResult(result?.vertical ?? null, t('上下', 'Elevation'))}
                {axisResult(result?.horizontal ?? null, t('左右', 'Windage'))}
              </ResultPanel>
              {!result && (
                <p className="text-sm text-destructive">
                  {t('射距離とクリック値を入力してください。', 'Enter the distance and click value.')}
                </p>
              )}
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="incline"
                title={t('傾斜射撃の水平距離', 'Horizontal distance on an incline')}
                summary={inclineSummary}
                forceOpen={slantInvalid || angleInvalid}
              >
                <p className="text-sm text-on-surface-variant">
                  {t('水平距離 = 斜距離 × cos(傾斜角)', 'Horizontal distance = slant distance × cos(angle)')}
                </p>
                <div className="grid grid-cols-2 items-start gap-4">
                  <NumberField
                    label={t('斜距離', 'Slant distance')}
                    unit={distance.unit}
                    value={slant.value}
                    onChange={(value) => setSlant({ ...slant, value })}
                    min={0}
                    invalid={slantInvalid}
                    errorText={positiveError}
                  />
                  <NumberField
                    label={t('傾斜角', 'Incline angle')}
                    unit={t('度', 'degrees')}
                    value={slant.angleDegrees}
                    onChange={(angleDegrees) => setSlant({ ...slant, angleDegrees })}
                    min={-90}
                    max={90}
                    invalid={angleInvalid}
                    errorText={angleError}
                  />
                </div>
                <dl className="rounded-sm bg-surface-container p-4">
                  <dt className="text-sm">{t('弾道に使う水平距離', 'Horizontal distance for ballistics')}</dt>
                  <dd className="mt-1 text-2xl font-medium tabular-nums">
                    {slantResult
                      ? `${number(fromMeters(slantResult.horizontalMeters, distance.unit))} ${distance.unit}`
                      : '—'}
                  </dd>
                  {slantResult && (
                    <dd className="mt-1 text-sm text-on-surface-variant tabular-nums">
                      {t(
                        `cos = ${number(slantResult.cosine, 3)}、斜距離より ${number(fromMeters(slantResult.reductionMeters, distance.unit))} ${distance.unit} 短い`,
                        `cos = ${number(slantResult.cosine, 3)}, ${number(fromMeters(slantResult.reductionMeters, distance.unit))} ${distance.unit} shorter than the slant distance`,
                      )}
                    </dd>
                  )}
                </dl>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '撃ち上げでも撃ち下ろしでも、落下は水平距離で見込みます。',
                    'Uphill or downhill, allow for the drop at the horizontal distance.',
                  )}
                </p>
              </ConditionSection>

              <ConditionSection
                id="unit-size"
                title={t('この距離での実寸', 'Size at this distance')}
                summary={sizeSummary}
              >
                {result && (
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      {t('角度の単位と 1 クリックの実寸', 'Angular units and one click at this distance')}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className="py-2 text-left font-medium">
                          {t('単位', 'Unit')}
                        </th>
                        <th scope="col" className="py-2 text-right font-medium">
                          mm
                        </th>
                        <th scope="col" className="py-2 text-right font-medium">
                          inch
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key} className="border-t border-outline-variant">
                          <th scope="row" className="py-2 text-left font-normal">
                            {rowName(row.key)}
                          </th>
                          <td className="py-2 text-right tabular-nums">{number(row.mm)}</td>
                          <td className="py-2 text-right tabular-nums">{number(row.inch, 3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="text-xs text-on-surface-variant">
                  {t(
                    'MOA は 1/60 度、mil はミリラジアン（1/1000 rad）です。円を 6400 分割する NATO mil ではありません。',
                    'MOA is 1/60 of a degree; mil is a milliradian (1/1000 rad), not the NATO mil of 1/6400 of a circle.',
                  )}
                </p>
              </ConditionSection>

              <p className="text-xs text-on-surface-variant">
                {storageAvailable && t('設定はこのブラウザーに保存されます。', 'Settings are saved in this browser. ')}
                {t(
                  '射撃は法令と射撃場の規則に従い、安全な方向・射座で行ってください。',
                  'Follow the law and range rules, and shoot in a safe direction from a safe position.',
                )}
              </p>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
