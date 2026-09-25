'use client';

import { useState } from 'react';

import { SelectField } from '@/components/labs';
import { Button } from '@/components/ui';
import {
  TARGETS_PER_ROUND,
  firstBarrelRate,
  groupSessions,
  matchesFilter,
  recordSheet,
  scoreTrend,
  shooterNames,
  summarizeHistory,
  summarizeRound,
  tagValues,
  type ClayDiscipline,
  type ClayRoundRecord,
  type ClayTagKey,
  type ClayTags,
  type HistoryFilter,
  type SessionSummary,
} from '@/lib/clay-score';

import { ClayTallies, percentFormat } from './clay-score-tallies';
import { ClayScoreTrend } from './clay-score-trend';

type Language = 'ja' | 'en';

export const TAG_KEYS: readonly ClayTagKey[] = ['gun', 'cartridge', 'range', 'weather'];

export const tagName = (key: ClayTagKey, language: Language) =>
  ({
    gun: { ja: '銃', en: 'Gun' },
    cartridge: { ja: '装弾', en: 'Cartridge' },
    range: { ja: '射撃場', en: 'Range' },
    weather: { ja: '天候', en: 'Weather' },
  })[key][language];

const ALL = '\u0000all';

interface ClayHistoryProps {
  language: Language;
  discipline: ClayDiscipline;
  disciplineName: string;
  records: readonly ClayRoundRecord[];
  deletedRecords: { records: ClayRoundRecord[] } | null;
  onDelete: (ids: readonly string[]) => void;
  onUndoDelete: () => void;
}

export function ClayHistory({
  language,
  discipline,
  disciplineName,
  records,
  deletedRecords,
  onDelete,
  onUndoDelete,
}: ClayHistoryProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [shooter, setShooter] = useState<string>(ALL);
  const [tags, setTags] = useState<Partial<ClayTags>>({});
  const percent = percentFormat(language);
  const decimal = (value: number | null) =>
    value === null ? '—' : new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  const dateTime = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });

  const ofDiscipline = records.filter((record) => record.discipline === discipline);
  const filter: HistoryFilter = { discipline, shooter: shooter === ALL ? null : shooter, tags };
  const history = summarizeHistory(records, filter);
  const trend = scoreTrend(records, filter);
  const sessions = groupSessions(records.filter((record) => matchesFilter(record, filter)));
  const names = shooterNames(ofDiscipline);
  const shooterLabel = (name: string) => name || t('（名前なし）', '(no name)');
  const line = (record: ClayRoundRecord) => `${summarizeRound(recordSheet(record)).hits} / ${TARGETS_PER_ROUND}`;
  const recordName = (record: ClayRoundRecord) =>
    `${record.shooter ? `${record.shooter} ` : ''}${disciplineName} ${line(record)}`;
  const sessionTitle = (session: SessionSummary, started: string) =>
    session.sessionId === null
      ? t(
          `${started}（セッションの記録なし）・${session.hits} / ${session.targets}`,
          `${started} (no session recorded): ${session.hits} / ${session.targets}`,
        )
      : t(
          `${started} からのセッション・${session.rounds} ラウンド・${session.hits} / ${session.targets}`,
          `Session from ${started}: ${session.rounds} ${session.rounds === 1 ? 'round' : 'rounds'}, ${session.hits} / ${session.targets}`,
        );
  const filtered = shooter !== ALL || Object.values(tags).some(Boolean);

  return (
    <div className="space-y-5">
      {ofDiscipline.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {names.length > 1 && (
            <SelectField
              label={t('射手で絞り込む', 'Filter by shooter')}
              value={shooter}
              options={[
                { value: ALL, label: t('すべて', 'All') },
                ...names.map((name) => ({ value: name, label: shooterLabel(name) })),
              ]}
              onChange={setShooter}
            />
          )}
          {TAG_KEYS.map((key) => {
            const values = tagValues(ofDiscipline, key);
            if (values.length === 0) return null;
            return (
              <SelectField
                key={key}
                label={t(`${tagName(key, 'ja')}で絞り込む`, `Filter by ${tagName(key, 'en').toLowerCase()}`)}
                value={tags[key] || ALL}
                options={[
                  { value: ALL, label: t('すべて', 'All') },
                  ...values.map((value) => ({ value, label: value })),
                ]}
                onChange={(value) => setTags({ ...tags, [key]: value === ALL ? '' : value })}
              />
            );
          })}
        </div>
      )}

      {history.rounds > 0 ? (
        <>
          <p className="text-sm">
            {t(
              `${filtered ? '絞り込んだ' : ''}${disciplineName} ${history.rounds} ラウンド・平均 ${decimal(history.average)} 枚・最高 ${history.best} 枚${history.barrels.recorded > 0 ? `・初矢命中率 ${percent(firstBarrelRate(history.barrels))}` : ''}`,
              `${history.rounds} ${filtered ? 'matching ' : ''}${disciplineName} ${history.rounds === 1 ? 'round' : 'rounds'}, average ${decimal(history.average)}, best ${history.best}${history.barrels.recorded > 0 ? `, first-barrel rate ${percent(firstBarrelRate(history.barrels))}` : ''}`,
            )}
          </p>
          {trend.length > 1 && (
            <div className="space-y-2">
              <h3 className="text-base font-medium">{t('スコアの推移（1 ラウンドごと）', 'Score by round')}</h3>
              <ClayScoreTrend
                points={trend}
                language={language}
                label={t(
                  `スコアの推移。${trend.length} ラウンド、最初 ${trend[0]!.hits} 枚、最後 ${trend[trend.length - 1]!.hits} 枚。`,
                  `Score by round: ${trend.length} rounds, first ${trend[0]!.hits}, latest ${trend[trend.length - 1]!.hits}.`,
                )}
              />
            </div>
          )}
          <ClayTallies
            language={language}
            stations={history.stations}
            barrels={history.barrels}
            directions={history.directions}
            houses={history.houses}
            subject={{ ja: '保存したラウンド', en: 'saved rounds' }}
            showTotals={false}
          />
        </>
      ) : (
        <p className="text-sm text-on-surface-variant">
          {filtered
            ? t('条件に合うラウンドはありません。', 'No rounds match.')
            : t(`保存した${disciplineName}のラウンドはありません。`, `No saved ${disciplineName} rounds.`)}
        </p>
      )}

      {sessions.length > 0 && (
        <ol className="space-y-4">
          {sessions.map((session) => {
            const ids = session.records.map((record) => record.id);
            const started = dateTime.format(new Date(session.startedAt));
            return (
              <li key={session.key} className="space-y-2 border-t border-outline-variant pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-medium">{sessionTitle(session, started)}</h3>
                  {session.rounds > 1 && (
                    <Button
                      variant="ghost"
                      aria-label={t(`${started} からのセッションを削除`, `Delete the session from ${started}`)}
                      onClick={() => onDelete(ids)}
                    >
                      {t('セッションを削除', 'Delete session')}
                    </Button>
                  )}
                </div>
                <ul className="divide-y divide-outline-variant">
                  {session.records.map((item) => {
                    const round = summarizeRound(recordSheet(item));
                    const tagLine = TAG_KEYS.filter((key) => item.tags?.[key])
                      .map((key) => `${tagName(key, language)}：${item.tags?.[key]}`)
                      .join(t('・', ', '));
                    return (
                      <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium tabular-nums">{recordName(item)}</p>
                          <p className="text-sm text-on-surface-variant">
                            {dateTime.format(new Date(item.savedAt))}
                            {item.discipline === 'trap' &&
                              t(` ・ 開始射台 ${item.startStation}`, ` · first station ${item.startStation}`)}
                            {t(` ・ 最長連続 ${round.longestRun}`, ` · longest run ${round.longestRun}`)}
                            {round.barrels.recorded > 0 &&
                              t(
                                ` ・ 初矢 ${round.barrels.first}・二の矢 ${round.barrels.second}`,
                                ` · first ${round.barrels.first}, second ${round.barrels.second}`,
                              )}
                          </p>
                          {tagLine && <p className="text-sm">{tagLine}</p>}
                          {item.note && <p className="whitespace-pre-wrap text-sm">{item.note}</p>}
                        </div>
                        <Button
                          variant="ghost"
                          aria-label={t(
                            `${dateTime.format(new Date(item.savedAt))} の${recordName(item)} を削除`,
                            `Delete ${recordName(item)}, ${dateTime.format(new Date(item.savedAt))}`,
                          )}
                          onClick={() => onDelete([item.id])}
                        >
                          {t('削除', 'Delete')}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
      <div role="status" className={deletedRecords ? 'flex flex-wrap items-center gap-2 text-sm' : 'sr-only'}>
        {deletedRecords && (
          <>
            <span>
              {deletedRecords.records.length === 1
                ? t(
                    `${recordName(deletedRecords.records[0]!)} を削除しました。`,
                    `Deleted ${recordName(deletedRecords.records[0]!)}.`,
                  )
                : t(
                    `${deletedRecords.records.length} ラウンドを削除しました。`,
                    `Deleted ${deletedRecords.records.length} rounds.`,
                  )}
            </span>
            <Button variant="ghost" onClick={onUndoDelete}>
              {t('元に戻す', 'Undo')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
