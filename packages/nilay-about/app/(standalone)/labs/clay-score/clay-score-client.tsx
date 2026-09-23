'use client';

import { useEffect, useState } from 'react';
import { LuPrinter, LuSave, LuUndo2 } from 'react-icons/lu';

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
import {
  CLAY_RULES_CHECKED_ON,
  ISSF_RULE_BOOK,
  TARGETS_PER_ROUND,
  sheetLayout,
  summarizeHistory,
  summarizeRound,
  type ClayDiscipline,
  type ClayRoundRecord,
  type SheetTarget,
  type StationTally,
  type TargetResult,
} from '@/lib/clay-score';
import { labsTool } from '@/lib/labs-tools';
import { NOTE_MAX_LENGTH } from '@/lib/schemas/clay-score';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { resetClayScore, storageKey, useClayScoreStore } from './_store';
import styles from './clay-score-print.module.css';
import { ClayScoreSheet } from './clay-score-sheet';

type Message = [ja: string, en: string];

export function ClayScoreClient() {
  const {
    discipline,
    startStation,
    results,
    note,
    records,
    deletedRecord,
    setDiscipline,
    setStartStation,
    mark,
    cycle,
    undoLast,
    clearSheet,
    setNote,
    saveRound,
    deleteRecord,
    undoDelete,
  } = useClayScoreStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  // Both wordings, picked at render, so a message follows a language change.
  const [announcement, setAnnouncement] = useState<Message | null>(null);
  const [saveMessage, setSaveMessage] = useState<Message | null>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useClayScoreStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const layout = sheetLayout(discipline, startStation);
  const summary = summarizeRound(discipline, startStation, results);
  const history = summarizeHistory(records, discipline);
  const percent = (value: number | null) =>
    value === null
      ? '—'
      : new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(value);
  const decimal = (value: number | null) =>
    value === null ? '—' : new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  const dateTime = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });

  const disciplineName = (value: ClayDiscipline) => (value === 'trap' ? t('トラップ', 'Trap') : t('スキート', 'Skeet'));
  const resultName = (result: TargetResult | null) =>
    result === 'hit' ? t('命中', 'hit') : result === 'miss' ? t('失中', 'miss') : t('未記録', 'not recorded');
  const houseName = (target: SheetTarget) =>
    target.house === undefined
      ? ''
      : `${target.kind === 'single' ? t('シングル', 'single') : t('ダブル', 'double')}・${
          target.house === 'high' ? t('ハイハウス', 'high house') : t('ローハウス', 'low house')
        }`;
  const targetName = (target: SheetTarget) =>
    t(
      `${target.index + 1} 枚目・射台 ${target.station}${target.house ? `・${houseName(target)}` : ''}`,
      `Target ${target.index + 1}, station ${target.station}${target.house ? `, ${houseName(target)}` : ''}`,
    );
  const next = summary.nextIndex === null ? null : layout[summary.nextIndex];

  const tallyLine = (hits: number, recorded: number): Message => [
    `${recorded} 枚中 ${hits} 枚命中`,
    `${hits} of ${recorded} hit`,
  ];
  const record = (result: TargetResult) => {
    if (!next || !mark(result)) return;
    const after = summarizeRound(discipline, startStation, useClayScoreStore.getState().results);
    const [tallyJa, tallyEn] = tallyLine(after.hits, after.recorded);
    setSaveMessage(null);
    setAnnouncement([
      `${next.index + 1} 枚目 ${result === 'hit' ? '命中' : '失中'}。${tallyJa}。`,
      `Target ${next.index + 1} ${result === 'hit' ? 'hit' : 'missed'}. ${tallyEn}.`,
    ]);
  };

  const changeDiscipline = (value: ClayDiscipline) => {
    if (value === discipline) return;
    // The two sheets share no targets, so the results cannot be carried over.
    if (
      summary.recorded > 0 &&
      !window.confirm(
        t(
          'このラウンドの記録は消えます。種目を切り替えますか？',
          'The results of this round will be cleared. Switch the discipline?',
        ),
      )
    )
      return;
    setDiscipline(value);
    setSaveMessage(null);
  };

  const save = () => {
    if (!saveRound()) {
      setSaveMessage([
        `${TARGETS_PER_ROUND} 枚すべてを記録してから保存してください。`,
        `Record all ${TARGETS_PER_ROUND} targets before saving.`,
      ]);
      return;
    }
    setSaveMessage(
      useStorageStatus.getState().available
        ? ['ラウンドを保存しました。', 'Round saved.']
        : [
            'この端末に保存できませんでした。履歴はこのページを離れると消えます。',
            'Could not save to this device. The history is lost when you leave this page.',
          ],
    );
  };

  const stationTable = (rows: StationTally[], caption: string, showRecorded: boolean) => (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="py-2 text-left font-medium">
            {t('射台', 'Station')}
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            {t('命中', 'Hits')}
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            {t('命中率', 'Rate')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.station} className="border-t border-outline-variant">
            <th scope="row" className="py-2 text-left font-normal">
              {row.station}
            </th>
            <td className="py-2 text-right tabular-nums">
              {showRecorded ? `${row.hits} / ${row.recorded}` : `${row.hits} / ${row.total}`}
              {showRecorded && row.recorded < row.total && (
                <span className="text-on-surface-variant">{t(`（全 ${row.total}）`, ` (of ${row.total})`)}</span>
              )}
            </td>
            <td className="py-2 text-right tabular-nums">
              {percent(row.recorded > 0 ? row.hits / row.recorded : null)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // The sheet in shooting order: a row per pass along the trap line, a row per stop on the skeet range.
  const groups = layout.reduce<{ group: number; station: number; targets: SheetTarget[] }[]>((rows, target) => {
    const row = rows.find((item) => item.group === target.group);
    if (row) row.targets.push(target);
    else rows.push({ group: target.group, station: target.station, targets: [target] });
    return rows;
  }, []);
  const groupLabel = (row: { group: number; station: number }) =>
    discipline === 'trap'
      ? t(`${row.group + 1} 巡目`, `Pass ${row.group + 1}`)
      : t(`射台 ${row.station}`, `Station ${row.station}`);

  const cell = (target: SheetTarget) => {
    const result = results[target.index] ?? null;
    return (
      <button
        key={target.index}
        type="button"
        onClick={() => {
          cycle(target.index);
          setSaveMessage(null);
        }}
        aria-label={`${targetName(target)}：${resultName(result)}`}
        className={cn(
          'flex min-h-12 !min-w-0 flex-1 flex-col items-center justify-center rounded-sm border !px-0 text-xs',
          result === 'hit' && 'border-primary bg-primary text-on-primary',
          result === 'miss' && 'border-error bg-error-container text-on-error-container',
          result === null && 'border-outline-variant bg-surface',
          summary.nextIndex === target.index && 'outline outline-2 outline-offset-2 outline-primary',
        )}
      >
        <span aria-hidden="true" className="leading-none">
          {discipline === 'trap'
            ? target.station
            : `${target.kind === 'single' ? 'S' : 'D'}·${target.house === 'high' ? 'H' : 'L'}`}
        </span>
        <span aria-hidden="true" className="mt-1 text-lg font-medium leading-none">
          {result === 'hit' ? '○' : result === 'miss' ? '×' : '·'}
        </span>
      </button>
    );
  };

  const recordSummary = (item: ClayRoundRecord) => {
    const round = summarizeRound(item.discipline, item.discipline === 'trap' ? item.startStation : 1, item.results);
    return { round, line: `${round.hits} / ${TARGETS_PER_ROUND}` };
  };

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('clay-score').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '記録中のラウンド・種目・開始射台・メモを初期値に戻します。保存したラウンドは残ります。',
                  en: 'The round in progress, discipline, first station and note return to their defaults. Saved rounds are kept.',
                }}
                onReset={() => {
                  resetClayScore();
                  setAnnouncement(null);
                  setSaveMessage(null);
                }}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty so later text is announced. */}
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {announcement ? t(...announcement) : ''}
      </p>
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('集計', 'Tally')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 className="text-xl font-medium">{t('このラウンド', 'This round')}</h2>
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <SegmentedControl
                  legend={t('種目', 'Discipline')}
                  orientation="inline"
                  value={discipline}
                  options={[
                    { value: 'trap', label: disciplineName('trap') },
                    { value: 'skeet', label: disciplineName('skeet') },
                  ]}
                  onChange={(value) => changeDiscipline(value as ClayDiscipline)}
                />
                {discipline === 'trap' && (
                  <SelectField
                    label={t('開始射台', 'First station')}
                    value={String(startStation)}
                    onChange={(value) => setStartStation(Number(value))}
                    options={[1, 2, 3, 4, 5].map((station) => ({
                      value: String(station),
                      label: t(`射台 ${station}`, `Station ${station}`),
                    }))}
                    hint={t(
                      '射順 6 番の人は射台 1 から。変えても記録は残ります。',
                      'The sixth in the squad starts at station 1. Changing it keeps the results.',
                    )}
                  />
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium" aria-live="off">
                  {next
                    ? t(`次：${targetName(next)}`, `Next: ${targetName(next)}`)
                    : t(`${TARGETS_PER_ROUND} 枚すべて記録しました。`, `All ${TARGETS_PER_ROUND} targets recorded.`)}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Button size="lg" disabled={!next} onClick={() => record('hit')}>
                    {t('命中 ○', 'Hit ○')}
                  </Button>
                  <Button size="lg" variant="outline" disabled={!next} onClick={() => record('miss')}>
                    {t('失中 ×', 'Miss ×')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    disabled={summary.recorded === 0}
                    onClick={() => {
                      undoLast();
                      setSaveMessage(null);
                      setAnnouncement(['最後の記録を消しました。', 'Cleared the last result.']);
                    }}
                  >
                    <LuUndo2 aria-hidden="true" />
                    {t('最後の記録を消す', 'Clear the last result')}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={summary.recorded === 0}
                    onClick={() => {
                      if (
                        !window.confirm(
                          t('このラウンドの記録をすべて消しますか？', 'Clear every result of this round?'),
                        )
                      )
                        return;
                      clearSheet();
                      setSaveMessage(null);
                      setAnnouncement(['このラウンドの記録を消しました。', 'Cleared the round.']);
                    }}
                  >
                    {t('ラウンドを消す', 'Clear the round')}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-medium">{t('スコアシート', 'Score sheet')}</h3>
                <p className="text-xs text-on-surface-variant">
                  {discipline === 'trap'
                    ? t(
                        'マスの数字は射台。押すと 未記録 → 命中 → 失中 と切り替わります。',
                        'The number in a box is the station. Tap a box to cycle: not recorded, hit, miss.',
                      )
                    : t(
                        'S＝シングル、D＝ダブル、H＝ハイハウス、L＝ローハウス。マスを押すと 未記録 → 命中 → 失中 と切り替わります。',
                        'S = single, D = double, H = high house, L = low house. Tap a box to cycle: not recorded, hit, miss.',
                      )}
                </p>
                <ol className="space-y-2">
                  {groups.map((row) => (
                    <li key={row.group} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
                      <span className="text-sm text-on-surface-variant">{groupLabel(row)}</span>
                      <div className="flex gap-1.5">{row.targets.map(cell)}</div>
                    </li>
                  ))}
                </ol>
              </div>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 className="text-xl font-medium">{t('集計', 'Tally')}</h2>
              <ResultPanel className="grid-cols-2">
                <ResultFigure
                  size="lead"
                  label={t('命中', 'Hits')}
                  value={summary.hits}
                  unit={`/ ${TARGETS_PER_ROUND}`}
                  note={t(`失中 ${summary.misses} 枚`, `${summary.misses} missed`)}
                />
                <ResultFigure
                  label={t('命中率', 'Hit rate')}
                  value={percent(summary.hitRate)}
                  note={t(`記録した ${summary.recorded} 枚に対して`, `Of ${summary.recorded} recorded`)}
                />
                <ResultFigure
                  label={t('最長の連続命中', 'Longest run of hits')}
                  value={summary.longestRun}
                  unit={t('枚', summary.longestRun === 1 ? 'target' : 'targets')}
                />
                <ResultFigure
                  label={t('いまの連続命中', 'Current run')}
                  value={summary.currentRun}
                  unit={t('枚', summary.currentRun === 1 ? 'target' : 'targets')}
                />
              </ResultPanel>
              {summary.recorded > 0 && stationTable(summary.stations, t('射台別の命中', 'Hits by station'), true)}
              <div className="space-y-2">
                <label htmlFor="clay-score-note" className="block text-sm font-medium">
                  {t('メモ（射撃場・銃・装弾など）', 'Note (range, gun, cartridges)')}
                </label>
                <textarea
                  id="clay-score-note"
                  rows={2}
                  maxLength={NOTE_MAX_LENGTH}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="w-full rounded-sm border border-outline bg-surface p-3 text-base text-on-surface"
                />
                <p className="text-xs text-on-surface-variant">
                  {t(
                    '保存するラウンドに付き、次のラウンドにも残ります。',
                    'Saved with the round and kept for the next.',
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Button className="w-full" disabled={!summary.complete} onClick={save}>
                  <LuSave aria-hidden="true" />
                  {t('このラウンドを保存', 'Save this round')}
                </Button>
                {!summary.complete && (
                  <p className="text-xs text-on-surface-variant">
                    {t(
                      `${TARGETS_PER_ROUND} 枚すべて記録すると保存できます。`,
                      `Record all ${TARGETS_PER_ROUND} targets to save.`,
                    )}
                  </p>
                )}
                <p role="status" className="text-sm">
                  {saveMessage ? t(...saveMessage) : ''}
                </p>
              </div>
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="clay-score-history"
                title={t('ラウンドの履歴', 'Round history')}
                summary={
                  history.rounds > 0
                    ? t(
                        `${disciplineName(discipline)} ${history.rounds} ラウンド・平均 ${decimal(history.average)} 枚・最高 ${history.best} 枚`,
                        `${disciplineName(discipline)}: ${history.rounds} ${history.rounds === 1 ? 'round' : 'rounds'}, average ${decimal(history.average)}, best ${history.best}`,
                      )
                    : t(
                        `保存した${disciplineName(discipline)}のラウンドなし`,
                        `No saved ${disciplineName(discipline)} rounds`,
                      )
                }
              >
                {storageAvailable && (
                  <p className="text-sm text-on-surface-variant">
                    {t('履歴はこのブラウザーに保存されます。', 'The history is saved in this browser.')}
                  </p>
                )}
                {history.rounds > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-base font-medium">
                      {t(
                        `${disciplineName(discipline)} の射台別命中率（保存した ${history.rounds} ラウンド）`,
                        `${disciplineName(discipline)} hit rate by station (${history.rounds} saved ${history.rounds === 1 ? 'round' : 'rounds'})`,
                      )}
                    </h3>
                    {stationTable(
                      history.stations,
                      t('保存したラウンドの射台別命中', 'Saved rounds by station'),
                      false,
                    )}
                  </div>
                )}
                {records.length > 0 && (
                  <ul className="divide-y divide-outline-variant border-y border-outline-variant">
                    {records.map((item) => {
                      const { round, line } = recordSummary(item);
                      return (
                        <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium tabular-nums">
                              {disciplineName(item.discipline)} {line}
                            </p>
                            <p className="text-sm text-on-surface-variant">
                              {dateTime.format(new Date(item.savedAt))}
                              {item.discipline === 'trap' &&
                                t(` ・ 開始射台 ${item.startStation}`, ` · first station ${item.startStation}`)}
                              {t(` ・ 最長連続 ${round.longestRun}`, ` · longest run ${round.longestRun}`)}
                            </p>
                            {item.note && <p className="whitespace-pre-wrap text-sm">{item.note}</p>}
                          </div>
                          <Button
                            variant="ghost"
                            aria-label={t(
                              `${dateTime.format(new Date(item.savedAt))} の${disciplineName(item.discipline)} ${line} を削除`,
                              `Delete ${disciplineName(item.discipline)} ${line}, ${dateTime.format(new Date(item.savedAt))}`,
                            )}
                            onClick={() => deleteRecord(item.id)}
                          >
                            {t('削除', 'Delete')}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div role="status" className={deletedRecord ? 'flex flex-wrap items-center gap-2 text-sm' : 'sr-only'}>
                  {deletedRecord && (
                    <>
                      <span>
                        {t(
                          `${disciplineName(deletedRecord.record.discipline)} ${recordSummary(deletedRecord.record).line} を削除しました。`,
                          `Deleted ${disciplineName(deletedRecord.record.discipline)} ${recordSummary(deletedRecord.record).line}.`,
                        )}
                      </span>
                      <Button variant="ghost" onClick={undoDelete}>
                        {t('元に戻す', 'Undo')}
                      </Button>
                    </>
                  )}
                </div>
              </ConditionSection>

              <ConditionSection
                id="clay-score-print"
                title={t('白紙のスコアシートを印刷', 'Print a blank score sheet')}
                summary={t(
                  `${disciplineName(discipline)}・5 ラウンド分・A4 縦`,
                  `${disciplineName(discipline)}, five rounds, A4 portrait`,
                )}
              >
                <div className="mx-auto max-w-sm rounded-sm border border-outline-variant bg-white">
                  <ClayScoreSheet
                    discipline={discipline}
                    language={language}
                    label={t(
                      `${disciplineName(discipline)}の白紙スコアシートのプレビュー`,
                      `Preview of the blank ${disciplineName(discipline)} score sheet`,
                    )}
                    className="block h-auto w-full"
                  />
                </div>
                <Button className="w-full" onClick={() => window.print()}>
                  <LuPrinter aria-hidden="true" />
                  {t('印刷', 'Print')}
                </Button>
                <p className="text-xs text-on-surface-variant">
                  {t(
                    '用紙は A4 縦、余白なしを選び、ヘッダーとフッターを切ってください。',
                    'Print on A4 portrait with no margins and no headers or footers.',
                  )}
                </p>
              </ConditionSection>

              <ConditionSection
                id="clay-score-sources"
                title={t('規則と出典', 'Rules and sources')}
                summary={t(
                  `ISSF 規則 2026 年版（${CLAY_RULES_CHECKED_ON} 確認）。練習の記録用で、公式記録の代わりにはなりません。`,
                  `ISSF Rules, 2026 edition (checked ${CLAY_RULES_CHECKED_ON}). For practice; not a substitute for the official score.`,
                )}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    'シートの構成は、国際射撃連盟（ISSF）の次の規則によります。',
                    'The sheets follow these International Shooting Sport Federation (ISSF) rules.',
                  )}
                </p>
                <p className="text-sm">
                  <a href={ISSF_RULE_BOOK.url} target="_blank" rel="noreferrer" className="underline" lang="en">
                    {ISSF_RULE_BOOK.name}
                  </a>
                </p>
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '9.6.1.3：トラップ・スキートの個人種目は予選 125 枚、25 枚ずつ 5 ラウンド。',
                      '9.6.1.3: individual Trap and Skeet qualification is 125 targets, five rounds of 25.',
                    )}
                  </li>
                  <li>
                    {t(
                      '6.4.18・9.8.1.1：トラップは射台 5 つ。1 枚ごとに右隣の射台へ移り、各射台で 5 枚、計 25 枚。予選では 1 枚に 2 発まで撃てます（決勝は 1 発）。',
                      '6.4.18, 9.8.1.1: Trap has five stations. The athlete moves one station right after each target, five targets per station, 25 in all. Two shots per target in qualification (one in finals).',
                    )}
                  </li>
                  <li>
                    {t(
                      '6.4.19・9.9.2.2：スキートは射台 8 つ、ハイハウスとローハウス。予選の射順（シングル・ダブル）は規則の表のとおりで、1 枚に 1 発のみ。',
                      '6.4.19, 9.9.2.2: Skeet has eight stations, a high house and a low house. The qualification sequence of singles and doubles follows the table in the rules; one shot per target.',
                    )}
                  </li>
                  <li>
                    {t(
                      '9.13.2：公式の得点は、射場ごとに副審が公式スコアカードとスコアボードで記録します。命中・失中、ノーターゲット、反則は審判が判定します。',
                      '9.13.2: on each range the assistant referees keep the official score on the official scorecard and a scoreboard. Hits, lost targets, no targets and penalties are the referee’s decision.',
                    )}
                  </li>
                  <li>
                    {t(
                      'トラップの 2 発目で割れた標的も命中です。どの弾で割れたかは記録しません。',
                      'In Trap, a target broken with the second shot counts as a hit. Which shot broke it is not recorded.',
                    )}
                  </li>
                  <li>
                    {t(
                      '国内の大会は主催者の規則によります（日本クレー射撃協会の競技規則は未確認）。出場する大会の要項と規則を確認してください。',
                      'Competitions in Japan follow their organisers’ rules (the Japan Clay Target Shooting Association rule book has not been checked). Check the programme and rules of your competition.',
                    )}
                  </li>
                </ul>
              </ConditionSection>
            </>
          }
        />
      </div>
      <div className={styles.sheet}>
        <ClayScoreSheet discipline={discipline} language={language} actualSize className="block" />
      </div>
    </AppLayout>
  );
}
