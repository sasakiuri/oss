'use client';

import type { Trap } from '@/lib/schemas/trap-check-log';
import {
  CHECK_RESULT_LABELS,
  TRAP_KIND_LABELS,
  formatDuration,
  formatLocalDateTime,
  getTrapStatus,
  sortedChecks,
  toLocalDateTime,
} from '@/lib/trap-check-log';
import type { Language } from '@/store';

interface TrapCheckLogSheetProps {
  traps: readonly Trap[];
  intervalHours: number;
  nowMs: number;
  language: Language;
  className?: string;
}

/**
 * The log as it is printed: every trap with its rounds, in plain black on white. Nothing on it is
 * drawn to scale, so it has no reference line; the browser's own page size and margins are used.
 */
export function TrapCheckLogSheet({ traps, intervalHours, nowMs, language, className }: TrapCheckLogSheetProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <div lang={language} className={className} data-testid="trap-check-log-sheet">
      <h1 className="text-xl font-medium text-black">{t('わな見回りの記録', 'Trap check log')}</h1>
      <p className="mb-4 text-sm text-black">
        {t(
          `印刷日時 ${formatLocalDateTime(toLocalDateTime(nowMs))}／見回り間隔 ${intervalHours} 時間`,
          `Printed ${formatLocalDateTime(toLocalDateTime(nowMs))} / check interval ${intervalHours} h`,
        )}
      </p>
      {traps.map((trap) => {
        const status = getTrapStatus(trap, intervalHours, nowMs);
        const checks = sortedChecks(trap);
        return (
          <section key={trap.id} className="mb-5 break-inside-avoid text-sm text-black">
            <h2 className="text-base font-medium">
              {trap.name}（{TRAP_KIND_LABELS[trap.kind][language]}）
              {status.state === 'overdue' && ` ${t('【間隔超過】', '[Overdue]')}`}
            </h2>
            <p>
              {t('設置', 'Set')} {formatLocalDateTime(trap.installedAt)}
              {trap.removedAt !== null && ` ／ ${t('撤去', 'Removed')} ${formatLocalDateTime(trap.removedAt)}`}
              {(status.state === 'ok' || status.state === 'overdue') &&
                ` ／ ${t('経過', 'Elapsed')} ${formatDuration(status.elapsedMs, language)}`}
            </p>
            {(trap.location || trap.latitude !== null) && (
              <p>
                {trap.location}
                {trap.latitude !== null && trap.longitude !== null && ` (${trap.latitude}, ${trap.longitude})`}
              </p>
            )}
            <table className="mt-1 w-full border-collapse">
              <thead>
                <tr>
                  <th className="border border-black px-2 py-1 text-left">{t('見回り日時', 'Checked at')}</th>
                  <th className="border border-black px-2 py-1 text-left">{t('結果', 'Result')}</th>
                  <th className="border border-black px-2 py-1 text-left">{t('メモ', 'Note')}</th>
                </tr>
              </thead>
              <tbody>
                {checks.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="border border-black px-2 py-1">
                      {t('記録なし', 'No round recorded')}
                    </td>
                  </tr>
                ) : (
                  checks.map((check) => (
                    <tr key={check.id}>
                      <td className="border border-black px-2 py-1 tabular-nums">{formatLocalDateTime(check.at)}</td>
                      <td className="border border-black px-2 py-1">{CHECK_RESULT_LABELS[check.result][language]}</td>
                      <td className="border border-black px-2 py-1">{check.note}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
