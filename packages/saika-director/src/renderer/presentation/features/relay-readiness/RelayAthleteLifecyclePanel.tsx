import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CheckCircle2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';

import { relayAthleteLifecycleService } from '@/renderer/services';
import type { RelayAthleteLifecycleAssessmentDto } from '@/shared/ipc/contracts';
import { Button } from '../shared/common/Button';

interface RelayAthleteLifecyclePanelProps {
  competitionId: string;
  relayNumber: number;
  preferredPhase: 'PRE_RELAY' | 'POST_RELAY';
  athletes: readonly {
    laneId: string;
    laneLabel: string;
    athleteId: string;
    athleteName: string;
    athleteStartNumber: number;
  }[];
}

export function RelayAthleteLifecyclePanel({
  competitionId,
  relayNumber,
  preferredPhase,
  athletes,
}: RelayAthleteLifecyclePanelProps) {
  const [phase, setPhase] = useState(preferredPhase);
  const [assessment, setAssessment] = useState<RelayAthleteLifecycleAssessmentDto | null>(null);
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('Athlete lifecycle check completed');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const athletesKey = useMemo(
    () => athletes.map((athlete) => `${athlete.laneId}:${athlete.athleteId}`).join('|'),
    [athletes],
  );

  useEffect(() => setPhase(preferredPhase), [preferredPhase]);

  const load = useCallback(async () => {
    setError(null);
    const response = await relayAthleteLifecycleService.assess({
      competitionId,
      relayNumber,
      phase,
      athletes: athletes.map(({ laneLabel: _laneLabel, ...athlete }) => athlete),
    });
    if (!response.success) {
      setError(response.error.message);
      return;
    }
    setAssessment(response.data);
  }, [athletesKey, competitionId, phase, relayNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const record = async (item: RelayAthleteLifecycleAssessmentDto['items'][number], state: 'CONFIRMED' | 'REVOKED') => {
    const athlete = athletes.find(
      (candidate) => candidate.laneId === item.laneId && candidate.athleteId === item.athleteId,
    );
    if (!athlete) return;
    const key = `${item.requirement}:${item.laneId}:${item.athleteId}`;
    setSavingKey(key);
    setError(null);
    try {
      const response = await relayAthleteLifecycleService.record({
        competitionId,
        relayNumber,
        laneId: athlete.laneId,
        athleteId: athlete.athleteId,
        athleteName: athlete.athleteName,
        athleteStartNumber: athlete.athleteStartNumber,
        phase: item.phase,
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

  const releaseEligible = (item: RelayAthleteLifecycleAssessmentDto['items'][number]) => {
    const athleteItems = assessment?.items.filter(
      (candidate) => candidate.laneId === item.laneId && candidate.athleteId === item.athleteId,
    );
    return Boolean(
      athleteItems?.some(
        (candidate) => candidate.requirement === 'FIREARM_UNLOADED_SAFETY_FLAG_VERIFIED' && candidate.confirmed,
      ) &&
      athleteItems?.some((candidate) => candidate.alternativeGroup === 'PRINTOUT_IDENTIFIED' && candidate.confirmed),
    );
  };

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Athlete relay status</h2>
          </div>
          <p className="mt-1 text-xs text-vscode-text-muted">
            Relay {relayNumber} · policy {assessment?.mode ?? '…'} ·{' '}
            {assessment?.ready ? 'complete' : 'checks outstanding'}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          <RefreshCw size={13} /> Refresh
        </Button>
      </header>

      <div className="flex gap-1" role="tablist" aria-label="Relay phase">
        {(['PRE_RELAY', 'POST_RELAY'] as const).map((candidate) => (
          <Button
            key={candidate}
            size="sm"
            variant={phase === candidate ? 'primary' : 'secondary'}
            onClick={() => setPhase(candidate)}
          >
            {candidate === 'PRE_RELAY' ? 'Pre-relay' : 'Post-relay'}
          </Button>
        ))}
      </div>

      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}
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

      {athletes.length === 0 ? (
        <p className="text-xs text-vscode-text-muted">Assign athletes to firing points to record their relay status.</p>
      ) : (
        <ul className="divide-y divide-vscode-border border-y border-vscode-border">
          {assessment?.items.map((item) => {
            const athlete = athletes.find(
              (candidate) => candidate.laneId === item.laneId && candidate.athleteId === item.athleteId,
            );
            const key = `${item.requirement}:${item.laneId}:${item.athleteId}`;
            const blockedRelease =
              item.requirement === 'ATHLETE_RELEASED' &&
              !item.confirmed &&
              assessment.mode === 'REQUIRED' &&
              !releaseEligible(item);
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <div>
                  <p className="flex items-center gap-1.5 font-medium text-vscode-text">
                    {item.confirmed ? (
                      <CheckCircle2 size={14} className="text-vscode-success" />
                    ) : (
                      <XCircle size={14} className="text-vscode-warning" />
                    )}
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-vscode-text-muted">
                    {athlete
                      ? `${athlete.laneLabel} · Bib ${athlete.athleteStartNumber} · ${athlete.athleteName}`
                      : item.athleteId}
                    {' · '}
                    {item.ruleReference}
                    {item.alternativeGroup ? ' · one printout method required' : ''}
                    {item.latestEntry
                      ? ` · ${item.latestEntry.officialName} · ${new Date(item.latestEntry.recordedAt).toLocaleString()}`
                      : ''}
                  </p>
                  {blockedRelease && (
                    <p className="mt-0.5 text-vscode-warning">
                      Confirm firearm clearance and either printout method first.
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={item.confirmed ? 'secondary' : 'primary'}
                  disabled={savingKey !== null || !officialName.trim() || !statement.trim() || blockedRelease}
                  onClick={() => void record(item, item.confirmed ? 'REVOKED' : 'CONFIRMED')}
                >
                  {savingKey === key ? 'Saving…' : item.confirmed ? 'Revoke' : 'Confirm'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {assessment?.mode === 'ADVISORY' && !assessment.ready && (
        <p className="flex items-start gap-1.5 text-xs text-vscode-warning">
          <BadgeCheck size={14} className="mt-0.5 shrink-0" />
          Advisory mode records gaps without blocking competition control or athlete release.
        </p>
      )}
    </div>
  );
}

const inputClass =
  'mt-1 block min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';
