'use client';

import { useEffect, useState } from 'react';
import { LuPrinter } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SegmentedControl,
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import {
  MAX_PAGES,
  REFERENCE_LINE_MM,
  calculateClickVerification,
  expectedTravelMm,
  clickUnit,
  mmToInch,
  tallTargetLayout,
  type AngleUnit,
  type DistanceUnit,
  type LateralSide,
  type NominalClick,
  type OffsetUnit,
} from '@/lib/click-verification';
import { labsTool } from '@/lib/labs-tools';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialClickVerificationSettings, storageKey, useClickVerificationStore } from './_store';
import styles from './tall-target-print.module.css';
import { TallTargetSheet, type TallTargetSheetText } from './tall-target-sheet';

const CHECKED_ON = '2026-09-23';
const SOURCE_URL = 'https://appliedballisticsllc.com/wp-content/uploads/2021/06/Tall-Target.pdf';
const UNIT_LABEL: Record<AngleUnit, string> = { moa: 'MOA', mil: 'mil' };
const CLICK_OPTIONS: Record<AngleUnit, { value: NominalClick; label: string }[]> = {
  moa: [
    { value: '1/8-moa', label: '1/8 MOA' },
    { value: '1/4-moa', label: '1/4 MOA' },
    { value: '1/2-moa', label: '1/2 MOA' },
    { value: '1-moa', label: '1 MOA' },
  ],
  mil: [
    { value: '0.05-mil', label: '0.05 mil' },
    { value: '0.1-mil', label: '0.1 mil' },
  ],
};

export function ClickVerificationClient() {
  const {
    distance,
    click,
    dial,
    measureUnit,
    measured,
    lateral,
    setDistance,
    setClick,
    setDialUnit,
    setDial,
    setMeasureUnit,
    setMeasured,
    setLateral,
  } = useClickVerificationStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useClickVerificationStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const unit = clickUnit(click);
  const unitLabel = UNIT_LABEL[unit];
  const result = calculateClickVerification({ distance, click, dial, measureUnit, measured, lateral });
  // Sized from the distance and the dial only, so the target can be printed before shooting.
  const expectedMm = expectedTravelMm(distance, click, dial);
  const layout = expectedMm === null ? null : tallTargetLayout(expectedMm);
  const canPrint = ready && layout !== null && layout.fits;
  const screenOnly = canPrint ? 'print:hidden' : undefined;

  const distanceInvalid = !Number.isFinite(distance.value) || distance.value <= 0;
  const dialInvalid = !Number.isFinite(dial) || dial <= 0;
  const measuredInvalid = !Number.isFinite(measured) || measured <= 0;
  const lateralInvalid = !Number.isFinite(lateral.value) || lateral.value < 0;
  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const nonNegativeError = t('0 以上の数値を入力してください。', 'Enter a number of zero or more.');

  const number = (value: number, digits = 2) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
  const signed = (value: number, digits = 2) =>
    Number.isFinite(value)
      ? new Intl.NumberFormat(language, { maximumFractionDigits: digits, signDisplay: 'exceptZero' }).format(value)
      : '—';
  const sideName = (side: LateralSide) => ({ right: t('右', 'right'), left: t('左', 'left') })[side];

  const errorSentence = (errorPercent: number) =>
    Math.abs(errorPercent) < 0.005
      ? t('実測は公称どおりです。', 'Travel matches the label.')
      : errorPercent > 0
        ? t(
            `実測は公称より ${number(errorPercent)}% 多く動きました。`,
            `${number(errorPercent)}% more travel than labelled.`,
          )
        : t(
            `実測は公称より ${number(-errorPercent)}% 少なく動きました。`,
            `${number(-errorPercent)}% less travel than labelled.`,
          );

  const emptyText = t(
    '距離・ダイヤル量・実測の移動量を入力してください。',
    'Enter the distance, the dial and the measured travel.',
  );
  const summary = result
    ? `${t(`補正係数 ${number(result.correctionFactor, 4)}。`, `Correction factor ${number(result.correctionFactor, 4)}. `)}${errorSentence(result.errorPercent)}`
    : emptyText;

  useEffect(() => {
    // Announce once typing settles, not on every keystroke.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [summary]);

  const measureUnits = {
    value: measureUnit,
    label: t('測定の単位（移動量・横ずれ共通）', 'Measurement unit (travel and sideways)'),
    options: [
      { value: 'mm', label: 'mm' },
      { value: 'cm', label: 'cm' },
      { value: 'inch', label: 'inch' },
    ] as const,
    onChange: (next: OffsetUnit) => setMeasureUnit(next),
  };

  const sheetText: TallTargetSheetText = {
    join: (index) => t(`合わせ線 ${index}`, `Join line ${index}`),
    expected:
      expectedMm === null
        ? ''
        : t(
            `期待位置 ${number(expectedMm, 1)} mm（${number(dial)} ${unitLabel}・${number(distance.value)} ${distance.unit}）`,
            `Expected ${number(expectedMm, 1)} mm (${number(dial)} ${unitLabel} at ${number(distance.value)} ${distance.unit})`,
          ),
    aim: t('狙点', 'Aim point'),
    glue: t('のりしろ（下の用紙を重ねる）', 'Glue strip (overlap the sheet below)'),
    page: (index, count) =>
      t(`${index + 1} / ${count} 枚目・下から順に`, `Sheet ${index + 1} of ${count}, from the bottom`),
    reference: t(
      `${REFERENCE_LINE_MM} mm の基準線／100% で印刷`,
      `${REFERENCE_LINE_MM} mm reference line / print at 100%`,
    ),
  };

  const printSummary = !layout
    ? t('ダイヤル量と距離を入力してください。', 'Enter the dial and the distance.')
    : layout.fits
      ? t(
          `高さ ${number(layout.heightMm / 10, 1)} cm・A4 ${layout.pageCount} 枚`,
          `${number(layout.heightMm / 10, 1)} cm tall, ${layout.pageCount} A4 sheets`,
        )
      : t(
          `高さ ${number(layout.heightMm / 10, 1)} cm は A4 ${MAX_PAGES} 枚を超えます`,
          `${number(layout.heightMm / 10, 1)} cm tall, more than ${MAX_PAGES} A4 sheets`,
        );

  return (
    <AppLayout
      header={
        <AppHeader
          className={screenOnly}
          title={labsTool('click-verification').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: 'すべての入力を初期値に戻します。',
                  en: 'All inputs return to their defaults.',
                }}
                onReset={() =>
                  useClickVerificationStore.setState({
                    ...initialClickVerificationSettings,
                    lastValidSettings: initialClickVerificationSettings,
                  })
                }
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty so the message is announced; separate from the result so it is not repeated. */}
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {announcement}
      </p>
      <div lang={language} className={cn('space-y-6', screenOnly)} inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('計算結果', 'Results')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="measurement" className="text-xl font-medium">
                {t('縦長標的の測定値', 'Tall target measurements')}
              </h2>
              <div className="grid grid-cols-2 items-start gap-4">
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
                    onChange: (next: DistanceUnit) => setDistance({ ...distance, unit: next }),
                  }}
                  min={0}
                  invalid={distanceInvalid}
                  errorText={positiveError}
                  hint={t('照準器から標的まで', 'From the scope to the target')}
                />
                <NumberField
                  label={t('ダイヤル量', 'Dialled elevation')}
                  value={dial}
                  onChange={setDial}
                  units={{
                    value: unit,
                    label: t('ダイヤル量の単位', 'Dial unit'),
                    options: [
                      { value: 'moa', label: 'MOA' },
                      { value: 'mil', label: 'mil' },
                    ],
                    onChange: (next: AngleUnit) => setDialUnit(next),
                  }}
                  min={0}
                  invalid={dialInvalid}
                  errorText={positiveError}
                />
                <SelectField
                  label={t('公称クリック値', 'Labelled click value')}
                  value={click}
                  onChange={(value) => setClick(value as NominalClick)}
                  options={CLICK_OPTIONS[unit]}
                />
                <NumberField
                  label={t('実測の移動量', 'Measured travel')}
                  value={measured}
                  onChange={setMeasured}
                  units={measureUnits}
                  min={0}
                  invalid={measuredInvalid}
                  errorText={positiveError}
                  hint={t(
                    'ダイヤル前後の群の中心どうしを、縦線に沿って',
                    'Between the group centres before and after dialling, along the line',
                  )}
                />
              </div>
              <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-4">
                <SegmentedControl
                  legend={t('横ずれの向き', 'Sideways to the')}
                  orientation="inline"
                  value={lateral.side}
                  options={[
                    { value: 'right', label: t('右', 'Right') },
                    { value: 'left', label: t('左', 'Left') },
                  ]}
                  onChange={(value) => setLateral({ ...lateral, side: value as LateralSide })}
                />
                <NumberField
                  label={t('横ずれ（任意）', 'Sideways offset (optional)')}
                  value={lateral.value}
                  onChange={(value) => setLateral({ ...lateral, value })}
                  units={measureUnits}
                  min={0}
                  invalid={lateralInvalid}
                  errorText={nonNegativeError}
                  hint={t('上の群の中心から縦線まで。線上なら 0', 'Upper group centre to the line; 0 if on it')}
                />
              </div>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {t('補正係数と実効クリック値', 'Correction factor and true click value')}
              </h2>
              <ResultPanel className="sm:grid-cols-2">
                <ResultFigure
                  size="lead"
                  label={t('補正係数（期待 ÷ 実測）', 'Correction factor (expected ÷ measured)')}
                  value={result ? number(result.correctionFactor, 4) : '—'}
                  note={
                    result
                      ? t(
                          `必要なダイヤル量に掛けます。${number(dial)} ${unitLabel} → ${number(dial * result.correctionFactor, 2)} ${unitLabel}`,
                          `Multiply the dial you need by this. ${number(dial)} ${unitLabel} → ${number(dial * result.correctionFactor, 2)} ${unitLabel}`,
                        )
                      : undefined
                  }
                />
                <ResultFigure
                  label={t('実効クリック値', 'True click value')}
                  value={result ? number(result.effectiveClick, 4) : '—'}
                  unit={result ? unitLabel : undefined}
                  note={
                    result
                      ? t(
                          `公称 ${number(result.nominalClick, 3)} ${unitLabel}・追従率 ${number(result.trackingRatio, 4)}`,
                          `Labelled ${number(result.nominalClick, 3)} ${unitLabel}; tracking ratio ${number(result.trackingRatio, 4)}`,
                        )
                      : undefined
                  }
                />
                <ResultFigure
                  label={t('誤差', 'Error')}
                  value={result ? signed(result.errorPercent) : '—'}
                  unit={result ? '%' : undefined}
                  note={
                    result ? (
                      <>
                        <span className="block">{errorSentence(result.errorPercent)}</span>
                        <span className="block">
                          {t(
                            `実測 1 mm の読み違いで約 ${number(result.percentPerMm, 3)} ポイント変わります。`,
                            `A 1 mm misread moves it by about ${number(result.percentPerMm, 3)} points.`,
                          )}
                        </span>
                      </>
                    ) : undefined
                  }
                />
                <ResultFigure
                  label={t('期待移動量', 'Expected travel')}
                  value={expectedMm === null ? '—' : number(expectedMm, 1)}
                  unit={expectedMm === null ? undefined : 'mm'}
                  note={
                    expectedMm === null
                      ? undefined
                      : result
                        ? t(
                            `${number(mmToInch(expectedMm), 2)} inch／実測 ${number(result.measuredMm, 1)} mm`,
                            `${number(mmToInch(expectedMm), 2)} inch; measured ${number(result.measuredMm, 1)} mm`,
                          )
                        : `${number(mmToInch(expectedMm), 2)} inch`
                  }
                />
              </ResultPanel>
              {!result && <p className="text-sm text-destructive">{emptyText}</p>}
              {result && (
                <div className="space-y-3 text-sm">
                  {!Number.isInteger(Math.round(result.clicksDialled * 1e6) / 1e6) && (
                    <p className="text-destructive">
                      {t(
                        `ダイヤル量が ${number(result.clicksDialled, 2)} クリックになり、クリック値の整数倍ではありません。回したクリック数 × クリック値を入力してください。`,
                        `The dial comes to ${number(result.clicksDialled, 2)} clicks, not a whole number. Enter the clicks turned × the click value.`,
                      )}
                    </p>
                  )}
                  {result.tiltDegrees !== null && result.tiltSide !== null && (
                    <p>
                      {t(
                        `横ずれから見た傾き：縦線から${sideName(result.tiltSide)}へ約 ${number(result.tiltDegrees, 2)}°。縦線の傾き、キャント、調整機構のどれが原因かは区別できません。`,
                        `Tilt from the sideways offset: about ${number(result.tiltDegrees, 2)}° to the ${sideName(result.tiltSide)} of the line. A line that is not plumb, cant and the turret cannot be told apart.`,
                      )}
                    </p>
                  )}
                  <p className="text-on-surface-variant">
                    {t(
                      `弾道計算ソフトに入れるときは、補正係数と追従率（逆数）のどちらを使うか説明書で確かめてください。逆に入れるとずれが約 2 倍になります。`,
                      `Check your ballistic program's manual for whether it takes the correction factor or the tracking ratio (its reciprocal); the wrong one roughly doubles the error.`,
                    )}
                  </p>
                </div>
              )}
            </Card>
          }
          extras={
            <>
              <ConditionSection id="print" title={t('縦長標的の印刷', 'Print the tall target')} summary={printSummary}>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '中央の縦線に、狙点からの高さを 1 mm 目盛りで入れます。高さ = 期待移動量 × 1.1 + 30 mm。',
                    'A centre line marked in millimetres above the aim point. Height = expected travel × 1.1 + 30 mm.',
                  )}
                </p>
                {layout && !layout.fits && (
                  <p role="alert" className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                    {t(
                      `A4 ${MAX_PAGES} 枚を超えるため、印刷用の標的は作りません。距離かダイヤル量を減らしてください。`,
                      `More than ${MAX_PAGES} A4 sheets, so no target is made. Use a shorter distance or a smaller dial.`,
                    )}
                  </p>
                )}
                {layout?.fits && (
                  <>
                    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {layout.pages.map((page) => (
                        <li key={page.index} className="rounded-sm bg-surface-container p-2">
                          <TallTargetSheet
                            layout={layout}
                            page={page}
                            text={sheetText}
                            label={t(
                              `印刷する標的のプレビュー ${page.index + 1} / ${layout.pageCount} 枚目`,
                              `Print preview, sheet ${page.index + 1} of ${layout.pageCount}`,
                            )}
                            className="w-full drop-shadow-sm"
                          />
                        </li>
                      ))}
                    </ol>
                    <p className="text-xs text-on-surface-variant">
                      {t('プレビューは実寸ではありません。', 'Preview, not actual size.')}
                    </p>
                    <Button className="w-full" onClick={() => window.print()}>
                      <LuPrinter aria-hidden="true" />
                      {t(`${layout.pageCount} 枚を印刷する`, `Print ${layout.pageCount} sheets`)}
                    </Button>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-on-surface-variant">
                      <li>
                        {t(
                          '「実際のサイズ（100%）」で印刷。「用紙に合わせる」は解除し、余白なし、ヘッダー・フッターはオフ。',
                          'Print at Actual size (100%) with “Fit to page” off, no margins, and no headers or footers.',
                        )}
                      </li>
                      <li>
                        {t(
                          `各用紙の ${REFERENCE_LINE_MM} mm 基準線を定規で測り、拡大・縮小されていないか確かめます。`,
                          `Measure the ${REFERENCE_LINE_MM} mm reference line on each sheet to check for scaling.`,
                        )}
                      </li>
                      <li>
                        {t(
                          '下の用紙を上端の合わせ線で切り、上の用紙の同じ番号の合わせ線に重ねて、縦線をまっすぐにつないで貼ります。',
                          'Trim each lower sheet at its top join line and glue it over the sheet above, matching the numbered join lines and keeping the centre line straight.',
                        )}
                      </li>
                    </ul>
                  </>
                )}
              </ConditionSection>

              <ConditionSection
                id="method"
                title={t('テストの手順と計算式', 'How to run the test')}
                summary={t(
                  '縦線の下を狙って撃ち、30 MOA 以上上げて同じ狙点をもう一度撃ちます。',
                  'Shoot at the bottom of the line, dial up 30 MOA or more, and shoot the same aim point again.',
                )}
              >
                <ol className="list-decimal space-y-1 pl-5 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '縦線が鉛直になるよう標的を設置する（下げ振りか水準器で確認）。距離は巻き尺か距離計で測る。距離の誤差は同じ割合で結果に入ります。',
                      'Set up the target with the line plumb (check with a plumb bob or a level). Measure the distance with a tape or a rangefinder: a distance error goes into the result in the same proportion.',
                    )}
                  </li>
                  <li>
                    {t(
                      '縦線の下の方の狙点を狙って群を撃ち、ゼロを確かめる。',
                      'Aim at a point near the bottom of the line and shoot a group to confirm zero.',
                    )}
                  </li>
                  <li>
                    {t(
                      '30 MOA（または 10 mil）以上を上へダイヤルし、同じ狙点を狙ってもう一つ群を撃つ。',
                      'Dial up at least 30 MOA (or 10 mil) and shoot another group at the same aim point.',
                    )}
                  </li>
                  <li>
                    {t(
                      '2 つの群の中心どうしの間隔を、縦線に沿って測る。',
                      'Measure between the two group centres, along the line.',
                    )}
                  </li>
                </ol>
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '期待移動量 = 距離 × tan(ダイヤル量の角度)。1 MOA = π/10800 rad（1/60 度）、1 mil = 1/1000 rad。',
                      'Expected travel = distance × tan(dialled angle), with 1 MOA = π/10800 rad (1/60 degree) and 1 mil = 1/1000 rad.',
                    )}
                  </li>
                  <li>
                    {t(
                      '補正係数 = 期待 ÷ 実測。追従率 = 実測 ÷ 期待。実効クリック値 = 公称クリック値 × 追従率。誤差 = (実測 − 期待) ÷ 期待 × 100。傾き = atan(横ずれ ÷ 実測移動量)。',
                      'Correction factor = expected ÷ measured. Tracking ratio = measured ÷ expected. True click = labelled click × tracking ratio. Error = (measured − expected) ÷ expected × 100. Tilt = atan(sideways ÷ measured travel).',
                    )}
                  </li>
                  <li>
                    {t(
                      '出典の記入例（102 yd・30 MOA・実測 29.8 inch）：期待移動量 32.04 inch・補正係数 1.075。このツールでは 32.05 inch・1.0753。差は出典の比例式と丸めた定数によるもので、100 MOA でも 0.05% 未満です。',
                      "Source worked example (30 MOA at 102 yd, 29.8 in measured): 32.04 in expected, factor 1.075. This tool: 32.05 in, 1.0753. The difference comes from the source's linear formula and rounded constants, and is under 0.05% even at 100 MOA.",
                    )}
                  </li>
                  <li>
                    {t('出典：', 'Source: ')}
                    <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="underline" lang="en">
                      Applied Ballistics, “Tall Target Test Worksheet” (2021)
                    </a>
                    {t(
                      `（手順・換算定数・補正係数の定義・記入例）。確認日 ${CHECKED_ON}。`,
                      ` (procedure, constants, correction factor, worked example). Checked ${CHECKED_ON}.`,
                    )}
                  </li>
                </ul>
              </ConditionSection>

              <p className="text-xs text-on-surface-variant">
                {storageAvailable && t('入力はこのブラウザーに保存されます。', 'Inputs are saved in this browser. ')}
                {t(
                  '射撃は法令と射撃場の規則に従い、安全な方向・射座で行ってください。',
                  'Follow the law and the range rules, and shoot in a safe direction from a safe position.',
                )}
              </p>
            </>
          }
        />
      </div>
      {canPrint && (
        <div className={styles.sheets}>
          {layout.pages.map((page) => (
            <div key={page.index} className={styles.page}>
              <TallTargetSheet layout={layout} page={page} text={sheetText} actualSize className="block" />
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
