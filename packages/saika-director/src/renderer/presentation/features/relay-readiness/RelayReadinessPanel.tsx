import { CheckCircle2, ClipboardCheck, RefreshCw, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { relayReadinessService } from '@/renderer/services';
import type { RelayReadinessAssessmentDto, RelayStartSettingsDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

interface RelayReadinessPanelProps {
  competitionId: string;
  relayNumber: number;
  phase: 'SIGHTING' | 'MATCH';
  lanes: readonly { laneId: string; label: string }[];
}

export function RelayReadinessPanel({
  competitionId,
  relayNumber,
  phase: suggestedPhase,
  lanes,
}: RelayReadinessPanelProps) {
  const [phase, setPhase] = useState(suggestedPhase);
  useEffect(() => setPhase(suggestedPhase), [suggestedPhase]);
  const [startSettings, setStartSettings] = useState<RelayStartSettingsDto | null>(null);
  const [mode, setMode] = useState<RelayStartSettingsDto['mode']>('ADVISORY');
  const [assessment, setAssessment] = useState<RelayReadinessAssessmentDto | null>(null);
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('Operational readiness checked');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const laneIds = useMemo(() => lanes.map((lane) => lane.laneId), [lanes]);
  const laneIdsKey = laneIds.join('|');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [response, settings] = await Promise.all([
        relayReadinessService.assess({ competitionId, relayNumber, phase, laneIds }),
        relayReadinessService.getStartSettings({ competitionId }),
      ]);
      if (!settings.success) throw new Error(settings.error.message);
      setStartSettings(settings.data);
      setMode(settings.data.mode);
      if (!response.success) {
        setError(response.error.message);
        return;
      }
      setAssessment(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [competitionId, laneIdsKey, phase, relayNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveStartSettings = async () => {
    setSavingKey('start-settings');
    setError(null);
    try {
      const response = await relayReadinessService.setStartSettings({ competitionId, relayNumber, mode });
      if (!response.success) throw new Error(response.error.message);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSavingKey(null);
    }
  };

  const record = async (
    item: NonNullable<RelayReadinessAssessmentDto['items'][number]>,
    state: 'CONFIRMED' | 'REVOKED',
  ) => {
    const key = `${item.requirement}:${item.laneId ?? 'range'}`;
    setSavingKey(key);
    setError(null);
    try {
      const response = await relayReadinessService.record({
        competitionId,
        relayNumber,
        phase: item.phase,
        laneId: item.laneId,
        requirement: item.requirement,
        state,
        source: 'MANUAL',
        statement: statement.trim(),
        officialName: officialName.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Relay readiness · {phase}</h2>
          </div>
          <p className="mt-1 text-xs text-vscode-text-muted">
            Relay {relayNumber} · policy {assessment?.mode ?? '…'} ·{' '}
            {assessment?.ready ? 'ready' : 'checks outstanding'}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          <RefreshCw size={13} /> Refresh
        </Button>
      </header>
      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}
      <label className="block text-xs text-vscode-text-muted">
        Check target mode
        <select
          className={inputClass}
          value={phase}
          disabled={savingKey !== null}
          onChange={(event) => setPhase(event.target.value as 'SIGHTING' | 'MATCH')}
        >
          <option value="SIGHTING">Sighting</option>
          <option value="MATCH">Match</option>
        </select>
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-vscode-text-muted">
          Relay start checks
          <select
            className={inputClass}
            value={mode}
            disabled={!startSettings || savingKey !== null}
            onChange={(event) => setMode(event.target.value as RelayStartSettingsDto['mode'])}
          >
            <option value="ADVISORY">Advisory</option>
            <option value="REQUIRED">Required</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </label>
        <Button
          size="sm"
          variant="secondary"
          disabled={!startSettings || savingKey !== null}
          onClick={() => void saveStartSettings()}
        >
          Apply start checks to relay {relayNumber}
        </Button>
      </div>
      {startSettings && (
        <p className="text-xs text-vscode-text-muted">
          START uses relay {startSettings.relayNumber} in {startSettings.mode.toLowerCase()} mode for this competition.
          Required mode checks every participating Lane before sighting and match start, including Final scripts.
        </p>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs text-vscode-text-muted">
          Official name
          <input
            className={inputClass}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
          />
        </label>
        <label className="text-xs text-vscode-text-muted">
          Audit statement
          <input className={inputClass} value={statement} onChange={(event) => setStatement(event.target.value)} />
        </label>
      </div>
      <ul className="divide-y divide-vscode-border border-y border-vscode-border">
        {assessment?.items.map((item) => {
          const key = `${item.requirement}:${item.laneId ?? 'range'}`;
          const label = item.laneId
            ? `${item.label} · ${lanes.find((lane) => lane.laneId === item.laneId)?.label ?? item.laneId.slice(0, 8)}`
            : item.label;
          return (
            <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <div>
                <p className="flex items-center gap-1.5 font-medium text-vscode-text">
                  {item.confirmed ? (
                    <CheckCircle2 size={14} className="text-vscode-success" />
                  ) : (
                    <XCircle size={14} className="text-vscode-warning" />
                  )}
                  {label}
                </p>
                <p className="mt-0.5 text-vscode-text-muted">
                  {item.ruleReference}
                  {!item.required ? ' · optional' : ''}
                  {item.latestEntry
                    ? ` · ${item.latestEntry.officialName} · ${new Date(item.latestEntry.recordedAt).toLocaleString()}`
                    : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant={item.confirmed ? 'secondary' : 'primary'}
                disabled={savingKey !== null || !officialName.trim() || !statement.trim()}
                onClick={() => void record(item, item.confirmed ? 'REVOKED' : 'CONFIRMED')}
              >
                {savingKey === key ? 'Saving…' : item.confirmed ? 'Revoke' : 'Confirm'}
              </Button>
            </li>
          );
        })}
      </ul>
      {assessment?.mode === 'ADVISORY' && !assessment.ready && (
        <p className="text-xs text-vscode-warning">
          Advisory mode records missing checks without blocking START. Select Required to enforce this relay checklist.
        </p>
      )}
    </div>
  );
}

const inputClass =
  'mt-1 block min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';
