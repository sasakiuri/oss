'use client';

import { useId, useState } from 'react';
import { LuClipboardCheck, LuTrash2 } from 'react-icons/lu';

import { Button, Card } from '@/components/ui';
import { CHECK_RESULTS, TRAP_TEXT_MAX_LENGTH, type CheckResult, type Trap } from '@/lib/schemas/trap-check-log';
import {
  CHECK_RESULT_LABELS,
  TRAP_KIND_LABELS,
  currentLocalMinute,
  formatDuration,
  formatLocalDateTime,
  getTrapStatus,
  sortedChecks,
  toLocalDateTime,
  type CheckTimeError,
} from '@/lib/trap-check-log';
import { cn } from '@/lib/utils';
import type { Language } from '@/store';

import { useTrapCheckLogStore } from './_store';

export const fieldClass =
  'block min-h-12 w-full rounded-lg border border-outline bg-background p-3 text-on-surface aria-[invalid=true]:border-destructive';

interface TrapCardProps {
  trap: Trap;
  intervalHours: number;
  nowMs: number;
  language: Language;
  /** Raises the page's notice, in both languages so a later language switch still reads right. */
  onNotice: (notice: { error: boolean; ja: string; en: string }) => void;
}

export function TrapCard({ trap, intervalHours, nowMs, language, onNotice }: TrapCardProps) {
  const { addCheck, deleteCheck, deleteTrap, setRemoved } = useTrapCheckLogStore();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState('');
  // Until edited, the time follows the clock and is read again on save.
  const [atEdited, setAtEdited] = useState(false);
  const [result, setResult] = useState<CheckResult>('nothing');
  const [note, setNote] = useState('');
  const [atError, setAtError] = useState<CheckTimeError | null>(null);
  const status = getTrapStatus(trap, intervalHours, nowMs);
  const checks = sortedChecks(trap);
  const name = trap.name;

  const startRecord = () => {
    setAt('');
    setAtEdited(false);
    setResult('nothing');
    setNote('');
    setAtError(null);
    setOpen(true);
  };

  const saveCheck = () => {
    const when = atEdited ? at : currentLocalMinute();
    const outcome = addCheck(trap.id, { at: when, result, note: note.trim() });
    if (outcome === 'invalid' || outcome === 'beforeInstalled') {
      setAtError(outcome);
      document.getElementById(`${formId}-at`)?.focus();
      return;
    }
    if (outcome === 'full') {
      onNotice({
        error: true,
        ja: `「${name}」の記録は上限に達しています。CSV に書き出してから、古い記録を削除してください。`,
        en: `“${name}” has reached the record limit. Export a CSV, then delete older rounds.`,
      });
      return;
    }
    setOpen(false);
    onNotice({
      error: false,
      ja: `「${name}」の見回りを ${formatLocalDateTime(when)} で記録しました。`,
      en: `Recorded a round of “${name}” at ${formatLocalDateTime(when)}.`,
    });
  };

  const statusLine = () => {
    switch (status.state) {
      case 'removed':
        return t(
          `撤去済み（${formatLocalDateTime(status.removedAt)}）`,
          `Removed (${formatLocalDateTime(status.removedAt)})`,
        );
      case 'notInstalled':
        return t(
          `設置日時（${formatLocalDateTime(status.installedAt)}）がまだ来ていません。`,
          `Not set until ${formatLocalDateTime(status.installedAt)}.`,
        );
      case 'future':
        return t(
          `記録の日時 ${formatLocalDateTime(status.baseAt)} が現在より後です。日時を確認してください。`,
          `The recorded time ${formatLocalDateTime(status.baseAt)} is later than now. Check the time.`,
        );
      default: {
        const elapsed = formatDuration(status.elapsedMs, language);
        const since =
          status.since === 'check'
            ? t('最後の見回りから', 'since the last round')
            : status.since === 'installed'
              ? t('設置から（見回り記録なし）', 'since setting (no round yet)')
              : t(
                  '設置から（見回りの記録がすべて設置日時より前のため数えていません。日時を確認してください）',
                  'since setting (all rounds are dated before the setting time and not counted; check the times)',
                );
        const due =
          status.state === 'overdue'
            ? t(
                `間隔を ${formatDuration(-status.remainingMs, language)} 超えています。`,
                `${formatDuration(-status.remainingMs, language)} past the interval.`,
              )
            : t(
                `次の見回りまで あと ${formatDuration(status.remainingMs, language)}`,
                `Next round due in ${formatDuration(status.remainingMs, language)}`,
              );
        return language === 'ja' ? `${since} ${elapsed}。${due}` : `${elapsed} ${since}. ${due}`;
      }
    }
  };

  const warn =
    status.state === 'overdue' ||
    status.state === 'future' ||
    ('since' in status && status.since === 'installedBeforeChecks');

  return (
    <Card
      variant="outlined"
      className={cn('space-y-3 rounded-md p-4', warn && 'border-2 border-error')}
      aria-labelledby={`${formId}-name`}
      role="group"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${formId}-name`} className="text-lg font-medium">
          {name}
        </h3>
        <span className="text-sm text-on-surface-variant">
          {TRAP_KIND_LABELS[trap.kind][language]}・{t('設置', 'Set')} {formatLocalDateTime(trap.installedAt)}
        </span>
      </div>
      {(trap.location || trap.latitude !== null) && (
        <p className="text-sm text-on-surface-variant">
          {trap.location}
          {trap.latitude !== null && trap.longitude !== null && (
            <span className="ml-2 tabular-nums">
              ({trap.latitude}, {trap.longitude})
            </span>
          )}
        </p>
      )}
      <p className={cn('text-sm font-medium', warn ? 'text-error' : 'text-on-surface')}>
        {status.state === 'overdue' && <span className="mr-1">{t('【間隔超過】', '[Overdue]')}</span>}
        {statusLine()}
      </p>

      {trap.removedAt === null && !open && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={startRecord}>
            <LuClipboardCheck aria-hidden="true" />
            {t('見回りを記録', 'Record a round')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRemoved(trap.id, currentLocalMinute());
              onNotice({ error: false, ja: `「${name}」を撤去済みにしました。`, en: `Marked “${name}” as removed.` });
            }}
          >
            {t('撤去済みにする', 'Mark removed')}
          </Button>
        </div>
      )}
      {trap.removedAt !== null && (
        <Button
          variant="outline"
          onClick={() => {
            setRemoved(trap.id, null);
            onNotice({ error: false, ja: `「${name}」を設置中に戻しました。`, en: `Marked “${name}” as set.` });
          }}
        >
          {t('設置中に戻す', 'Set again')}
        </Button>
      )}

      {open && (
        <fieldset className="space-y-3 rounded-md bg-surface-container p-3">
          <legend className="sr-only">{t(`「${name}」の見回り`, `Round of “${name}”`)}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${formId}-at`} className="block text-sm font-medium">
                {t('見回り日時', 'Checked at')}
              </label>
              <input
                id={`${formId}-at`}
                type="datetime-local"
                value={atEdited ? at : toLocalDateTime(nowMs)}
                onChange={(event) => {
                  setAt(event.target.value);
                  setAtEdited(true);
                  setAtError(null);
                }}
                aria-invalid={atError !== null}
                aria-describedby={atError ? `${formId}-at-error` : undefined}
                className={fieldClass}
              />
              {atError && (
                <p id={`${formId}-at-error`} className="text-sm text-destructive">
                  {atError === 'beforeInstalled'
                    ? t(
                        `設置日時（${formatLocalDateTime(trap.installedAt)}）より前の見回りは記録できません。`,
                        `A round cannot be dated before the setting time (${formatLocalDateTime(trap.installedAt)}).`,
                      )
                    : t('日時を入力してください。', 'Enter the date and time.')}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-result`} className="block text-sm font-medium">
                {t('結果', 'Result')}
              </label>
              <select
                id={`${formId}-result`}
                value={result}
                onChange={(event) => setResult(event.target.value as CheckResult)}
              >
                {CHECK_RESULTS.map((value) => (
                  <option key={value} value={value}>
                    {CHECK_RESULT_LABELS[value][language]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-note`} className="block text-sm font-medium">
              {t('メモ（任意）', 'Note (optional)')}
            </label>
            <input
              id={`${formId}-note`}
              type="text"
              value={note}
              maxLength={TRAP_TEXT_MAX_LENGTH}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveCheck}>{t('記録する', 'Save round')}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('やめる', 'Cancel')}
            </Button>
          </div>
        </fieldset>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-on-surface-variant">
          {t(`見回りの記録（${checks.length} 件）`, `Rounds (${checks.length})`)}
        </summary>
        {checks.length === 0 ? (
          <p className="mt-2 text-on-surface-variant">{t('まだ記録がありません。', 'No round recorded yet.')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-outline-variant">
            {checks
              .slice()
              .reverse()
              .map((check) => (
                <li key={check.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="tabular-nums">{formatLocalDateTime(check.at)}</span>
                    <span className="ml-2">{CHECK_RESULT_LABELS[check.result][language]}</span>
                    {check.note && <span className="ml-2 break-words text-on-surface-variant">{check.note}</span>}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t(
                      `${formatLocalDateTime(check.at)} の記録を削除`,
                      `Delete the round at ${formatLocalDateTime(check.at)}`,
                    )}
                    onClick={() => {
                      if (!window.confirm(t('この見回りの記録を削除しますか？', 'Delete this round?'))) return;
                      deleteCheck(trap.id, check.id);
                      onNotice({ error: false, ja: '見回りの記録を削除しました。', en: 'Deleted the round.' });
                    }}
                  >
                    <LuTrash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
          </ul>
        )}
      </details>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (
            !window.confirm(
              t(
                `「${name}」と、その見回りの記録をすべて削除しますか？元に戻せません。`,
                `Delete “${name}” and every round recorded for it? This cannot be undone.`,
              ),
            )
          )
            return;
          deleteTrap(trap.id);
          onNotice({ error: false, ja: `「${name}」を削除しました。`, en: `Deleted “${name}”.` });
        }}
      >
        <LuTrash2 aria-hidden="true" />
        {t('このわなを削除', 'Delete this trap')}
      </Button>
    </Card>
  );
}
