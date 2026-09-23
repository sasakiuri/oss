'use client';

import { useEffect, useState } from 'react';
import { LuDownload, LuLoader } from 'react-icons/lu';

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
  SelectField,
  ToolLayout,
  discardedSaveMessage,
  type DiscardedSaveSubject,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave } from '@/lib/browser-storage';
import { getTargetLayout, type TargetPaper } from '@/lib/home-target';
import { labsTool } from '@/lib/labs-tools';
import { targetRequestSchema, type TargetCopies } from '@/lib/schemas/home-target';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import {
  TARGET_STORAGE_KEY,
  useHomeTargetStore,
  calculateHeightOfTarget,
  calculateBlackAreaSize,
  targetSettingsSchema,
  type Length,
} from './_store';
import { disciplineMap } from './disciplines';
import { SavedSetups } from './saved-setups';
import { readSettingsHash } from './share';

/** A length in the unit it is stored in. The unit is part of the saved value and has no picker. */
function LengthField({
  label,
  value,
  onChange,
  allowZero = false,
  errorText,
  hint,
}: {
  label: string;
  value: Length;
  onChange: (value: Length) => void;
  allowZero?: boolean;
  errorText: string;
  hint?: string;
}) {
  const invalid = !Number.isFinite(value.number) || (allowZero ? value.number < 0 : value.number <= 0);
  return (
    <NumberField
      label={label}
      unit={value.unit}
      value={value.number}
      min={0}
      onChange={(number) => onChange({ ...value, number })}
      invalid={invalid}
      errorText={errorText}
      hint={hint}
    />
  );
}

export function HomeTargetClient() {
  const state = useHomeTargetStore();
  const {
    heightOfEye,
    distanceToTarget,
    discipline,
    paper,
    copies,
    showConditions,
    setCopies,
    setShowConditions,
    setHeightOfEye,
    setDistanceToTarget,
    setDiscipline,
    setPaper,
  } = state;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const [ready, setReady] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  // Both wordings, picked at render, so the message follows a language change.
  const [feedback, setFeedback] = useState<{ error: boolean; ja: string; en: string } | null>(null);
  const [sharedStatus, setSharedStatus] = useState<'loaded' | 'invalid' | null>(null);
  const discarded = useDiscardedSave(TARGET_STORAGE_KEY);
  // A shared link fills the form, so the notice must not claim the defaults are on screen.
  const discardedSubject: DiscardedSaveSubject = sharedStatus === 'loaded' ? 'settings-shared' : 'settings';
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const height = calculateHeightOfTarget(heightOfEye, distanceToTarget, discipline);
  const diameter = calculateBlackAreaSize(distanceToTarget, discipline);
  const validSettings = targetSettingsSchema.safeParse(state).success;
  const printOptions = {
    copies,
    ...(showConditions
      ? {
          conditions: {
            eyeCm: heightOfEye.number * { mm: 0.1, cm: 1, m: 100 }[heightOfEye.unit],
            distanceCm: distanceToTarget.number * { mm: 0.1, cm: 1, m: 100 }[distanceToTarget.unit],
            heightCm: height,
          },
        }
      : {}),
  };
  const validTarget =
    validSettings &&
    targetRequestSchema.safeParse({ blackAreaSize: { number: diameter, unit: 'cm' }, paper, ...printOptions }).success;
  const layout = getTargetLayout(diameter * 10, paper, printOptions);
  const canDownload = validTarget && layout.fits;
  // A bare dash, not "— cm", for no answer yet.
  const formatCm = (value: number) =>
    Number.isFinite(value) && validSettings
      ? `${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value)} cm`
      : '—';
  const custom = discipline.key === 'CUSTOM';
  const lengthNumber = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const lengthText = (value: Length) =>
    Number.isFinite(value.number) ? `${lengthNumber.format(value.number)} ${value.unit}` : '—';
  const dimensionRows: [string, string][] = [
    [t('距離', 'Distance'), lengthText(discipline.distance)],
    [t('中心の高さ', 'Center height'), lengthText(discipline.heightOfTarget)],
    [t('黒丸の直径', 'Black circle'), lengthText(discipline.blackAreaSize)],
  ];
  const dimensionsSummary = dimensionRows.map(([label, value]) => `${label} ${value}`).join(t('・', ' · '));
  const paperLabel = { a4: 'A4', letter: 'Letter', target: t('標的に合わせる', 'Fit to target') }[paper];
  const printSummary = [
    paperLabel,
    t(`1 ページに ${copies} 個`, `${copies} per page`),
    showConditions ? t('設置条件を印字', 'setup printed') : t('設置条件は印字しない', 'no setup notes'),
  ].join(t('・', ' · '));
  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');

  useEffect(() => {
    const loadSharedSettings = () => {
      try {
        const settings = readSettingsHash(window.location.hash);
        if (settings) {
          useHomeTargetStore.getState().applySettings(settings);
          setSharedStatus('loaded');
        }
      } catch {
        setSharedStatus('invalid');
      }
    };
    void Promise.all([useHomeTargetStore.persist.rehydrate(), rehydrateLanguage()]).then(() => {
      loadSharedSettings();
      setReady(true);
    });
    window.addEventListener('hashchange', loadSharedSettings);
    return () => window.removeEventListener('hashchange', loadSharedSettings);
  }, []);

  const download = async () => {
    if (!canDownload || isDownloading) return;
    setIsDownloading(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/home-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blackAreaSize: { number: diameter, unit: 'cm' }, paper, ...printOptions }),
      });
      // Set here, not thrown, so the message follows a language change.
      if (!response.ok) {
        setFeedback(
          response.status === 429
            ? {
                error: true,
                ja: '作成回数が多すぎます。少し待ってからお試しください。',
                en: 'Too many requests. Wait a moment and try again.',
              }
            : {
                error: true,
                ja: 'PDF を作成できませんでした。もう一度お試しください。',
                en: 'Could not create the PDF. Try again.',
              },
        );
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `Home_Target_${paper}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({
        error: false,
        ja: 'PDF を作成しました。',
        en: 'PDF created.',
      });
    } catch {
      // Network failures; HTTP errors are handled above.
      setFeedback({
        error: true,
        ja: '通信できませんでした。接続を確認してください。',
        en: 'Could not connect. Check your connection and try again.',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('home-target').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: 'すべての入力を初期値に戻します。名前を付けて保存した設定は残ります。',
                  en: 'All inputs return to their defaults. Named setups are kept.',
                }}
                onReset={() => useHomeTargetStore.getState().reset()}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty so later text is announced. */}
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language, discardedSubject) : ''}
      </p>
      {/* Mounted empty so later text is announced. */}
      <p role="status" className={sharedStatus ? 'mb-4 text-sm' : ''}>
        {sharedStatus === 'loaded'
          ? t('共有リンクの条件を読み込みました。', 'Loaded the shared setup.')
          : sharedStatus === 'invalid'
            ? t(
                '共有リンクの条件を読み込めませんでした。保存済みの条件を表示しています。',
                'Could not read the shared link. Showing your saved settings.',
              )
            : ''}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        {/* At the top, not with the saved setups, so a lost setup is noticed. */}
        <DiscardedSaveNotice storageKey={TARGET_STORAGE_KEY} language={language} subject={discardedSubject} />
        <ToolLayout
          resultLabel={t('計算結果', 'Results')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="setup" className="text-xl font-medium">
                {t('設置条件', 'Target setup')}
              </h2>
              <SelectField
                fieldId="discipline"
                label={t('競技種目', 'Discipline')}
                value={discipline.key}
                onChange={(key) =>
                  setDiscipline(disciplineMap.get(key) ?? { ...discipline, name: 'Custom', key: 'CUSTOM' })
                }
                options={[
                  ...Array.from(disciplineMap.values()).map((item) => ({ value: item.key, label: item.name })),
                  { value: 'CUSTOM', label: t('カスタム（寸法を指定）', 'Custom dimensions') },
                ]}
              />
              {/* Two short numbers, side by side even on a phone. */}
              <div className="grid grid-cols-2 gap-4">
                <LengthField
                  label={t('目の高さ', 'Eye height')}
                  value={heightOfEye}
                  onChange={setHeightOfEye}
                  errorText={positiveError}
                  hint={t('構えたときの、床から目まで', 'Floor to eye, in your shooting position')}
                />
                <LengthField
                  label={t('標的までの距離', 'Distance to target')}
                  value={distanceToTarget}
                  onChange={setDistanceToTarget}
                  errorText={positiveError}
                  hint={t('目から標的まで', 'From your eye to the target')}
                />
              </div>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {t('標的の掛け方', 'Where to hang it')}
              </h2>
              {/* The height leads: it is set by hand, while the diameter is already in the PDF. */}
              <div aria-live="polite">
                <ResultPanel className="grid-cols-2">
                  <ResultFigure
                    size="lead"
                    label={t('標的の中心の高さ', 'Target center height')}
                    value={formatCm(height)}
                    note={t('床から', 'Above the floor')}
                  />
                  <ResultFigure label={t('黒丸の直径', 'Black circle diameter')} value={formatCm(diameter)} />
                </ResultPanel>
              </div>
              {validSettings && height < 0 && (
                <p className="text-sm text-destructive">
                  {t(
                    '標的の中心が床より下になります。入力を確認してください。',
                    'The target center is below the floor. Check your inputs.',
                  )}
                </p>
              )}
              {canDownload ? (
                <figure className="space-y-2 rounded-sm bg-surface-container p-4">
                  <svg
                    viewBox={`0 0 ${layout.width} ${layout.height}`}
                    role="img"
                    aria-label={t('印刷する標的のプレビュー', 'Print preview of the target')}
                    className="mx-auto max-h-48 w-full drop-shadow-sm lg:max-h-64"
                  >
                    <rect width={layout.width} height={layout.height} fill="white" />
                    {layout.centers.map((center, index) => (
                      <circle key={index} cx={center.x} cy={center.y} r={layout.diameter / 2} fill="black" />
                    ))}
                    {layout.labels.map((label, index) => (
                      <text key={label} x={10} y={layout.height - 40 + index * 6} fontSize="2.82" fill="black">
                        {label}
                      </text>
                    ))}
                    <path
                      d={`M ${layout.rulerX} ${layout.rulerY} h 50`}
                      fill="none"
                      stroke="black"
                      strokeWidth="0.25"
                    />
                    {Array.from({ length: 6 }, (_, index) => (
                      <path
                        key={index}
                        d={`M ${layout.rulerX + index * 10} ${layout.rulerY - 2} v 4`}
                        stroke="black"
                        strokeWidth="0.25"
                      />
                    ))}
                    <text x={layout.rulerX} y={layout.rulerY + 8} fontSize="2.82" fill="black">
                      50 mm - Print at 100%
                    </text>
                  </svg>
                  <figcaption className="text-center text-xs text-on-surface-variant">
                    {t('プレビューは実寸ではありません。', 'Preview, not actual size.')}
                  </figcaption>
                </figure>
              ) : (
                <p className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                  {!validSettings
                    ? t('入力を確認してください。', 'Check the values above.')
                    : !validTarget
                      ? t(
                          '黒丸の直径が 0 より大きく 100 cm 以下になるよう、距離や寸法を見直してください。',
                          'Adjust the distance or dimensions so the black circle is over 0 and at most 100 cm.',
                        )
                      : t(
                          'この用紙には収まりません。標的数を減らすか、用紙を「標的に合わせる」にしてください。',
                          'The targets do not fit. Reduce the count or set the paper to “Fit to target”.',
                        )}
                </p>
              )}
              <Button className="w-full" onClick={download} disabled={!canDownload || isDownloading}>
                {isDownloading ? (
                  <LuLoader className="animate-spin" aria-hidden="true" />
                ) : (
                  <LuDownload aria-hidden="true" />
                )}
                {isDownloading ? t('PDF を作成中…', 'Creating PDF…') : t('PDF をダウンロード', 'Download PDF')}
              </Button>
              {/* Mounted empty so later text is announced; only the urgency changes. */}
              <p
                role="status"
                aria-live={feedback?.error ? 'assertive' : 'polite'}
                className={
                  feedback ? `text-sm ${feedback.error ? 'text-destructive' : 'text-on-surface-variant'}` : 'sr-only'
                }
              >
                {feedback ? t(feedback.ja, feedback.en) : ''}
              </p>
              <div className="space-y-1 text-xs text-on-surface-variant">
                <p>
                  {t(
                    '印刷は「実際のサイズ（100%）」を選び、「用紙に合わせる」は解除してください。',
                    'Print at actual size (100%) with “Fit to page” off.',
                  )}
                </p>
                <p>
                  {t(
                    '印刷後、確認用の線が 50 mm あるか定規で確かめます。',
                    'Then check that the reference line measures 50 mm.',
                  )}
                </p>
                {paper === 'target' && (
                  <p>
                    {t(
                      '印刷設定で用紙サイズをカスタムにしてください。',
                      'Set a custom paper size in the print settings.',
                    )}
                  </p>
                )}
              </div>
            </Card>
          }
          secondary={
            <>
              <ConditionSection
                id="dimensions"
                title={t('競技種目の寸法', 'Discipline dimensions')}
                summary={dimensionsSummary}
                // Custom dimensions are inputs, so the section stays open.
                forceOpen={custom}
              >
                {custom ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <LengthField
                      label={t('競技の距離', 'Competition distance')}
                      value={discipline.distance}
                      onChange={(value) => setDiscipline({ ...discipline, distance: value })}
                      errorText={positiveError}
                    />
                    <LengthField
                      label={t('競技の標的中心の高さ', 'Competition target height')}
                      value={discipline.heightOfTarget}
                      onChange={(value) => setDiscipline({ ...discipline, heightOfTarget: value })}
                      allowZero
                      errorText={t('0 以上の数値を入力してください。', 'Enter a number of zero or more.')}
                    />
                    <LengthField
                      label={t('競技の黒丸の直径', 'Competition black circle diameter')}
                      value={discipline.blackAreaSize}
                      onChange={(value) => setDiscipline({ ...discipline, blackAreaSize: value })}
                      errorText={positiveError}
                    />
                  </div>
                ) : (
                  <>
                    {/* Fixed by the discipline's rules, so shown as text. */}
                    <dl className="grid grid-cols-3 gap-4 text-sm">
                      {dimensionRows.map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-on-surface-variant">{label}</dt>
                          <dd className="mt-1 text-base font-medium tabular-nums">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-xs text-on-surface-variant">
                      {t(
                        '変えるには、競技種目で「カスタム（寸法を指定）」を選びます。',
                        'To change them, choose “Custom dimensions” as the discipline.',
                      )}
                    </p>
                  </>
                )}
              </ConditionSection>
              <ConditionSection
                id="print-settings"
                title={t('印刷の設定', 'Print settings')}
                summary={printSummary}
                // Opens when the targets do not fit, since the fix is in here.
                forceOpen={validTarget && !layout.fits}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    fieldId="paper"
                    label={t('用紙サイズ', 'Paper size')}
                    value={paper}
                    onChange={(value) => setPaper(value as TargetPaper)}
                    options={[
                      { value: 'a4', label: 'A4 (210 × 297 mm)' },
                      { value: 'letter', label: 'Letter (215.9 × 279.4 mm)' },
                      { value: 'target', label: t('標的に合わせる（カスタム用紙）', 'Fit to target (custom paper)') },
                    ]}
                  />
                  <SelectField
                    fieldId="copies"
                    label={t('1 ページの標的数', 'Targets per page')}
                    value={String(copies)}
                    onChange={(value) => setCopies(Number(value) as TargetCopies)}
                    options={[1, 2, 4, 6].map((count) => ({ value: String(count), label: String(count) }))}
                  />
                </div>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={showConditions}
                    onChange={(e) => setShowConditions(e.target.checked)}
                  />
                  {t('設置条件を余白に印字（英語）', 'Print setup conditions in the margin')}
                </label>
              </ConditionSection>
              <SavedSetups />
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
