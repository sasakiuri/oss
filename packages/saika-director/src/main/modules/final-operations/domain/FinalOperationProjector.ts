import type { RuleCommandScriptStep } from '@sasakiuri/saika-rules';

import type {
  FinalOperationBranch,
  FinalOperationEntry,
  FinalOperationRun,
  FinalOperationShootOffShot,
} from './IFinalOperationRepository';
import { shootOffUnitsFromMetadata, type FinalOperationShootOffUnit } from './FinalOperationShootOffUnit';
import { shootOffShotsPerLaneFromMetadata } from './FinalOperationShootOffFormat';

export type FinalOperationStepStatus =
  'PENDING' | 'AWAITING_CONFIRMATION' | 'AWAITING_EXECUTION' | 'COMPLETED' | 'SKIPPED';

export interface FinalOperationStepProjection {
  readonly step: RuleCommandScriptStep;
  readonly status: FinalOperationStepStatus;
  readonly confirmationEntryId: string | null;
  readonly eligibleLaneIds: readonly string[];
  readonly executionAttempts: readonly FinalOperationEntry[];
  readonly scheduledFor: string | null;
}

export interface FinalOperationShootOffProjection {
  readonly iteration: number;
  readonly checkpointStepId: string;
  readonly eligibleLaneIds: readonly string[];
  readonly units: readonly FinalOperationShootOffUnit[];
  readonly shotsPerLane: number;
  readonly status: 'ACTIVE' | 'AWAITING_RESOLUTION';
  readonly steps: readonly FinalOperationStepProjection[];
  readonly currentStep: FinalOperationStepProjection | null;
  readonly shots: readonly FinalOperationShootOffShot[];
}

export interface FinalOperationProjection {
  readonly run: FinalOperationRun;
  readonly status: 'ACTIVE' | 'COMPLETED' | 'ABORTED';
  readonly currentBranch: FinalOperationBranch;
  readonly steps: readonly FinalOperationStepProjection[];
  readonly currentStep: FinalOperationStepProjection | null;
  readonly shootOff: FinalOperationShootOffProjection | null;
  readonly entries: readonly FinalOperationEntry[];
  readonly shootOffShots: readonly FinalOperationShootOffShot[];
}

export function projectFinalOperation(
  run: FinalOperationRun,
  entries: readonly FinalOperationEntry[],
  shootOffShots: readonly FinalOperationShootOffShot[] = [],
): FinalOperationProjection {
  const orderedEntries = [...entries].sort(compareEntry);
  const orderedShots = [...shootOffShots].sort(compareShot);
  if (orderedEntries.some((entry) => entry.entryType === 'ABORTED')) {
    return {
      run,
      status: 'ABORTED',
      currentBranch: 'MAIN',
      steps: run.script.main.map((step) => pendingStep(run, step)),
      currentStep: null,
      shootOff: null,
      entries: orderedEntries,
      shootOffShots: orderedShots,
    };
  }

  const mainSteps = projectSteps(run, run.script.main, orderedEntries, 'MAIN', 0);
  const mainCurrent = findCurrent(mainSteps);
  const activeShootOffStart = findActiveShootOffStart(orderedEntries);
  if (activeShootOffStart) {
    const branchSteps = projectSteps(
      run,
      run.script.shootOff,
      orderedEntries,
      'SHOOT_OFF',
      activeShootOffStart.iteration,
      activeShootOffStart.eligibleLaneIds,
    );
    const branchCurrent = findCurrent(branchSteps);
    const shootOff: FinalOperationShootOffProjection = {
      iteration: activeShootOffStart.iteration,
      checkpointStepId: activeShootOffStart.stepId!,
      eligibleLaneIds: activeShootOffStart.eligibleLaneIds,
      units: shootOffUnitsFromMetadata(activeShootOffStart.eligibleLaneIds, activeShootOffStart.metadata),
      shotsPerLane: shootOffShotsPerLaneFromMetadata(activeShootOffStart.metadata, run.script.shootOff),
      status: branchCurrent ? 'ACTIVE' : 'AWAITING_RESOLUTION',
      steps: branchSteps,
      currentStep: branchCurrent,
      shots: orderedShots.filter((shot) => shot.iteration === activeShootOffStart.iteration),
    };
    return {
      run,
      status: 'ACTIVE',
      currentBranch: 'SHOOT_OFF',
      steps: mainSteps,
      currentStep: branchCurrent,
      shootOff,
      entries: orderedEntries,
      shootOffShots: orderedShots,
    };
  }

  return {
    run,
    status: mainCurrent ? 'ACTIVE' : 'COMPLETED',
    currentBranch: 'MAIN',
    steps: mainSteps,
    currentStep: mainCurrent,
    shootOff: null,
    entries: orderedEntries,
    shootOffShots: orderedShots,
  };
}

function projectSteps(
  run: FinalOperationRun,
  script: readonly RuleCommandScriptStep[],
  entries: readonly FinalOperationEntry[],
  branch: FinalOperationBranch,
  iteration: number,
  branchLaneIds: readonly string[] = [],
): FinalOperationStepProjection[] {
  let blocked = false;
  return script.map((step): FinalOperationStepProjection => {
    if (blocked) return pendingStep(run, step);
    const skipped = entries.find(
      (entry) =>
        entry.branch === branch &&
        entry.iteration === iteration &&
        entry.stepId === step.id &&
        entry.entryType === 'STEP_SKIPPED',
    );
    if (skipped) return { ...pendingStep(run, step), status: 'SKIPPED' };

    const confirmation = entries.find(
      (entry) =>
        entry.branch === branch &&
        entry.iteration === iteration &&
        entry.stepId === step.id &&
        entry.entryType === 'STEP_CONFIRMED',
    );
    if (!confirmation) {
      blocked = true;
      return {
        ...pendingStep(run, step),
        status: 'AWAITING_CONFIRMATION',
        eligibleLaneIds: branchLaneIds,
      };
    }

    const executionAttempts = entries.filter(
      (entry) => entry.entryType === 'EXECUTION_RESULT' && entry.confirmationEntryId === confirmation.id,
    );
    if (!executionAttempts.some((entry) => entry.executionStatus === 'DONE')) {
      blocked = true;
      return {
        ...pendingStep(run, step),
        status: 'AWAITING_EXECUTION',
        confirmationEntryId: confirmation.id,
        eligibleLaneIds: confirmation.eligibleLaneIds,
        executionAttempts,
      };
    }
    return {
      ...pendingStep(run, step),
      status: 'COMPLETED',
      confirmationEntryId: confirmation.id,
      eligibleLaneIds: confirmation.eligibleLaneIds,
      executionAttempts,
    };
  });
}

function findActiveShootOffStart(entries: readonly FinalOperationEntry[]): FinalOperationEntry | null {
  const starts = entries.filter((entry) => entry.entryType === 'SHOOT_OFF_STARTED');
  return (
    [...starts]
      .reverse()
      .find(
        (start) =>
          !entries.some(
            (entry) =>
              entry.entryType === 'SHOOT_OFF_ROUND_CLOSED' &&
              entry.branch === 'SHOOT_OFF' &&
              entry.iteration === start.iteration,
          ),
      ) ?? null
  );
}

function findCurrent(steps: readonly FinalOperationStepProjection[]): FinalOperationStepProjection | null {
  return steps.find((step) => step.status === 'AWAITING_CONFIRMATION' || step.status === 'AWAITING_EXECUTION') ?? null;
}

function pendingStep(run: FinalOperationRun, step: RuleCommandScriptStep): FinalOperationStepProjection {
  return {
    step,
    status: 'PENDING',
    confirmationEntryId: null,
    eligibleLaneIds: [],
    executionAttempts: [],
    scheduledFor: scheduledFor(run, step),
  };
}

function scheduledFor(run: FinalOperationRun, step: RuleCommandScriptStep): string | null {
  if (step.timing.mode !== 'SCHEDULED_START_OFFSET') return null;
  return new Date(new Date(run.scheduledStartAt).getTime() + step.timing.offsetSeconds * 1000).toISOString();
}

function compareEntry(left: FinalOperationEntry, right: FinalOperationEntry): number {
  return left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id);
}

function compareShot(left: FinalOperationShootOffShot, right: FinalOperationShootOffShot): number {
  return (
    left.iteration - right.iteration ||
    left.observedAt.localeCompare(right.observedAt) ||
    left.id.localeCompare(right.id)
  );
}
