import { useEffect, useMemo, useState } from 'react';

import type { CompetitionTypeDefinition } from '@/shared/competitionTypes';
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { Card } from '../shared/common/Card';

interface Props {
  definition: CompetitionTypeDefinition;
  phase: string;
  lanes: DirectorLaneSnapshotDto[];
  disabled: boolean;
  onStart(input: {
    programId: string;
    purpose: 'SIGHTING' | 'MATCH';
    stageIndex: number;
    seriesIndex: number;
  }): Promise<void>;
  onRecordUnload?(sequenceId: string, laneIds: string[], officialName: string, observedAt: string): Promise<void>;
  onCancel(sequenceId: string, laneIds: string[]): Promise<void>;
}

const TERMINAL_PHASES = new Set(['COMPLETE', 'CANCELLED']);

export function TimedTargetControlPanel({
  definition,
  phase,
  lanes,
  disabled,
  onStart,
  onCancel,
  onRecordUnload,
}: Props) {
  const [now, setNow] = useState(Date.now());
  const [officialName, setOfficialName] = useState('');
  const unloadGroups = new Map<string, string[]>();
  for (const lane of lanes) {
    const state = lane.timedTargetState;
    if (
      state?.commandPause &&
      state.commandPause.mode !== 'DISABLED' &&
      TERMINAL_PHASES.has(state.phase) &&
      !state.commandPause.unloadAt
    ) {
      unloadGroups.set(state.sequenceId, [...(unloadGroups.get(state.sequenceId) ?? []), lane.laneId]);
    }
  }
  const position = useMemo(() => commonPosition(lanes), [lanes]);
  const externallyVerifiedLanes = lanes.filter((lane) => {
    const integration = lane.hardware?.capabilities?.targetIntegration?.timedTarget;
    return integration?.actuation !== 'INTEGRATED' || integration.feedback !== 'INTEGRATED';
  });
  const contextStates = position
    ? lanes.flatMap((lane) => {
        const state = lane.timedTargetState;
        return state && state.stageIndex === position.stageIndex && state.seriesIndex === position.seriesIndex
          ? [state]
          : [];
      })
    : [];
  const activeGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const lane of lanes) {
      const state = lane.timedTargetState;
      if (!state || TERMINAL_PHASES.has(state.phase)) continue;
      groups.set(state.sequenceId, [...(groups.get(state.sequenceId) ?? []), lane.laneId]);
    }
    return [...groups.entries()];
  }, [lanes]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  if (!definition.timedTarget) return null;
  const stage = position ? definition.config.stages[position.stageIndex] : undefined;
  const series = position && stage ? stage.series[position.seriesIndex] : undefined;
  const matchProgramId = series?.timedTargetProgramId;
  const sightingProgramId = stage?.sightingTimedTargetProgramId;
  const allCurrent = contextStates.length === lanes.length && lanes.length > 0;
  const sightingComplete =
    !!sightingProgramId &&
    allCurrent &&
    contextStates.every((state) => state.programId === sightingProgramId && state.phase === 'COMPLETE');
  const matchAlreadyComplete =
    !!matchProgramId &&
    allCurrent &&
    contextStates.every((state) => state.programId === matchProgramId && state.phase === 'COMPLETE');
  const missingRequiredUnload = lanes.some(
    (lane) => lane.timedTargetState?.commandPause?.mode === 'REQUIRED' && !lane.timedTargetState.commandPause.unloadAt,
  );
  const ready = !missingRequiredUnload && phase === 'MATCH' && !!position && activeGroups.length === 0;
  const matchReady = ready && !!matchProgramId && !matchAlreadyComplete;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-vscode-text">ISSF 25m timed targets</h3>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Lane schedules the absolute LOAD, ATTENTION, software red/green state and EST after-time boundaries.
            Director only issues acknowledged intents.
          </p>
        </div>
        <span className="text-xs text-vscode-dimmed">{definition.timedTarget.signalSystem.replaceAll('_', ' ')}</span>
      </div>

      {externallyVerifiedLanes.length > 0 && (
        <p className="mt-3 border-l-2 border-vscode-warning pl-3 text-xs leading-5 text-vscode-warning">
          End-to-end physical target facing or light actuation and feedback are not confirmed by Saika for{' '}
          {externallyVerifiedLanes.map(laneLabel).join(', ')}. Operate and visually verify the external signal system
          before each series (ISSF 8.7.6.3(h)).
        </p>
      )}

      {!position ? (
        <p className="mt-3 border-l-2 border-vscode-warning pl-3 text-xs text-vscode-warning">
          Lanes are not at one common stage and series.
        </p>
      ) : (
        <p className="mt-3 text-xs text-vscode-text-muted">
          Stage {position.stageIndex} · series {position.seriesIndex + 1} · {stage?.name ?? 'unknown stage'}
        </p>
      )}

      <div className="mt-3 overflow-auto border border-vscode-border">
        <table className="w-full text-xs">
          <thead className="bg-vscode-sidebar text-vscode-text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Lane</th>
              <th className="px-3 py-2 text-left">Target device</th>
              <th className="px-3 py-2 text-left">Physical signals</th>
              <th className="px-3 py-2 text-left">Program</th>
              <th className="px-3 py-2 text-left">Signal / phase</th>
              <th className="px-3 py-2 text-right">Next edge</th>
              <th className="px-3 py-2 text-left">UNLOAD pause</th>
            </tr>
          </thead>
          <tbody>
            {lanes.map((lane) => {
              const state = lane.timedTargetState;
              const remaining = state?.nextTransitionAt ? Math.max(0, Date.parse(state.nextTransitionAt) - now) : null;
              return (
                <tr key={lane.laneId} className="border-t border-vscode-border">
                  <td className="px-3 py-2 text-vscode-text">{laneLabel(lane)}</td>
                  <td className="px-3 py-2 text-vscode-text-muted">
                    {lane.hardware?.connection.deviceId ?? lane.hardware?.connection.manufacturer ?? 'Not reported'}
                  </td>
                  <td className="px-3 py-2 text-vscode-text-muted">
                    {physicalSignalLabel(lane.hardware?.capabilities?.targetIntegration?.timedTarget)}
                  </td>
                  <td className="px-3 py-2 text-vscode-text-muted">{state?.programLabel ?? 'Not run'}</td>
                  <td
                    className={`px-3 py-2 font-semibold ${
                      state?.signal === 'GREEN' ? 'text-vscode-success' : 'text-vscode-warning'
                    }`}
                  >
                    {state ? `${state.signal} · ${state.phase.replaceAll('_', ' ')}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-vscode-text-muted">
                    {remaining === null ? '—' : `${(remaining / 1_000).toFixed(1)} s`}
                  </td>
                  <td className="px-3 py-2 text-vscode-text-muted">
                    {!state?.commandPause ? (
                      'Not applicable'
                    ) : state.commandPause.mode === 'DISABLED' ? (
                      'Disabled'
                    ) : !state.commandPause.unloadAt ? (
                      `Awaiting UNLOAD (${state.commandPause.mode.toLowerCase()})`
                    ) : (
                      <span
                        title={`UNLOAD ${new Date(state.commandPause.unloadAt).toLocaleTimeString()} by ${state.commandPause.officialName}`}
                      >
                        {Math.max(0, Math.ceil((Date.parse(state.commandPause.nextLoadAllowedAt!) - now) / 1_000))} s ·{' '}
                        {state.commandPause.mode.toLowerCase()}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {onRecordUnload && unloadGroups.size > 0 && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-vscode-text-muted">
            Official recording UNLOAD
            <input
              className="ml-2 border border-vscode-border bg-vscode-input p-1 text-vscode-text"
              value={officialName}
              onChange={(event) => setOfficialName(event.target.value)}
              maxLength={200}
            />
          </label>
          {[...unloadGroups].map(([sequenceId, laneIds]) => (
            <UnloadRecordControl
              key={sequenceId}
              disabled={disabled || !officialName.trim()}
              count={laneIds.length}
              onRecord={(observedAt) => onRecordUnload(sequenceId, laneIds, officialName, observedAt)}
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {sightingProgramId && (
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || !ready || sightingComplete}
            onClick={() =>
              position &&
              void onStart({
                programId: sightingProgramId,
                purpose: 'SIGHTING',
                stageIndex: position.stageIndex,
                seriesIndex: position.seriesIndex,
              })
            }
          >
            {position?.seriesIndex === 0 ? 'Run configured sighting series' : 'Run authorized recovery sighting'}
          </Button>
        )}
        <Button
          size="sm"
          disabled={disabled || !matchReady}
          onClick={() =>
            position &&
            matchProgramId &&
            void onStart({
              programId: matchProgramId,
              purpose: 'MATCH',
              stageIndex: position.stageIndex,
              seriesIndex: position.seriesIndex,
            })
          }
        >
          LOAD / run match series
        </Button>
        {activeGroups.map(([sequenceId, laneIds]) => (
          <Button
            key={sequenceId}
            size="sm"
            variant="danger"
            disabled={disabled}
            onClick={() => void onCancel(sequenceId, laneIds)}
          >
            Cancel {sequenceId.slice(0, 8)} ({laneIds.length})
          </Button>
        ))}
      </div>

      <p className="mt-3 text-xs leading-5 text-vscode-dimmed">
        Record the actual UNLOAD command after each applicable series. Required mode gates the next LOAD on that command
        and the prescribed pause; advisory mode displays the evidence without adding a start gate. Additional sighting
        and recovery remain explicit Jury/Range Officer decisions.
      </p>
    </Card>
  );
}

function laneLabel(lane: DirectorLaneSnapshotDto): string {
  return lane.firingPointNumber ? `FP ${lane.firingPointNumber}` : lane.laneAlias || lane.laneId.slice(0, 8);
}

function physicalSignalLabel(
  integration:
    | NonNullable<
        NonNullable<NonNullable<DirectorLaneSnapshotDto['hardware']>['capabilities']>['targetIntegration']
      >['timedTarget']
    | null
    | undefined,
): string {
  if (!integration) return 'Not reported';
  if (integration.actuation === 'INTEGRATED' && integration.feedback === 'INTEGRATED') {
    return 'Integrated + feedback';
  }
  if (integration.actuation === 'INTEGRATED') return 'Integrated / no feedback';
  if (integration.feedback === 'INTEGRATED') return 'External actuation / feedback integrated';
  return 'External actuation + verification';
}

function commonPosition(lanes: DirectorLaneSnapshotDto[]): { stageIndex: number; seriesIndex: number } | null {
  if (lanes.length === 0) return null;
  const first = lanes[0]?.competitionState;
  if (!first || first.phase !== 'MATCH' || first.awaitingSeriesStart === true) return null;
  const position = { stageIndex: first.currentStage.index, seriesIndex: first.currentSeries.index };
  return lanes.every(
    (lane) =>
      lane.competitionState?.phase === 'MATCH' &&
      lane.competitionState.awaitingSeriesStart !== true &&
      lane.competitionState.currentStage.index === position.stageIndex &&
      lane.competitionState.currentSeries.index === position.seriesIndex,
  )
    ? position
    : null;
}

function UnloadRecordControl({
  disabled,
  count,
  onRecord,
}: {
  disabled: boolean;
  count: number;
  onRecord(at: string): Promise<void>;
}) {
  const [observedAt, setObservedAt] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label>
        Actual UNLOAD time (blank = now)
        <input
          aria-label="Actual UNLOAD time"
          type="datetime-local"
          step="0.001"
          className="ml-2 border border-vscode-border bg-vscode-input p-1"
          value={observedAt}
          onChange={(event) => setObservedAt(event.target.value)}
        />
      </label>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          const at = observedAt ? new Date(observedAt) : new Date();
          if (!Number.isFinite(at.getTime())) return;
          const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, -1);
          setObservedAt(local);
          void onRecord(at.toISOString());
        }}
      >
        Record UNLOAD ({count} lanes)
      </Button>
    </div>
  );
}
