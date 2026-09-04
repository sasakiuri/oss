import { useCallback, useEffect, useState } from 'react';
import { FileSearch, LoaderCircle, RefreshCw, Radio } from 'lucide-react';

import { estComplaintsService } from '@/renderer/services';
import type { EstComplaintObservationDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

interface EstComplaintInboxProps {
  competitionId: string;
  observedSignalIds: readonly string[];
  relayNumber?: number;
  onCaseOpened?: (caseId: string) => void;
}

export function EstComplaintInbox({
  competitionId,
  observedSignalIds,
  relayNumber,
  onCaseOpened,
}: EstComplaintInboxProps) {
  const [observations, setObservations] = useState<EstComplaintObservationDto[]>([]);
  const [openedBy, setOpenedBy] = useState('');
  const [loading, setLoading] = useState(true);
  const [openingSignalId, setOpeningSignalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const observedSignalKey = [...observedSignalIds].sort().join(':');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await estComplaintsService.listByCompetition({ competitionId });
      if (!response.success) throw new Error(response.error.message);
      setObservations(response.data);
    } catch (caught) {
      setError(errorMessage(caught, 'Failed to load Lane EST complaints'));
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    void load();
  }, [load, observedSignalKey]);

  const openCase = useCallback(
    async (signalId: string) => {
      const official = openedBy.trim();
      if (!official) return;
      setOpeningSignalId(signalId);
      setError(null);
      try {
        const response = await estComplaintsService.openTargetExamination({
          signalId,
          openedBy: official,
          ...(relayNumber ? { relayNumber } : {}),
        });
        if (!response.success) throw new Error(response.error.message);
        setObservations((current) =>
          current.map((observation) => (observation.signalId === signalId ? response.data.observation : observation)),
        );
        onCaseOpened?.(response.data.targetExaminationCaseId);
      } catch (caught) {
        setError(errorMessage(caught, 'Failed to open the target examination'));
      } finally {
        setOpeningSignalId(null);
      }
    },
    [onCaseOpened, openedBy, relayNumber],
  );

  return (
    <section className="space-y-3" aria-label="Lane EST complaint inbox">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Lane EST complaint inbox</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Preserve a received Lane observation as the starting evidence for a Target Examination case.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || openingSignalId !== null}
          onClick={() => void load()}
        >
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      <label className="block max-w-sm text-xs font-medium text-vscode-text-muted">
        Official opening the examination
        <input
          value={openedBy}
          onChange={(event) => setOpenedBy(event.target.value)}
          maxLength={200}
          className="mt-1 w-full rounded-[2px] border border-vscode-input-border bg-vscode-input-bg px-2.5 py-1.5 text-[13px] text-vscode-input-text outline-none focus:border-vscode-focus"
          placeholder="Name or role"
        />
      </label>

      {error && <div className="border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error">{error}</div>}
      {loading && <p className="text-[13px] text-vscode-text-muted">Loading Lane observations…</p>}
      {!loading && observations.length === 0 && (
        <p className="border-y border-vscode-border py-3 text-[13px] text-vscode-text-muted">
          No Lane EST complaints have been observed for this competition.
        </p>
      )}

      {observations.length > 0 && (
        <ul className="divide-y divide-vscode-border border-y border-vscode-border">
          {[...observations].reverse().map((observation) => (
            <li key={observation.signalId} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-vscode-text">
                  <span>
                    {observation.firingPointNumber ? `Firing point ${observation.firingPointNumber}` : 'Lane'}
                  </span>
                  <span>· {observation.context.participantName}</span>
                  <span className={observation.status === 'ACTIVE' ? 'text-cyan-300' : 'text-vscode-text-muted'}>
                    {observation.status.toLowerCase()}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-vscode-text-muted">
                  {issueLabel(observation.issue)} · {observation.context.phase.toLowerCase()} · stage{' '}
                  {observation.context.stageIndex + 1}, series {observation.context.seriesIndex + 1}, recorded{' '}
                  {observation.context.recordedShots} · {new Date(observation.signalledAt).toLocaleString()}
                </p>
                {observation.message && <p className="mt-1 text-xs text-vscode-text">{observation.message}</p>}
                <p className="mt-1 text-xs leading-5 text-vscode-warning">
                  {observation.timing.guidance} ({observation.timing.ruleReference})
                </p>
                <p className="text-[11px] text-vscode-dimmed">
                  Advisory only; the Jury determines timeliness, validity, target failure, and score.
                </p>
              </div>
              <div className="self-center md:text-right">
                {observation.targetExaminationCaseId ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-vscode-success">
                    <FileSearch size={13} aria-hidden="true" /> Case {observation.targetExaminationCaseId.slice(0, 8)}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    disabled={!openedBy.trim() || openingSignalId !== null}
                    onClick={() => void openCase(observation.signalId)}
                  >
                    {openingSignalId === observation.signalId ? (
                      <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <FileSearch size={13} aria-hidden="true" />
                    )}
                    Open examination
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function issueLabel(issue: EstComplaintObservationDto['issue']): string {
  switch (issue) {
    case 'SHOT_VALUE':
      return 'Displayed shot value';
    case 'SHOT_NOT_REGISTERED':
      return 'Shot not registered or displayed';
    case 'TARGET_FAILURE':
      return 'Target failure';
    case 'TARGET_MEDIA_ADVANCE':
      return 'Paper or rubber strip advance';
    case 'OTHER':
      return 'Other EST issue';
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
