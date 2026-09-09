// SPDX-License-Identifier: MIT
import { useEffect, useRef } from 'react';

import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { Card } from '../shared/common/Card';

import { formatClockMetric } from './competitionFormatting';
import { LANE_COMPETITION_TYPES, type SupportedLaneCompetitionType } from './supportedCompetitionTypes';
import type { CompetitionCommands } from './useCompetitionCommands';
import type { CompetitionSelection } from './useCompetitionSelection';

type Selection = Pick<
  CompetitionSelection,
  | 'selectedLaneIds'
  | 'setSelectedLaneIds'
  | 'selectedCompetitionId'
  | 'competitionTypeId'
  | 'setCompetitionTypeId'
  | 'assignmentLaneId'
  | 'setAssignmentLaneId'
  | 'activeCompetition'
  | 'competitionByLaneId'
  | 'assignmentEditingAllowed'
  | 'competitionLanes'
  | 'selectedAvailableLaneIds'
  | 'allLanesSelected'
  | 'toggleLane'
  | 'toggleAllLanes'
>;
type Commands = Pick<
  CompetitionCommands,
  | 'busyAction'
  | 'clockQuality'
  | 'athleteStartNumber'
  | 'setAthleteStartNumber'
  | 'athleteName'
  | 'setAthleteName'
  | 'probeLaneClock'
  | 'createAndJoinCompetition'
  | 'assignAthlete'
  | 'resetLaneSession'
  | 'unassignAthlete'
>;
interface LaneManagementPanelProps {
  selection: Selection;
  commands: Commands;
  lanes: MqttControlSnapshotDto['lanes'];
  connected: boolean;
  baseControlsDisabled: boolean;
  onOpenNetworkSettings: () => void;
}
export function LaneManagementPanel({
  selection,
  commands,
  lanes,
  connected,
  baseControlsDisabled,
  onOpenNetworkSettings,
}: LaneManagementPanelProps) {
  const {
    selectedLaneIds,
    setSelectedLaneIds,
    selectedCompetitionId,
    competitionTypeId,
    setCompetitionTypeId,
    assignmentLaneId,
    setAssignmentLaneId,
    activeCompetition,
    competitionByLaneId,
    assignmentEditingAllowed,
    competitionLanes,
    selectedAvailableLaneIds,
    allLanesSelected,
    toggleLane,
    toggleAllLanes,
  } = selection;
  const {
    busyAction,
    clockQuality,
    athleteStartNumber,
    setAthleteStartNumber,
    athleteName,
    setAthleteName,
    probeLaneClock,
    createAndJoinCompetition,
    assignAthlete,
    resetLaneSession,
    unassignAthlete,
  } = commands;
  const selectAllLanesRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllLanesRef.current)
      selectAllLanesRef.current.indeterminate = selectedLaneIds.size > 0 && !allLanesSelected;
  }, [allLanesSelected, selectedLaneIds]);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-vscode-text">Lanes</h3>
          <p className="mt-0.5 text-xs text-vscode-text-muted" aria-live="polite">
            {lanes.length} discovered · {selectedLaneIds.size} selected
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
            Competition type
            <select
              value={competitionTypeId}
              onChange={(event) => setCompetitionTypeId(event.target.value as SupportedLaneCompetitionType)}
              className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text"
            >
              {LANE_COMPETITION_TYPES.map((competitionType) => (
                <option key={competitionType} value={competitionType}>
                  {competitionType}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={!connected || selectedAvailableLaneIds.length === 0 || busyAction !== null}
            onClick={() => void createAndJoinCompetition()}
          >
            Create competition
          </Button>
        </div>
      </div>

      {lanes.length > 0 && (
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <p className="text-vscode-text-muted" aria-live="polite">
            <span className="font-semibold text-vscode-text">{selectedLaneIds.size}</span> of {lanes.length} Lanes
            selected
          </p>
          {selectedLaneIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedLaneIds(new Set())}
              className="rounded px-2 py-1 font-medium text-vscode-accent transition-colors hover:bg-vscode-primary/15 hover:text-vscode-text"
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      <div className="max-h-80 overflow-auto border border-vscode-border bg-vscode-bg/30">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-vscode-sidebar text-vscode-text shadow-[0_1px_0_0_#3E3E42]">
            <tr>
              <th scope="col" className="w-12 px-3 py-2.5">
                <input
                  ref={selectAllLanesRef}
                  type="checkbox"
                  aria-label="Select all discovered Lanes"
                  checked={allLanesSelected}
                  disabled={lanes.length === 0}
                  onChange={toggleAllLanes}
                  className="h-4 w-4 accent-vscode-primary"
                />
              </th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-vscode-text-muted">
                Firing point
              </th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                Lane name
              </th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                Lane ID
              </th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                Hardware
              </th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                Safety
              </th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                Clock
              </th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                Competition
              </th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                Phase
              </th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                Athlete
              </th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-vscode-text-muted">
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {lanes.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-5 text-left">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-medium text-vscode-text">No Lanes discovered</p>
                      <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
                        Waiting for Saika Lane devices on this broker.
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={onOpenNetworkSettings}>
                      Configure network
                    </Button>
                  </div>
                </td>
              </tr>
            ) : (
              lanes.map((lane) => {
                const laneCompetition = competitionByLaneId.get(lane.laneId);
                const joinPending = laneCompetition?.pendingJoinLaneIds?.includes(lane.laneId) ?? false;
                return (
                  <tr
                    key={lane.laneId}
                    className={`border-t border-vscode-border/80 transition-colors hover:bg-white/[0.025] ${
                      selectedLaneIds.has(lane.laneId)
                        ? 'bg-vscode-primary/[0.12]'
                        : laneCompetition?.competitionId === selectedCompetitionId
                          ? 'bg-vscode-primary/[0.05]'
                          : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Select ${lane.laneAlias || lane.laneId}`}
                        checked={selectedLaneIds.has(lane.laneId)}
                        onChange={() => toggleLane(lane.laneId)}
                        className="h-4 w-4 accent-vscode-primary"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-vscode-text">
                      {lane.firingPointNumber ?? '--'}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-vscode-text">{lane.laneAlias || 'Unnamed'}</td>
                    <td
                      className="max-w-36 truncate px-3 py-2.5 font-mono text-xs text-vscode-dimmed"
                      title={lane.laneId}
                    >
                      {lane.laneId}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs text-vscode-text-muted">
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            lane.hardware?.connection.status === 'connected' ? 'bg-vscode-success' : 'bg-vscode-dimmed'
                          }`}
                        />
                        {lane.hardware?.connection.status ?? 'unknown'}
                      </span>
                      {lane.hardware?.connection.manufacturer ? ` / ${lane.hardware.connection.manufacturer}` : ''}
                      {lane.hardware?.connection.deviceId ? ` / ${lane.hardware.connection.deviceId}` : ''}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`whitespace-nowrap text-xs font-bold ${
                          lane.safetyState?.status === 'STOPPED' ? 'text-red-400' : 'text-vscode-success'
                        }`}
                      >
                        {lane.safetyState?.status ?? 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-vscode-text-muted">
                      {clockQuality[lane.laneId] ? (
                        <button
                          type="button"
                          className="text-left hover:text-vscode-text"
                          title={clockQuality[lane.laneId]!.guidance}
                          disabled={busyAction !== null}
                          onClick={() => void probeLaneClock(lane.laneId)}
                        >
                          <span className="font-semibold">{clockQuality[lane.laneId]!.status}</span>{' '}
                          {formatClockMetric(clockQuality[lane.laneId]!.offsetMilliseconds)}
                        </button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!connected || busyAction !== null}
                          onClick={() => void probeLaneClock(lane.laneId)}
                        >
                          Probe
                        </Button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-vscode-text">{laneCompetition?.competitionTypeId ?? '--'}</td>
                    <td className="px-3 py-2.5 text-vscode-text">
                      <span className="whitespace-nowrap text-xs font-medium text-vscode-text-muted">
                        {(joinPending ? 'JOIN_PENDING' : (lane.competitionState?.phase ?? 'READY')).replaceAll(
                          '_',
                          ' ',
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-vscode-text">
                      {lane.assignment?.athlete
                        ? `${lane.assignment.athlete.startNumber} ${lane.assignment.athlete.name}`
                        : '--'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-vscode-text">
                      {lane.score ? (lane.score.totalScoreX10 / 10).toFixed(1) : '--'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {activeCompetition && (
        <div className="mt-4 border-t border-vscode-border pt-4">
          <h4 className="mb-3 text-[13px] font-semibold text-vscode-text">Manual athlete assignment</h4>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-vscode-text-muted">
              Target Lane
              <select
                value={assignmentLaneId}
                onChange={(event) => setAssignmentLaneId(event.target.value)}
                className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text"
              >
                {competitionLanes.map((lane) => (
                  <option key={lane.laneId} value={lane.laneId}>
                    {lane.laneAlias || lane.laneId.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-28 flex-col gap-1 text-xs font-medium text-vscode-text-muted">
              Start number
              <input
                type="number"
                min={1}
                value={athleteStartNumber}
                onChange={(event) => setAthleteStartNumber(event.target.value)}
                className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text"
              />
            </label>
            <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs font-medium text-vscode-text-muted">
              Athlete name
              <input
                value={athleteName}
                onChange={(event) => setAthleteName(event.target.value)}
                className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text"
              />
            </label>
            <Button
              size="sm"
              disabled={!assignmentLaneId || baseControlsDisabled || !assignmentEditingAllowed}
              onClick={() => void assignAthlete()}
            >
              Assign athlete
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!assignmentLaneId || baseControlsDisabled || !assignmentEditingAllowed}
              onClick={() => void unassignAthlete()}
            >
              Unassign
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!assignmentLaneId || baseControlsDisabled || activeCompetition.phase !== 'NOT_STARTED'}
              onClick={() => void resetLaneSession()}
            >
              Reset session
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
