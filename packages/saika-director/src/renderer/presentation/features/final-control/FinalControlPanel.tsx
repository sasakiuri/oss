import { useCallback, useEffect, useMemo, useState } from 'react';
import { Medal, RefreshCw } from 'lucide-react';

import { finalControlService, mqttService } from '@/renderer/services';
import type {
  DirectorLaneSnapshotDto,
  FinalCheckpointAssessmentDto,
  FinalControlDecisionDto,
  FinalControlLaneSnapshotDto,
} from '@/shared/ipc/contracts';
import { Button } from '../shared/common/Button';

interface FinalControlPanelProps {
  competitionId: string;
  competitionTypeId: string;
  eventId?: string;
  lanes: readonly DirectorLaneSnapshotDto[];
  disabled?: boolean;
}

export function FinalControlPanel({
  competitionId,
  competitionTypeId,
  eventId,
  lanes,
  disabled = false,
}: FinalControlPanelProps) {
  const [assessment, setAssessment] = useState<FinalCheckpointAssessmentDto | null>(null);
  const [decisions, setDecisions] = useState<FinalControlDecisionDto[]>([]);
  const [officialName, setOfficialName] = useState('');
  const [selectedLaneId, setSelectedLaneId] = useState('');
  const [resolution, setResolution] = useState<'CLEAR_LOWEST' | 'SHOOT_OFF' | 'JURY_DECISION'>('CLEAR_LOWEST');
  const [statement, setStatement] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const laneSnapshots = useMemo<FinalControlLaneSnapshotDto[]>(
    () =>
      lanes.map((lane) => ({
        laneId: lane.laneId,
        athleteName: lane.assignment?.athlete?.name || lane.laneAlias || lane.laneId.slice(0, 8),
        totalShotCount: lane.score?.competitionId === competitionId ? lane.score.totalShotCount : 0,
        totalScoreX10: lane.score?.competitionId === competitionId ? lane.score.totalScoreX10 : 0,
        finished: lane.competitionState?.competitionId === competitionId && lane.competitionState.phase === 'FINISHED',
      })),
    [competitionId, lanes],
  );
  const laneSnapshotKey = JSON.stringify(laneSnapshots);
  const input = useMemo(
    () => ({ competitionId, competitionTypeId, participantCount: laneSnapshots.length, lanes: laneSnapshots }),
    [competitionId, competitionTypeId, laneSnapshotKey],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listResponse, assessmentResponse] = await Promise.all([
        finalControlService.list({ competitionId }),
        finalControlService.assess(input),
      ]);
      if (!listResponse.success) throw new Error(listResponse.error.message);
      if (!assessmentResponse.success) throw new Error(assessmentResponse.error.message);
      setDecisions(listResponse.data);
      setAssessment(assessmentResponse.data);
      const candidate = assessmentResponse.data.candidateLaneIds[0] ?? '';
      setSelectedLaneId((current) =>
        assessmentResponse.data.candidateLaneIds.includes(current) ? current : candidate,
      );
      setResolution(assessmentResponse.data.status === 'TIE' ? 'SHOOT_OFF' : 'CLEAR_LOWEST');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }, [competitionId, input]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingDecision =
    [...decisions].reverse().find((decision) => !decision.voided && !decision.commandCompleted) ?? null;
  const canDecide = assessment?.status === 'READY' || assessment?.status === 'TIE';

  const executeRetirement = async () => {
    setSaving(true);
    setError(null);
    try {
      let decision = pendingDecision;
      if (!decision) {
        if (!canDecide || !selectedLaneId) throw new Error('No Final checkpoint is ready');
        const recorded = await finalControlService.recordDecision({
          ...input,
          ...(eventId ? { eventId } : {}),
          selectedLaneId,
          resolution,
          ...(statement.trim() ? { resolutionStatement: statement.trim() } : {}),
          officialName: officialName.trim(),
        });
        if (!recorded.success) throw new Error(recorded.error.message);
        decision = recorded.data;
      }
      const command = await mqttService.retireFinalist({
        competitionId,
        laneId: decision.selectedLaneId,
        checkpointId: decision.id,
        rank: decision.rank,
        afterShot: decision.afterShot,
      });
      if (!command.success) throw new Error(command.error.message);
      const laneResult = command.data.lanes.find((lane) => lane.laneId === decision!.selectedLaneId);
      const status = laneResult?.status === 'done' ? 'DONE' : laneResult?.status === 'error' ? 'ERROR' : 'TIMEOUT';
      const detail =
        laneResult?.error?.message ??
        (status === 'DONE'
          ? `Lane retired as rank ${decision.rank} after shot ${decision.afterShot}`
          : `Lane command ended with ${status.toLowerCase()}`);
      const recordedResult = await finalControlService.recordCommandResult({
        decisionId: decision.id,
        commandId: command.data.commandId,
        status,
        statement: detail,
        officialName: officialName.trim(),
      });
      if (!recordedResult.success) throw new Error(recordedResult.error.message);
      setStatement('');
      await load();
    } catch (caught) {
      await load();
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const voidPending = async () => {
    if (!pendingDecision || !statement.trim() || !officialName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await finalControlService.voidDecision({
        decisionId: pendingDecision.id,
        reason: statement.trim(),
        officialName: officialName.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setStatement('');
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Medal size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">10m Final checkpoints</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            ISSF 6.17.2. Director records the placing decision; Lane only stops the selected finalist.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <div className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</div>}
      {assessment && (
        <div className="border-l-2 border-vscode-accent pl-3 text-xs leading-5">
          <p className="font-semibold text-vscode-text">
            {assessment.status.replaceAll('_', ' ')}
            {assessment.afterShot ? ` · after shot ${assessment.afterShot}` : ''}
            {assessment.expectedRank ? ` · rank ${assessment.expectedRank}` : ''}
          </p>
          <p className="text-vscode-text-muted">{assessment.guidance}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-vscode-text-muted">
            <tr>
              <th className="py-1 pr-3">Lane</th>
              <th className="py-1 pr-3">Athlete</th>
              <th className="py-1 pr-3">Shots</th>
              <th className="py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {laneSnapshots.map((lane) => (
              <tr
                key={lane.laneId}
                className={assessment?.candidateLaneIds.includes(lane.laneId) ? 'bg-vscode-warning/10' : ''}
              >
                <td className="py-1 pr-3 tabular-nums">{lane.laneId.slice(0, 8)}</td>
                <td className="py-1 pr-3">
                  {lane.athleteName}
                  {lane.finished ? ' · retired' : ''}
                </td>
                <td className="py-1 pr-3 tabular-nums">{lane.totalShotCount}</td>
                <td className="py-1 tabular-nums">{(lane.totalScoreX10 / 10).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(canDecide || pendingDecision) && (
        <div className="grid gap-3 border-t border-vscode-border pt-3 md:grid-cols-2">
          <label className="text-xs text-vscode-text-muted">
            Official name
            <input
              value={officialName}
              onChange={(event) => setOfficialName(event.target.value)}
              className={inputClass}
            />
          </label>
          {!pendingDecision && (
            <label className="text-xs text-vscode-text-muted">
              Selected finalist
              <select
                value={selectedLaneId}
                onChange={(event) => setSelectedLaneId(event.target.value)}
                className={inputClass}
              >
                {assessment?.candidateLaneIds.map((laneId) => {
                  const lane = laneSnapshots.find((item) => item.laneId === laneId);
                  return (
                    <option key={laneId} value={laneId}>
                      {lane?.athleteName ?? laneId.slice(0, 8)}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
          {!pendingDecision && assessment?.status === 'TIE' && (
            <label className="text-xs text-vscode-text-muted">
              Tie resolution
              <select
                value={resolution}
                onChange={(event) => setResolution(event.target.value as 'SHOOT_OFF' | 'JURY_DECISION')}
                className={inputClass}
              >
                <option value="SHOOT_OFF">Shoot-off</option>
                <option value="JURY_DECISION">Jury decision</option>
              </select>
            </label>
          )}
          <label className="text-xs text-vscode-text-muted md:col-span-2">
            {pendingDecision
              ? 'Retry / void note'
              : assessment?.status === 'TIE'
                ? 'Shoot-off or Jury resolution'
                : 'Optional note'}
            <textarea
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              className={`${inputClass} min-h-16`}
            />
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button
              disabled={
                disabled ||
                saving ||
                !officialName.trim() ||
                (!pendingDecision && assessment?.status === 'TIE' && !statement.trim())
              }
              onClick={() => void executeRetirement()}
            >
              {pendingDecision
                ? `Retry Lane command for rank ${pendingDecision.rank}`
                : `Record and retire rank ${assessment?.expectedRank}`}
            </Button>
            {pendingDecision && (
              <Button
                variant="secondary"
                disabled={saving || !officialName.trim() || !statement.trim()}
                onClick={() => void voidPending()}
              >
                Void pending decision
              </Button>
            )}
          </div>
        </div>
      )}

      {decisions.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-vscode-text">
            Checkpoint audit ({decisions.length})
          </summary>
          <ul className="mt-2 space-y-2 text-xs">
            {[...decisions].reverse().map((decision) => (
              <li key={decision.id} className="border-t border-vscode-border pt-2">
                <p className="font-medium text-vscode-text">
                  Rank {decision.rank} after shot {decision.afterShot} · {decision.resolution.replaceAll('_', ' ')}
                </p>
                <p className="text-vscode-text-muted">
                  {decision.selectedLaneId.slice(0, 8)} · {decision.officialName} ·{' '}
                  {decision.commandCompleted ? 'Lane completed' : decision.voided ? 'void' : 'command pending'}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const inputClass =
  'mt-1 block min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
