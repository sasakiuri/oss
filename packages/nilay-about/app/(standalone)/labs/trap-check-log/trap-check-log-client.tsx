'use client';

import { useEffect, useId, useState } from 'react';
import { flushSync } from 'react-dom';
import { LuCalendarPlus, LuDownload, LuLocateFixed, LuPlus, LuPrinter, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  LanguageMenu,
  NumberField,
  ResetButton,
  ResultFigure,
  ResultPanel,
  ToolLayout,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import { savedAsShown } from '@/lib/persisted-store';
import { deleteToolPhotos } from '@/lib/photo-storage';
import {
  INTERVAL_HOURS_MAX,
  INTERVAL_HOURS_MIN,
  TRAP_KINDS,
  TRAP_MAX_COUNT,
  TRAP_NAME_MAX_LENGTH,
  TRAP_TEXT_MAX_LENGTH,
  intervalHoursSchema,
  validateTrapDraft,
  type TrapDraft,
  type TrapDraftError,
  type TrapDraftField,
  type TrapKind,
} from '@/lib/schemas/trap-check-log';
import {
  TRAP_KIND_LABELS,
  buildTrapCheckCsv,
  currentLocalMinute,
  orderForRound,
  summarizeTraps,
  toLocalDateTime,
} from '@/lib/trap-check-log';
import { buildDailyReport, buildTrapIcs, monthOf } from '@/lib/trap-check-report';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { DEFAULT_INTERVAL_HOURS, TRAP_CHECK_LOG_STORAGE_KEY, useTrapCheckLogStore } from './_store';
import { positionErrorText, readPosition, type PositionError } from './read-position';
import { TrapCard, fieldClass } from './trap-card';
import { TrapCheckLogSheet } from './trap-check-log-sheet';
import { DailyReportSheet, WorkReport } from './work-report';

// Elapsed times are re-read against the clock at this interval.
const CLOCK_TICK_MS = 30_000;
const readClock = () => Date.now();

export const GUIDELINE_URL = 'https://www.env.go.jp/nature/choju/plan/plan1.html';
export const KAGAWA_URL = 'https://www.pref.kagawa.lg.jp/midorihozen/shuryo-ryuui.html';
export const AICHI_URL = 'https://www.pref.aichi.jp/soshiki/shizen/syuryoutyuui.html';
const CHECKED_ON = '2026-09-23';

// An empty setting time means the current minute.
const emptyDraft = (): TrapDraft => ({
  name: '',
  kind: 'kukuri',
  installedAt: '',
  location: '',
  latitude: '',
  longitude: '',
});

type Notice = { error: boolean; ja: string; en: string };

// Not the shared notice, which speaks of settings.
export const discardedLogMessage = (language: 'ja' | 'en') =>
  language === 'ja'
    ? '保存されていたわなと見回りの記録を読み取れなかったため、空の状態で開いています。'
    : 'The saved traps and rounds could not be read, so the log opened empty.';

export function TrapCheckLogClient() {
  const { intervalHours, lastValidIntervalHours, traps, work, setIntervalHours, resetInterval, addTrap, clearAll } =
    useTrapCheckLogStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((state) => state.available);
  const storageDiscarded = useDiscardedSave(TRAP_CHECK_LOG_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  // Read after mount: the server's clock and time zone are not the device's.
  const [clockMs, setNowMs] = useState<number | null>(null);
  const nowMs = clockMs ?? 0;
  const [draft, setDraft] = useState<TrapDraft>(emptyDraft);
  // The radius of a position read from the device. Typing over the coordinates drops it.
  const [draftAccuracy, setDraftAccuracy] = useState<number | null>(null);
  const [positionState, setPositionState] = useState<'idle' | 'reading' | PositionError>('idle');
  // The month the daily report shows, and which sheet the next print is for.
  const [reportMonth, setReportMonth] = useState<string | null>(null);
  const [printTarget, setPrintTarget] = useState<'log' | 'report'>('log');
  // Until edited, the setting time follows the clock and is read again on save.
  const [installedAtEdited, setInstalledAtEdited] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<TrapDraftField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  // Both wordings, so the notice follows a later change of language.
  const [notice, setNotice] = useState<Notice | null>(null);
  const [summary, setSummary] = useState('');
  const formId = useId();

  useEffect(() => {
    void Promise.all([useTrapCheckLogStore.persist.rehydrate(), rehydrateLanguage()]).then(() => {
      setNowMs(Date.now());
      setReady(true);
    });
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    // Timers stop in the background, so the clock is read again when the page returns.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNowMs(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const intervalValid = intervalHoursSchema.safeParse(intervalHours).success;
  const counts = summarizeTraps(traps, lastValidIntervalHours, nowMs);
  const ordered = orderForRound(traps, lastValidIntervalHours, nowMs);
  const shownInstalledAt = installedAtEdited ? draft.installedAt : clockMs === null ? '' : toLocalDateTime(clockMs);
  const validation = validateTrapDraft({ ...draft, installedAt: shownInstalledAt });

  const summaryMessage =
    !ready || counts.active === 0
      ? ''
      : counts.overdue > 0
        ? t(
            `設置中 ${counts.active} 基のうち ${counts.overdue} 基が、見回り間隔 ${lastValidIntervalHours} 時間を過ぎています。`,
            `${counts.overdue} of ${counts.active} set traps are past the ${lastValidIntervalHours}-hour interval.`,
          )
        : t(
            `設置中 ${counts.active} 基。見回り間隔 ${lastValidIntervalHours} 時間を過ぎたわなはありません。`,
            `${counts.active} traps set. None is past the ${lastValidIntervalHours}-hour interval.`,
          );

  // Announced once typing settles.
  useEffect(() => {
    const timer = setTimeout(() => setSummary(summaryMessage), 700);
    return () => clearTimeout(timer);
  }, [summaryMessage]);

  const draftError = (field: TrapDraftField) =>
    touched[field] || submitted ? (validation.valid ? undefined : validation.errors[field]) : undefined;

  const errorText = (field: TrapDraftField, error: TrapDraftError) => {
    switch (error) {
      case 'required':
        return t('入力してください。', 'Enter this item.');
      case 'tooLong':
        return field === 'name'
          ? t(
              `${TRAP_NAME_MAX_LENGTH} 文字以内で入力してください。`,
              `Use ${TRAP_NAME_MAX_LENGTH} characters or fewer.`,
            )
          : t(
              `${TRAP_TEXT_MAX_LENGTH} 文字以内で入力してください。`,
              `Use ${TRAP_TEXT_MAX_LENGTH} characters or fewer.`,
            );
      case 'invalid':
        return field === 'installedAt'
          ? t('日時を正しく入力してください。', 'Enter a valid date and time.')
          : t('10 進数の度で入力してください（例：35.6581）。', 'Enter decimal degrees, such as 35.6581.');
      case 'outOfRange':
        return field === 'latitude'
          ? t('緯度は -90 から 90 の範囲です。', 'Latitude runs from -90 to 90.')
          : t('経度は -180 から 180 の範囲です。', 'Longitude runs from -180 to 180.');
      case 'pairMissing':
        return field === 'latitude'
          ? t('経度を入れる場合は緯度も入力してください。', 'Enter the latitude to go with the longitude.')
          : t('緯度を入れる場合は経度も入力してください。', 'Enter the longitude to go with the latitude.');
    }
  };

  const setDraftField = (field: keyof TrapDraft, value: string) => {
    if (field === 'latitude' || field === 'longitude') setDraftAccuracy(null);
    setDraft((state) => ({ ...state, [field]: value }));
  };

  const month = reportMonth ?? monthOf(toLocalDateTime(nowMs));
  const reportRows = clockMs === null ? [] : buildDailyReport(traps, work, month, clockMs);

  const takePosition = () => {
    setPositionState('reading');
    readPosition().then(
      (read) => {
        setDraft((state) => ({ ...state, latitude: String(read.latitude), longitude: String(read.longitude) }));
        setDraftAccuracy(read.accuracyM);
        setPositionState('idle');
      },
      (error: PositionError) => setPositionState(error),
    );
  };

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const printSheet = (target: 'log' | 'report') => {
    // The sheet is swapped in before the browser lays out the page for printing.
    flushSync(() => setPrintTarget(target));
    window.print();
  };

  // browserStorage swallows failed writes, so the outcome is read back before reporting it.
  const reportSaved = (done: Notice) => {
    // Re-read the clock so a round just saved is not shown as in the future.
    setNowMs(readClock());
    if (useStorageStatus.getState().available) setNotice(done);
    else
      setNotice({
        error: true,
        ja: `${done.ja}ただし、このブラウザーでは保存できないため、ページを離れると消えます。`,
        en: `${done.en} This browser cannot save it, so it is lost when you leave the page.`,
      });
  };

  const clearDraft = () => {
    setDraft(emptyDraft());
    setDraftAccuracy(null);
    setPositionState('idle');
    setInstalledAtEdited(false);
    setTouched({});
    setSubmitted(false);
  };

  const register = () => {
    setSubmitted(true);
    const checked = validateTrapDraft({
      ...draft,
      installedAt: installedAtEdited ? draft.installedAt : currentLocalMinute(),
    });
    if (!checked.valid) {
      const order: TrapDraftField[] = ['name', 'installedAt', 'location', 'latitude', 'longitude'];
      const first = order.find((field) => checked.errors[field]);
      if (first) document.getElementById(`${formId}-${first}`)?.focus();
      return;
    }
    if (addTrap({ ...checked.value, ...(draftAccuracy === null ? {} : { accuracyM: draftAccuracy }) }) === 'full') {
      setNotice({
        error: true,
        ja: `登録できるわなは ${TRAP_MAX_COUNT} 基までです。撤去したわなを CSV に書き出してから削除してください。`,
        en: `Up to ${TRAP_MAX_COUNT} traps can be registered. Export removed traps to a CSV, then delete them.`,
      });
      return;
    }
    reportSaved({
      error: false,
      ja: `「${checked.value.name}」を登録しました。`,
      en: `Registered “${checked.value.name}”.`,
    });
    clearDraft();
  };

  const exportCsv = () => {
    // Excel needs the byte order mark to read UTF-8.
    download(
      `\uFEFF${buildTrapCheckCsv(traps, language)}`,
      `trap-check-log-${currentLocalMinute().slice(0, 10)}.csv`,
      'text/csv;charset=utf-8',
    );
    setNotice({ error: false, ja: 'CSV を書き出しました。', en: 'CSV exported.' });
  };

  const exportIcs = () => {
    const nowRead = readClock();
    const { ics, events } = buildTrapIcs(traps, lastValidIntervalHours, nowRead, language);
    if (events === 0) {
      setNotice({
        error: true,
        ja: '予定にできる設置中のわながありません。',
        en: 'No set trap to put in a calendar.',
      });
      return;
    }
    download(ics, `trap-check-rounds-${currentLocalMinute().slice(0, 10)}.ics`, 'text/calendar;charset=utf-8');
    setNotice({
      error: false,
      ja: `次の見回り ${events} 件を予定ファイル（.ics）に書き出しました。見回りを記録したら、書き出し直してください。`,
      en: `Exported the next ${events} rounds as a calendar file (.ics). Export again after recording rounds.`,
    });
  };

  const deleteEverything = () => {
    if (
      !window.confirm(
        t(
          'わなと見回りの記録をすべて削除しますか？元に戻せません。必要なら先に CSV に書き出してください。',
          'Delete every trap and round? This cannot be undone. Export a CSV first if you need a copy.',
        ),
      )
    )
      return;
    clearAll();
    if (!savedAsShown(useTrapCheckLogStore)) {
      setNotice({
        error: true,
        ja: '記録を削除できなかった可能性があります。写真は残しています。',
        en: 'The records may not have been deleted. The photos are kept.',
      });
      return;
    }
    setNotice({ error: false, ja: '記録をすべて削除しました。', en: 'All records deleted.' });
    deleteToolPhotos('trap-check-log').catch(() =>
      setNotice({
        error: true,
        ja: '記録をすべて削除しましたが、写真を削除できませんでした。',
        en: 'All records deleted, but the photos could not be deleted.',
      }),
    );
  };

  const fieldProps = (field: TrapDraftField) => {
    const error = draftError(field);
    return {
      id: `${formId}-${field}`,
      'aria-invalid': Boolean(error),
      'aria-describedby': error ? `${formId}-${field}-error` : undefined,
      onBlur: () => setTouched((state) => ({ ...state, [field]: true })),
    };
  };
  const fieldError = (field: TrapDraftField) => {
    const error = draftError(field);
    return error ? (
      <p id={`${formId}-${field}-error`} className="text-sm text-destructive">
        {errorText(field, error)}
      </p>
    ) : null;
  };

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('trap-check-log').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: `見回り間隔を初期値（${DEFAULT_INTERVAL_HOURS} 時間）に戻し、登録フォームを空にします。わなと見回りの記録は残ります。`,
                  en: `Resets the check interval to ${DEFAULT_INTERVAL_HOURS} hours and clears the registration form. Traps and rounds are kept.`,
                }}
                onReset={() => {
                  resetInterval();
                  clearDraft();
                }}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Live regions are mounted from the first paint; one inserted with its text is not announced.
          Each message has its own region because role="status" is atomic. */}
      <p className="sr-only" role="status" lang={language}>
        {storageDiscarded ? discardedLogMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {summary}
      </p>
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        {storageDiscarded && <p className="text-sm text-on-surface-variant">{discardedLogMessage(language)}</p>}
        {!storageAvailable && (
          <p className="text-sm text-on-surface-variant">
            {t(
              'このブラウザーでは保存できません。ページを離れると記録が消えるため、CSV に書き出してください。',
              'This browser cannot save the log. It is lost when you leave the page, so export a CSV.',
            )}
          </p>
        )}
        <ToolLayout
          resultLabel={t('見回りの状況', 'Round status')}
          primary={
            <section aria-labelledby="traps-heading" className="space-y-4">
              <h2 id="traps-heading" className="text-xl font-medium">
                {t('わなの一覧', 'Traps')}
              </h2>
              {traps.length === 0 ? (
                <p className="rounded-sm bg-surface-container p-4 text-sm">
                  {t('まだわなが登録されていません。', 'No traps yet.')}
                </p>
              ) : (
                ordered.map((trap) => (
                  <TrapCard
                    key={trap.id}
                    trap={trap}
                    intervalHours={lastValidIntervalHours}
                    nowMs={nowMs}
                    language={language}
                    onNotice={reportSaved}
                  />
                ))
              )}
              {/* Next to the form, where a registration's result is looked for. Mounted from the
                  start so its first message is announced. */}
              <p
                role="status"
                aria-live={notice?.error ? 'assertive' : 'polite'}
                className={
                  notice
                    ? cn(
                        'rounded-sm p-3 text-sm',
                        notice.error ? 'bg-error-container text-on-error-container' : 'bg-surface-container',
                      )
                    : 'sr-only'
                }
              >
                {notice ? t(notice.ja, notice.en) : ''}
              </p>
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="register" className="text-xl font-medium">
                  {t('わなを登録', 'Register a trap')}
                </h2>
                <div className="space-y-2">
                  <label htmlFor={`${formId}-name`} className="block text-sm font-medium">
                    {t('識別名', 'Name')}
                  </label>
                  <input
                    type="text"
                    value={draft.name}
                    maxLength={TRAP_NAME_MAX_LENGTH}
                    placeholder={t('例：沢沿い 1 号', 'e.g. Creek 1')}
                    onChange={(event) => setDraftField('name', event.target.value)}
                    {...fieldProps('name')}
                  />
                  {fieldError('name')}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor={`${formId}-kind`} className="block text-sm font-medium">
                      {t('種類', 'Kind')}
                    </label>
                    <select
                      id={`${formId}-kind`}
                      value={draft.kind}
                      onChange={(event) => setDraftField('kind', event.target.value as TrapKind)}
                    >
                      {TRAP_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {TRAP_KIND_LABELS[kind][language]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor={`${formId}-installedAt`} className="block text-sm font-medium">
                      {t('設置日時', 'Set at')}
                    </label>
                    <input
                      type="datetime-local"
                      value={shownInstalledAt}
                      onChange={(event) => {
                        setDraftField('installedAt', event.target.value);
                        setInstalledAtEdited(true);
                      }}
                      className={fieldClass}
                      {...fieldProps('installedAt')}
                    />
                    {fieldError('installedAt')}
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor={`${formId}-location`} className="block text-sm font-medium">
                    {t('場所メモ（任意）', 'Location note (optional)')}
                  </label>
                  <input
                    type="text"
                    value={draft.location}
                    maxLength={TRAP_TEXT_MAX_LENGTH}
                    placeholder={t('例：林道の分岐から沢へ 50 m', 'e.g. 50 m up the creek from the fork')}
                    onChange={(event) => setDraftField('location', event.target.value)}
                    {...fieldProps('location')}
                  />
                  {fieldError('location')}
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">
                    {t('座標（任意・10 進数の度）', 'Coordinates (optional, decimal degrees)')}
                  </legend>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor={`${formId}-latitude`} className="block text-sm">
                        {t('緯度', 'Latitude')}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft.latitude}
                        placeholder="35.6581"
                        onChange={(event) => setDraftField('latitude', event.target.value)}
                        {...fieldProps('latitude')}
                      />
                      {fieldError('latitude')}
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={`${formId}-longitude`} className="block text-sm">
                        {t('経度', 'Longitude')}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft.longitude}
                        placeholder="139.7414"
                        onChange={(event) => setDraftField('longitude', event.target.value)}
                        {...fieldProps('longitude')}
                      />
                      {fieldError('longitude')}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={takePosition} disabled={positionState === 'reading'}>
                      <LuLocateFixed aria-hidden="true" />
                      {positionState === 'reading'
                        ? t('現在地を取得中…', 'Reading position…')
                        : t('現在地を入れる', 'Use current position')}
                    </Button>
                    <p className="text-sm text-on-surface-variant" role="status">
                      {draftAccuracy !== null
                        ? t(`端末の位置（誤差 ±${draftAccuracy} m）`, `Device position (±${draftAccuracy} m)`)
                        : positionState !== 'idle' && positionState !== 'reading'
                          ? positionErrorText(positionState, language)
                          : ''}
                    </p>
                  </div>
                </fieldset>
                <Button className="w-full" onClick={register}>
                  <LuPlus aria-hidden="true" />
                  {t('登録する', 'Register')}
                </Button>
              </Card>
            </section>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 className="text-xl font-medium">{t('見回りの状況', 'Round status')}</h2>
              {traps.length > 0 && (
                <ResultPanel className="grid-cols-2">
                  <ResultFigure
                    label={t('間隔を過ぎたわな', 'Past the interval')}
                    value={counts.overdue}
                    unit={language === 'ja' ? '基' : undefined}
                    tone={counts.overdue > 0 ? 'bad' : 'neutral'}
                    size="lead"
                  />
                  <ResultFigure
                    label={t('設置中', 'Set')}
                    value={counts.active}
                    unit={language === 'ja' ? '基' : undefined}
                  />
                </ResultPanel>
              )}
              <NumberField
                fieldId="trap-check-log-interval"
                label={t('見回り間隔', 'Check interval')}
                unit={t('時間', 'h')}
                value={intervalHours}
                onChange={setIntervalHours}
                min={INTERVAL_HOURS_MIN}
                max={INTERVAL_HOURS_MAX}
                step={1}
                invalid={!intervalValid}
                errorText={t(
                  `${INTERVAL_HOURS_MIN} から ${INTERVAL_HOURS_MAX} までの整数で入力してください。`,
                  `Enter a whole number from ${INTERVAL_HOURS_MIN} to ${INTERVAL_HOURS_MAX}.`,
                )}
                hint={t(
                  '最後の見回り（なければ設置）からこの時間を過ぎると警告します。',
                  'A trap is flagged once this long has passed since its last round, or since it was set.',
                )}
              />
              {traps.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={exportCsv}>
                    <LuDownload aria-hidden="true" />
                    {t('CSV に書き出す', 'Export CSV')}
                  </Button>
                  <Button variant="outline" onClick={() => printSheet('log')}>
                    <LuPrinter aria-hidden="true" />
                    {t('印刷する', 'Print')}
                  </Button>
                  <Button variant="outline" onClick={exportIcs}>
                    <LuCalendarPlus aria-hidden="true" />
                    {t('次の見回りを予定に書き出す（.ics）', 'Export next rounds (.ics)')}
                  </Button>
                </div>
              )}
              <p className="text-xs text-on-surface-variant">
                {t(
                  '.ics をカレンダーに取り込むと、カレンダーの通知が使えます。予定は書き出した時点のもので、あとの見回りでは動きません。',
                  'Import the .ics into a calendar to get its alerts. The events are fixed at export and do not move with later rounds.',
                )}
              </p>
            </Card>
          }
          secondary={
            <ConditionSection
              id="saving"
              title={t('この端末への保存', 'Saving on this device')}
              summary={
                storageAvailable
                  ? t('記録はこのブラウザーに保存します。', 'Saved in this browser.')
                  : t('このブラウザーでは保存できません。', 'This browser cannot save.')
              }
            >
              <Button variant="outline" onClick={deleteEverything} disabled={traps.length === 0}>
                <LuTrash2 aria-hidden="true" />
                {t('記録をすべて削除', 'Delete every record')}
              </Button>
            </ConditionSection>
          }
          extras={
            <>
              <ConditionSection
                id="work"
                title={t('作業時間・日報・わな別の集計', 'Work time, daily report and figures by trap')}
                summary={t(
                  `${month} の作業 ${reportRows.length} 日`,
                  `${reportRows.length} days of work or rounds in ${month}`,
                )}
              >
                <WorkReport
                  traps={traps}
                  work={work}
                  month={month}
                  onMonthChange={setReportMonth}
                  nowMs={nowMs}
                  language={language}
                  onNotice={reportSaved}
                  onPrint={() => printSheet('report')}
                  onDownload={download}
                />
              </ConditionSection>
              <ConditionSection
                id="basis"
                title={t('見回り頻度の根拠', 'Basis for the interval')}
                summary={t(
                  '国の指針は「頻繁に」、県の案内は「原則として毎日」。',
                  'The national guideline says “frequently”. Prefectural guidance says every day as a rule.',
                )}
              >
                <div className="space-y-4 text-sm">
                  <section className="space-y-2">
                    <h3 className="font-medium">
                      {t(
                        '環境省「鳥獣の保護及び管理を図るための事業を実施するための基本的な指針」（令和 3 年 10 月告示版）',
                        'Ministry of the Environment, basic guideline for wildlife protection and management (October 2021)',
                      )}
                    </h3>
                    <blockquote
                      lang="ja"
                      className="space-y-2 border-l-4 border-outline-variant pl-4 text-on-surface-variant"
                    >
                      <p>
                        Ⅰ第三 5(1)
                        錯誤捕獲の防止：「国及び都道府県は、指定管理鳥獣捕獲等事業を始めとする鳥獣捕獲等事業においては、……（中略）……また、頻繁にわなを見回ること、わなを設置した付近でクマ類やカモシカ等の生息が確認された場合にはわなを移動する等のわなの適正な使用の徹底を図るとともに、錯誤捕獲した場合の対応について指導することにより、錯誤捕獲の防止と安全の確保に努める。」
                      </p>
                      <p>
                        Ⅲ第四 1(2)
                        許可に当たっての条件の考え方：「捕獲等又は採取等の許可に当たっての条件は、……適切なわなの数量の限定、見回りの実施方法、猟具の所有等について付す。」
                      </p>
                      <p>
                        Ⅲ第四 ２－３(2)
                        被害の防止の目的の許可対象者（小型のはこわな等を農林業者が自らの事業地内で使う場合）：「１日１回以上の見回りを実施する等、錯誤捕獲等により鳥獣の保護に重大な支障を生じないと認められる場合」
                      </p>
                    </blockquote>
                    <a href={GUIDELINE_URL} target="_blank" rel="noreferrer">
                      {t('環境省 基本指針のページ', 'The guideline page (Ministry of the Environment)')}
                    </a>
                  </section>
                  <section className="space-y-2">
                    <h3 className="font-medium">{t('都道府県の案内（例）', 'Prefectural guidance (examples)')}</h3>
                    <blockquote
                      lang="ja"
                      className="space-y-2 border-l-4 border-outline-variant pl-4 text-on-surface-variant"
                    >
                      <p>
                        香川県「香川県で狩猟をされる皆さんへ」：「わなの設置後は捕獲の有無を頻繁（原則として毎日）に見回るなど、安全管理及び事故、錯誤捕獲防止に努めてください。」
                      </p>
                      <p>
                        愛知県「出猟時に注意するポイント」：「速やかな止めさしができるよう、毎日の見回りを行いましょう。」
                      </p>
                    </blockquote>
                    <p className="flex flex-wrap gap-x-4 gap-y-2">
                      <a href={KAGAWA_URL} target="_blank" rel="noreferrer">
                        {t('香川県のページ', 'Kagawa Prefecture')}
                      </a>
                      <a href={AICHI_URL} target="_blank" rel="noreferrer">
                        {t('愛知県のページ', 'Aichi Prefecture')}
                      </a>
                    </p>
                  </section>
                  <ul className="list-disc space-y-2 pl-5 text-on-surface-variant">
                    <li>
                      {t(
                        '「毎日」は暦の日ごとの見回りで、24 時間ちょうどの間隔とは違います。',
                        '“Every day” means once per calendar day, not exactly every 24 hours.',
                      )}
                    </li>
                    <li>
                      {t(
                        '許可捕獲では、見回りの実施方法が許可の条件になることがあります。',
                        'Under a permit, how rounds are made can be a permit condition.',
                      )}
                    </li>
                    <li>
                      {t(
                        `確認日 ${CHECKED_ON}。基本指針は改正の準備中です。`,
                        `Checked ${CHECKED_ON}. The guideline is being revised.`,
                      )}
                    </li>
                  </ul>
                </div>
              </ConditionSection>
            </>
          }
        />
      </div>
      {clockMs !== null && printTarget === 'log' && (
        <TrapCheckLogSheet
          traps={ordered}
          intervalHours={lastValidIntervalHours}
          nowMs={clockMs}
          language={language}
          className="hidden print:block"
        />
      )}
      {clockMs !== null && printTarget === 'report' && (
        <DailyReportSheet
          rows={reportRows}
          month={month}
          nowMs={clockMs}
          language={language}
          className="hidden print:block"
        />
      )}
    </AppLayout>
  );
}
