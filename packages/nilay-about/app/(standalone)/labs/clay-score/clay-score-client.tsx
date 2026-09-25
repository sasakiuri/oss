'use client';

import { useEffect, useState } from 'react';
import { LuPlus, LuPrinter, LuSave, LuUndo2 } from 'react-icons/lu';

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
  MAX_SQUAD,
  TARGETS_PER_ROUND,
  TRAP_DIRECTIONS,
  firstBarrelRate,
  nextTurn,
  sheetLayout,
  summarizeRound,
  tagValues,
  type ClayDiscipline,
  type KeyAction,
  type SheetTarget,
  type TargetResult,
  type TrapDirection,
} from '@/lib/clay-score';
import { labsTool } from '@/lib/labs-tools';
import { NOTE_MAX_LENGTH, TAG_MAX_LENGTH, resultsAllowed } from '@/lib/schemas/clay-score';
import { gunLabel } from '@/lib/shotgun-gear';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { rehydrateGear } from '../shotgun-gear/_store';
import { GearPicker } from '../shotgun-gear/gear-picker';

import { anyRecorded, resetClayScore, storageKey, useClayScoreStore, type MarkedTurn } from './_store';
import { ClayHistory, TAG_KEYS, tagName } from './clay-score-history';
import { ClayKeySettings, useKeyInput } from './clay-score-keys';
import styles from './clay-score-print.module.css';
import { ClayScoreSheet } from './clay-score-sheet';
import { ClayTallies, directionName, percentFormat } from './clay-score-tallies';

type Message = [ja: string, en: string];

const RESULT_GLYPH: Record<TargetResult, string> = { hit: '○', first: '①', second: '②', miss: '×' };
const DIRECTION_GLYPH: Record<TrapDirection, string> = { left: '←', centre: '↑', right: '→' };
const RESULT_WORDS: Record<TargetResult, Message> = {
  hit: ['命中', 'hit'],
  first: ['初矢で命中', 'hit with the first barrel'],
  second: ['二の矢で命中', 'hit with the second barrel'],
  miss: ['失中', 'missed'],
};

export function ClayScoreClient() {
  const store = useClayScoreStore();
  const {
    discipline,
    barrels,
    recordDirections,
    shooters,
    note,
    tags,
    sessionId,
    records,
    deletedRecords,
    keysEnabled,
    keyMap,
  } = store;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  // Both wordings, picked at render, so a message follows a language change.
  const [announcement, setAnnouncement] = useState<Message | null>(null);
  const [saveMessage, setSaveMessage] = useState<Message | null>(null);
  const [pendingDirection, setPendingDirection] = useState<TrapDirection | null>(null);
  const [capturing, setCapturing] = useState<KeyAction | null>(null);
  const [tallyShooter, setTallyShooter] = useState(0);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useClayScoreStore.persist.rehydrate(), rehydrateGear(), rehydrateLanguage()]).then(() =>
      setReady(true),
    );
  }, []);

  const trap = discipline === 'trap';
  const withBarrels = trap && barrels;
  const withDirections = trap && recordDirections;
  const squad = shooters.length > 1;
  const allowed = resultsAllowed(discipline, barrels);
  const turn = nextTurn(
    discipline,
    shooters.map((shooter) => shooter.results),
  );
  const recorded = anyRecorded(shooters);
  const summaries = shooters.map((shooter) =>
    summarizeRound({
      discipline,
      startStation: shooter.startStation,
      results: shooter.results,
      directions: shooter.directions,
      barrels,
    }),
  );
  const complete = summaries.every((summary) => summary.complete);
  const tallyIndex = Math.min(tallyShooter, shooters.length - 1);
  const summary = summaries[tallyIndex]!;
  const percent = percentFormat(language);
  const sessionRecords = records.filter((record) => record.sessionId === sessionId);
  const sessionHits = sessionRecords.reduce(
    (sum, record) => sum + record.results.filter((result) => result !== 'miss').length,
    0,
  );

  const disciplineName = (value: ClayDiscipline) => (value === 'trap' ? t('トラップ', 'Trap') : t('スキート', 'Skeet'));
  const shooterName = (position: number) =>
    shooters[position]?.name.trim() || t(`射手 ${position + 1}`, `Shooter ${position + 1}`);
  const resultName = (result: TargetResult | null) =>
    ({
      hit: t('命中', 'hit'),
      first: t('初矢で命中', 'hit with the first barrel'),
      second: t('二の矢で命中', 'hit with the second barrel'),
      miss: t('失中', 'miss'),
      none: t('未記録', 'not recorded'),
    })[result ?? 'none'];
  const buttonName = (result: TargetResult) =>
    ({
      hit: t('命中 ○', 'Hit ○'),
      first: t('初矢 ①', 'First ①'),
      second: t('二の矢 ②', 'Second ②'),
      miss: t('失中 ×', 'Miss ×'),
    })[result];
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
  const turnName = (position: number, target: SheetTarget) =>
    squad
      ? t(`${shooterName(position)}・${targetName(target)}`, `${shooterName(position)}, ${targetName(target)}`)
      : targetName(target);
  const next = turn ? sheetLayout(discipline, shooters[turn.shooter]!.startStation)[turn.index]! : null;

  const announce = (marked: MarkedTurn) => {
    const after = useClayScoreStore.getState().shooters[marked.shooter]!;
    const round = summarizeRound({ discipline, startStation: after.startStation, results: after.results });
    const who: Message = squad ? [`${shooterName(marked.shooter)}、`, `${shooterName(marked.shooter)}, `] : ['', ''];
    const where: Message = marked.direction
      ? [`・${directionName(marked.direction, 'ja')}`, `, ${directionName(marked.direction, 'en').toLowerCase()}`]
      : ['', ''];
    const outcome = RESULT_WORDS[marked.result];
    setAnnouncement([
      `${who[0]}${marked.index + 1} 枚目 ${outcome[0]}${where[0]}。${round.recorded} 枚中 ${round.hits} 枚命中。`,
      `${who[1]}${squad ? 'target' : 'Target'} ${marked.index + 1} ${outcome[1]}${where[1]}. ${round.hits} of ${round.recorded} hit.`,
    ]);
  };

  const record = (result: TargetResult, direction: TrapDirection | null = null) => {
    const marked = store.mark(result, withDirections ? direction : null);
    setPendingDirection(null);
    if (!marked) return;
    setSaveMessage(null);
    announce(marked);
  };

  const undo = () => {
    if (!store.undoLast()) return;
    setSaveMessage(null);
    setAnnouncement(['最後の記録を消しました。', 'Cleared the last result.']);
  };

  useKeyInput({
    enabled: ready && keysEnabled,
    keyMap,
    capturing,
    onAction: (action) => {
      if (action === 'undo') return undo();
      if (action === 'left' || action === 'centre' || action === 'right') {
        if (!withDirections) return;
        setPendingDirection(action);
        setAnnouncement([`方向：${directionName(action, 'ja')}`, `Direction: ${directionName(action, 'en')}`]);
        return;
      }
      const result: TargetResult | null =
        action === 'miss'
          ? 'miss'
          : action === 'first'
            ? withBarrels
              ? 'first'
              : 'hit'
            : withBarrels
              ? 'second'
              : null;
      if (result) record(result, pendingDirection);
    },
    onCapture: (key) => {
      if (capturing && key !== null) store.setKey(capturing, key);
      setCapturing(null);
    },
  });

  const keyActions: KeyAction[] = [
    'first',
    ...(withBarrels ? (['second'] as const) : []),
    'miss',
    'undo',
    ...(withDirections ? TRAP_DIRECTIONS : []),
  ];
  const actionName = (action: KeyAction) =>
    ({
      first: withBarrels ? t('初矢で命中', 'Hit, first barrel') : t('命中', 'Hit'),
      second: t('二の矢で命中', 'Hit, second barrel'),
      miss: t('失中', 'Miss'),
      undo: t('最後の記録を消す', 'Clear the last result'),
      left: t('方向：左', 'Direction: left'),
      centre: t('方向：正面', 'Direction: centre'),
      right: t('方向：右', 'Direction: right'),
    })[action];

  const changeDiscipline = (value: ClayDiscipline) => {
    if (value === discipline) return;
    // The two sheets share no targets, so the results cannot be carried over.
    if (
      recorded &&
      !window.confirm(
        t(
          'このラウンドの記録は消えます。種目を切り替えますか？',
          'The results of this round will be cleared. Switch the discipline?',
        ),
      )
    )
      return;
    store.setDiscipline(value);
    setSaveMessage(null);
  };

  const changeSquadSize = (size: number) => {
    const dropped = shooters.slice(size);
    if (
      dropped.some((shooter) => shooter.results.some((result) => result !== null)) &&
      !window.confirm(
        t(
          '外す射手の記録は消えます。人数を減らしますか？',
          'The results of the shooters removed will be cleared. Continue?',
        ),
      )
    )
      return;
    store.setSquadSize(size);
  };

  const save = () => {
    if (!store.saveRound()) {
      setSaveMessage([
        `すべての射手の ${TARGETS_PER_ROUND} 枚を記録してから保存してください。`,
        `Record all ${TARGETS_PER_ROUND} targets for every shooter before saving.`,
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

  const cell = (position: number, target: SheetTarget) => {
    const shooter = shooters[position]!;
    const result = shooter.results[target.index] ?? null;
    const direction = shooter.directions[target.index] ?? null;
    const isNext = turn?.shooter === position && turn.index === target.index;
    return (
      <button
        key={target.index}
        type="button"
        onClick={() => {
          store.cycle(position, target.index);
          setSaveMessage(null);
        }}
        aria-label={`${turnName(position, target)}：${resultName(result)}${direction ? `・${directionName(direction, language)}` : ''}`}
        className={cn(
          'flex min-h-12 !min-w-0 flex-1 flex-col items-center justify-center rounded-sm border !px-0 text-xs',
          result !== null && result !== 'miss' && 'border-primary bg-primary text-on-primary',
          result === 'miss' && 'border-error bg-error-container text-on-error-container',
          result === null && 'border-outline-variant bg-surface',
          isNext && 'outline outline-2 outline-offset-2 outline-primary',
        )}
      >
        <span aria-hidden="true" className="leading-none">
          {trap ? target.station : `${target.kind === 'single' ? 'S' : 'D'}·${target.house === 'high' ? 'H' : 'L'}`}
        </span>
        <span aria-hidden="true" className="mt-1 text-lg font-medium leading-none">
          {result ? RESULT_GLYPH[result] : '·'}
        </span>
        {direction && (
          <span aria-hidden="true" className="text-[10px] leading-none">
            {DIRECTION_GLYPH[direction]}
          </span>
        )}
      </button>
    );
  };

  const sheet = (position: number) => {
    const layout = sheetLayout(discipline, shooters[position]!.startStation);
    // The sheet in shooting order: a row per pass along the trap line, a row per stop on the skeet range.
    const groups = layout.reduce<{ group: number; station: number; targets: SheetTarget[] }[]>((rows, target) => {
      const row = rows.find((item) => item.group === target.group);
      if (row) row.targets.push(target);
      else rows.push({ group: target.group, station: target.station, targets: [target] });
      return rows;
    }, []);
    return (
      <div key={shooters[position]!.id} className="space-y-2">
        {squad && (
          <h4 className="text-sm font-medium">
            {shooterName(position)}
            <span className="text-on-surface-variant">{`　${summaries[position]!.hits} / ${TARGETS_PER_ROUND}`}</span>
          </h4>
        )}
        <ol className="space-y-2">
          {groups.map((row) => (
            <li key={row.group} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-sm text-on-surface-variant">
                {trap
                  ? t(`${row.group + 1} 巡目`, `Pass ${row.group + 1}`)
                  : t(`射台 ${row.station}`, `Station ${row.station}`)}
              </span>
              <div className="flex gap-1.5">{row.targets.map((target) => cell(position, target))}</div>
            </li>
          ))}
        </ol>
      </div>
    );
  };

  const inputButtons = withDirections ? (
    <table className="w-full table-fixed border-separate border-spacing-1.5">
      <caption className="sr-only">
        {t('結果と方向を 1 回で記録', 'Record the result and direction in one tap')}
      </caption>
      <thead>
        <tr>
          <td />
          {TRAP_DIRECTIONS.map((direction) => (
            <th key={direction} scope="col" className="text-sm font-medium">
              {`${DIRECTION_GLYPH[direction]} ${directionName(direction, language)}`}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {allowed.map((result) => (
          <tr key={result}>
            <th scope="row" className="text-left text-sm font-medium">
              {buttonName(result)}
            </th>
            {TRAP_DIRECTIONS.map((direction) => (
              <td key={direction}>
                <Button
                  size="lg"
                  className="w-full !min-w-0 !px-1"
                  variant={result === 'miss' ? 'outline' : 'default'}
                  disabled={!turn}
                  aria-label={`${buttonName(result)}・${directionName(direction, language)}`}
                  onClick={() => record(result, direction)}
                >
                  <span aria-hidden="true">{`${RESULT_GLYPH[result]}${DIRECTION_GLYPH[direction]}`}</span>
                </Button>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <div className={cn('grid gap-3', allowed.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {allowed.map((result) => (
        <Button
          key={result}
          size="lg"
          variant={result === 'miss' ? 'outline' : 'default'}
          disabled={!turn}
          onClick={() => record(result)}
        >
          {buttonName(result)}
        </Button>
      ))}
    </div>
  );

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
                  ja: '記録中のラウンド・種目・射手・記録方法・メモ・タグを初期値に戻します。保存したラウンドとキーの割り当ては残ります。',
                  en: 'The round in progress, discipline, shooters, recording options, note and tags return to their defaults. Saved rounds and key assignments are kept.',
                }}
                onReset={() => {
                  resetClayScore();
                  setAnnouncement(null);
                  setSaveMessage(null);
                  setPendingDirection(null);
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
                <SelectField
                  label={t('射手の人数', 'Shooters')}
                  value={String(shooters.length)}
                  onChange={(value) => changeSquadSize(Number(value))}
                  options={Array.from({ length: MAX_SQUAD }, (_, index) => ({
                    value: String(index + 1),
                    label: t(`${index + 1} 人`, `${index + 1}`),
                  }))}
                  hint={
                    squad ? t('射順どおりに順番に記録します。', 'Results go in turn, in shooting order.') : undefined
                  }
                />
              </div>
              {trap && (
                <div className="space-y-1">
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={barrels}
                      disabled={recorded}
                      onChange={(event) => store.setBarrels(event.target.checked)}
                    />
                    {t('初矢と二の矢を分けて記録する', 'Record which barrel broke each target')}
                  </label>
                  {recorded && (
                    <p className="text-xs text-on-surface-variant">
                      {t(
                        '記録を始めたラウンドでは切り替えられません。',
                        'Cannot be changed once the round has started.',
                      )}
                    </p>
                  )}
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={recordDirections}
                      onChange={(event) => {
                        store.setRecordDirections(event.target.checked);
                        setPendingDirection(null);
                      }}
                    />
                    {t('クレーの飛んだ方向も記録する', 'Also record the direction each target flew')}
                  </label>
                </div>
              )}
              {squad ? (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">{t('射手（射順）', 'Shooters (in order)')}</legend>
                  {shooters.map((shooter, position) => (
                    <div key={shooter.id} className="grid items-end gap-3 sm:grid-cols-2">
                      <div className="min-w-0 space-y-2">
                        <label htmlFor={`clay-shooter-${position}`} className="block text-sm font-medium">
                          {t(`射順 ${position + 1} の名前`, `Name, position ${position + 1}`)}
                        </label>
                        <input
                          id={`clay-shooter-${position}`}
                          type="text"
                          value={shooter.name}
                          maxLength={TAG_MAX_LENGTH}
                          placeholder={t(`射手 ${position + 1}`, `Shooter ${position + 1}`)}
                          onChange={(event) => store.setShooterName(position, event.target.value)}
                        />
                      </div>
                      {trap && (
                        <SelectField
                          label={t(`射順 ${position + 1} の開始射台`, `First station, position ${position + 1}`)}
                          value={String(shooter.startStation)}
                          onChange={(value) => store.setStartStation(position, Number(value))}
                          options={[1, 2, 3, 4, 5].map((station) => ({
                            value: String(station),
                            label: t(`射台 ${station}`, `Station ${station}`),
                          }))}
                        />
                      )}
                    </div>
                  ))}
                </fieldset>
              ) : (
                trap && (
                  <SelectField
                    label={t('開始射台', 'First station')}
                    value={String(shooters[0]!.startStation)}
                    onChange={(value) => store.setStartStation(0, Number(value))}
                    options={[1, 2, 3, 4, 5].map((station) => ({
                      value: String(station),
                      label: t(`射台 ${station}`, `Station ${station}`),
                    }))}
                    hint={t('射順 6 番の人は射台 1 から', 'The sixth in the squad starts at station 1')}
                  />
                )
              )}

              <div className="space-y-3">
                <p className="text-sm font-medium" aria-live="off">
                  {turn && next
                    ? t(`次：${turnName(turn.shooter, next)}`, `Next: ${turnName(turn.shooter, next)}`)
                    : t(`${TARGETS_PER_ROUND} 枚すべて記録しました。`, `All ${TARGETS_PER_ROUND} targets recorded.`)}
                  {pendingDirection &&
                    t(
                      `（方向：${directionName(pendingDirection, 'ja')}）`,
                      ` (direction: ${directionName(pendingDirection, 'en')})`,
                    )}
                </p>
                {inputButtons}
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" disabled={!recorded} onClick={undo}>
                    <LuUndo2 aria-hidden="true" />
                    {t('最後の記録を消す', 'Clear the last result')}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!recorded}
                    onClick={() => {
                      if (
                        !window.confirm(
                          t('このラウンドの記録をすべて消しますか？', 'Clear every result of this round?'),
                        )
                      )
                        return;
                      store.clearSheet();
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
                  {(trap
                    ? t('マスの数字は射台。', 'The number in a box is the station. ')
                    : t(
                        'S＝シングル、D＝ダブル、H＝ハイハウス、L＝ローハウス。',
                        'S = single, D = double, H = high house, L = low house. ',
                      )) +
                    (withBarrels
                      ? t('①＝初矢、②＝二の矢、×＝失中。', '① = first barrel, ② = second barrel, × = miss. ')
                      : t('○＝命中、×＝失中。', '○ = hit, × = miss. ')) +
                    t(
                      'マスを押すと 未記録 → 記録の種類 と順に切り替わります。',
                      'Tap a box to step through not recorded and each result.',
                    )}
                </p>
                <div className="space-y-4">{shooters.map((_, position) => sheet(position))}</div>
              </div>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 className="text-xl font-medium">{t('集計', 'Tally')}</h2>
              {squad && (
                <SelectField
                  label={t('集計する射手', 'Tally for')}
                  value={String(tallyIndex)}
                  onChange={(value) => setTallyShooter(Number(value))}
                  options={shooters.map((_, position) => ({ value: String(position), label: shooterName(position) }))}
                />
              )}
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
                {withBarrels && (
                  <ResultFigure
                    label={t('初矢命中率', 'First-barrel rate')}
                    value={percent(firstBarrelRate(summary.barrels))}
                    note={t(`二の矢 ${summary.barrels.second} 枚`, `${summary.barrels.second} with the second`)}
                  />
                )}
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
              {summary.recorded > 0 && (
                <ClayTallies
                  language={language}
                  stations={summary.stations}
                  barrels={{ ...summary.barrels, recorded: 0 }}
                  directions={summary.directions}
                  houses={summary.houses}
                  subject={{ ja: 'このラウンド', en: 'this round' }}
                  showTotals
                />
              )}

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">{t('タグ（絞り込み用）', 'Tags (for filtering)')}</legend>
                <GearPicker
                  language={language}
                  kind="setup"
                  onPickSetup={(resolved) => {
                    store.setTag('gun', gunLabel(resolved));
                    if (resolved.cartridge) store.setTag('cartridge', resolved.cartridge.name);
                  }}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  {TAG_KEYS.map((key) => (
                    <div key={key} className="min-w-0 space-y-2">
                      <label htmlFor={`clay-tag-${key}`} className="block text-sm font-medium">
                        {tagName(key, language)}
                      </label>
                      <input
                        id={`clay-tag-${key}`}
                        type="text"
                        list={`clay-tag-${key}-values`}
                        value={tags[key]}
                        maxLength={TAG_MAX_LENGTH}
                        placeholder={key === 'weather' ? t('例：晴れ・北風', 'e.g. Sunny, north wind') : undefined}
                        onChange={(event) => store.setTag(key, event.target.value)}
                      />
                      <datalist id={`clay-tag-${key}-values`}>
                        {tagValues(records, key).map((value) => (
                          <option key={value} value={value} />
                        ))}
                      </datalist>
                    </div>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-2">
                <label htmlFor="clay-score-note" className="block text-sm font-medium">
                  {t('メモ', 'Note')}
                </label>
                <textarea
                  id="clay-score-note"
                  rows={2}
                  maxLength={NOTE_MAX_LENGTH}
                  value={note}
                  onChange={(event) => store.setNote(event.target.value)}
                  className="w-full rounded-sm border border-outline bg-surface p-3 text-base text-on-surface"
                />
              </div>
              <div className="space-y-2">
                <Button className="w-full" disabled={!complete} onClick={save}>
                  <LuSave aria-hidden="true" />
                  {t('このラウンドを保存', 'Save this round')}
                </Button>
                {!complete && (
                  <p className="text-xs text-on-surface-variant">
                    {squad
                      ? t(
                          `全員の ${TARGETS_PER_ROUND} 枚を記録すると、射手ごとに保存できます。`,
                          `Record all ${TARGETS_PER_ROUND} targets for everyone to save each shooter’s round.`,
                        )
                      : t(
                          `${TARGETS_PER_ROUND} 枚すべて記録すると保存できます。`,
                          `Record all ${TARGETS_PER_ROUND} targets to save.`,
                        )}
                  </p>
                )}
                <p role="status" className="text-sm">
                  {saveMessage ? t(...saveMessage) : ''}
                </p>
              </div>
              <div className="space-y-2 border-t border-outline-variant pt-4">
                <p className="text-sm">
                  {sessionRecords.length > 0
                    ? t(
                        `このセッション：${sessionRecords.length} ラウンド・${sessionHits} / ${sessionRecords.length * TARGETS_PER_ROUND}`,
                        `This session: ${sessionRecords.length} ${sessionRecords.length === 1 ? 'round' : 'rounds'}, ${sessionHits} / ${sessionRecords.length * TARGETS_PER_ROUND}`,
                      )
                    : t('このセッションに保存したラウンドはまだありません。', 'No rounds saved in this session yet.')}
                </p>
                <Button
                  variant="outline"
                  disabled={sessionRecords.length === 0}
                  onClick={() => {
                    store.startSession();
                    setSaveMessage(['新しいセッションを始めました。', 'Started a new session.']);
                  }}
                >
                  <LuPlus aria-hidden="true" />
                  {t('新しいセッションを始める', 'Start a new session')}
                </Button>
              </div>
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="clay-score-history"
                title={t('ラウンドの履歴', 'Round history')}
                summary={(() => {
                  const saved = records.filter((item) => item.discipline === discipline);
                  if (saved.length === 0)
                    return t(
                      `保存した${disciplineName(discipline)}のラウンドなし`,
                      `No saved ${disciplineName(discipline)} rounds`,
                    );
                  const hits = saved.reduce(
                    (sum, item) => sum + item.results.filter((result) => result !== 'miss').length,
                    0,
                  );
                  const best = Math.max(
                    ...saved.map((item) => item.results.filter((result) => result !== 'miss').length),
                  );
                  const average = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(
                    hits / saved.length,
                  );
                  return t(
                    `${disciplineName(discipline)} ${saved.length} ラウンド・平均 ${average} 枚・最高 ${best} 枚`,
                    `${disciplineName(discipline)}: ${saved.length} ${saved.length === 1 ? 'round' : 'rounds'}, average ${average}, best ${best}`,
                  );
                })()}
              >
                <ClayHistory
                  language={language}
                  discipline={discipline}
                  disciplineName={disciplineName(discipline)}
                  records={records}
                  deletedRecords={deletedRecords}
                  onDelete={store.deleteRecords}
                  onUndoDelete={store.undoDelete}
                />
              </ConditionSection>

              <ConditionSection
                id="clay-score-keys"
                title={t('キーボード・リモコンでの入力', 'Keyboard and remote input')}
                summary={
                  keysEnabled
                    ? t('キーで記録する：オン', 'Record with keys: on')
                    : t('キーで記録する：オフ', 'Record with keys: off')
                }
              >
                <ClayKeySettings
                  language={language}
                  enabled={keysEnabled}
                  keyMap={keyMap}
                  capturing={capturing}
                  actions={keyActions}
                  actionName={actionName}
                  onEnabledChange={store.setKeysEnabled}
                  onCapture={setCapturing}
                  onClear={(action) => store.setKey(action, null)}
                />
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
                  `ISSF 規則 2026 年版（${CLAY_RULES_CHECKED_ON} 確認）`,
                  `ISSF Rules, 2026 edition (checked ${CLAY_RULES_CHECKED_ON})`,
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
                      '6.4.18・9.8.1.1：トラップは射台 5 つ。1 枚ごとに右隣の射台へ移り、各射台で左 2・右 2・正面 1 の 5 枚、計 25 枚。1 枚に 2 発まで撃てます（決勝とその中のシュートオフは 1 発）。',
                      '6.4.18, 9.8.1.1: Trap has five stations. The athlete moves one station right after each target, and gets 2 left, 2 right and 1 centre from each station, 25 in all. Two shots per target (one in finals and their shoot-offs).',
                    )}
                  </li>
                  <li>
                    {t(
                      '6.4.19・9.9.1.1・9.9.2.2：スキートは射台 8 つ、ハイハウスとローハウス。シングルは 1 発、ダブルは 2 発を込め、1 枚に 1 発。予選の射順は規則の表のとおり。',
                      '6.4.19, 9.9.1.1, 9.9.2.2: Skeet has eight stations, a high house and a low house. One cartridge for a single and two for a double, one shot per target. The qualification sequence follows the table in the rules.',
                    )}
                  </li>
                  <li>
                    {t(
                      '9.8.1・9.9.1.1・9.10.2.1：スクワッドは 6 人。トラップは 1 人 1 枚ずつ順に撃ち、6 人目は射台 1 の後ろで待って 1 人目の後に射台 1 に入ります。スキートは 1 人がその射台の射順をすべて撃ってから次の人に替わります。',
                      '9.8.1, 9.9.1.1, 9.10.2.1: a squad is six. In trap each athlete shoots one target in turn, and the sixth waits behind station 1 and steps onto it after the first athlete has shot. In skeet each athlete shoots the whole sequence of a station before the next one steps up.',
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
                      '方向はクレーが射台から見て飛んだ向きです。',
                      'The direction is the way the target flew as seen from the station.',
                    )}
                  </li>
                  <li>
                    {t(
                      '国内の大会は主催者の規則によります。国内ルールのスキートなど国内の種目のシートはありません。',
                      'Competitions in Japan follow their organisers’ rules. There is no sheet for domestic disciplines such as Japan-rule skeet.',
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
