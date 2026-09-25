'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
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
import { labsTool } from '@/lib/labs-tools';
import { ENTRY_LIMIT, NOTE_MAX_LENGTH, localDateTimeSchema, type TrailEntry } from '@/lib/schemas/wounded-game';
import {
  SOURCES_CHECKED_ON,
  addMinutes,
  distancesFromShotSite,
  findingsFor,
  minutesBetween,
  sortEntries,
  sources,
  toLocalDateTime,
  waitAdvice,
  type CueId,
  type EntryKind,
  type HitClass,
  type Impression,
  type SourceId,
  type WaitGuide,
} from '@/lib/wounded-game';
import { rehydrateLanguage, useLanguage, useSetLanguage, type Language } from '@/store';

import { initialWoundedGameState, storageKey, useWoundedGameStore } from './_store';
import { BloodCamera } from './blood-camera';
import { TrailMap } from './trail-map';

const cueOrder: readonly CueId[] = [
  'bright-red',
  'dark-red',
  'frothy',
  'gut-fluid',
  'both-sides',
  'hair-bone',
  'no-blood',
  'down-in-sight',
];

const cueLabels: Record<CueId, { ja: string; en: string }> = {
  'bright-red': { ja: '鮮やかな赤い血', en: 'Bright red blood' },
  'dark-red': { ja: '暗い色の血', en: 'Dark red blood' },
  frothy: { ja: '泡が混じる血', en: 'Frothy blood' },
  'gut-fluid': { ja: '緑がかった液・脂・透明な液', en: 'Greenish fluid, tallow or clear fluid' },
  'both-sides': { ja: '足跡の両側に血', en: 'Blood on both sides of the trail' },
  'hair-bone': { ja: '毛・肉片・骨片', en: 'Hair, meat or bone fragments' },
  'no-blood': { ja: '血が見つからない', en: 'No blood found' },
  'down-in-sight': { ja: '倒れた個体が見えている', en: 'Animal down and in sight' },
};

const impressionLabels: Record<Impression, { ja: string; en: string }> = {
  chest: { ja: '胸（心臓・肺）', en: 'Chest (heart, lungs)' },
  gut: { ja: '腹（腸）', en: 'Abdomen (gut)' },
  'outside-cavity': { ja: '首・脚・尻・背', en: 'Neck, leg, rump, back' },
  unsure: { ja: '分からない', en: 'Not sure' },
};

const hitClassLabels: Record<HitClass, { ja: string; en: string }> = {
  chest: { ja: '胸（心臓・肺）に当たった場合の目安', en: 'Guidance for a chest hit' },
  gut: { ja: '腹（腸）に当たった場合の目安', en: 'Guidance for a gut hit' },
  'outside-cavity': { ja: '体腔の外に当たった場合の目安', en: 'Guidance for a hit outside the body cavity' },
  unsure: { ja: '当たった位置が分からない場合の目安', en: 'Guidance when the hit is uncertain' },
};

const contextLabels: Record<WaitGuide['context'], { ja: string; en: string }> = {
  bow: { ja: '弓猟の教材', en: 'Bowhunting course' },
  firearm: { ja: '銃猟の教材', en: 'Firearm course' },
  general: { ja: 'シカ猟一般', en: 'Deer hunting in general' },
};

const entryKindLabels: Record<EntryKind, { ja: string; en: string }> = {
  'shot-site': { ja: '被弾地点', en: 'Shot site' },
  blood: { ja: '血痕', en: 'Blood' },
  sign: { ja: 'その他の痕跡', en: 'Other sign' },
  lost: { ja: '跡を見失った地点', en: 'Sign lost' },
  recovered: { ja: '回収', en: 'Recovered' },
  note: { ja: 'メモ', en: 'Note' },
};

function SourceLinks({ ids, language }: { ids: readonly SourceId[]; language: Language }) {
  return (
    <span className="text-xs text-on-surface-variant">
      {language === 'ja' ? '出典: ' : 'Source: '}
      {ids.map((id, index) => (
        <span key={id}>
          {index > 0 && (language === 'ja' ? '、' : '; ')}
          <a href={sources[id].url} target="_blank" rel="noreferrer" className="underline">
            {sources[id].publisher[language]}「{sources[id].title[language]}」
          </a>
        </span>
      ))}
    </span>
  );
}

export function WoundedGameClient() {
  const { shotAt, impression, cues, entries, setShotAt, setImpression, setCue, addEntry, removeEntry } =
    useWoundedGameStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // Read after mount: the server's clock and time zone are not the reader's.
  const [now, setNow] = useState<string | null>(null);
  const [entryKind, setEntryKind] = useState<EntryKind>('blood');
  const [entryAt, setEntryAt] = useState('');
  const [entryNote, setEntryNote] = useState('');
  const [withPosition, setWithPosition] = useState(false);
  const [locating, setLocating] = useState(false);
  const [logMessage, setLogMessage] = useState<'full' | 'no-geolocation' | 'geolocation-failed' | null>(null);
  const [deleted, setDeleted] = useState<TrailEntry | null>(null);
  const shotAtId = useId();
  const entryAtId = useId();
  const noteId = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const pick = (text: { ja: string; en: string }) => text[language];

  useEffect(() => {
    void Promise.all([useWoundedGameStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
    // Pick up changes made in another tab.
    const sync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== storageKey) return;
      void useWoundedGameStore.persist.rehydrate();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    // The elapsed time only has to be right to the minute.
    const tick = () => setNow(toLocalDateTime(new Date()));
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const advice = waitAdvice(impression, cues);
  // With the animal in sight, the approach is shown as the lead answer instead.
  const findings = findingsFor(impression, cues).filter((finding) => finding.id !== 'approach');
  const shotAtValid = localDateTimeSchema.safeParse(shotAt).success;
  const startAfter = shotAtValid ? addMinutes(shotAt, advice.longestMinimum) : null;
  const elapsed = shotAtValid && now ? minutesBetween(shotAt, now) : null;
  const ordered = sortEntries(entries);
  const distances = distancesFromShotSite(entries);

  const duration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (language === 'ja')
      return hours === 0 ? `${rest} 分` : rest === 0 ? `${hours} 時間` : `${hours} 時間 ${rest} 分`;
    return hours === 0 ? `${rest} min` : rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  };
  const clock = (local: string) => {
    const match = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})$/.exec(local);
    return match ? `${Number(match[1])}/${Number(match[2])} ${match[3]}` : local;
  };
  const guideRange = (guide: WaitGuide) =>
    guide.maxMinutes === 0
      ? t('すぐに追う', 'Follow at once')
      : guide.maxMinutes === null
        ? t(`${duration(guide.minMinutes)}以上`, `${duration(guide.minMinutes)} or more`)
        : `${duration(guide.minMinutes)}〜${duration(guide.maxMinutes)}`;

  const lead = t(`${duration(advice.longestMinimum)}以上`, `${duration(advice.longestMinimum)} or more`);
  const waitFigure = (
    <ResultFigure
      size={startAfter ? 'normal' : 'lead'}
      label={t('資料が示す最も長い待ち時間', 'Longest wait in the sources')}
      value={lead}
      note={
        advice.shortestMinimum < advice.longestMinimum
          ? t(
              `資料によって ${advice.shortestMinimum === 0 ? 'すぐ' : duration(advice.shortestMinimum)}から分かれます。`,
              `Shortest in the sources: ${advice.shortestMinimum === 0 ? 'at once' : duration(advice.shortestMinimum)}.`,
            )
          : undefined
      }
    />
  );
  const inSightNote = t(
    '銃猟の教材では、倒れた個体が見えている場合は待ち時間の例外です。まだ生きていることがあります。',
    'The firearm course makes an exception to the wait when the downed animal is in sight. It may still be alive.',
  );
  const summary = advice.downInSight
    ? inSightNote
    : t(
        `${pick(hitClassLabels[advice.hitClass])}：資料が示す最も長い待ち時間は${lead}。${startAfter ? `追跡開始の目安は ${clock(startAfter)} 以降。` : ''}`,
        `${pick(hitClassLabels[advice.hitClass])}: the longest wait in the sources is ${lead}.${startAfter ? ` Start trailing from ${clock(startAfter)}.` : ''}`,
      );

  useEffect(() => {
    // Nothing is said before the saved state is read.
    if (!ready) return;
    // Announce once the ticks settle, so a screen reader is not read the guidance on every change.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [ready, summary]);

  const submitEntry = () => {
    const at = localDateTimeSchema.safeParse(entryAt).success ? entryAt : toLocalDateTime(new Date());
    const note = entryNote.trim();
    const save = (position: { latitude: number; longitude: number; accuracyMeters: number | null } | null) => {
      if (!addEntry({ at, kind: entryKind, note, position })) {
        setLogMessage('full');
        return;
      }
      setLogMessage(null);
      setDeleted(null);
      setEntryNote('');
      setEntryAt('');
      setAnnouncement(
        t(
          `${pick(entryKindLabels[entryKind])}を ${clock(at)} で記録しました。`,
          `${pick(entryKindLabels[entryKind])} logged at ${clock(at)}.`,
        ),
      );
    };
    if (!withPosition) {
      save(null);
      return;
    }
    if (!('geolocation' in navigator)) {
      setLogMessage('no-geolocation');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        save({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        });
      },
      () => {
        // Save nothing: an entry without the requested position would mislead later.
        setLocating(false);
        setLogMessage('geolocation-failed');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const logMessageText =
    logMessage === 'full'
      ? t(
          `記録は ${ENTRY_LIMIT} 件までです。不要な記録を削除してください。`,
          `The log holds ${ENTRY_LIMIT} entries. Delete some to add more.`,
        )
      : logMessage === 'no-geolocation'
        ? t(
            'このブラウザーでは現在地を取得できません。「現在地を付ける」を外してください。',
            'This browser cannot get your location. Untick “Add my location”.',
          )
        : logMessage === 'geolocation-failed'
          ? t(
              '現在地を取得できず、記録していません。位置情報の許可を確認するか、「現在地を付ける」を外してください。',
              'Location unavailable; nothing was logged. Check the location permission or untick “Add my location”.',
            )
          : '';

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('wounded-game').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '撃った時刻・手がかり・追跡の記録（位置を含む）をすべて消します。',
                  en: 'Clears the shot time, the signs and the trail log, including positions.',
                }}
                onReset={() => {
                  useWoundedGameStore.setState(initialWoundedGameState);
                  setDeleted(null);
                  setLogMessage(null);
                }}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty from the first paint: a status region inserted with its text already set is not announced. */}
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
          resultLabel={t('待ち時間の目安', 'Waiting time')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="signs" className="text-xl font-medium">
                {t('撃った直後の状況', 'Right after the shot')}
              </h2>
              <div className="space-y-2">
                <label htmlFor={shotAtId} className="block text-sm font-medium">
                  {t('撃った時刻', 'Shot time')}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id={shotAtId}
                    type="datetime-local"
                    value={shotAt}
                    onChange={(event) => setShotAt(event.target.value)}
                    className="min-h-12 min-w-0 flex-1"
                  />
                  <Button variant="outline" onClick={() => setShotAt(toLocalDateTime(new Date()))}>
                    {t('今の時刻', 'Now')}
                  </Button>
                </div>
              </div>
              <SegmentedControl
                legend={t('当たったと思う位置', 'Where you think it hit')}
                orientation="vertical"
                value={impression}
                options={(['chest', 'gut', 'outside-cavity', 'unsure'] as const).map((value) => ({
                  value,
                  label: pick(impressionLabels[value]),
                }))}
                onChange={(value) => setImpression(value as Impression)}
              />
              <fieldset className="min-w-0 space-y-1">
                <legend className="mb-2 text-sm font-medium">
                  {t('見つけた手がかり（複数選択可）', 'Signs found (select all that apply)')}
                </legend>
                {cueOrder.map((cue) => (
                  <label key={cue} className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={cues.includes(cue)}
                      onChange={(event) => setCue(cue, event.target.checked)}
                    />
                    {pick(cueLabels[cue])}
                  </label>
                ))}
              </fieldset>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="wait" className="text-xl font-medium">
                {advice.downInSight
                  ? t('倒れた個体が見えている場合', 'When the downed animal is in sight')
                  : pick(hitClassLabels[advice.hitClass])}
              </h2>
              {advice.downInSight ? (
                <ResultPanel>
                  <ResultFigure
                    size="lead"
                    label={t('待ち時間の目安', 'Waiting time')}
                    value={t('例外（近づき方を先に確認）', 'Exception: check the approach first')}
                    note={inSightNote}
                  />
                  <p className="text-sm">
                    {t(
                      '倒れた個体には、上側かつ頭の後方から慎重に近づきます。死んでいるように見えても、少し離れた場所で数分待ち、胸の上下の動きがないかを見ます。死んだ個体の目はふつう開いていて、棒で目に触れてもまばたきしなければ死んでいるとされます。まだ生きている場合は「止め刺しの安全」も確認してください。',
                      'Approach a downed animal carefully from above and behind the head. Even if it looks dead, wait a few minutes a short distance away and watch for the chest rising and falling. A dead animal’s eyes are usually open; if the eye does not blink when touched with a stick, it is dead. If it is still alive, see “Finishing safely”.',
                    )}
                  </p>
                  <SourceLinks
                    ids={['mo-hunter-trailing', 'mo-hunter-approach', 'mo-bow-approach']}
                    language={language}
                  />
                </ResultPanel>
              ) : (
                <ResultPanel className="sm:grid-cols-2">
                  {startAfter ? (
                    <>
                      <ResultFigure
                        size="lead"
                        label={t('追跡開始の目安', 'Start trailing from')}
                        value={clock(startAfter)}
                        note={
                          elapsed === null
                            ? undefined
                            : elapsed < 0
                              ? t('撃った時刻が現在より後です。', 'The shot time is later than now.')
                              : elapsed < advice.longestMinimum
                                ? t(
                                    `あと ${duration(advice.longestMinimum - elapsed)}（撃ってから ${duration(elapsed)}）`,
                                    `${duration(advice.longestMinimum - elapsed)} to go (${duration(elapsed)} since the shot)`,
                                  )
                                : t(
                                    `待ち時間を過ぎています（撃ってから ${duration(elapsed)}）`,
                                    `Wait is over (${duration(elapsed)} since the shot)`,
                                  )
                        }
                      />
                      {waitFigure}
                    </>
                  ) : (
                    <>
                      {waitFigure}
                      <ResultFigure
                        label={t('追跡開始の目安', 'Start trailing from')}
                        value="—"
                        note={t('撃った時刻を入力してください。', 'Enter the shot time.')}
                      />
                    </>
                  )}
                </ResultPanel>
              )}
              {advice.downInSight && (
                <h3 className="font-medium">{t('見えなくなった場合の待ち時間', 'If it drops out of sight')}</h3>
              )}
              <ul className="space-y-3 text-sm">
                {advice.guides.map((guide) => (
                  <li key={`${guide.sourceId}-${guide.minMinutes}`} className="space-y-1">
                    <p>
                      <span className="font-medium tabular-nums">{guideRange(guide)}</span>
                      <span className="ml-2 rounded-sm bg-surface-container px-1.5 py-0.5 text-xs">
                        {pick(contextLabels[guide.context])}
                      </span>
                    </p>
                    <p className="text-on-surface-variant">{pick(guide.text)}</p>
                    <SourceLinks ids={[guide.sourceId]} language={language} />
                  </li>
                ))}
              </ul>
              <div className="space-y-1 text-sm">
                <p className="text-on-surface-variant">
                  {t(
                    '州の広報記事では、犬で追跡する協力者が「30 分待てばよいという考えは捨て、もっと待つべき」と述べ、最初の 40 ヤード（約 37 m）以内で止まっていた個体を追い立ててしまった例が多いとしています。',
                    'A state news release quotes a volunteer dog tracker: forget waiting 30 minutes and wait longer. Many deer he was called for had stopped within 40 yards (about 37 m) and were pushed out.',
                  )}
                </p>
                <SourceLinks ids={['agfc']} language={language} />
              </div>
              {findings.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium">
                    {t('手がかりについての資料の記述', 'What the sources say about the signs')}
                  </h3>
                  <ul className="space-y-3 text-sm">
                    {findings.map((finding) => (
                      <li key={finding.id} className="space-y-1">
                        <p>{pick(finding.text)}</p>
                        <SourceLinks ids={finding.sourceIds} language={language} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-on-surface-variant">
                {t(
                  '待ち時間と手がかりは北米のオジロジカ猟の資料によります。手がかりが食い違うときは、最も長く待つ腹の兆候に従います。',
                  'Waiting times and signs are from North American material on white-tailed deer. When signs conflict, go by the gut sign, which has the longest wait.',
                )}
              </p>
              <p className="text-xs text-on-surface-variant">
                {t(
                  '日出前と日没後は銃猟ができません（鳥獣保護管理法第38条第1項）。日の出・日の入りの時刻は',
                  'Shooting is not allowed before sunrise or after sunset in Japan (Article 38(1) of the Act). Check sunrise and sunset in ',
                )}
                <Link href="/labs/hunting-hours" className="underline">
                  {labsTool('hunting-hours').title[language]}
                </Link>
                {t('で確認できます。', '.')}
              </p>
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="blood-camera"
                title={t('血痕を強調するカメラ', 'Blood-finding camera')}
                summary={t('写真の赤を強調', 'Picks out reds in a photo')}
              >
                <BloodCamera language={language} />
              </ConditionSection>
              <ConditionSection
                id="trail-log"
                title={t('追跡の記録', 'Trail log')}
                summary={
                  entries.length === 0
                    ? t('まだ記録はありません。', 'Nothing logged yet.')
                    : t(`${entries.length} 件の記録`, `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`)
                }
                defaultOpen
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label={t('記録の種類', 'Entry type')}
                    value={entryKind}
                    onChange={(value) => setEntryKind(value as EntryKind)}
                    options={(Object.keys(entryKindLabels) as EntryKind[]).map((value) => ({
                      value,
                      label: pick(entryKindLabels[value]),
                    }))}
                  />
                  <div className="min-w-0 space-y-2">
                    <label htmlFor={entryAtId} className="block text-sm font-medium">
                      {t('時刻', 'Time')}
                    </label>
                    <input
                      id={entryAtId}
                      type="datetime-local"
                      value={entryAt}
                      onChange={(event) => setEntryAt(event.target.value)}
                      aria-describedby={`${entryAtId}-hint`}
                      className="min-h-12 w-full"
                    />
                    <p id={`${entryAtId}-hint`} className="text-xs text-on-surface-variant">
                      {t('空欄なら追加した時刻になります。', 'If blank, the current time is used.')}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor={noteId} className="block text-sm font-medium">
                    {t('メモ（目印・血の量・向きなど）', 'Note (landmark, amount of blood, direction)')}
                  </label>
                  <textarea
                    id={noteId}
                    rows={2}
                    maxLength={NOTE_MAX_LENGTH}
                    value={entryNote}
                    onChange={(event) => setEntryNote(event.target.value)}
                    className="w-full rounded-sm border border-outline bg-surface p-3 text-base text-on-surface"
                  />
                </div>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={withPosition}
                    onChange={(event) => setWithPosition(event.target.checked)}
                  />
                  {t('現在地を付ける', 'Add my location')}
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={submitEntry} disabled={locating}>
                    {locating ? t('現在地を取得中…', 'Reading location…') : t('記録を追加', 'Add to log')}
                  </Button>
                </div>
                <p role="alert" className="text-sm text-destructive">
                  {logMessageText}
                </p>
                {deleted && (
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    {t(
                      `${clock(deleted.at)} の${pick(entryKindLabels[deleted.kind])}を削除しました。`,
                      `Deleted ${pick(entryKindLabels[deleted.kind]).toLowerCase()} at ${clock(deleted.at)}.`,
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        const { id: _id, ...rest } = deleted;
                        if (addEntry(rest)) {
                          setDeleted(null);
                          setAnnouncement(t('元に戻しました。', 'Restored.'));
                        } else setLogMessage('full');
                      }}
                    >
                      {t('元に戻す', 'Undo')}
                    </Button>
                  </p>
                )}
                {ordered.length > 0 && (
                  <ol className="divide-y divide-outline-variant rounded-sm border border-outline-variant">
                    {ordered.map((entry) => {
                      const distance = distances.get(entry.id);
                      return (
                        <li key={entry.id} className="flex items-start gap-3 p-3 text-sm">
                          <div className="min-w-0 flex-1 space-y-1">
                            <p>
                              <span className="font-medium tabular-nums">{clock(entry.at)}</span>
                              <span className="ml-2">{pick(entryKindLabels[entry.kind])}</span>
                            </p>
                            {entry.note && <p className="break-words">{entry.note}</p>}
                            {entry.position && (
                              <p className="text-xs text-on-surface-variant tabular-nums">
                                {entry.position.latitude.toFixed(5)}, {entry.position.longitude.toFixed(5)}
                                {entry.position.accuracyMeters !== null &&
                                  t(
                                    `（誤差 約 ${Math.round(entry.position.accuracyMeters)} m）`,
                                    ` (±${Math.round(entry.position.accuracyMeters)} m)`,
                                  )}
                                {distance !== undefined &&
                                  t(
                                    `・被弾地点から直線 ${Math.round(distance)} m`,
                                    ` · ${Math.round(distance)} m from shot site (straight line)`,
                                  )}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              removeEntry(entry.id);
                              setDeleted(entry);
                              setAnnouncement(t('記録を削除しました。', 'Entry deleted.'));
                            }}
                            aria-label={t(
                              `${clock(entry.at)} の${pick(entryKindLabels[entry.kind])}を削除`,
                              `Delete ${pick(entryKindLabels[entry.kind])} at ${clock(entry.at)}`,
                            )}
                          >
                            {t('削除', 'Delete')}
                          </Button>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <TrailMap language={language} entries={entries} kindLabel={(kind) => pick(entryKindLabels[kind])} />
                <div className="space-y-1 text-sm">
                  <p>
                    {t(
                      '跡を見失ったら、最後の目印に戻り、円を広げるように、または区画に分けて探します。下り方向や水場へ向かう獣道、カラスなどの鳥の動きも手がかりになるとされます。',
                      'If you lose the trail, go back to the last marker and search in widening circles or in a grid. Trails leading downhill or to water, and crows or ravens calling, can also be clues.',
                    )}
                  </p>
                  <SourceLinks ids={['mo-bow-lost', 'mo-hunter-trailing']} language={language} />
                </div>
                <div className="space-y-1 text-sm">
                  <p>
                    {t(
                      '食肉処理施設に搬入する場合、厚生労働省の指針では、捕獲者が被弾部位や止め刺しの部位・方法などを記録して処理業者に伝え、保存することとしています。',
                      'For a carcass going to a game meat plant, the hygiene guidelines ask the hunter to record the hit location and how the animal was finished, pass this to the processor and keep it.',
                    )}
                  </p>
                  <SourceLinks ids={['mhlw']} language={language} />
                </div>
              </ConditionSection>

              <ConditionSection
                id="finishing"
                title={t('止め刺しの安全', 'Finishing safely')}
                summary={t(
                  '手負いの個体への接近と、銃で止め刺すときの制限',
                  'Approaching a wounded animal, and limits on finishing with a gun',
                )}
              >
                <ul className="space-y-4 text-sm">
                  <li className="space-y-1">
                    <p>
                      {t(
                        '捕獲作業の事故は、転倒・滑落に次いで捕獲した鳥獣による怪我が多く、イノシシによるものが最も多いとされています。対策として、接近前に状態を目で確認する、個体を興奮させない、関係者以外を近づけない、3 人以上で作業する、銃を使うときは人の配置と矢先を確認する、が挙げられています。',
                        'After falls, injuries from the captured animal are the most common capture accidents, most often from wild boar. The manual lists: check the animal by eye before approaching; stay calm and do not excite it; keep bystanders away; work in a group of three or more; with a gun, check where everyone is and what lies beyond the target.',
                      )}
                    </p>
                    <SourceLinks ids={['maff-safety']} language={language} />
                  </li>
                  <li className="space-y-1">
                    <p>
                      {t(
                        '手負い（半矢）の個体が逃げる方向は、予測も誘導も難しいとされています。',
                        'Where a wounded animal will run is hard to predict or control.',
                      )}
                    </p>
                    <SourceLinks ids={['env-emergency']} language={language} />
                  </li>
                  <li className="space-y-1">
                    <p>
                      {t(
                        '福井県のわな捕獲マニュアルは、銃で止め刺す場合に、バックストップがあるか、岩などで跳弾しないか、住宅地から 200 m 以上離れているかを確認し、斜面の上側から近づくよう示しています（わなで捕獲した個体が対象）。',
                        'A Fukui Prefecture snare-trapping manual says to check, before finishing with a gun, that there is a backstop, that no rock could cause a ricochet and that homes are at least 200 m away, and to approach from uphill (written for snared animals).',
                      )}
                    </p>
                    <SourceLinks ids={['fukui']} language={language} />
                  </li>
                  <li className="space-y-1">
                    <p>
                      {t(
                        '倒れた個体には、上側かつ頭の後方から慎重に近づきます。死んでいるように見えても、少し離れた場所で数分待ち、胸の上下の動きがないかを見ます。死んだ個体の目はふつう開いていて、棒で目に触れてもまばたきしなければ死んでいるとされます。',
                        'Approach a downed animal carefully from above and behind the head. Even if it looks dead, wait a few minutes a short distance away and watch for the chest rising and falling. A dead animal’s eyes are usually open; if the eye does not blink when touched with a stick, it is dead.',
                      )}
                    </p>
                    <SourceLinks ids={['mo-hunter-approach', 'mo-bow-approach']} language={language} />
                  </li>
                  <li className="space-y-1">
                    <p>
                      {t(
                        '法は銃器を使用した鳥獣の捕獲等（捕獲又は殺傷）を「銃猟」とし、日出前・日没後の銃猟、住居が集合している地域等での銃猟、弾丸の到達するおそれのある人・動物・建物・乗物に向かっての銃猟を禁じています。',
                        'The Act calls capturing or killing wildlife with a firearm “shooting” and forbids it before sunrise and after sunset, in residential areas and places where people gather, and toward people, animals, buildings or vehicles a bullet could reach.',
                      )}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {t('第2条第8項、第34条の2第1項、第38条', 'Articles 2(8), 34-2(1) and 38')}
                    </p>
                    <SourceLinks ids={['law']} language={language} />
                  </li>
                </ul>
              </ConditionSection>

              <ConditionSection
                id="law"
                title={t('見つからないときと法令', 'When the animal is not found')}
                summary={t(
                  '捕獲した鳥獣の放置の禁止（鳥獣保護管理法第18条）',
                  'Leaving captured wildlife is prohibited (Article 18 of the Act)',
                )}
              >
                {language === 'en' && (
                  <p className="text-sm text-on-surface-variant">
                    Provisions are quoted in the original Japanese, with an English summary.
                  </p>
                )}
                <div className="space-y-4 text-sm">
                  <figure className="space-y-1">
                    <blockquote lang="ja" className="border-l-4 border-outline-variant pl-3">
                      鳥獣又は鳥類の卵の捕獲等又は採取等をした者は、適切な処理が困難な場合又は生態系に影響を及ぼすおそれが軽微である場合として環境省令で定める場合を除き、当該捕獲等又は採取等をした場所に、当該鳥獣又は鳥類の卵を放置してはならない。
                    </blockquote>
                    <figcaption className="text-xs text-on-surface-variant">
                      {t(
                        '法第18条（鳥獣の放置等の禁止）',
                        'Article 18: a person who captured or killed wildlife must not leave it where it was taken, except in cases set by ministerial ordinance.',
                      )}
                    </figcaption>
                  </figure>
                  <figure className="space-y-1">
                    <blockquote lang="ja" className="border-l-4 border-outline-variant pl-3">
                      一　地形、地質、積雪その他の捕獲等又は採取等をした者の責めに帰すことができない要因により、捕獲等をした鳥獣又は採取等をした鳥類の卵を持ち帰ることが困難で、かつ、これらを生態系に大きな影響を与えない方法で埋めることが困難であると認められる場合
                      <br />
                      二　過失がなくて捕獲等をした鳥獣の行方を確知することができない場合
                    </blockquote>
                    <figcaption className="text-xs text-on-surface-variant">
                      {t(
                        '施行規則第19条（抜粋。第3号・第4号は農地・林地での放置と漁業活動の場合）',
                        'Enforcement Regulations, Article 19 (excerpt): the exceptions include (1) terrain, geology, snow or other causes not the hunter’s fault that make it hard both to carry the animal out and to bury it harmlessly, and (2) being unable, without negligence, to learn where the animal went. Items 3 and 4 cover farm or forest land and fishing.',
                      )}
                    </figcaption>
                    <SourceLinks ids={['rule']} language={language} />
                  </figure>
                  <p>
                    {t(
                      '第18条に違反した者は、30 万円以下の罰金に処せられます（法第86条第1号）。',
                      'Breaking Article 18 is punishable by a fine of up to 300,000 yen (Article 86(1)).',
                    )}
                  </p>
                  <SourceLinks ids={['law']} language={language} />
                  <p className="text-on-surface-variant">
                    {t(
                      '止め刺しや猟犬による追跡など地域の規則は、狩猟者登録をした都道府県の鳥獣行政担当に確認します。',
                      'For local rules on finishing and tracking with dogs, ask the wildlife office of the prefecture where you are registered.',
                    )}
                  </p>
                </div>
              </ConditionSection>

              <ConditionSection
                id="sources"
                title={t('出典', 'Sources')}
                summary={t(`確認日 ${SOURCES_CHECKED_ON}`, `Checked on ${SOURCES_CHECKED_ON}`)}
              >
                <ul className="space-y-2 text-sm">
                  {Object.values(sources).map((source) => (
                    <li key={source.id}>
                      <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                        {source.publisher[language]}「{source.title[language]}」
                      </a>
                      <span className="ml-2 text-xs text-on-surface-variant">
                        {source.region === 'jp' ? t('国内', 'Japan') : t('北米', 'North America')}
                      </span>
                    </li>
                  ))}
                </ul>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
