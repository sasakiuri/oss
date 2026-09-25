'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LuBell, LuBellOff, LuPlay, LuRotateCcw } from 'react-icons/lu';

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
import {
  AUTO_OFF_MINUTES_MAX,
  BEAR_INFO_URL,
  BEAR_SOURCES,
  BEAR_SOURCES_CHECKED_ON,
  BELL_LIMITS,
  BELL_TONES,
  ENCOUNTER_STAGES,
  INTERVAL_SECONDS_MAX,
  INTERVAL_SECONDS_MIN,
  PRE_TRIP_CHECKLIST,
  SENSITIVITY_LEVELS,
  SPRAY_POINTS,
  autoOffAt,
  createStepDetector,
  nextRingDelayMs,
  ringLevel,
  type BearSourceId,
  type BellTone,
  type Sensitivity,
  type SourcedText,
} from '@/lib/bear-bell';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import type { BellMode } from '@/lib/schemas/bear-bell';
import { rehydrateLanguage, useLanguage, useSetLanguage, type Language } from '@/store';

import { BEAR_BELL_STORAGE_KEY, initialBearBellSettings, useBearBellStore } from './_store';
import { BellPlayer, canPlayBell, requestMotionPermission } from './bell-player';

/** How long walking mode waits for a motion sample before saying the sensor is silent. */
const MOTION_WAIT_MS = 3000;

type Problem = 'noAudio' | 'blocked' | 'interrupted' | 'noMotion' | 'motionDenied' | 'wakeLock' | null;

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockLike = { request: (type: 'screen') => Promise<WakeLockSentinelLike> };

export function BearBellClient() {
  const store = useBearBellStore();
  const {
    tone,
    volumePercent,
    mode,
    intervalSeconds,
    varyInterval,
    varyVolume,
    sensitivity,
    autoOffMinutes,
    keepScreenOn,
    checked,
    lastValidSettings,
  } = store;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(BEAR_BELL_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rings, setRings] = useState(0);
  const [problem, setProblem] = useState<Problem>(null);
  const [stopAt, setStopAt] = useState<number | null>(null);
  const [stopReason, setStopReason] = useState<'timer' | null>(null);
  const [clockMs, setClockMs] = useState(0);
  const player = useRef<BellPlayer | null>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useBearBellStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
    return () => player.current?.close();
  }, []);

  // The running bell reads the settings from the store, so a change applies from the next ring.
  const ringOnce = () => {
    const current = useBearBellStore.getState().lastValidSettings;
    player.current?.ring(current.tone, ringLevel(current.volumePercent, current.varyVolume, Math.random()));
    setRings((count) => count + 1);
  };

  // Interval mode: one timer at a time, each choosing the next wait.
  useEffect(() => {
    if (!playing || lastValidSettings.mode !== 'interval') return;
    let timer = 0;
    const schedule = () => {
      const current = useBearBellStore.getState().lastValidSettings;
      timer = window.setTimeout(
        () => {
          ringOnce();
          schedule();
        },
        nextRingDelayMs({ intervalSeconds: current.intervalSeconds, vary: current.varyInterval }, Math.random()),
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [playing, lastValidSettings.mode]);

  // Walking mode: a ring on each step the motion sensor shows.
  useEffect(() => {
    if (!playing || lastValidSettings.mode !== 'walking') return;
    const detector = createStepDetector(lastValidSettings.sensitivity);
    let heard = false;
    const onMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity;
      if (!acceleration || acceleration.x === null || acceleration.y === null || acceleration.z === null) return;
      heard = true;
      if (detector.push({ x: acceleration.x, y: acceleration.y, z: acceleration.z, timeMs: event.timeStamp }))
        ringOnce();
    };
    window.addEventListener('devicemotion', onMotion);
    const silence = window.setTimeout(() => {
      if (!heard) setProblem('noMotion');
    }, MOTION_WAIT_MS);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      window.clearTimeout(silence);
    };
  }, [playing, lastValidSettings.mode, lastValidSettings.sensitivity]);

  // The timer that turns the bell off by itself.
  useEffect(() => {
    if (!playing || stopAt === null) return;
    const check = () => {
      const now = Date.now();
      setClockMs(now);
      if (now >= stopAt) {
        setPlaying(false);
        setStopAt(null);
        setStopReason('timer');
      }
    };
    const timer = window.setInterval(check, 1000);
    return () => window.clearInterval(timer);
  }, [playing, stopAt]);

  // Keeps the screen on while ringing, where the browser allows it; the lock is dropped whenever the
  // page is hidden, so it is asked for again when the page comes back.
  useEffect(() => {
    if (!playing || !lastValidSettings.keepScreenOn) return;
    const wakeLock = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
    // A browser without the API was reported when the bell started.
    if (!wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let active = true;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      wakeLock.request('screen').then(
        (lock) => {
          if (active) sentinel = lock;
          else void lock.release().catch(() => undefined);
        },
        () => setProblem((current) => current ?? 'wakeLock'),
      );
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', acquire);
      if (sentinel) void sentinel.release().catch(() => undefined);
    };
  }, [playing, lastValidSettings.keepScreenOn]);

  // A browser can stop the sound when the page is hidden. It is resumed when the page returns.
  useEffect(() => {
    if (!playing) return;
    const bell = player.current;
    const report = () => {
      if (!bell) return;
      setProblem((current) =>
        bell.state === 'running' ? (current === 'interrupted' ? null : current) : 'interrupted',
      );
    };
    bell?.onStateChange(report);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void bell?.unlock().then(report, report);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      bell?.onStateChange(null);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [playing]);

  const unlockSound = (): Promise<boolean> => {
    if (!canPlayBell()) {
      setProblem('noAudio');
      return Promise.resolve(false);
    }
    player.current ??= new BellPlayer();
    return player.current.unlock().then(
      () => true,
      () => {
        setProblem('blocked');
        return false;
      },
    );
  };

  const start = () => {
    setProblem(null);
    setStopReason(null);
    // Both are asked for inside the press, as the browsers require.
    const sound = unlockSound();
    const motion = mode === 'walking' ? requestMotionPermission() : Promise.resolve(true);
    void Promise.all([sound, motion]).then(([soundOk, motionOk]) => {
      if (!soundOk) return;
      if (!motionOk) {
        setProblem('motionDenied');
        return;
      }
      const now = Date.now();
      setRings(0);
      setClockMs(now);
      setStopAt(autoOffAt(now, lastValidSettings.autoOffMinutes));
      if (lastValidSettings.keepScreenOn && !('wakeLock' in navigator)) setProblem('wakeLock');
      setPlaying(true);
      // The first ring comes with the press; walking mode then waits for a step.
      if (lastValidSettings.mode === 'interval') ringOnce();
    });
  };

  const stop = () => {
    setPlaying(false);
    setStopAt(null);
    setProblem(null);
  };

  const test = () => {
    void unlockSound().then((ok) => {
      if (ok) ringOnce();
    });
  };

  const problemText = (): string | null => {
    switch (problem) {
      case 'noAudio':
        return t(
          'このブラウザーでは音を鳴らせません（Web Audio 非対応）。',
          'This browser cannot make the sound (no Web Audio).',
        );
      case 'blocked':
        return t(
          'ブラウザーが音の再生を許可しませんでした。もう一度ボタンを押してください。',
          'The browser did not allow the sound. Press the button again.',
        );
      case 'interrupted':
        return t(
          '音が止まっています。画面を点けてこのページに戻ると再開します。鳴らなければ「止める」「鳴らす」の順に押してください。',
          'The sound has stopped. It resumes when this page is back on screen. If not, press Stop, then Ring.',
        );
      case 'noMotion':
        return t(
          '加速度センサーの値が届きません。「一定の間隔」に切り替えてください。',
          'No motion readings. Switch to a fixed interval.',
        );
      case 'motionDenied':
        return t(
          '加速度センサーの利用が許可されませんでした。歩行連動には許可が必要です。',
          'Motion access was not allowed. Walking mode needs it.',
        );
      case 'wakeLock':
        return t(
          'この端末では画面を点けたままにできませんでした。端末の自動ロックの設定を長くしてください。',
          'The screen could not be kept on. Lengthen the device’s auto-lock time.',
        );
      default:
        return null;
    }
  };

  const toneName = (value: BellTone) =>
    ({
      bright: t('高い鈴', 'High bell'),
      mellow: t('低い鈴', 'Low bell'),
      pair: t('2 つの鈴', 'Two bells'),
    })[value];

  const intervalInvalid =
    !Number.isFinite(intervalSeconds) ||
    intervalSeconds < INTERVAL_SECONDS_MIN ||
    intervalSeconds > INTERVAL_SECONDS_MAX;
  const volumeInvalid = !Number.isInteger(volumePercent) || volumePercent < 0 || volumePercent > 100;
  const autoOffInvalid =
    !Number.isInteger(autoOffMinutes) || autoOffMinutes < 0 || autoOffMinutes > AUTO_OFF_MINUTES_MAX;
  const remainingMinutes = stopAt === null ? null : Math.max(0, Math.ceil((stopAt - clockMs) / 60_000));
  const statusText = playing
    ? t(
        `鳴らしています（${mode === 'walking' ? '歩行連動' : `約 ${lastValidSettings.intervalSeconds} 秒ごと`}）${remainingMinutes === null ? '' : `。あと約 ${remainingMinutes} 分で止まります`}`,
        `Ringing (${mode === 'walking' ? 'with each step' : `about every ${lastValidSettings.intervalSeconds} s`})${remainingMinutes === null ? '' : `. Stops in about ${remainingMinutes} min`}`,
      )
    : stopReason === 'timer'
      ? t('タイマーで止めました。', 'Stopped by the timer.')
      : t('止まっています。', 'Stopped.');
  const message = problemText();

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('bear-bell').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '音色・音量・間隔・タイマーなどの設定を初期値に戻します。入山前チェックの記録は残ります。',
                  en: 'Resets the tone, volume, interval, timer and other settings. The pre-trip checklist is kept.',
                }}
                onReset={() => {
                  const next = { ...initialBearBellSettings, checked };
                  useBearBellStore.setState({ ...next, lastValidSettings: next });
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
      <p className="sr-only" role="status" lang={language}>
        {ready ? statusText : ''}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={BEAR_BELL_STORAGE_KEY} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('鈴の状態', 'Bell status')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="bell" className="text-xl font-medium">
                {t('熊鈴', 'Bear bell')}
              </h2>
              <SegmentedControl
                legend={t('鳴らし方', 'How it rings')}
                orientation="inline"
                value={mode}
                options={(['interval', 'walking'] as const).map((value) => ({
                  value,
                  label: value === 'interval' ? t('一定の間隔', 'Fixed interval') : t('歩行連動', 'With each step'),
                }))}
                onChange={(value) => store.setMode(value as BellMode)}
              />
              <div className="grid grid-cols-2 items-start gap-4">
                <SelectField
                  label={t('音色', 'Tone')}
                  value={tone}
                  onChange={(value) => store.setTone(value as BellTone)}
                  options={BELL_TONES.map((value) => ({ value, label: toneName(value) }))}
                />
                <NumberField
                  label={t('音量', 'Volume')}
                  unit="%"
                  value={volumePercent}
                  onChange={store.setVolumePercent}
                  min={0}
                  max={100}
                  step={10}
                  invalid={volumeInvalid}
                  errorText={t('0 から 100 までの整数で入力してください。', 'Enter a whole number from 0 to 100.')}
                  hint={t('端末の音量も上げてください。', 'Turn the device volume up as well.')}
                />
              </div>
              {mode === 'interval' ? (
                <NumberField
                  label={t('鳴らす間隔', 'Interval')}
                  unit={t('秒', 's')}
                  value={intervalSeconds}
                  onChange={store.setIntervalSeconds}
                  min={INTERVAL_SECONDS_MIN}
                  max={INTERVAL_SECONDS_MAX}
                  step={1}
                  invalid={intervalInvalid}
                  errorText={t(
                    `${INTERVAL_SECONDS_MIN} から ${INTERVAL_SECONDS_MAX} 秒で入力してください。`,
                    `Enter ${INTERVAL_SECONDS_MIN} to ${INTERVAL_SECONDS_MAX} seconds.`,
                  )}
                />
              ) : (
                <SelectField
                  label={t('歩行の感度', 'Step sensitivity')}
                  value={String(sensitivity)}
                  onChange={(value) => store.setSensitivity(Number(value) as Sensitivity)}
                  options={SENSITIVITY_LEVELS.map((level) => ({
                    value: String(level),
                    label:
                      level === 1
                        ? t('1（鈍い）', '1 (least)')
                        : level === 5
                          ? t('5（敏感）', '5 (most)')
                          : String(level),
                  }))}
                  hint={t('1 歩ごとに鳴り、止まると鳴りません。', 'Rings on each step, silent when you stop.')}
                />
              )}
              <div className="space-y-2">
                {mode === 'interval' && (
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={varyInterval}
                      onChange={(event) => store.setVaryInterval(event.target.checked)}
                    />
                    {t('間隔をばらつかせる（0.5〜1.5 倍）', 'Vary the interval (0.5 to 1.5 times)')}
                  </label>
                )}
                <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={varyVolume}
                    onChange={(event) => store.setVaryVolume(event.target.checked)}
                  />
                  {t('音量をばらつかせる（60〜100 %）', 'Vary the volume (60 to 100 %)')}
                </label>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={keepScreenOn}
                    onChange={(event) => store.setKeepScreenOn(event.target.checked)}
                  />
                  {t('鳴らしている間は画面を点けたままにする', 'Keep the screen on while ringing')}
                </label>
              </div>
              <NumberField
                label={t('自動で止めるまで', 'Stop automatically after')}
                unit={t('分', 'min')}
                value={autoOffMinutes}
                onChange={store.setAutoOffMinutes}
                min={0}
                max={AUTO_OFF_MINUTES_MAX}
                step={10}
                invalid={autoOffInvalid}
                errorText={t(
                  `0 から ${AUTO_OFF_MINUTES_MAX} までの整数で入力してください。`,
                  `Enter a whole number from 0 to ${AUTO_OFF_MINUTES_MAX}.`,
                )}
                hint={t('0 は止めるまで鳴らし続けます。', '0 rings until you stop it.')}
              />
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 className="text-xl font-medium">{t('鈴の状態', 'Bell status')}</h2>
              <p className="text-lg font-medium" aria-live="off">
                {statusText}
              </p>
              {playing && (
                <p className="text-sm text-on-surface-variant tabular-nums">
                  {t(`鳴らした回数 ${rings}`, `Rings: ${rings}`)}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {playing ? (
                  <Button className="min-w-40" onClick={stop}>
                    <LuBellOff aria-hidden="true" />
                    {t('止める', 'Stop')}
                  </Button>
                ) : (
                  <Button className="min-w-40" onClick={start}>
                    <LuBell aria-hidden="true" />
                    {t('鳴らす', 'Ring')}
                  </Button>
                )}
                <Button variant="outline" onClick={test}>
                  <LuPlay aria-hidden="true" />
                  {t('1 回だけ鳴らす', 'Ring once')}
                </Button>
              </div>
              {message && (
                <p role="alert" className="rounded-sm bg-error-container p-3 text-sm text-on-error-container">
                  {message}
                </p>
              )}
              <p className="text-sm">
                {t(
                  '画面のロックや、アプリ・タブの切り替えで音が止まることがあります（iPhone・iPad の Safari では止まります）。画面を点けたまま、このページを開いておいてください。',
                  'Locking the screen or switching app or tab can stop the sound (on iPhone and iPad Safari it stops). Keep the screen on with this page open.',
                )}
              </p>
              <p className="text-sm">
                {t('本物の鈴やラジオと併用してください。', 'Use it alongside a real bell or radio.')}
              </p>
            </Card>
          }
          secondary={
            <ConditionSection
              id="checklist"
              title={t('入山前チェック', 'Before going in')}
              summary={t(
                `${checked.length} / ${PRE_TRIP_CHECKLIST.length} 項目を確認済み`,
                `${checked.length} of ${PRE_TRIP_CHECKLIST.length} checked`,
              )}
              defaultOpen
            >
              <ul className="space-y-1 text-sm">
                {PRE_TRIP_CHECKLIST.map((item) => (
                  <li key={item.id}>
                    <label className="flex min-h-12 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked.includes(item.id)}
                        onChange={() => store.toggleChecked(item.id)}
                      />
                      <span>{item.text[language]}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <SourceNotes items={PRE_TRIP_CHECKLIST} language={language} />
              <Button variant="outline" onClick={store.clearChecked} disabled={checked.length === 0}>
                <LuRotateCcw aria-hidden="true" />
                {t('チェックを外す（次の入山用）', 'Clear the ticks for the next trip')}
              </Button>
            </ConditionSection>
          }
          extras={
            <>
              <ConditionSection
                id="encounter"
                title={t('遭遇したときの行動', 'If you meet a bear')}
                summary={t(
                  '見ながらゆっくり離れる。走らない・大声を出さない。最終手段は防御姿勢。',
                  'Back away slowly, watching it. Do not run or shout. Protective position as a last resort.',
                )}
              >
                <div className="space-y-6 text-sm">
                  {ENCOUNTER_STAGES.map((stage) => (
                    <section key={stage.id} aria-labelledby={`stage-${stage.id}`} className="space-y-2">
                      <h3 id={`stage-${stage.id}`} className="text-base font-medium">
                        {stage.title[language]}
                      </h3>
                      <ul className="list-disc space-y-1 pl-5">
                        {stage.steps.map((step) => (
                          <li key={step.ja}>{step[language]}</li>
                        ))}
                      </ul>
                      <blockquote
                        lang="ja"
                        className="space-y-2 border-l-4 border-outline-variant pl-4 text-on-surface-variant"
                      >
                        {stage.quotes.map((quote) => (
                          <p key={quote.quote}>
                            「{quote.quote}」
                            <span className="ml-1 text-xs">
                              （{BEAR_SOURCES[quote.source].publisher}「{BEAR_SOURCES[quote.source].title}」
                              {quote.where}）
                            </span>
                          </p>
                        ))}
                      </blockquote>
                    </section>
                  ))}
                </div>
              </ConditionSection>
              <ConditionSection
                id="limits"
                title={t('鈴の限界', 'What a bell cannot do')}
                summary={t(
                  '止まると鳴らない、沢の音で消える、人に慣れたクマには効かないことがある',
                  'Silent when you stop, drowned by streams, may not work on bears used to people',
                )}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  {BELL_LIMITS.map((item) => (
                    <li key={item.quote}>{item.text[language]}</li>
                  ))}
                </ul>
                <SourceNotes items={BELL_LIMITS} language={language} />
              </ConditionSection>
              <ConditionSection
                id="spray"
                title={t('クマ撃退スプレー', 'Bear spray')}
                summary={t(
                  '迫ってきたクマへの緊急の防御手段。事前の準備が必須。',
                  'An emergency defence against a charging bear.',
                )}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  {SPRAY_POINTS.map((item) => (
                    <li key={item.quote}>{item.text[language]}</li>
                  ))}
                </ul>
                <SourceNotes items={SPRAY_POINTS} language={language} />
              </ConditionSection>
              <ConditionSection
                id="sources"
                title={t('出典', 'Sources')}
                summary={t(`確認日 ${BEAR_SOURCES_CHECKED_ON}`, `Checked ${BEAR_SOURCES_CHECKED_ON}`)}
              >
                <ul className="space-y-2 text-sm">
                  {(Object.keys(BEAR_SOURCES) as BearSourceId[]).map((id) => (
                    <li key={id}>
                      <a href={BEAR_SOURCES[id].url} target="_blank" rel="noreferrer">
                        {BEAR_SOURCES[id].publisher}「{BEAR_SOURCES[id].title}」{BEAR_SOURCES[id].issued}
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-sm">
                  <a href={BEAR_INFO_URL} target="_blank" rel="noreferrer">
                    {t(
                      '環境省「国民向けのクマに関する情報」',
                      'Ministry of the Environment: bear information for the public',
                    )}
                  </a>
                  {' ・ '}
                  <Link href="/labs/bear-stats">{t('クマの出没・被害統計', 'Bear incident statistics')}</Link>
                </p>
                {language === 'en' && (
                  <p className="text-xs text-on-surface-variant">
                    Sources are in Japanese. Quotes are shown as published.
                  </p>
                )}
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}

/** One disclosure per list, giving each item's source under the item's own wording. */
function SourceNotes({ items, language }: { items: readonly SourcedText[]; language: Language }) {
  return (
    <details className="text-xs text-on-surface-variant">
      <summary className="cursor-pointer">{language === 'ja' ? '出典' : 'Sources'}</summary>
      <ul className="mt-2 space-y-2">
        {items.map((item) => {
          const source = BEAR_SOURCES[item.source];
          return (
            <li key={item.quote}>
              <p className="font-medium">{item.text[language]}</p>
              <p lang="ja">
                「{item.quote}」（
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.publisher}「{source.title}」
                </a>
                {item.where}）
              </p>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
