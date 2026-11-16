// SPDX-License-Identifier: MIT
import type {
  DirectorLaneSnapshotDto,
  FinalOperationRunDto,
  FinalOperationScriptStepDto,
} from '@/shared/ipc/contracts';

import { laneLabel } from '../shared/lanes/laneLabels';

type StepProjection = FinalOperationRunDto['steps'][number];
type ShootOff = NonNullable<FinalOperationRunDto['shootOff']>;
type ShootOffShot = ShootOff['shots'][number];

/** Steps counted as done in the run summary. */
export function completedStepCount(run: FinalOperationRunDto): number {
  return run.steps.filter((step) => step.status === 'COMPLETED' || step.status === 'SKIPPED').length;
}

/** A timed-target step whose firing Lanes the official selects when confirming it. */
export function isOfficialSelectedTimedTarget(step: FinalOperationScriptStepDto): boolean {
  return step.effect.type === 'RUN_TIMED_TARGET' && step.effect.participantSelection === 'OFFICIAL_SELECTED';
}

/** The number of Lanes the official must select before confirming the step, when the step states one. */
export function requiredExecutionLaneCount(step: FinalOperationScriptStepDto): number | undefined {
  return step.effect.type === 'RUN_TIMED_TARGET' && step.effect.participantSelection === 'OFFICIAL_SELECTED'
    ? step.effect.requiredParticipantCount
    : undefined;
}

/** Checks and announcements without a Lane effect may be skipped with a reason before confirmation. */
export function canSkipStep(current: StepProjection): boolean {
  return (
    current.status === 'AWAITING_CONFIRMATION' &&
    current.step.effect.type === 'NONE' &&
    (current.step.kind === 'CHECK' || current.step.kind === 'ANNOUNCEMENT')
  );
}

/** An active run waiting at a main-branch checkpoint, where a shoot-off branch may start. */
export function isAtMainCheckpoint(run: FinalOperationRunDto): boolean {
  return (
    run.status === 'ACTIVE' &&
    run.currentBranch === 'MAIN' &&
    run.currentStep?.status === 'AWAITING_CONFIRMATION' &&
    run.currentStep.step.effect.type === 'CHECKPOINT'
  );
}

interface StepExecutionResult {
  readonly success: boolean;
  readonly command: { readonly lanes: readonly { readonly status: string }[] } | null;
}

/** DONE on success; TIMEOUT when every failed Lane timed out (or no Lane failed); ERROR otherwise. */
export function executionRecordStatus(result: StepExecutionResult): 'DONE' | 'TIMEOUT' | 'ERROR' {
  const failedLanes = result.command?.lanes.filter((lane) => lane.status !== 'done') ?? [];
  return result.success ? 'DONE' : failedLanes.every((lane) => lane.status === 'timeout') ? 'TIMEOUT' : 'ERROR';
}

export interface ShootOffUnitOption {
  unitId: string;
  label: string;
  laneIds: string[];
  issue?: string;
}

/**
 * One option per Lane for individual Finals. Mixed Team Lanes are grouped by team; a team without exactly two Lanes
 * and a Lane without a team carry an issue and cannot be selected.
 */
export function buildShootOffUnitOptions(
  lanes: readonly DirectorLaneSnapshotDto[],
  competitorUnit: 'INDIVIDUAL' | 'MIXED_TEAM',
): ShootOffUnitOption[] {
  if (competitorUnit === 'INDIVIDUAL') {
    return lanes.map((lane) => ({ unitId: lane.laneId, label: laneLabel(lane), laneIds: [lane.laneId] }));
  }

  const unitsByTeamId = new Map<string, ShootOffUnitOption>();
  const unassigned: ShootOffUnitOption[] = [];
  for (const lane of lanes) {
    const teamId = lane.assignment?.athlete?.teamId;
    if (!teamId) {
      unassigned.push({
        unitId: `UNASSIGNED:${lane.laneId}`,
        label: laneLabel(lane),
        laneIds: [lane.laneId],
        issue: 'Official Mixed Team ID is missing',
      });
      continue;
    }
    const existing = unitsByTeamId.get(teamId);
    if (existing) {
      existing.laneIds.push(lane.laneId);
      existing.label = lane.assignment?.athlete?.teamName ?? existing.label;
    } else {
      unitsByTeamId.set(teamId, {
        unitId: teamId,
        label: lane.assignment?.athlete?.teamName ?? teamId,
        laneIds: [lane.laneId],
      });
    }
  }

  return [
    ...[...unitsByTeamId.values()].map((unit) => ({
      ...unit,
      ...(unit.laneIds.length === 2
        ? {}
        : { issue: `Mixed Team must have exactly two active Lanes (${unit.laneIds.length} found)` }),
    })),
    ...unassigned,
  ];
}

export interface ShootOffUnitProgress {
  readonly lanes: ReadonlyArray<{ readonly laneId: string; readonly shots: readonly ShootOffShot[] }>;
  /** Every Lane of the unit has all its shots. */
  readonly complete: boolean;
  readonly totalX10: number;
}

/** The unit's shots in this round, per Lane, and their total. */
export function shootOffUnitProgress(shootOff: ShootOff, unit: ShootOff['units'][number]): ShootOffUnitProgress {
  const lanes = unit.laneIds.map((laneId) => ({
    laneId,
    shots: shootOff.shots.filter((candidate) => candidate.laneId === laneId),
  }));
  return {
    lanes,
    complete: lanes.every(({ shots }) => shots.length === shootOff.shotsPerLane),
    totalX10: lanes.reduce(
      (total, { shots }) => total + shots.reduce((laneTotal, shot) => laneTotal + shot.scoreX10, 0),
      0,
    ),
  };
}

/** Every eligible Lane has delivered all its shots for this round. */
export function isShootOffRoundComplete(shootOff: ShootOff): boolean {
  return shootOff.shots.length === shootOff.eligibleLaneIds.length * shootOff.shotsPerLane;
}
