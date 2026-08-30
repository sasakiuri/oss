import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, UsersRound } from 'lucide-react';
import { mixedTeamFinalControlService, mqttService } from '@/renderer/services';
import type {
  DirectorLaneSnapshotDto,
  MixedTeamFinalAssessmentDto,
  MixedTeamFinalDecisionDto,
  MixedTeamFinalSnapshotDto,
} from '@/shared/ipc/contracts';
import { Button } from '../shared/common/Button';

interface Props {
  competitionId: string;
  competitionTypeId: string;
  eventId?: string;
  lanes: readonly DirectorLaneSnapshotDto[];
  disabled?: boolean;
}

export function MixedTeamFinalControlPanel({
  competitionId,
  competitionTypeId,
  eventId,
  lanes,
  disabled = false,
}: Props) {
  const teams = useMemo(() => buildTeams(competitionId, lanes), [competitionId, lanes]);
  const teamKey = JSON.stringify(teams);
  const input = useMemo(
    () => ({ competitionId, competitionTypeId, teams }),
    [competitionId, competitionTypeId, teamKey],
  );
  const [assessment, setAssessment] = useState<MixedTeamFinalAssessmentDto | null>(null);
  const [decisions, setDecisions] = useState<MixedTeamFinalDecisionDto[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [resolution, setResolution] = useState<'CLEAR_LOWEST' | 'SHOOT_OFF' | 'JURY_DECISION'>('CLEAR_LOWEST');
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, assessed] = await Promise.all([
        mixedTeamFinalControlService.list({ competitionId }),
        mixedTeamFinalControlService.assess(input),
      ]);
      if (!list.success) throw new Error(list.error.message);
      if (!assessed.success) throw new Error(assessed.error.message);
      setDecisions(list.data);
      setAssessment(assessed.data);
      setSelectedTeamId((current) =>
        assessed.data.candidateTeamIds.includes(current) ? current : (assessed.data.candidateTeamIds[0] ?? ''),
      );
      setResolution(assessed.data.status === 'TIE' ? 'SHOOT_OFF' : 'CLEAR_LOWEST');
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [competitionId, input]);

  useEffect(() => {
    void load();
  }, [load]);
  const pending = [...decisions].reverse().find((decision) => !decision.voided && !decision.commandCompleted) ?? null;
  const canDecide = assessment?.status === 'READY' || assessment?.status === 'TIE';

  const execute = async () => {
    setSaving(true);
    setError(null);
    try {
      let decision = pending;
      if (!decision) {
        if (!canDecide || !selectedTeamId) throw new Error('No Mixed Team checkpoint is ready');
        const recorded = await mixedTeamFinalControlService.recordDecision({
          ...input,
          ...(eventId ? { eventId } : {}),
          selectedTeamId,
          resolution,
          ...(statement.trim() ? { resolutionStatement: statement.trim() } : {}),
          officialName: officialName.trim(),
        });
        if (!recorded.success) throw new Error(recorded.error.message);
        decision = recorded.data;
      }
      const incompleteLaneIds = decision.memberLaneIds.filter(
        (laneId) => decision!.latestLaneStatuses[laneId] !== 'DONE',
      );
      const commandResponses = await Promise.all(
        incompleteLaneIds.map((laneId) =>
          mqttService.retireFinalist({
            competitionId,
            laneId,
            checkpointId: decision!.id,
            rank: decision!.rank,
            afterShot: decision!.afterShot,
          }),
        ),
      );
      const laneResults = commandResponses.flatMap((response, index) => {
        if (!response.success) return [];
        const laneId = incompleteLaneIds[index]!;
        const result = response.data.lanes.find((lane) => lane.laneId === laneId);
        return [
          {
            laneId,
            commandId: response.data.commandId,
            status:
              result?.status === 'done'
                ? ('DONE' as const)
                : result?.status === 'error'
                  ? ('ERROR' as const)
                  : ('TIMEOUT' as const),
            error: result?.error?.message ?? null,
          },
        ];
      });
      if (laneResults.length > 0) {
        const recorded = await mixedTeamFinalControlService.recordCommandBatch({
          decisionId: decision.id,
          laneResults,
          statement: `Retirement command for ${decision.selectedTeamId}: ${laneResults.map((result) => `${result.laneId.slice(0, 8)}=${result.status}`).join(', ')}`,
          officialName: officialName.trim(),
        });
        if (!recorded.success) throw new Error(recorded.error.message);
      }
      const transportErrors = commandResponses.filter((response) => !response.success);
      await load();
      if (transportErrors.length > 0 || laneResults.some((result) => result.status !== 'DONE')) {
        throw new Error('Mixed Team retirement was only partially completed; retry the pending member Lane(s)');
      }
      setStatement('');
    } catch (caught) {
      await load();
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
            <UsersRound size={17} />
            <h2 className="text-sm font-semibold text-vscode-text">Mixed Team Final checkpoints</h2>
          </div>
          <p className="mt-1 text-xs text-vscode-text-muted">
            ISSF 6.18: combined team scores; eliminations after shots 18, 21 and 24.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={saving} onClick={() => void load()}>
          <RefreshCw size={13} /> Refresh
        </Button>
      </header>
      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}
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
              <th className="py-1 pr-3">Team</th>
              <th className="py-1 pr-3">Members</th>
              <th className="py-1 pr-3">Shots</th>
              <th className="py-1">Combined</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr
                key={team.teamId}
                className={assessment?.candidateTeamIds.includes(team.teamId) ? 'bg-vscode-warning/10' : ''}
              >
                <td className="py-1 pr-3 font-medium">{team.teamName}</td>
                <td className="py-1 pr-3">
                  {team.members
                    .map((member) => `${member.gender} ${member.athleteName}${member.finished ? ' (retired)' : ''}`)
                    .join(' / ')}
                </td>
                <td className="py-1 pr-3 tabular-nums">
                  {team.members.map((member) => member.totalShotCount).join('/')}
                </td>
                <td className="py-1 tabular-nums">
                  {(team.members.reduce((sum, member) => sum + member.totalScoreX10, 0) / 10).toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(canDecide || pending) && (
        <div className="grid gap-3 border-t border-vscode-border pt-3 md:grid-cols-2">
          <label className="text-xs text-vscode-text-muted">
            Official name
            <input
              className={inputClass}
              value={officialName}
              onChange={(event) => setOfficialName(event.target.value)}
            />
          </label>
          {!pending && (
            <label className="text-xs text-vscode-text-muted">
              Selected team
              <select
                className={inputClass}
                value={selectedTeamId}
                onChange={(event) => setSelectedTeamId(event.target.value)}
              >
                {assessment?.candidateTeamIds.map((teamId) => (
                  <option key={teamId} value={teamId}>
                    {teams.find((team) => team.teamId === teamId)?.teamName ?? teamId}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!pending && assessment?.status === 'TIE' && (
            <label className="text-xs text-vscode-text-muted">
              Tie resolution
              <select
                className={inputClass}
                value={resolution}
                onChange={(event) => setResolution(event.target.value as 'SHOOT_OFF' | 'JURY_DECISION')}
              >
                <option value="SHOOT_OFF">Team shoot-off</option>
                <option value="JURY_DECISION">Jury decision</option>
              </select>
            </label>
          )}
          <label className="text-xs text-vscode-text-muted md:col-span-2">
            {pending ? 'Retry note' : assessment?.status === 'TIE' ? 'Shoot-off / Jury resolution' : 'Optional note'}
            <textarea
              className={`${inputClass} min-h-16`}
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
            />
          </label>
          <Button
            disabled={
              disabled ||
              saving ||
              !officialName.trim() ||
              (!pending && assessment?.status === 'TIE' && !statement.trim())
            }
            onClick={() => void execute()}
          >
            {pending ? `Retry ${pending.selectedTeamId}` : `Record and retire rank ${assessment?.expectedRank}`}
          </Button>
        </div>
      )}
      {decisions.length > 0 && (
        <p className="text-xs text-vscode-text-muted">
          Audit: {decisions.filter((decision) => decision.commandCompleted).length}/{decisions.length} team checkpoint
          commands complete.
        </p>
      )}
    </div>
  );
}

function buildTeams(competitionId: string, lanes: readonly DirectorLaneSnapshotDto[]): MixedTeamFinalSnapshotDto[] {
  const groups = new Map<string, MixedTeamFinalSnapshotDto>();
  for (const lane of lanes) {
    const athlete = lane.assignment?.competitionId === competitionId ? lane.assignment.athlete : null;
    const teamId = athlete?.teamId || `MISSING:${lane.laneId}`;
    const current = groups.get(teamId) ?? {
      teamId,
      teamName: athlete?.teamName || teamId,
      nationCode: athlete?.nationCode ?? null,
      members: [],
    };
    current.members.push({
      laneId: lane.laneId,
      participantId: athlete?.id ?? lane.laneId,
      athleteName: athlete?.name || lane.laneAlias || lane.laneId.slice(0, 8),
      gender: athlete?.gender ?? 'UNSPECIFIED',
      totalShotCount: lane.score?.competitionId === competitionId ? lane.score.totalShotCount : 0,
      totalScoreX10: lane.score?.competitionId === competitionId ? lane.score.totalScoreX10 : 0,
      finished: lane.competitionState?.competitionId === competitionId && lane.competitionState.phase === 'FINISHED',
    });
    groups.set(teamId, current);
  }
  return [...groups.values()]
    .map((team) => ({
      ...team,
      members: [...team.members].sort((left, right) => (left.gender === 'F' ? -1 : right.gender === 'F' ? 1 : 0)),
    }))
    .sort((left, right) => left.teamId.localeCompare(right.teamId));
}

const inputClass =
  'mt-1 block min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
