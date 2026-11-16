import type {
  DirectorLaneSnapshotDto,
  FinalOperationRunDto,
  FinalOperationScriptStepDto,
} from '@/shared/ipc/contracts';
import type { FinalScriptStepExecutionResultDto } from '@/shared/ipc/contracts/mqtt.contract';
import { ok } from '../../../../../helpers/renderer/serviceResponses';

export const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
export const RUN_ID = '44444444-4444-4444-8444-444444444444';
export const EVENT_ID = '55555555-5555-4555-8555-555555555555';
export const CONFIRMATION_ID = '66666666-6666-4666-8666-666666666666';
export const COMMAND_ID = '77777777-7777-4777-8777-777777777777';
export const CUE_ID = '88888888-8888-4888-8888-888888888888';
export const LANE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const LANE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const LANE_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const LANE_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const LANE_E = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
export const LANE_F = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

export type StepProjection = FinalOperationRunDto['steps'][number];
type ShootOff = NonNullable<FinalOperationRunDto['shootOff']>;
type RunEntry = FinalOperationRunDto['entries'][number];

export function scriptStep(overrides: Partial<FinalOperationScriptStepDto> = {}): FinalOperationScriptStepDto {
  return {
    id: 'step-1',
    actor: 'CRO',
    kind: 'COMMAND',
    text: 'LOAD',
    ruleReference: '6.17.1',
    timing: { mode: 'MANUAL' },
    effect: { type: 'NONE' },
    ...overrides,
  };
}

export function stepProjection(
  step: FinalOperationScriptStepDto,
  overrides: Partial<StepProjection> = {},
): StepProjection {
  return {
    step,
    status: 'AWAITING_CONFIRMATION',
    confirmationEntryId: null,
    eligibleLaneIds: [],
    executionAttempts: [],
    scheduledFor: null,
    ...overrides,
  };
}

export function executionAttempt(status: 'DONE' | 'ERROR' | 'TIMEOUT'): StepProjection['executionAttempts'][number] {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    status,
    commandId: null,
    statement: `Lane ${status.toLowerCase()}`,
    officialName: 'Jury Chair',
    recordedAt: '2026-11-16T01:05:00.000Z',
  };
}

export function finalRun(
  currentStep: StepProjection | null,
  overrides: Partial<FinalOperationRunDto> = {},
): FinalOperationRunDto {
  return {
    id: RUN_ID,
    competitionId: COMPETITION_ID,
    eventId: null,
    competitionTypeId: 'AR60_FINAL',
    rulePackId: 'ISSF:2026:AR60:FINAL',
    scriptVersion: '1',
    scriptSource: null,
    scheduledStartAt: '2026-11-16T01:00:00.000Z',
    createdBy: 'Jury Chair',
    createdAt: '2026-11-16T00:50:00.000Z',
    status: 'ACTIVE',
    currentBranch: 'MAIN',
    currentStep,
    steps: currentStep ? [currentStep] : [],
    shootOff: null,
    shootOffShots: [],
    entries: [],
    ...overrides,
  };
}

export function shootOff(overrides: Partial<ShootOff> = {}): ShootOff {
  return {
    iteration: 1,
    checkpointStepId: 'checkpoint-10',
    eligibleLaneIds: [LANE_A, LANE_B],
    units: [
      { unitId: LANE_A, label: 'FP 1 · Athlete A', laneIds: [LANE_A] },
      { unitId: LANE_B, label: 'FP 2 · Athlete B', laneIds: [LANE_B] },
    ],
    shotsPerLane: 1,
    status: 'ACTIVE',
    steps: [],
    currentStep: null,
    shots: [],
    ...overrides,
  };
}

export function shootOffShot(laneId: string, scoreX10: number, index: number): ShootOff['shots'][number] {
  return {
    id: `0000000${index}-0000-4000-8000-000000000000`,
    iteration: 1,
    laneId,
    shotId: `0000000${index}-1111-4111-8111-111111111111`,
    scoreX10,
    sourceScoreX10: scoreX10,
    x: null,
    y: null,
    firedAt: '2026-11-16T01:30:00.000Z',
    observedAt: '2026-11-16T01:30:01.000Z',
  };
}

export function roundClosedEntry(metadata: Record<string, unknown> | null, index = 1): RunEntry {
  return {
    id: `1000000${index}-2222-4222-8222-222222222222`,
    entryType: 'SHOOT_OFF_ROUND_CLOSED',
    branch: 'SHOOT_OFF',
    iteration: index,
    stepId: null,
    confirmationEntryId: null,
    executionStatus: null,
    commandId: null,
    eligibleLaneIds: [],
    statement: 'Round closed',
    officialName: 'Jury Chair',
    recordedAt: '2026-11-16T01:40:00.000Z',
    metadata,
  };
}

interface LaneAthlete {
  readonly name: string;
  readonly startNumber?: number;
  readonly teamId?: string;
  readonly teamName?: string;
}

export function laneSnapshot(
  laneId: string,
  firingPointNumber: number | null,
  athlete?: LaneAthlete,
  options: { readonly alias?: string; readonly finished?: boolean } = {},
): DirectorLaneSnapshotDto {
  return {
    laneId,
    laneAlias: options.alias ?? '',
    firingPointNumber,
    hardware: null,
    competitionState: options.finished
      ? ({ phase: 'FINISHED' } as unknown as DirectorLaneSnapshotDto['competitionState'])
      : null,
    assignment: athlete
      ? {
          competitionId: COMPETITION_ID,
          laneId,
          athlete: { id: `athlete-${laneId.slice(0, 4)}`, ...athlete } as NonNullable<
            NonNullable<DirectorLaneSnapshotDto['assignment']>['athlete']
          >,
          assignedAt: null,
          publishedAt: '2026-11-16T00:00:00.000Z',
        }
      : null,
    score: null,
    lastRawShot: null,
    lastCompetitionShot: null,
    lastSeenAt: '2026-11-16T01:00:00.000Z',
  };
}

export function executed(overrides: Partial<FinalScriptStepExecutionResultDto> = {}) {
  return ok<FinalScriptStepExecutionResultDto>({
    success: true,
    cueId: CUE_ID,
    cuePublished: true,
    command: {
      commandId: COMMAND_ID,
      action: 'start-match',
      success: true,
      lanes: [{ laneId: LANE_A, status: 'done' }],
    },
    declarationId: null,
    statement: 'Lane cue published',
    ...overrides,
  });
}
