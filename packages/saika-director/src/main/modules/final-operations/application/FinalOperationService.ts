import { isDeepStrictEqual } from 'node:util';

import type { RulePackRegistry } from '@sasakiuri/saika-rules';

import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type {
  AbortFinalOperationRunPayload,
  CloseFinalOperationShootOffRoundPayload,
  ConfirmFinalOperationStepPayload,
  CreateFinalOperationRunPayload,
  FinalOperationRunDto,
  FinalOperationScriptStepDto,
  RecordFinalOperationExecutionPayload,
  SkipFinalOperationStepPayload,
  StartFinalOperationShootOffPayload,
} from '@/shared/ipc/contracts/finalOperations.contract';

import { projectFinalOperation, type FinalOperationProjection } from '../domain/FinalOperationProjector';
import { normalizeShootOffUnits } from '../domain/FinalOperationShootOffUnit';
import type {
  FinalOperationEntry,
  FinalOperationRun,
  FinalOperationShootOffShot,
  IFinalOperationRepository,
} from '../domain/IFinalOperationRepository';

export interface ObserveFinalShootOffShotInput {
  readonly runId: string;
  readonly competitionId: string;
  readonly iteration: number;
  readonly laneId: string;
  readonly shotId: string;
  readonly scoreX10: number;
  readonly x: number | null;
  readonly y: number | null;
  readonly firedAt: string;
  readonly observedAt?: string;
}

export interface FinalOperationExecutionAuthorizationInput {
  readonly competitionId: string;
  readonly runId: string;
  readonly confirmationEntryId: string;
  readonly branch: 'MAIN' | 'SHOOT_OFF';
  readonly iteration: number;
  readonly step: FinalOperationScriptStepDto;
  readonly eligibleLaneIds: readonly string[];
}

export class FinalOperationService {
  constructor(
    private readonly repository: IFinalOperationRepository,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly rulePacks: RulePackRegistry,
  ) {}

  getByCompetition(competitionId: string): FinalOperationRunDto | null {
    const run = this.repository.findLatestRunByCompetition(competitionId);
    return run ? toDto(this.project(run)) : null;
  }

  create(input: CreateFinalOperationRunPayload): FinalOperationRunDto {
    const previous = this.repository.findLatestRunByCompetition(input.competitionId);
    if (previous && this.project(previous).status === 'ACTIVE') {
      throw new Error(`Competition ${input.competitionId} already has an active Final run`);
    }
    const definition = this.competitionTypes.get(input.competitionTypeId);
    if (definition.config.name !== 'Final' || !definition.rulePackId) {
      throw new Error(`Competition type ${input.competitionTypeId} does not provide a versioned Final Rule Pack`);
    }
    const pack = this.rulePacks.getById(definition.rulePackId);
    const script = pack.capabilities.commands?.finalScript;
    if (!script) throw new Error(`Rule Pack ${pack.id} does not provide a Final command script`);

    const run: FinalOperationRun = {
      id: crypto.randomUUID(),
      competitionId: input.competitionId,
      eventId: input.eventId ?? null,
      competitionTypeId: input.competitionTypeId,
      rulePackId: pack.id,
      scriptVersion: script.version,
      script,
      scheduledStartAt: input.scheduledStartAt,
      createdBy: input.officialName.trim(),
      createdAt: new Date().toISOString(),
    };
    this.repository.insertRun(run);
    return toDto(this.project(run));
  }

  assertExecutionAuthorized(input: FinalOperationExecutionAuthorizationInput): void {
    const projection = this.requireActive(input.runId);
    if (projection.run.competitionId !== input.competitionId) {
      throw new Error(`Final run ${input.runId} does not belong to competition ${input.competitionId}`);
    }
    const current = projection.currentStep;
    if (
      !current ||
      current.status !== 'AWAITING_EXECUTION' ||
      current.confirmationEntryId !== input.confirmationEntryId
    ) {
      throw new Error(`Confirmation ${input.confirmationEntryId} is not the current executable Final step`);
    }
    const expectedIteration = projection.shootOff?.iteration ?? 0;
    if (projection.currentBranch !== input.branch || expectedIteration !== input.iteration) {
      throw new Error('Final execution branch or iteration does not match the confirmed step');
    }
    if (!isDeepStrictEqual(current.step, input.step)) {
      throw new Error(`Final execution step ${input.step.id} does not match the confirmed snapshot`);
    }
    if (!sameUniqueIds(current.eligibleLaneIds, input.eligibleLaneIds)) {
      throw new Error('Final execution target Lanes do not match the confirmed step');
    }
  }

  confirmStep(input: ConfirmFinalOperationStepPayload): FinalOperationRunDto {
    const projection = this.requireActive(input.runId);
    const current = projection.currentStep;
    if (!current || current.status !== 'AWAITING_CONFIRMATION' || current.step.id !== input.stepId) {
      throw new Error(`Step ${input.stepId} is not awaiting confirmation`);
    }
    const branch = projection.currentBranch;
    const iteration = projection.shootOff?.iteration ?? 0;
    const submittedLaneIds = [...new Set(input.eligibleLaneIds ?? [])];
    const participantSelection =
      'participantSelection' in current.step.effect ? current.step.effect.participantSelection : null;
    if (branch === 'MAIN' && submittedLaneIds.length > 0 && participantSelection !== 'TIED_ONLY') {
      throw new Error(`Non-targeted Final step ${input.stepId} cannot be restricted to selected Lanes`);
    }
    const eligibleLaneIds =
      branch === 'SHOOT_OFF' ? [...(projection.shootOff?.eligibleLaneIds ?? [])] : submittedLaneIds;
    if (current.step.effect.type !== 'NONE' && participantSelection === 'TIED_ONLY' && eligibleLaneIds.length < 2) {
      throw new Error('A tied-only Final step requires at least two eligible Lanes');
    }
    this.repository.appendEntry(
      stepEntry({
        runId: projection.run.id,
        entryType: 'STEP_CONFIRMED',
        branch,
        iteration,
        step: current.step,
        eligibleLaneIds,
        statement: input.statement?.trim() ?? '',
        officialName: input.officialName.trim(),
        recordedAt: input.recordedAt ?? new Date().toISOString(),
      }),
    );
    return toDto(this.project(projection.run));
  }

  recordExecution(input: RecordFinalOperationExecutionPayload): FinalOperationRunDto {
    const projection = this.requireActive(input.runId);
    const current = projection.currentStep;
    if (
      !current ||
      current.status !== 'AWAITING_EXECUTION' ||
      current.confirmationEntryId !== input.confirmationEntryId
    ) {
      throw new Error(`Confirmation ${input.confirmationEntryId} is not awaiting execution`);
    }
    this.repository.appendEntry({
      ...stepEntry({
        runId: projection.run.id,
        entryType: 'EXECUTION_RESULT',
        branch: projection.currentBranch,
        iteration: projection.shootOff?.iteration ?? 0,
        step: current.step,
        eligibleLaneIds: current.eligibleLaneIds,
        statement: input.statement.trim(),
        officialName: input.officialName.trim(),
        recordedAt: input.recordedAt ?? new Date().toISOString(),
      }),
      confirmationEntryId: input.confirmationEntryId,
      executionStatus: input.status,
      commandId: input.commandId ?? null,
    });
    return toDto(this.project(projection.run));
  }

  skipStep(input: SkipFinalOperationStepPayload): FinalOperationRunDto {
    const projection = this.requireActive(input.runId);
    const current = projection.currentStep;
    if (!current || current.status !== 'AWAITING_CONFIRMATION' || current.step.id !== input.stepId) {
      throw new Error(`Step ${input.stepId} is not awaiting confirmation`);
    }
    if (current.step.effect.type !== 'NONE' || !['CHECK', 'ANNOUNCEMENT'].includes(current.step.kind)) {
      throw new Error(`Operational command step ${input.stepId} cannot be skipped`);
    }
    this.repository.appendEntry(
      stepEntry({
        runId: projection.run.id,
        entryType: 'STEP_SKIPPED',
        branch: projection.currentBranch,
        iteration: projection.shootOff?.iteration ?? 0,
        step: current.step,
        eligibleLaneIds: projection.shootOff?.eligibleLaneIds ?? [],
        statement: input.reason.trim(),
        officialName: input.officialName.trim(),
        recordedAt: input.recordedAt ?? new Date().toISOString(),
      }),
    );
    return toDto(this.project(projection.run));
  }

  startShootOff(input: StartFinalOperationShootOffPayload): FinalOperationRunDto {
    const projection = this.requireActive(input.runId);
    const current = projection.currentStep;
    if (
      projection.currentBranch !== 'MAIN' ||
      !current ||
      current.status !== 'AWAITING_CONFIRMATION' ||
      current.step.id !== input.checkpointStepId ||
      current.step.effect.type !== 'CHECKPOINT'
    ) {
      throw new Error(`Checkpoint ${input.checkpointStepId} is not ready for a shoot-off`);
    }
    const eligibleLaneIds = [...new Set(input.eligibleLaneIds)];
    if (eligibleLaneIds.length < 2) throw new Error('A shoot-off requires at least two eligible Lanes');
    const competitionType = this.competitionTypes.get(projection.run.competitionTypeId);
    if (competitionType.teamFormat === 'MIXED_PAIR' && !input.units) {
      throw new Error('A Mixed Team shoot-off requires explicit two-Lane scoring units');
    }
    const units = normalizeShootOffUnits(
      eligibleLaneIds,
      input.units,
      competitionType.teamFormat === 'MIXED_PAIR' ? 2 : undefined,
    );
    const previousStarts = projection.entries.filter((entry) => entry.entryType === 'SHOOT_OFF_STARTED');
    const iteration = Math.max(0, ...previousStarts.map((entry) => entry.iteration)) + 1;
    this.repository.appendEntry({
      ...stepEntry({
        runId: projection.run.id,
        entryType: 'SHOOT_OFF_STARTED',
        branch: 'SHOOT_OFF',
        iteration,
        step: current.step,
        eligibleLaneIds,
        statement: input.reason.trim(),
        officialName: input.officialName.trim(),
        recordedAt: input.recordedAt ?? new Date().toISOString(),
      }),
      metadata: {
        checkpointStepId: current.step.id,
        units: units.map((unit) => ({ ...unit, laneIds: [...unit.laneIds] })),
      },
    });
    return toDto(this.project(projection.run));
  }

  observeShootOffShot(input: ObserveFinalShootOffShotInput): FinalOperationRunDto {
    const run = this.repository.findRunById(input.runId);
    if (!run) throw new Error(`Final run not found: ${input.runId}`);
    if (run.competitionId !== input.competitionId) {
      throw new Error(`Shoot-off shot competition does not match Final run ${input.runId}`);
    }
    const persistedShots = this.repository.findShootOffShotsByRun(input.runId);
    const replay = persistedShots.find((shot) => shot.shotId === input.shotId);
    if (replay) {
      if (replay.iteration !== input.iteration || replay.laneId !== input.laneId) {
        throw new Error(`Shoot-off shot ${input.shotId} was replayed with conflicting context`);
      }
      return toDto(projectFinalOperation(run, this.repository.findEntriesByRun(run.id), persistedShots));
    }
    const projection = this.requireActive(input.runId);
    const shootOff = projection.shootOff;
    if (!shootOff || shootOff.iteration !== input.iteration || !shootOff.eligibleLaneIds.includes(input.laneId)) {
      throw new Error(`Lane ${input.laneId} is not eligible for shoot-off round ${input.iteration}`);
    }
    const firingOpened = shootOff.steps.some(
      (step) =>
        step.status === 'COMPLETED' &&
        step.step.effect.type === 'OPEN_FIRING' &&
        step.step.effect.purpose === 'SHOOT_OFF',
    );
    if (!firingOpened) throw new Error(`Shoot-off round ${input.iteration} has not opened its firing window`);
    const existing = shootOff.shots.find((shot) => shot.laneId === input.laneId);
    if (existing?.shotId === input.shotId) return toDto(projection);
    if (existing) throw new Error(`Lane ${input.laneId} already has a shot in shoot-off round ${input.iteration}`);
    this.repository.appendShootOffShot({
      id: crypto.randomUUID(),
      runId: projection.run.id,
      iteration: input.iteration,
      laneId: input.laneId,
      shotId: input.shotId,
      scoreX10: input.scoreX10,
      x: input.x,
      y: input.y,
      firedAt: input.firedAt,
      observedAt: input.observedAt ?? new Date().toISOString(),
    });
    return toDto(this.project(projection.run));
  }

  closeShootOffRound(input: CloseFinalOperationShootOffRoundPayload): FinalOperationRunDto {
    const projection = this.requireActive(input.runId);
    const shootOff = projection.shootOff;
    if (!shootOff || shootOff.status !== 'AWAITING_RESOLUTION') {
      throw new Error('The active shoot-off round has not completed its command script');
    }
    const shotByLane = new Map(shootOff.shots.map((shot) => [shot.laneId, shot]));
    const missingLaneIds = shootOff.eligibleLaneIds.filter((laneId) => !shotByLane.has(laneId));
    if (missingLaneIds.length > 0) {
      throw new Error(`Shoot-off shots are missing for Lane(s): ${missingLaneIds.join(', ')}`);
    }
    const unitScores = shootOff.units.map((unit) => ({
      unitId: unit.unitId,
      label: unit.label,
      laneIds: [...unit.laneIds],
      scoreX10: unit.laneIds.reduce((total, laneId) => total + shotByLane.get(laneId)!.scoreX10, 0),
    }));
    const minimumScore = Math.min(...unitScores.map((unit) => unit.scoreX10));
    const lowestUnits = unitScores.filter((unit) => unit.scoreX10 === minimumScore);
    const eliminatedUnit = lowestUnits.length === 1 ? lowestUnits[0]! : null;
    const remainingTiedUnitIds = eliminatedUnit ? [] : lowestUnits.map((unit) => unit.unitId);
    const remainingTiedLaneIds = eliminatedUnit ? [] : lowestUnits.flatMap((unit) => unit.laneIds);
    const eliminatedLaneIds = eliminatedUnit ? [...eliminatedUnit.laneIds] : [];
    const eliminatedLaneId = eliminatedLaneIds.length === 1 ? eliminatedLaneIds[0]! : null;
    this.repository.appendEntry({
      ...stepEntry({
        runId: projection.run.id,
        entryType: 'SHOOT_OFF_ROUND_CLOSED',
        branch: 'SHOOT_OFF',
        iteration: shootOff.iteration,
        step: projection.steps.find((step) => step.step.id === shootOff.checkpointStepId)!.step,
        eligibleLaneIds: shootOff.eligibleLaneIds,
        statement: input.statement.trim(),
        officialName: input.officialName.trim(),
        recordedAt: input.recordedAt ?? new Date().toISOString(),
      }),
      metadata: {
        minimumScoreX10: minimumScore,
        eliminatedUnitId: eliminatedUnit?.unitId ?? null,
        eliminatedUnitLabel: eliminatedUnit?.label ?? null,
        eliminatedLaneIds,
        eliminatedLaneId,
        remainingTiedUnitIds,
        remainingTiedLaneIds: eliminatedLaneId ? [] : remainingTiedLaneIds,
        unitScores,
        shots: shootOff.shots.map((shot) => ({ laneId: shot.laneId, shotId: shot.shotId, scoreX10: shot.scoreX10 })),
      },
    });
    return toDto(this.project(projection.run));
  }

  abort(input: AbortFinalOperationRunPayload): FinalOperationRunDto {
    const projection = this.requireActive(input.runId);
    this.repository.appendEntry({
      id: crypto.randomUUID(),
      runId: projection.run.id,
      entryType: 'ABORTED',
      branch: projection.currentBranch,
      iteration: projection.shootOff?.iteration ?? 0,
      stepId: null,
      stepSnapshot: null,
      confirmationEntryId: null,
      executionStatus: null,
      commandId: null,
      eligibleLaneIds: [],
      statement: input.reason.trim(),
      officialName: input.officialName.trim(),
      recordedAt: input.recordedAt ?? new Date().toISOString(),
      metadata: null,
    });
    return toDto(this.project(projection.run));
  }

  private requireActive(runId: string): FinalOperationProjection {
    const run = this.repository.findRunById(runId);
    if (!run) throw new Error(`Final run not found: ${runId}`);
    const projection = this.project(run);
    if (projection.status !== 'ACTIVE') throw new Error(`Final run ${runId} is ${projection.status.toLowerCase()}`);
    return projection;
  }

  private project(run: FinalOperationRun): FinalOperationProjection {
    return projectFinalOperation(
      run,
      this.repository.findEntriesByRun(run.id),
      this.repository.findShootOffShotsByRun(run.id),
    );
  }
}

interface StepEntryInput {
  readonly runId: string;
  readonly entryType: FinalOperationEntry['entryType'];
  readonly branch: FinalOperationEntry['branch'];
  readonly iteration: number;
  readonly step: NonNullable<FinalOperationEntry['stepSnapshot']>;
  readonly eligibleLaneIds: readonly string[];
  readonly statement: string;
  readonly officialName: string;
  readonly recordedAt: string;
}

function stepEntry(input: StepEntryInput): FinalOperationEntry {
  return {
    id: crypto.randomUUID(),
    runId: input.runId,
    entryType: input.entryType,
    branch: input.branch,
    iteration: input.iteration,
    stepId: input.step.id,
    stepSnapshot: input.step,
    confirmationEntryId: null,
    executionStatus: null,
    commandId: null,
    eligibleLaneIds: [...input.eligibleLaneIds],
    statement: input.statement,
    officialName: input.officialName,
    recordedAt: input.recordedAt,
    metadata: null,
  };
}

function toDto(projection: FinalOperationProjection): FinalOperationRunDto {
  return {
    id: projection.run.id,
    competitionId: projection.run.competitionId,
    eventId: projection.run.eventId,
    competitionTypeId: projection.run.competitionTypeId,
    rulePackId: projection.run.rulePackId,
    scriptVersion: projection.run.scriptVersion,
    scheduledStartAt: projection.run.scheduledStartAt,
    createdBy: projection.run.createdBy,
    createdAt: projection.run.createdAt,
    status: projection.status,
    currentBranch: projection.currentBranch,
    currentStep: projection.currentStep ? toStepDto(projection.currentStep) : null,
    steps: projection.steps.map(toStepDto),
    shootOff: projection.shootOff
      ? {
          iteration: projection.shootOff.iteration,
          checkpointStepId: projection.shootOff.checkpointStepId,
          eligibleLaneIds: [...projection.shootOff.eligibleLaneIds],
          units: projection.shootOff.units.map((unit) => ({ ...unit, laneIds: [...unit.laneIds] })),
          status: projection.shootOff.status,
          steps: projection.shootOff.steps.map(toStepDto),
          currentStep: projection.shootOff.currentStep ? toStepDto(projection.shootOff.currentStep) : null,
          shots: projection.shootOff.shots.map(toShootOffShotDto),
        }
      : null,
    shootOffShots: projection.shootOffShots.map(toShootOffShotDto),
    entries: projection.entries.map((entry) => ({
      id: entry.id,
      entryType: entry.entryType,
      branch: entry.branch,
      iteration: entry.iteration,
      stepId: entry.stepId,
      confirmationEntryId: entry.confirmationEntryId,
      executionStatus: entry.executionStatus,
      commandId: entry.commandId,
      eligibleLaneIds: [...entry.eligibleLaneIds],
      statement: entry.statement,
      officialName: entry.officialName,
      recordedAt: entry.recordedAt,
      metadata: entry.metadata ? { ...entry.metadata } : null,
    })),
  };
}

function toStepDto(step: FinalOperationProjection['steps'][number]): FinalOperationRunDto['steps'][number] {
  return {
    step: step.step,
    status: step.status,
    confirmationEntryId: step.confirmationEntryId,
    eligibleLaneIds: [...step.eligibleLaneIds],
    executionAttempts: step.executionAttempts.map((entry) => ({
      id: entry.id,
      status: entry.executionStatus!,
      commandId: entry.commandId,
      statement: entry.statement,
      officialName: entry.officialName,
      recordedAt: entry.recordedAt,
    })),
    scheduledFor: step.scheduledFor,
  };
}

function toShootOffShotDto(shot: FinalOperationShootOffShot): FinalOperationRunDto['shootOffShots'][number] {
  return {
    id: shot.id,
    iteration: shot.iteration,
    laneId: shot.laneId,
    shotId: shot.shotId,
    scoreX10: shot.scoreX10,
    x: shot.x,
    y: shot.y,
    firedAt: shot.firedAt,
    observedAt: shot.observedAt,
  };
}

function sameUniqueIds(expected: readonly string[], actual: readonly string[]): boolean {
  const expectedIds = new Set(expected);
  const actualIds = new Set(actual);
  return (
    expectedIds.size === expected.length &&
    actualIds.size === actual.length &&
    expectedIds.size === actualIds.size &&
    [...expectedIds].every((id) => actualIds.has(id))
  );
}
