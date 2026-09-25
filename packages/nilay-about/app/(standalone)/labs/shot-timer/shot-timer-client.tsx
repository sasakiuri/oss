'use client';

import { useEffect, useRef, useState } from 'react';
import { LuPlay, LuSquare } from 'react-icons/lu';

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
  SectionNav,
  SegmentedControl,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import {
  PEAK_WORKLET_SOURCE,
  ShotDetector,
  randomDelay,
  timeShots,
  toDbfs,
  type QuietWindow,
  type TimedShot,
} from '@/lib/shot-timer';
import { requestWakeLock } from '@/lib/wake-lock';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { storageKey, useShotTimerStore } from './_store';
import { VideoAnalysis } from './video-analysis';

/** The start and par beeps: short, high and plain. No rule sets their pitch, so these are this tool's own. */
const BEEP_HZ = 2000;
const BEEP_SECONDS = 0.25;
/** The microphone hears the timer's own beeps, so it is deaf from a little before each to a little after. */
const BEEP_GUARD_SECONDS = 0.15;

type RunState = 'idle' | 'starting' | 'waiting' | 'running';

interface StringResult {
  shots: TimedShot[];
  par: number | null;
}

interface AudioSession {
  context: AudioContext;
  stream: MediaStream | null;
  workletUrl: string | null;
  release: (() => void) | null;
  timers: number[];
}

export function ShotTimerClient() {
  const settings = useShotTimerStore();
  const { delayMode, fixedDelay, minDelay, maxDelay, par, useMicrophone, thresholdDb, deadTimeMs, edit, reset } =
    settings;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [run, setRun] = useState<RunState>('idle');
  const [shots, setShots] = useState<number[]>([]);
  const [strings, setStrings] = useState<StringResult[]>([]);
  const [level, setLevel] = useState(-Infinity);
  const [notice, setNotice] = useState<[string, string] | null>(null);
  const sessionRef = useRef<AudioSession | null>(null);
  const peakRef = useRef(0);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const seconds = (value: number) =>
    new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

  useEffect(() => {
    void Promise.all([useShotTimerStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const close = () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return;
    session.timers.forEach((timer) => window.clearTimeout(timer));
    session.stream?.getTracks().forEach((track) => track.stop());
    session.release?.();
    if (session.workletUrl) URL.revokeObjectURL(session.workletUrl);
    void session.context.close().catch(() => undefined);
  };
  useEffect(() => close, []);

  // The level meter is read ten times a second rather than for every block the microphone sends.
  useEffect(() => {
    if (run === 'idle' || !useMicrophone) return;
    const timer = window.setInterval(() => {
      setLevel(toDbfs(peakRef.current));
      peakRef.current = 0;
    }, 100);
    return () => window.clearInterval(timer);
  }, [run, useMicrophone]);

  const beep = (context: AudioContext, at: number) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = BEEP_HZ;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.8, at + 0.005);
    gain.gain.setValueAtTime(0.8, at + BEEP_SECONDS - 0.02);
    gain.gain.linearRampToValueAtTime(0, at + BEEP_SECONDS);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + BEEP_SECONDS + 0.01);
  };

  const stop = (finished: number[] = shots) => {
    close();
    setRun('idle');
    setLevel(-Infinity);
    setStrings((previous) => [{ shots: timeShots(0, finished), par }, ...previous].slice(0, 20));
  };

  const start = async () => {
    close();
    setShots([]);
    setNotice(null);
    setRun('starting');
    const found: number[] = [];
    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch {
      setRun('idle');
      setNotice(['このブラウザーでは音を鳴らせません。', 'This browser cannot play sound.']);
      return;
    }
    const session: AudioSession = { context, stream: null, workletUrl: null, release: null, timers: [] };
    sessionRef.current = session;
    try {
      await context.resume();
      if (useMicrophone) {
        if (!navigator.mediaDevices?.getUserMedia || !context.audioWorklet) throw new Error('unsupported');
        session.stream = await navigator.mediaDevices.getUserMedia({
          // The processing a call needs would flatten a shot's report and could cut it out entirely.
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        session.workletUrl = URL.createObjectURL(new Blob([PEAK_WORKLET_SOURCE], { type: 'text/javascript' }));
        await context.audioWorklet.addModule(session.workletUrl);
      }
    } catch (error) {
      close();
      setRun('idle');
      setNotice(
        error instanceof Error && error.message === 'unsupported'
          ? [
              'このブラウザーではマイクの音を読めません。マイクを使わない設定で par タイマーとして使えます。',
              'This browser cannot read the microphone. Turn the microphone off to use it as a par timer.',
            ]
          : [
              'マイクを使えませんでした。ブラウザーの許可を確かめるか、マイクを使わない設定にしてください。',
              'The microphone could not be used. Check the browser’s permission, or turn the microphone off.',
            ],
      );
      return;
    }
    if (sessionRef.current !== session) return;

    const lock = await requestWakeLock(() => undefined);
    session.release = lock.held ? lock.release : null;
    const delay = delayMode === 'fixed' ? fixedDelay : randomDelay(minDelay, maxDelay);
    const startAt = context.currentTime + delay;
    beep(context, startAt);
    const quiet: QuietWindow[] = [{ start: 0, end: startAt + BEEP_SECONDS + BEEP_GUARD_SECONDS }];
    if (par !== null) {
      beep(context, startAt + par);
      quiet.push({ start: startAt + par - BEEP_GUARD_SECONDS, end: startAt + par + BEEP_SECONDS + BEEP_GUARD_SECONDS });
    }

    if (useMicrophone && session.stream) {
      const detector = new ShotDetector({ thresholdDb, deadTimeMs }, quiet);
      const node = new AudioWorkletNode(context, 'nilay-peak');
      const silent = context.createGain();
      silent.gain.value = 0;
      context.createMediaStreamSource(session.stream).connect(node).connect(silent).connect(context.destination);
      node.port.onmessage = (event: MessageEvent<{ time: number; peak: number }>) => {
        const { time, peak } = event.data;
        if (peak > peakRef.current) peakRef.current = peak;
        const shot = detector.push(time, peak);
        if (shot === null) return;
        found.push(shot - startAt);
        setShots([...found]);
      };
    }
    setRun('waiting');
    session.timers.push(window.setTimeout(() => setRun('running'), delay * 1000));
    if (par !== null && !useMicrophone)
      // Without a microphone the string ends with the par beep, as there is nothing else to wait for.
      session.timers.push(window.setTimeout(() => stop([]), (delay + par + BEEP_SECONDS) * 1000 + 200));
    if (!lock.held)
      setNotice([
        '画面のスリープを止められませんでした。端末の自動ロックを切ってください。',
        'The screen could not be kept on. Turn off auto-lock on the device.',
      ]);
  };

  const current = timeShots(0, shots);
  const last = strings[0];
  const shown = run === 'idle' ? (last?.shots ?? []) : current;
  const shownPar = run === 'idle' ? (last?.par ?? null) : par;
  const lastShot = shown.at(-1);
  const delayInvalid =
    delayMode === 'fixed'
      ? !(fixedDelay >= 0 && fixedDelay <= 60)
      : !(minDelay >= 0 && maxDelay <= 60 && minDelay <= maxDelay);

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'timer-settings', label: t('設定', 'Settings') },
            { id: 'timer-result', label: t('結果', 'Result') },
            { id: 'timer-video', label: t('動画から', 'From a video') },
            { id: 'timer-notes', label: t('注意', 'Notes') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('shot-timer').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '開始の遅れ・par・検出の設定を初期値に戻します。',
                  en: 'Resets the delay, par and detection settings.',
                }}
                onReset={reset}
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
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('結果', 'Result')}
          primary={
            <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
              <h2 id="timer-settings" className="text-xl font-medium">
                {t('開始の合図と par', 'Start signal and par')}
              </h2>
              <SegmentedControl
                legend={t('開始までの時間', 'Delay before the beep')}
                orientation="inline"
                value={delayMode}
                onChange={(value) => edit({ delayMode: value as 'fixed' | 'random' })}
                options={[
                  { value: 'random', label: t('ランダム', 'Random') },
                  { value: 'fixed', label: t('固定', 'Fixed') },
                ]}
              />
              {delayMode === 'fixed' ? (
                <NumberField
                  label={t('開始までの秒数', 'Delay')}
                  unit={t('秒', 's')}
                  value={fixedDelay}
                  onChange={(value) => edit({ fixedDelay: value })}
                  min={0}
                  max={60}
                  invalid={delayInvalid}
                  errorText={t('0 から 60 秒の間で入力してください。', 'Enter 0 to 60 seconds.')}
                />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <NumberField
                    label={t('最短', 'Shortest')}
                    unit={t('秒', 's')}
                    value={minDelay}
                    onChange={(value) => edit({ minDelay: value })}
                    min={0}
                    max={60}
                    invalid={delayInvalid}
                    errorText={t('最短 ≤ 最長、0〜60 秒にしてください。', 'Keep shortest ≤ longest, 0 to 60 s.')}
                  />
                  <NumberField
                    label={t('最長', 'Longest')}
                    unit={t('秒', 's')}
                    value={maxDelay}
                    onChange={(value) => edit({ maxDelay: value })}
                    min={0}
                    max={60}
                    invalid={delayInvalid}
                  />
                </div>
              )}
              <NumberField
                label={t('par タイム（空欄でなし）', 'Par time (blank for none)')}
                unit={t('秒', 's')}
                value={par ?? NaN}
                onChange={(value) => edit({ par: Number.isNaN(value) ? null : value })}
                min={0}
                invalid={par !== null && !(par > 0 && par <= 600)}
                errorText={t('0 より大きく 600 秒以下で入力してください。', 'Enter more than 0 and up to 600 seconds.')}
                hint={t(
                  '開始の合図からこの秒数でもう一度鳴ります。',
                  'A second beep sounds this long after the start.',
                )}
              />
              <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={useMicrophone}
                  disabled={run !== 'idle'}
                  onChange={(event) => edit({ useMicrophone: event.target.checked })}
                />
                {t('マイクで発砲音を検出する', 'Detect shots with the microphone')}
              </label>
              <div className="flex flex-wrap gap-2">
                {run === 'idle' ? (
                  <Button onClick={() => void start()} disabled={delayInvalid}>
                    <LuPlay aria-hidden="true" />
                    {t('スタート', 'Start')}
                  </Button>
                ) : (
                  <Button variant="destructive" onClick={() => stop()}>
                    <LuSquare aria-hidden="true" />
                    {t('ストップ', 'Stop')}
                  </Button>
                )}
              </div>
              <p role="status" className="text-sm font-medium">
                {
                  {
                    idle: t('待機中', 'Ready'),
                    starting: t('準備中…', 'Getting ready…'),
                    waiting: t('スタンバイ…（合図を待っています）', 'Stand by… waiting for the beep'),
                    running: useMicrophone ? t('計測中', 'Timing') : t('合図が鳴りました', 'Beep sounded'),
                  }[run]
                }
              </p>
              {notice && <p className="text-sm text-destructive">{t(...notice)}</p>}
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="timer-result" className="text-xl font-medium">
                {run === 'idle' ? t('直前のストリング', 'Last string') : t('計測中のストリング', 'This string')}
              </h2>
              <ResultPanel className="grid-cols-2">
                <ResultFigure
                  size="lead"
                  label={t('最後の弾', 'Last shot')}
                  value={lastShot ? `${seconds(lastShot.time)} s` : '—'}
                  tone={lastShot && shownPar !== null ? (lastShot.time <= shownPar ? 'good' : 'bad') : 'neutral'}
                  note={
                    lastShot && shownPar !== null
                      ? lastShot.time <= shownPar
                        ? t(`par ${seconds(shownPar)} 秒以内`, `Within par ${seconds(shownPar)} s`)
                        : t(`par ${seconds(shownPar)} 秒を超過`, `Over par ${seconds(shownPar)} s`)
                      : undefined
                  }
                />
                <ResultFigure label={t('弾数', 'Shots')} value={String(shown.length)} />
                <ResultFigure
                  label={t('初弾（合図から）', 'First shot (from the beep)')}
                  value={shown[0] ? `${seconds(shown[0].time)} s` : '—'}
                />
              </ResultPanel>
              {shown.length > 0 && (
                <ol className="space-y-1 text-sm tabular-nums">
                  {shown.map((shot, index) => (
                    <li key={`${shot.time}-${index}`}>
                      {t(
                        `${index + 1} 発目 ${seconds(shot.time)} 秒（スプリット ${seconds(shot.split)} 秒）`,
                        `Shot ${index + 1}: ${seconds(shot.time)} s (split ${seconds(shot.split)} s)`,
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {useMicrophone && (
                <div className="space-y-1">
                  <p className="text-sm">
                    {t('マイクの音量', 'Microphone level')}:{' '}
                    <span className="tabular-nums">{Number.isFinite(level) ? `${level.toFixed(1)} dBFS` : '—'}</span>
                  </p>
                  <meter
                    className="w-full"
                    min={-60}
                    max={0}
                    value={Number.isFinite(level) ? Math.max(-60, level) : -60}
                    aria-label={t('マイクの音量', 'Microphone level')}
                  />
                </div>
              )}
              {strings.length > 1 && (
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">{t('計ったストリング', 'Timed strings')}</h3>
                  <ol className="text-sm tabular-nums">
                    {strings.map((item, index) => (
                      <li key={index}>
                        {t(
                          `${strings.length - index}. ${item.shots.length} 発・最後 ${item.shots.at(-1) ? seconds(item.shots.at(-1)!.time) : '—'} 秒`,
                          `${strings.length - index}. ${item.shots.length} shots, last ${item.shots.at(-1) ? seconds(item.shots.at(-1)!.time) : '—'} s`,
                        )}
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs text-on-surface-variant">
                    {t('ページを閉じると消えます。', 'These are gone when the page is closed.')}
                  </p>
                </div>
              )}
            </Card>
          }
          secondary={
            <ConditionSection
              id="timer-detection"
              title={t('発砲検出のしきい値', 'Shot detection threshold')}
              summary={t(
                `${thresholdDb} dBFS 以上・間隔 ${deadTimeMs} ms`,
                `${thresholdDb} dBFS or louder, ${deadTimeMs} ms apart`,
              )}
              forceOpen={!(thresholdDb >= -60 && thresholdDb <= 0) || !(deadTimeMs >= 10 && deadTimeMs <= 1000)}
            >
              <NumberField
                label={t('しきい値', 'Threshold')}
                unit="dBFS"
                value={thresholdDb}
                onChange={(value) => edit({ thresholdDb: value })}
                min={-60}
                max={0}
                step={1}
                invalid={!(thresholdDb >= -60 && thresholdDb <= 0)}
                errorText={t('-60 から 0 の間で入力してください。', 'Enter -60 to 0.')}
                hint={t(
                  '0 に近いほど大きな音だけを数えます。隣の射座の音や反響を拾うときは上げ、自分の発砲を取りこぼすときは下げます。',
                  'Closer to 0 counts only louder sounds. Raise it if the next bay or echoes are counted, lower it if your own shots are missed.',
                )}
              />
              <NumberField
                label={t('最短の間隔', 'Shortest gap')}
                unit="ms"
                value={deadTimeMs}
                onChange={(value) => edit({ deadTimeMs: value })}
                min={10}
                max={1000}
                invalid={!(deadTimeMs >= 10 && deadTimeMs <= 1000)}
                errorText={t('10 から 1000 の間で入力してください。', 'Enter 10 to 1000.')}
                hint={t(
                  '1 発の反響を 2 発と数えないよう、この間隔より近い音は数えません。',
                  'Sounds closer together than this are not counted twice.',
                )}
              />
            </ConditionSection>
          }
          extras={
            <>
              <ConditionSection
                id="timer-video"
                title={t('動画から発砲のタイミングを出す', 'Shot timing from a video')}
                summary={t('動画・録音の音から', 'From the sound of a video or recording')}
              >
                <VideoAnalysis language={language} detector={{ thresholdDb, deadTimeMs }} />
              </ConditionSection>
              <ConditionSection
                id="timer-notes"
                title={t('注意', 'Notes')}
                summary={t('マイク検出と空撃ち', 'Microphone detection and dry practice')}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  <li>
                    {t(
                      'マイクは音の大きさだけで数えます。隣の射座の発砲や反響も拾い、エアガンや減音器付きの小さな音は取りこぼします。',
                      'The microphone counts by loudness alone. It picks up the next bay and echoes, and misses quiet shots from air guns or suppressed guns.',
                    )}
                  </li>
                  <li>
                    {t(
                      'スピーカーとマイクの遅れ（端末により数十ミリ秒）は補正していません。',
                      'Speaker and microphone latency (tens of milliseconds on some devices) is not corrected.',
                    )}
                  </li>
                  <li>
                    {t(
                      '空撃ちの練習は、実包が無いことを確かめてから行ってください。',
                      'Before dry practice, check that there is no live ammunition.',
                    )}
                  </li>
                </ul>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
