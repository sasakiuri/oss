'use client';

import { useEffect, useId, useState } from 'react';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  SegmentedControl,
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import type { DragModel, SpeedUnit } from '@/lib/trajectory';
import { convertSpeedValue } from '@/lib/trajectory-units';
import {
  CLOCK_HOURS,
  attemptsByHour,
  createQuestion,
  holdAnswer,
  judgeAnswer,
  questionDistances,
  weakestHours,
  windValue,
  type ClockHour,
  type WindQuestion,
} from '@/lib/wind-practice';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialWindPracticeSettings, storageKey, useWindPracticeStore } from './_store';

type Side = 'left' | 'right' | null;

/** A clock face with the arrow pointing the way the wind blows, from the hour it comes from. */
function WindClock({ hour, label }: { hour: ClockHour; label: string }) {
  const angle = (hour * Math.PI) / 6;
  const from = { x: 40 * Math.sin(angle), y: -40 * Math.cos(angle) };
  return (
    <svg viewBox="-50 -50 100 100" role="img" aria-label={label} className="mx-auto w-32">
      <circle r={46} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {CLOCK_HOURS.map((mark) => (
        <text
          key={mark}
          x={38 * Math.sin((mark * Math.PI) / 6)}
          y={-38 * Math.cos((mark * Math.PI) / 6)}
          fontSize={8}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
        >
          {mark}
        </text>
      ))}
      {/* The shooter faces twelve o'clock from the centre. */}
      <line x1={0} y1={8} x2={0} y2={-14} stroke="currentColor" strokeWidth={2} />
      <line
        x1={from.x * 0.8}
        y1={from.y * 0.8}
        x2={from.x * 0.15}
        y2={from.y * 0.15}
        stroke="var(--md-sys-color-primary)"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <circle cx={from.x * 0.15} cy={from.y * 0.15} r={4} fill="var(--md-sys-color-primary)" />
    </svg>
  );
}

export function WindPracticeClient() {
  const state = useWindPracticeStore();
  const { kind, load, distanceUnit, windUnit, angleUnit, attempts, setSettings, record, clearAttempts } = state;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [question, setQuestion] = useState<WindQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [side, setSide] = useState<Side>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; expected: string } | null>(null);
  const answerId = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const number = (value: number, digits = 2) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';

  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const speedInvalid = !positive(load.muzzleSpeed.value);
  const bcInvalid =
    !Number.isFinite(load.ballisticCoefficient) || load.ballisticCoefficient < 0.01 || load.ballisticCoefficient > 2;
  const maxSpeedInvalid = !Number.isInteger(state.maxSpeed) || state.maxSpeed < 1 || state.maxSpeed > 30;
  const minInvalid = !positive(state.minDistance);
  const maxInvalid = !positive(state.maxDistance) || state.maxDistance < state.minDistance;
  const stepInvalid = !positive(state.distanceStep);
  const valueToleranceInvalid = !positive(state.valueTolerance) || state.valueTolerance > 50;
  const holdToleranceInvalid = !positive(state.holdTolerance);
  const settingsInvalid =
    speedInvalid ||
    bcInvalid ||
    maxSpeedInvalid ||
    minInvalid ||
    maxInvalid ||
    stepInvalid ||
    valueToleranceInvalid ||
    holdToleranceInvalid;
  const range = {
    maxSpeed: state.maxSpeed,
    minDistance: state.minDistance,
    maxDistance: state.maxDistance,
    distanceStep: state.distanceStep,
  };

  const next = (forKind = kind) => {
    setAnswer('');
    setSide(null);
    setFeedback(null);
    setQuestion(settingsInvalid ? null : createQuestion(forKind, range, Math.random));
  };

  useEffect(() => {
    void Promise.all([useWindPracticeStore.persist.rehydrate(), rehydrateLanguage()]).then(() => {
      const settings = useWindPracticeStore.getState();
      // The first question is drawn in the browser: a random draw on the server would not match.
      setQuestion(
        createQuestion(
          settings.kind,
          {
            maxSpeed: settings.maxSpeed,
            minDistance: settings.minDistance,
            maxDistance: settings.maxDistance,
            distanceStep: settings.distanceStep,
          },
          Math.random,
        ),
      );
      setReady(true);
    });
  }, []);

  const windLabel = windUnit === 'mps' ? 'm/s' : 'mph';
  const angleLabel = angleUnit === 'mil' ? 'mil' : 'MOA';
  const hourText = (hour: ClockHour) => t(`${hour} 時`, `${hour} o’clock`);
  const sideText = (value: Side) => (value === 'left' ? t('左', 'left') : value === 'right' ? t('右', 'right') : '');
  const expected =
    question === null
      ? null
      : question.kind === 'value'
        ? { size: windValue(question.hour) * 100, side: null as Side }
        : holdAnswer(question, load, { distance: distanceUnit, wind: windUnit, angle: angleUnit });
  const needsSide = question?.kind === 'hold' && expected !== null && expected.side !== null;

  const submit = () => {
    if (question === null || expected === null || feedback !== null) return;
    const size = Number(answer);
    const tolerance = question.kind === 'value' ? state.valueTolerance : state.holdTolerance;
    const correct = answer.trim() !== '' && judgeAnswer(expected, { size, side }, tolerance);
    record({ kind: question.kind, hour: question.hour, correct });
    setFeedback({
      correct,
      expected:
        question.kind === 'value'
          ? `${number(expected.size, 0)} %`
          : `${sideText(expected.side)} ${number(expected.size, 2)} ${angleLabel}`.trim(),
    });
  };

  const table = attemptsByHour(attempts);
  const weakest = weakestHours(attempts);
  const total = attempts.length;
  const correctCount = attempts.filter((attempt) => attempt.correct).length;
  const distanceCount = questionDistances(range).length;

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('wind-practice').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '設定と解答の記録を初期値に戻します。',
                  en: 'Resets the settings and the record of answers.',
                }}
                onReset={() =>
                  useWindPracticeStore.setState({
                    ...initialWindPracticeSettings,
                    lastValidSettings: initialWindPracticeSettings,
                  })
                }
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language, 'record') : ''}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} subject="record" />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('記録', 'Record')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="question" className="text-xl font-medium">
                {t('問題', 'Question')}
              </h2>
              <SegmentedControl
                legend={t('練習の種類', 'Practice')}
                orientation="inline"
                value={kind}
                onChange={(value) => {
                  const nextKind = value as WindQuestion['kind'];
                  setSettings({ kind: nextKind });
                  next(nextKind);
                }}
                options={[
                  { value: 'value', label: t('横風の割合', 'Wind value') },
                  { value: 'hold', label: t('ホールド量', 'Hold') },
                ]}
              />
              {question === null ? (
                <p className="text-sm text-destructive">
                  {t('設定のエラーを直してください。', 'Correct the settings with errors.')}
                </p>
              ) : (
                <>
                  <WindClock
                    hour={question.hour}
                    label={t(`${hourText(question.hour)}から吹く風`, `Wind from ${hourText(question.hour)}`)}
                  />
                  <p className="text-lg" id={`${answerId}-question`}>
                    {question.kind === 'value'
                      ? t(
                          `${hourText(question.hour)}から吹く風。射線を横切る割合は何 % ですか。`,
                          `A wind from ${hourText(question.hour)}. What share of it crosses the line of fire, in %?`,
                        )
                      : t(
                          `${number(question.distance, 0)} ${distanceUnit} 先、${hourText(question.hour)}から ${number(question.speed, 0)} ${windLabel} の風。どちらに何 ${angleLabel} 持ちますか。`,
                          `${number(question.distance, 0)} ${distanceUnit}, ${number(question.speed, 0)} ${windLabel} from ${hourText(question.hour)}. How far do you hold, and which way, in ${angleLabel}?`,
                        )}
                  </p>
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submit();
                    }}
                  >
                    <div className="space-y-2">
                      <label htmlFor={answerId} className="block text-sm font-medium">
                        {question.kind === 'value'
                          ? t('答え（%）', 'Answer (%)')
                          : t(`答え（${angleLabel}）`, `Answer (${angleLabel})`)}
                      </label>
                      <input
                        id={answerId}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={answer}
                        disabled={feedback !== null}
                        aria-describedby={`${answerId}-question`}
                        onChange={(event) => setAnswer(event.target.value)}
                      />
                    </div>
                    {needsSide && (
                      <SegmentedControl
                        legend={t('ホールドする向き', 'Hold to the')}
                        orientation="inline"
                        value={side ?? ''}
                        onChange={(value) => setSide(value as Side)}
                        options={[
                          { value: 'left', label: t('左', 'Left') },
                          { value: 'right', label: t('右', 'Right') },
                        ]}
                      />
                    )}
                    {feedback === null ? (
                      <Button type="submit" className="w-full" disabled={answer.trim() === ''}>
                        {t('答える', 'Answer')}
                      </Button>
                    ) : (
                      <Button type="button" className="w-full" onClick={() => next()}>
                        {t('次の問題', 'Next question')}
                      </Button>
                    )}
                  </form>
                  <p role="status" className={feedback ? 'text-base font-medium' : ''}>
                    {feedback === null
                      ? ''
                      : feedback.correct
                        ? t(`正解。答えは ${feedback.expected} です。`, `Correct. The answer is ${feedback.expected}.`)
                        : t(`不正解。答えは ${feedback.expected} です。`, `Wrong. The answer is ${feedback.expected}.`)}
                  </p>
                </>
              )}
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 sm:p-6">
              <h2 id="record" className="text-xl font-medium">
                {t('風向きごとの成績', 'Results by direction')}
              </h2>
              <p className="text-sm">
                {total === 0
                  ? t('まだ解答がありません。', 'No answers yet.')
                  : t(
                      `直近 ${total} 問中 ${correctCount} 問正解。`,
                      `${correctCount} of the last ${total} answers correct.`,
                    )}
                {weakest.length > 0 &&
                  t(
                    ` 苦手な風向き: ${weakest.map(hourText).join('・')}`,
                    ` Weakest directions: ${weakest.map(hourText).join(', ')}`,
                  )}
              </p>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="py-1 text-left font-medium">
                      {t('風向き', 'From')}
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      {t('正解 / 解答', 'Correct / asked')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CLOCK_HOURS.map((hour) => (
                    <tr key={hour} className="border-t border-outline-variant">
                      <th scope="row" className="py-1 text-left font-normal">
                        {hourText(hour)}
                      </th>
                      <td
                        className={`py-1 text-right tabular-nums ${weakest.includes(hour) ? 'font-medium text-error' : ''}`}
                      >
                        {`${table[hour].correct} / ${table[hour].attempts}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button variant="outline" onClick={clearAttempts} disabled={total === 0}>
                {t('記録を消す', 'Clear the record')}
              </Button>
            </Card>
          }
          secondary={
            <ConditionSection
              id="settings"
              title={t('弾と問題の範囲', 'Load and question range')}
              summary={t(
                `初速 ${number(load.muzzleSpeed.value, 0)} ${load.muzzleSpeed.unit === 'mps' ? 'm/s' : 'fps'}・BC ${number(load.ballisticCoefficient, 3)} ${load.dragModel.toUpperCase()}・${number(state.minDistance, 0)}〜${number(state.maxDistance, 0)} ${distanceUnit}・風 ${state.maxSpeed} ${windLabel} まで`,
                `${number(load.muzzleSpeed.value, 0)} ${load.muzzleSpeed.unit === 'mps' ? 'm/s' : 'fps'} · BC ${number(load.ballisticCoefficient, 3)} ${load.dragModel.toUpperCase()} · ${number(state.minDistance, 0)}–${number(state.maxDistance, 0)} ${distanceUnit} · wind to ${state.maxSpeed} ${windLabel}`,
              )}
              forceOpen={settingsInvalid}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label={t('初速', 'Muzzle velocity')}
                  value={load.muzzleSpeed.value}
                  onChange={(value) => setSettings({ load: { ...load, muzzleSpeed: { ...load.muzzleSpeed, value } } })}
                  units={{
                    value: load.muzzleSpeed.unit,
                    label: t('初速の単位', 'Velocity unit'),
                    options: [
                      { value: 'mps', label: 'm/s' },
                      { value: 'fps', label: 'fps' },
                    ],
                    onChange: (unit: SpeedUnit) =>
                      setSettings({
                        load: {
                          ...load,
                          muzzleSpeed: {
                            value: convertSpeedValue(load.muzzleSpeed.value, load.muzzleSpeed.unit, unit),
                            unit,
                          },
                        },
                      }),
                  }}
                  min={0}
                  invalid={speedInvalid}
                  errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                />
                <NumberField
                  label={t('弾道係数 BC', 'Ballistic coefficient')}
                  value={load.ballisticCoefficient}
                  onChange={(ballisticCoefficient) => setSettings({ load: { ...load, ballisticCoefficient } })}
                  units={{
                    value: load.dragModel,
                    label: t('抗力モデル', 'Drag function'),
                    options: [
                      { value: 'g1', label: 'G1' },
                      { value: 'g7', label: 'G7' },
                    ],
                    onChange: (dragModel: DragModel) => setSettings({ load: { ...load, dragModel } }),
                  }}
                  min={0.01}
                  max={2}
                  invalid={bcInvalid}
                  errorText={t('0.01 から 2 の範囲で入力してください。', 'Enter a coefficient between 0.01 and 2.')}
                />
                <NumberField
                  label={t('いちばん近い距離', 'Nearest distance')}
                  value={state.minDistance}
                  onChange={(minDistance) => setSettings({ minDistance })}
                  units={{
                    value: distanceUnit,
                    label: t('距離の単位', 'Distance unit'),
                    options: [
                      { value: 'm', label: 'm' },
                      { value: 'yd', label: 'yd' },
                    ],
                    onChange: (unit: 'm' | 'yd') => setSettings({ distanceUnit: unit }),
                  }}
                  min={0}
                  invalid={minInvalid}
                  errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                />
                <NumberField
                  label={t('いちばん遠い距離', 'Furthest distance')}
                  unit={distanceUnit}
                  value={state.maxDistance}
                  onChange={(maxDistance) => setSettings({ maxDistance })}
                  min={0}
                  invalid={maxInvalid}
                  errorText={t('近い距離以上の数値を入力してください。', 'Enter at least the nearest distance.')}
                />
                <NumberField
                  label={t('距離の刻み', 'Distance step')}
                  unit={distanceUnit}
                  value={state.distanceStep}
                  onChange={(distanceStep) => setSettings({ distanceStep })}
                  min={0}
                  invalid={stepInvalid}
                  errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                  hint={t(`${distanceCount} 通りの距離から出題`, `Questions from ${distanceCount} distances`)}
                />
                <NumberField
                  label={t('最大の風速', 'Strongest wind')}
                  value={state.maxSpeed}
                  onChange={(maxSpeed) => setSettings({ maxSpeed })}
                  units={{
                    value: windUnit,
                    label: t('風速の単位', 'Wind speed unit'),
                    options: [
                      { value: 'mps', label: 'm/s' },
                      { value: 'mph', label: 'mph' },
                    ],
                    onChange: (unit: 'mps' | 'mph') => setSettings({ windUnit: unit }),
                  }}
                  min={1}
                  max={30}
                  step={1}
                  invalid={maxSpeedInvalid}
                  errorText={t('1 から 30 の整数を入力してください。', 'Enter a whole number from 1 to 30.')}
                />
                <SelectField
                  label={t('ホールドの単位', 'Hold unit')}
                  value={angleUnit}
                  onChange={(value) => setSettings({ angleUnit: value as 'mil' | 'moa' })}
                  options={[
                    { value: 'mil', label: 'mil' },
                    { value: 'moa', label: 'MOA' },
                  ]}
                />
                <NumberField
                  label={t('ホールドの許容差', 'Hold tolerance')}
                  unit={angleLabel}
                  value={state.holdTolerance}
                  onChange={(holdTolerance) => setSettings({ holdTolerance })}
                  min={0}
                  invalid={holdToleranceInvalid}
                  errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                />
                <NumberField
                  label={t('割合の許容差', 'Wind value tolerance')}
                  unit={t('ポイント', 'points')}
                  value={state.valueTolerance}
                  onChange={(valueTolerance) => setSettings({ valueTolerance })}
                  min={0}
                  max={50}
                  invalid={valueToleranceInvalid}
                  errorText={t('0 より大きく 50 以下で入力してください。', 'Enter more than 0 and at most 50.')}
                />
              </div>
            </ConditionSection>
          }
          extras={
            <Card variant="outlined" className="min-w-0 space-y-3 rounded-md p-5 sm:p-6 lg:col-span-2">
              <h2 id="method" className="text-xl font-medium">
                {t('答えの求め方', 'How the answers are worked out')}
              </h2>
              <ul className="space-y-2 text-sm text-on-surface-variant">
                <li>
                  {t(
                    '横風の割合は、風向きと射線のなす角の正弦です。3 時・9 時は 100 %（フルバリュー）、1・5・7・11 時は 50 %、2・4・8・10 時は約 87 %、12 時・6 時は 0 % です。',
                    'The wind value is the sine of the angle between the wind and the line of fire: 3 and 9 o’clock are 100 % (full value), 1, 5, 7 and 11 are 50 %, 2, 4, 8 and 10 about 87 %, and 12 and 6 none.',
                  )}
                </li>
                <li>
                  {t(
                    `ホールド量 = 真横の風 1 m/s での風偏 × 風速 × 割合。風偏は「${labsTool('trajectory').title.ja}」と同じ質点モデルで、標準大気、100 m ゼロイン、スコープ高 40 mm として求めます。`,
                    `Hold = drift in a 1 m/s full-value wind × wind speed × wind value. The drift comes from the ${labsTool('trajectory').title.en}’s point-mass model with the standard atmosphere, a 100 m zero and a 40 mm sight height.`,
                  )}
                </li>
                <li>
                  {t(
                    'ホールドは風上へ取ります。右から吹く風（1〜5 時）では右へ、左から吹く風（7〜11 時）では左へ持ちます。',
                    'Hold into the wind: to the right for a wind from the right (1 to 5 o’clock), to the left for a wind from the left (7 to 11).',
                  )}
                </li>
              </ul>
            </Card>
          }
        />
      </div>
    </AppLayout>
  );
}
