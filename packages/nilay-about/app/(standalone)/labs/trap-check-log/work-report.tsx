'use client';

import { useId, useState } from 'react';
import { LuDownload, LuPlay, LuPlus, LuPrinter, LuSquare, LuTrash2 } from 'react-icons/lu';

import { Button } from '@/components/ui';
import { TRAP_TEXT_MAX_LENGTH, type Trap, type WorkSession } from '@/lib/schemas/trap-check-log';
import { TRAP_KIND_LABELS, currentLocalMinute, formatLocalDateTime, toLocalDateTime } from '@/lib/trap-check-log';
import {
  buildDailyReport,
  buildDailyReportCsv,
  dailySessionTimes,
  dailySpeciesText,
  formatWorkMinutes,
  sessionMinutes,
  totalStats,
  trapStats,
  type DailyReportRow,
} from '@/lib/trap-check-report';
import type { Language } from '@/store';

import { useTrapCheckLogStore, type WorkResult } from './_store';
import { fieldClass } from './trap-card';

type Notice = { error: boolean; ja: string; en: string };

interface WorkReportProps {
  traps: readonly Trap[];
  work: readonly WorkSession[];
  month: string;
  onMonthChange: (month: string) => void;
  nowMs: number;
  language: Language;
  onNotice: (notice: Notice) => void;
  onPrint: () => void;
  onDownload: (content: string, filename: string, type: string) => void;
}

const workError = (result: WorkResult): Notice | null => {
  switch (result) {
    case 'added':
      return null;
    case 'open':
      return {
        error: true,
        ja: '作業中の記録があります。先に終了してください。',
        en: 'Work is already running. End it first.',
      };
    case 'full':
      return {
        error: true,
        ja: '作業の記録が上限に達しています。CSV に書き出してから古い記録を削除してください。',
        en: 'The work records are full. Export a CSV, then delete older records.',
      };
    case 'endBeforeStart':
      return { error: true, ja: '終了は開始より後にしてください。', en: 'The end must be after the start.' };
    case 'invalid':
      return { error: true, ja: '日時を正しく入力してください。', en: 'Enter a valid date and time.' };
  }
};

/** Work time, the day-by-day report for a month, and the figures for each trap. */
export function WorkReport({
  traps,
  work,
  month,
  onMonthChange,
  nowMs,
  language,
  onNotice,
  onPrint,
  onDownload,
}: WorkReportProps) {
  const { startWork, endWork, addWork, deleteWork } = useTrapCheckLogStore();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const formId = useId();
  const open = work.find((session) => session.end === null) ?? null;
  const [endNote, setEndNote] = useState('');
  const [manual, setManual] = useState({ start: '', end: '', note: '' });
  const rows = buildDailyReport(traps, work, month, nowMs);
  const totalMinutes = rows.reduce((sum, row) => sum + row.workMinutes, 0);
  const number = (value: number, digits = 1) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

  const report = (result: WorkResult, done: Notice) => onNotice(workError(result) ?? done);

  return (
    <div className="space-y-6 text-sm">
      <section aria-labelledby={`${formId}-work`} className="space-y-3">
        <h3 id={`${formId}-work`} className="text-base font-medium">
          {t('作業時間', 'Work time')}
        </h3>
        {open ? (
          <div className="space-y-2 rounded-md bg-surface-container p-3">
            <p>
              {t(
                `作業中：${formatLocalDateTime(open.start)} から ${formatWorkMinutes(sessionMinutes(open, nowMs), 'ja')}`,
                `Working since ${formatLocalDateTime(open.start)}: ${formatWorkMinutes(sessionMinutes(open, nowMs), 'en')}`,
              )}
            </p>
            <label htmlFor={`${formId}-end-note`} className="block font-medium">
              {t('作業内容のメモ（任意）', 'What was done (optional)')}
            </label>
            <input
              id={`${formId}-end-note`}
              type="text"
              value={endNote}
              maxLength={TRAP_TEXT_MAX_LENGTH}
              placeholder={t('例：見回り 8 基、止め刺し 1 頭', 'e.g. 8 traps checked, 1 dispatched')}
              onChange={(event) => setEndNote(event.target.value)}
            />
            <Button
              onClick={() => {
                const result = endWork(open.id, currentLocalMinute(), endNote.trim());
                if (result === 'added') setEndNote('');
                report(result, { error: false, ja: '作業を終了しました。', en: 'Work ended.' });
              }}
            >
              <LuSquare aria-hidden="true" />
              {t('作業を終了', 'End work')}
            </Button>
          </div>
        ) : (
          <Button
            onClick={() =>
              report(startWork(currentLocalMinute()), {
                error: false,
                ja: '作業を開始しました。',
                en: 'Work started.',
              })
            }
          >
            <LuPlay aria-hidden="true" />
            {t('作業を開始', 'Start work')}
          </Button>
        )}
        <details className="rounded-md border border-outline-variant p-3">
          <summary className="cursor-pointer">{t('あとから作業を入力する', 'Enter work afterwards')}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-start`} className="block font-medium">
                {t('開始', 'Start')}
              </label>
              <input
                id={`${formId}-start`}
                type="datetime-local"
                value={manual.start}
                onChange={(event) => setManual((state) => ({ ...state, start: event.target.value }))}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-end`} className="block font-medium">
                {t('終了', 'End')}
              </label>
              <input
                id={`${formId}-end`}
                type="datetime-local"
                value={manual.end}
                onChange={(event) => setManual((state) => ({ ...state, end: event.target.value }))}
                className={fieldClass}
              />
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <label htmlFor={`${formId}-manual-note`} className="block font-medium">
              {t('作業内容のメモ（任意）', 'What was done (optional)')}
            </label>
            <input
              id={`${formId}-manual-note`}
              type="text"
              value={manual.note}
              maxLength={TRAP_TEXT_MAX_LENGTH}
              onChange={(event) => setManual((state) => ({ ...state, note: event.target.value }))}
            />
          </div>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => {
              const result = addWork({ start: manual.start, end: manual.end || null, note: manual.note.trim() });
              if (result === 'added') setManual({ start: '', end: '', note: '' });
              report(result, { error: false, ja: '作業を追加しました。', en: 'Work added.' });
            }}
          >
            <LuPlus aria-hidden="true" />
            {t('作業を追加', 'Add work')}
          </Button>
        </details>
      </section>

      <section aria-labelledby={`${formId}-daily`} className="space-y-3">
        <h3 id={`${formId}-daily`} className="text-base font-medium">
          {t('日報（月ごと）', 'Daily report by month')}
        </h3>
        <div className="max-w-xs space-y-1">
          <label htmlFor={`${formId}-month`} className="block font-medium">
            {t('月', 'Month')}
          </label>
          <input
            id={`${formId}-month`}
            type="month"
            value={month}
            onChange={(event) => event.target.value && onMonthChange(event.target.value)}
            className={fieldClass}
          />
        </div>
        {rows.length === 0 ? (
          <p className="text-on-surface-variant">
            {t('この月の作業・見回りの記録はありません。', 'No work or rounds recorded this month.')}
          </p>
        ) : (
          <>
            <DailyReportTable rows={rows} language={language} onDelete={deleteWork} />
            <p>
              {t(
                `合計 ${formatWorkMinutes(totalMinutes, 'ja')}／見回り ${rows.reduce((sum, row) => sum + row.rounds, 0)} 回`,
                `Total ${formatWorkMinutes(totalMinutes, 'en')} / ${rows.reduce((sum, row) => sum + row.rounds, 0)} rounds`,
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  onDownload(
                    `﻿${buildDailyReportCsv(rows, language)}`,
                    `trap-daily-report-${month}.csv`,
                    'text/csv;charset=utf-8',
                  );
                  onNotice({ error: false, ja: '日報の CSV を書き出しました。', en: 'Daily report CSV exported.' });
                }}
              >
                <LuDownload aria-hidden="true" />
                {t('日報を CSV に書き出す', 'Export the report as CSV')}
              </Button>
              <Button variant="outline" onClick={onPrint}>
                <LuPrinter aria-hidden="true" />
                {t('日報を印刷する', 'Print the report')}
              </Button>
            </div>
          </>
        )}
        <p className="text-xs text-on-surface-variant">
          {t('作業はその開始日の行に入ります。', 'Work is counted on the day it started.')}
        </p>
      </section>

      <section aria-labelledby={`${formId}-stats`} className="space-y-3">
        <h3 id={`${formId}-stats`} className="text-base font-medium">
          {t('わな別の集計', 'Figures by trap')}
        </h3>
        {traps.length === 0 ? (
          <p className="text-on-surface-variant">{t('わながありません。', 'No traps.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left tabular-nums">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="py-2 pr-3 font-medium">{t('わな', 'Trap')}</th>
                  <th className="py-2 pr-3 font-medium">{t('わな日', 'Trap-days')}</th>
                  <th className="py-2 pr-3 font-medium">{t('見回り', 'Rounds')}</th>
                  <th className="py-2 pr-3 font-medium">{t('捕獲（頭）', 'Caught')}</th>
                  <th className="py-2 pr-3 font-medium">{t('100 わな日あたり', 'Per 100 trap-days')}</th>
                  <th className="py-2 pr-3 font-medium">{t('錯誤捕獲（頭）', 'Non-target')}</th>
                  <th className="py-2 pr-3 font-medium">{t('錯誤の割合', 'Non-target share')}</th>
                  <th className="py-2 pr-3 font-medium">{t('作動・破損', 'Sprung or damaged')}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...traps.map((trap) => ({ key: trap.id, label: trap, stats: trapStats(trap, nowMs) })),
                  { key: 'total', label: null, stats: totalStats(traps, nowMs) },
                ].map(({ key, label, stats }) => (
                  <tr key={key} className="border-b border-outline-variant">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {label ? `${label.name}（${TRAP_KIND_LABELS[label.kind][language]}）` : t('合計', 'Total')}
                    </th>
                    <td className="py-2 pr-3">{number(stats.trapDays)}</td>
                    <td className="py-2 pr-3">{stats.rounds}</td>
                    <td className="py-2 pr-3">{stats.heads}</td>
                    <td className="py-2 pr-3">
                      {stats.headsPer100TrapDays === null ? '—' : number(stats.headsPer100TrapDays)}
                    </td>
                    <td className="py-2 pr-3">{stats.bycatchHeads}</td>
                    <td className="py-2 pr-3">
                      {stats.bycatchPercent === null ? '—' : `${number(stats.bycatchPercent, 0)} %`}
                    </td>
                    <td className="py-2 pr-3">{stats.troubleRounds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ul className="list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
          <li>
            {t(
              'わな日は設置から撤去（設置中は現在）までの日数です。100 わな日あたりの捕獲数（CPUE）は、1 わな日に満たないうちは表示しません。',
              'Trap-days run from setting to removal, or to now while set. Catch per 100 trap-days (CPUE) is not shown before one trap-day.',
            )}
          </li>
          <li>
            {t(
              '錯誤の割合は、捕獲と錯誤捕獲を合わせた頭数に占める錯誤捕獲の割合です。頭数を記録していない見回りは集計から除きます。',
              'The non-target share is non-target animals over all animals caught. Rounds without a head count are left out.',
            )}
          </li>
        </ul>
      </section>
    </div>
  );
}

function DailyReportTable({
  rows,
  language,
  onDelete,
}: {
  rows: readonly DailyReportRow[];
  language: Language;
  onDelete: (id: string) => void;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left tabular-nums">
        <thead>
          <tr className="border-b border-outline-variant">
            <th className="py-2 pr-3 font-medium">{t('日付', 'Date')}</th>
            <th className="py-2 pr-3 font-medium">{t('作業', 'Work')}</th>
            <th className="py-2 pr-3 font-medium">{t('見回り', 'Rounds')}</th>
            <th className="py-2 pr-3 font-medium">{t('捕獲', 'Caught')}</th>
            <th className="py-2 pr-3 font-medium">{t('錯誤捕獲', 'Non-target')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.date} className="border-b border-outline-variant align-top">
              <th scope="row" className="py-2 pr-3 font-normal">
                {row.date}
              </th>
              <td className="py-2 pr-3">
                {formatWorkMinutes(row.workMinutes, language)}
                {row.sessions.length > 0 && (
                  <ul className="mt-1 space-y-1 text-xs text-on-surface-variant">
                    {row.sessions.map((session) => (
                      <li key={session.id} className="flex items-center gap-1">
                        <span>
                          {dailySessionTimes({ ...row, sessions: [session] }, language)}
                          {session.note && ` ${session.note}`}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t(
                            `${formatLocalDateTime(session.start)} からの作業を削除`,
                            `Delete the work from ${formatLocalDateTime(session.start)}`,
                          )}
                          onClick={() => {
                            if (window.confirm(t('この作業の記録を削除しますか？', 'Delete this work record?')))
                              onDelete(session.id);
                          }}
                        >
                          <LuTrash2 aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="py-2 pr-3">
                {t(`${row.rounds} 回（${row.trapsChecked} 基）`, `${row.rounds} (${row.trapsChecked} traps)`)}
              </td>
              <td className="py-2 pr-3">
                {t(`${row.heads} 頭`, `${row.heads}`)}
                {row.species.length > 0 && (
                  <span className="block text-xs text-on-surface-variant">{dailySpeciesText(row, language)}</span>
                )}
                {row.uncountedRounds > 0 && (
                  <span className="block text-xs text-on-surface-variant">
                    {t(`頭数未記録 ${row.uncountedRounds} 回`, `${row.uncountedRounds} without a count`)}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3">{t(`${row.bycatchHeads} 頭`, `${row.bycatchHeads}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The month's report as printed: plain black on white, the browser's own page size. */
export function DailyReportSheet({
  rows,
  month,
  nowMs,
  language,
  className,
}: {
  rows: readonly DailyReportRow[];
  month: string;
  nowMs: number;
  language: Language;
  className?: string;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const cellClass = 'border border-black px-2 py-1 align-top';
  const total = rows.reduce((sum, row) => sum + row.workMinutes, 0);
  return (
    <div lang={language} className={className} data-testid="trap-daily-report-sheet">
      <h1 className="text-xl font-medium text-black">
        {t(`わな猟の作業日報 ${month}`, `Trapping work report ${month}`)}
      </h1>
      <p className="mb-4 text-sm text-black">
        {t(
          `印刷日時 ${formatLocalDateTime(toLocalDateTime(nowMs))}／作業時間の合計 ${formatWorkMinutes(total, 'ja')}`,
          `Printed ${formatLocalDateTime(toLocalDateTime(nowMs))} / total work ${formatWorkMinutes(total, 'en')}`,
        )}
      </p>
      <table className="w-full border-collapse text-sm text-black">
        <thead>
          <tr>
            <th className={cellClass}>{t('日付', 'Date')}</th>
            <th className={cellClass}>{t('作業時間', 'Work')}</th>
            <th className={cellClass}>{t('時間帯・内容', 'Times and notes')}</th>
            <th className={cellClass}>{t('見回り', 'Rounds')}</th>
            <th className={cellClass}>{t('捕獲', 'Caught')}</th>
            <th className={cellClass}>{t('錯誤捕獲', 'Non-target')}</th>
            <th className={cellClass}>{t('作動・破損', 'Sprung')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.date}>
              <td className={cellClass}>{row.date}</td>
              <td className={cellClass}>{formatWorkMinutes(row.workMinutes, language)}</td>
              <td className={cellClass}>
                {row.sessions.map((session) => (
                  <span key={session.id} className="block">
                    {dailySessionTimes({ ...row, sessions: [session] }, language)}
                    {session.note && ` ${session.note}`}
                  </span>
                ))}
              </td>
              <td className={cellClass}>
                {t(`${row.rounds} 回（${row.trapsChecked} 基）`, `${row.rounds} (${row.trapsChecked} traps)`)}
              </td>
              <td className={cellClass}>
                {row.heads}
                {row.species.length > 0 && <span className="block">{dailySpeciesText(row, language)}</span>}
              </td>
              <td className={cellClass}>{row.bycatchHeads}</td>
              <td className={cellClass}>{row.troubleRounds}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
