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
  onCancel(sequenceId: string, laneIds: string[]): Promise<void>;
}

const TERMINAL_PHASES = new Set(['COMPLETE', 'CANCELLED']);

export function TimedTargetControlPanel({ definition, phase, lanes, disabled, onStart, onCancel }: Props) {
  const [now, setNow] = useState(Date.now());
  const position = useMemo(() => commonPosition(lanes), [lanes]);
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
    if (activeGroups.length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [activeGroups.length]);

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
  const ready = phase === 'MATCH' && !!position && activeGroups.length === 0;
  const matchReady = ready && !!matchProgramId && !matchAlreadyComplete;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-vscode-text">ISSF 25m timed targets</h3>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Lane schedules the absolute LOAD, ATTENTION, red/green and EST after-time boundaries. Director only issues
            acknowledged intents.
          </p>
        </div>
        <span className="text-xs text-vscode-dimmed">{definition.timedTarget.signalSystem.replaceAll('_', ' ')}</span>
      </div>

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
              <th className="px-3 py-2 text-left">Program</th>
              <th className="px-3 py-2 text-left">Signal / phase</th>
              <th className="px-3 py-2 text-right">Next edge</th>
            </tr>
          </thead>
          <tbody>
            {lanes.map((lane) => {
              const state = lane.timedTargetState;
              const remaining = state?.nextTransitionAt ? Math.max(0, Date.parse(state.nextTransitionAt) - now) : null;
              return (
                <tr key={lane.laneId} className="border-t border-vscode-border">
                  <td className="px-3 py-2 text-vscode-text">
                    {lane.firingPointNumber
                      ? `FP ${lane.firingPointNumber}`
                      : lane.laneAlias || lane.laneId.slice(0, 8)}
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
        A new LOAD is automatically delayed until every selected Lane has completed the required one-minute pause. The
        configured sighting series is shown separately but is not a software gate: additional sighting, interruption
        recovery and malfunction handling remain explicit Jury/Range Officer decisions.
      </p>
    </Card>
  );
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
