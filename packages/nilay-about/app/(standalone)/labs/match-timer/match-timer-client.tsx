'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LuPause, LuPlay, LuRotateCcw, LuSkipForward } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  SectionNav,
  SegmentedControl,
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import { buildProgram, clock, cuesBetween, stateAt, type Cue, type MatchProgramKey } from '@/lib/match-timer';
import { requestWakeLock } from '@/lib/wake-lock';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { storageKey, useMatchTimerStore, type MatchTimerSettings } from './_store';

const RULE_BOOK_URL = 'https://www.issf-sports.org/rules';

/** The clock runs off the page's monotonic time, so a late tick never shifts the schedule. */
function useNow(running: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}

export function MatchTimerClient() {
  const settings = useMatchTimerStore();
  const { program: programKey, finalGapSeconds, outdoor, pistol, voice, edit, reset } = settings;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  // Elapsed seconds banked before the current run, and when the current run started (null while paused).
  const [banked, setBanked] = useState(0);
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [lockNotice, setLockNotice] = useState<[string, string] | null>(null);
  const now = useNow(runningSince !== null);
  const audioRef = useRef<AudioContext | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const lastElapsedRef = useRef(0);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useMatchTimerStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const gapValid = finalGapSeconds >= 0 && finalGapSeconds <= 120;
  const program = useMemo(
    () => buildProgram(programKey, { finalGapSeconds: gapValid ? finalGapSeconds : 20, outdoor, pistol }),
    [programKey, finalGapSeconds, gapValid, outdoor, pistol],
  );
  // The last tick can be older than the start, so the clock never reads before zero.
  const elapsed = Math.min(
    program.duration,
    Math.max(0, banked + (runningSince === null ? 0 : (now - runningSince) / 1000)),
  );
  const state = stateAt(program, elapsed);
  const started = elapsed > 0 || runningSince !== null;

  const announce = (cue: Cue) => {
    const context = audioRef.current;
    if (context) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 1000;
      gain.gain.setValueAtTime(0.5, context.currentTime);
      gain.gain.setValueAtTime(0, context.currentTime + 0.2);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.25);
    }
    if (voice === 'beep' || typeof speechSynthesis === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(voice === 'en' ? cue.command.replace(/…/g, ',') : cue.ja);
    utterance.lang = voice === 'en' ? 'en-US' : 'ja-JP';
    speechSynthesis.speak(utterance);
  };

  // Cues are given as the clock passes them, including the one at the very start.
  useEffect(() => {
    if (runningSince === null) {
      lastElapsedRef.current = elapsed;
      return;
    }
    const from = lastElapsedRef.current;
    const due = from === 0 ? program.cues.filter((cue) => cue.at <= elapsed) : cuesBetween(program, from, elapsed);
    lastElapsedRef.current = elapsed;
    due.forEach(announce);
    if (elapsed >= program.duration) pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on each tick of the clock
  }, [elapsed, runningSince]);

  useEffect(
    () => () => {
      releaseRef.current?.();
      void audioRef.current?.close().catch(() => undefined);
    },
    [],
  );

  const run = async () => {
    try {
      audioRef.current ??= new AudioContext();
      await audioRef.current.resume();
    } catch {
      audioRef.current = null;
    }
    if (elapsed === 0) lastElapsedRef.current = 0;
    setRunningSince(performance.now());
    const lock = await requestWakeLock(() =>
      setLockNotice(['画面のスリープ防止が解除されました。', 'The screen may now turn off.']),
    );
    releaseRef.current = lock.held ? lock.release : null;
    setLockNotice(
      lock.held
        ? null
        : [
            'このブラウザーでは画面のスリープを止められません。端末の自動ロックを切ってください。',
            'This browser cannot keep the screen on. Turn off auto-lock on the device.',
          ],
    );
  };
  function pause() {
    if (runningSince !== null)
      setBanked((value) => Math.min(program.duration, value + (performance.now() - runningSince) / 1000));
    setRunningSince(null);
    releaseRef.current?.();
    releaseRef.current = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }
  const restart = () => {
    pause();
    setBanked(0);
    lastElapsedRef.current = 0;
  };
  const skip = () => {
    if (!state.next) return;
    const to = state.next.at;
    setBanked(to - 0.001);
    lastElapsedRef.current = to - 0.001;
    if (runningSince !== null) setRunningSince(performance.now());
  };

  const confirmChange = () =>
    !started ||
    window.confirm(
      t('進行中のタイマーを止めて最初に戻します。よろしいですか？', 'Stop the timer and go back to the start?'),
    );
  const change = (changes: Partial<MatchTimerSettings>) => {
    if (!confirmChange()) return;
    restart();
    edit(changes);
  };

  const programNames: Record<MatchProgramKey, string> = {
    'air-qualification': t(
      '10m エアライフル・エアピストル 本射（60 発・75 分）',
      '10m Air Rifle / Air Pistol qualification (60 shots, 75 min)',
    ),
    'prone-qualification': t('50m 伏射 本射（60 発・50 分）', '50m Prone qualification (60 shots, 50 min)'),
    '3p-qualification': t('50m 3 姿勢 本射（60 発）', '50m 3 Positions qualification (60 shots)'),
    'air-final': t('10m エアライフル・エアピストル 決勝（24 発）', '10m Air Rifle / Air Pistol final (24 shots)'),
    '3p-final': t('50m 3 姿勢 決勝（35 発）', '50m 3 Positions final (35 shots)'),
  };
  const final = programKey === 'air-final' || programKey === '3p-final';
  const cueText = (cue: Cue) => (language === 'ja' ? `${cue.command}（${cue.ja}）` : cue.command);

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'match-program', label: t('種目', 'Event') },
            { id: 'match-clock', label: t('時計', 'Clock') },
            { id: 'match-cues', label: t('号令の一覧', 'Commands') },
            { id: 'match-sources', label: t('出典', 'Sources') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('match-timer').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '種目と読み上げの設定を初期値に戻し、時計を止めます。',
                  en: 'Resets the event and voice settings and stops the clock.',
                }}
                onReset={() => {
                  restart();
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
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('時計', 'Clock')}
          primary={
            <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
              <h2 id="match-program" className="text-xl font-medium">
                {t('種目と読み上げ', 'Event and voice')}
              </h2>
              <SelectField<MatchProgramKey>
                label={t('種目', 'Event')}
                value={programKey}
                onChange={(value) => change({ program: value })}
                options={(Object.keys(programNames) as MatchProgramKey[]).map((key) => ({
                  value: key,
                  label: programNames[key],
                }))}
              />
              {programKey === '3p-qualification' && (
                <SegmentedControl
                  legend={t('射場', 'Range')}
                  orientation="inline"
                  value={outdoor ? 'outdoor' : 'indoor'}
                  onChange={(value) => change({ outdoor: value === 'outdoor' })}
                  options={[
                    { value: 'indoor', label: t('屋内（90 分）', 'Indoor (90 min)') },
                    { value: 'outdoor', label: t('屋外（105 分）', 'Outdoor (105 min)') },
                  ]}
                />
              )}
              {programKey === 'air-final' && (
                <SegmentedControl
                  legend={t('銃', 'Gun')}
                  orientation="inline"
                  value={pistol ? 'pistol' : 'rifle'}
                  onChange={(value) => change({ pistol: value === 'pistol' })}
                  options={[
                    { value: 'rifle', label: t('ライフル', 'Rifle') },
                    { value: 'pistol', label: t('ピストル', 'Pistol') },
                  ]}
                />
              )}
              {final && (
                <NumberField
                  label={t('STOP から次の LOAD までの間', 'Pause from STOP to the next LOAD')}
                  unit={t('秒', 's')}
                  value={finalGapSeconds}
                  onChange={(value) => change({ finalGapSeconds: value })}
                  min={0}
                  max={120}
                  invalid={!gapValid}
                  errorText={t('0 から 120 秒の間で入力してください。', 'Enter 0 to 120 seconds.')}
                  hint={t(
                    '規則にあるのは第 1 シリーズ後の実況 15〜20 秒だけです。',
                    'The Rule Book only sets 15–20 s of commentary after the first series.',
                  )}
                />
              )}
              <SegmentedControl
                legend={t('号令の読み上げ', 'Read the commands')}
                orientation="inline"
                value={voice}
                onChange={(value) => edit({ voice: value as MatchTimerSettings['voice'] })}
                options={[
                  { value: 'en', label: t('英語（規則の文言）', 'English (as written)') },
                  { value: 'ja', label: t('日本語訳（非公式）', 'Japanese (unofficial)') },
                  { value: 'beep', label: t('音だけ', 'Beep only') },
                ]}
              />
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 sm:p-6">
              <h2 id="match-clock" className="text-xl font-medium">
                {state.phase
                  ? state.phase.name[language]
                  : state.finished
                    ? t('終了', 'Finished')
                    : t('次の号令まで', 'Until the next command')}
              </h2>
              <p className="text-6xl font-medium tabular-nums" aria-live="off">
                {clock(state.remaining)}
              </p>
              <p role="status" className="min-h-12 text-lg font-medium">
                {state.last && started ? cueText(state.last) : ''}
              </p>
              {state.next && (
                <p className="text-sm text-on-surface-variant">
                  {t(
                    `次：${clock(state.next.at - elapsed)} 後に ${cueText(state.next)}`,
                    `Next in ${clock(state.next.at - elapsed)}: ${cueText(state.next)}`,
                  )}
                </p>
              )}
              <p className="text-sm tabular-nums text-on-surface-variant">
                {t(
                  `経過 ${clock(elapsed)} / 全体 ${clock(program.duration)}`,
                  `Elapsed ${clock(elapsed)} of ${clock(program.duration)}`,
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {runningSince === null ? (
                  <Button onClick={() => void run()} disabled={state.finished || !gapValid}>
                    <LuPlay aria-hidden="true" />
                    {started ? t('再開', 'Resume') : t('スタート', 'Start')}
                  </Button>
                ) : (
                  <Button variant="outline" onClick={pause}>
                    <LuPause aria-hidden="true" />
                    {t('一時停止', 'Pause')}
                  </Button>
                )}
                <Button variant="outline" disabled={!state.next} onClick={skip}>
                  <LuSkipForward aria-hidden="true" />
                  {t('次の号令へ進む', 'Skip to the next command')}
                </Button>
                <Button variant="ghost" disabled={!started} onClick={restart}>
                  <LuRotateCcw aria-hidden="true" />
                  {t('最初に戻す', 'Back to the start')}
                </Button>
              </div>
              {lockNotice && <p className="text-sm text-on-surface-variant">{t(...lockNotice)}</p>}
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="match-cues"
                title={t('号令の一覧', 'All commands')}
                summary={t(
                  `${program.cues.length} の号令・全体 ${clock(program.duration)}`,
                  `${program.cues.length} commands, ${clock(program.duration)} in all`,
                )}
              >
                <ol className="divide-y divide-outline-variant text-sm">
                  {program.cues.map((cue, index) => (
                    <li
                      key={index}
                      aria-current={state.last === cue && started ? 'step' : undefined}
                      className="flex gap-3 py-1 aria-[current=step]:font-medium"
                    >
                      <span className="w-20 shrink-0 tabular-nums">{clock(cue.at)}</span>
                      <span className="min-w-0 flex-1">
                        {cueText(cue)}
                        {!cue.official && t('（規則に文言なし）', ' (wording not in the rules)')}
                      </span>
                    </li>
                  ))}
                </ol>
              </ConditionSection>
              <ConditionSection id="match-sources" title={t('出典', 'Sources')} summary="ISSF Rule Book 2026">
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  <li>
                    {t(
                      '時間と号令は ISSF Rule Book 2026（Edition 2025 Second Print 07/2026、2026 年 7 月 1 日発効）の 6.11.1、6.11.9、7.7.4、8.11、6.17.2、6.17.3 によります（2026-09-24 確認）。本射の時間は電子標的の場合です。',
                      'Times and commands follow rules 6.11.1, 6.11.9, 7.7.4, 8.11, 6.17.2 and 6.17.3 of the ISSF Rule Book 2026 (Edition 2025, second print 07/2026, effective 1 July 2026), checked 2026-09-24. Qualification times are for electronic targets.',
                    )}{' '}
                    <a href={RULE_BOOK_URL} className="text-primary underline" target="_blank" rel="noreferrer">
                      ISSF Rules
                    </a>
                  </li>
                  <li>
                    {t(
                      '決勝の時間は規則上も目安で、詳しい進行は ISSF の別資料「Commands and Announcements for Finals」にあります。実際の決勝では全員が撃ち終えると早く STOP がかかり、脱落の発表や同点の決着射が入ります。',
                      'Finals timings are guidelines in the rules too, with details in the ISSF document “Commands and Announcements for Finals”. In a real final STOP comes early once everyone has fired, and eliminations and tie-breaking shots are announced.',
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
