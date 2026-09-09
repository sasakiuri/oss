import type { RulePack, TimedTargetProgram } from '../RulePack';

import { validateNonNegativeInteger, validatePositiveInteger, validateText } from './primitives';

export function validateTimedTargetCapability(pack: RulePack): void {
  const capability = pack.capabilities.timedTarget;
  const stages = pack.capabilities.courseOfFire.stages;
  const hasReferences = stages.some(
    (stage) =>
      stage.sightingTimedTargetProgramId !== undefined ||
      stage.series.some((series) => series.timedTargetProgramId !== undefined),
  );
  if (!capability) {
    if (hasReferences) throw new Error('courseOfFire references a missing timedTarget capability');
    return;
  }
  if (capability.programs.length === 0) throw new Error('timedTarget.programs must not be empty');

  const programsById = new Map<string, TimedTargetProgram>();
  for (const program of capability.programs) {
    validateText(program.id, 'timedTarget.programs.id');
    validateText(program.label, `Timed target program ${program.id} label`);
    validateText(program.ruleReference, `Timed target program ${program.id} ruleReference`);
    if (programsById.has(program.id)) throw new Error('timedTarget.programs must have unique IDs');
    validatePositiveInteger(
      program.loadPreparationSeconds,
      `Timed target program ${program.id} loadPreparationSeconds`,
    );
    validatePositiveInteger(
      program.attentionDelayMilliseconds,
      `Timed target program ${program.id} attentionDelayMilliseconds`,
    );
    validateNonNegativeInteger(
      program.attentionToleranceMilliseconds,
      `Timed target program ${program.id} attentionToleranceMilliseconds`,
    );
    validateNonNegativeInteger(
      program.betweenExposuresMilliseconds,
      `Timed target program ${program.id} betweenExposuresMilliseconds`,
    );
    validatePositiveInteger(
      program.minimumPauseAfterSeconds,
      `Timed target program ${program.id} minimumPauseAfterSeconds`,
    );
    if (program.exposures.length === 0) throw new Error(`Timed target program ${program.id} requires an exposure`);
    if (program.unloadPause) {
      validatePositiveInteger(program.unloadPause.minimumSeconds, `Timed target program ${program.id} unload pause`);
      validateText(program.unloadPause.ruleReference, `Timed target program ${program.id} unload pause reference`);
    }
    for (const exposure of program.exposures) {
      validatePositiveInteger(
        exposure.nominalDurationMilliseconds,
        `Timed target program ${program.id} nominalDurationMilliseconds`,
      );
      validateNonNegativeInteger(
        exposure.signalExtensionMilliseconds,
        `Timed target program ${program.id} signalExtensionMilliseconds`,
      );
      validateNonNegativeInteger(
        exposure.recordingAfterTimeMilliseconds,
        `Timed target program ${program.id} recordingAfterTimeMilliseconds`,
      );
      validatePositiveInteger(exposure.maximumShots, `Timed target program ${program.id} maximumShots`);
    }
    programsById.set(program.id, program);
  }

  const referencedIds = new Set<string>();
  for (const stage of stages) {
    if (stage.sightingTimedTargetProgramId) {
      const program = programsById.get(stage.sightingTimedTargetProgramId);
      if (!program || program.purpose !== 'SIGHTING') {
        throw new Error(`Stage ${stage.id} references an unavailable SIGHTING timed target program`);
      }
      referencedIds.add(program.id);
    }
    for (const series of stage.series) {
      if (!series.timedTargetProgramId) continue;
      const program = programsById.get(series.timedTargetProgramId);
      if (!program || program.purpose !== 'MATCH' || stage.phase !== 'MATCH') {
        throw new Error(`Stage ${stage.id} references an unavailable MATCH timed target program`);
      }
      const programShots = program.exposures.reduce((sum, exposure) => sum + exposure.maximumShots, 0);
      if (programShots !== series.shots) {
        throw new Error(`Timed target program ${program.id} shot limit must match its course-of-fire series`);
      }
      referencedIds.add(program.id);
    }
  }
  for (const step of [
    ...(pack.capabilities.commands?.finalScript?.main ?? []),
    ...(pack.capabilities.commands?.finalScript?.shootOff ?? []),
  ]) {
    if (step.effect.type === 'RUN_TIMED_TARGET') referencedIds.add(step.effect.programId);
  }
  for (const id of programsById.keys()) {
    if (!referencedIds.has(id)) {
      throw new Error(`Timed target program ${id} is not referenced by the course of fire or Final command script`);
    }
  }

  const recovery = capability.recovery;
  if (recovery.procedure === 'QUALIFICATION') {
    if (pack.round !== 'QUALIFICATION') {
      throw new Error('Qualification timed-target recovery requires a Qualification Rule Pack');
    }
    validatePositiveInteger(
      recovery.interruption.extraSightingWhenLongerThanSeconds,
      'timedTarget.recovery.interruption.extraSightingWhenLongerThanSeconds',
    );
    validatePositiveInteger(
      recovery.interruption.extraSightingSeriesShots,
      'timedTarget.recovery.interruption.extraSightingSeriesShots',
    );
    validateText(
      recovery.interruption.extraSightingRuleReference,
      'timedTarget.recovery.interruption.extraSightingRuleReference',
    );
    if (recovery.interruption.stages.length === 0) {
      throw new Error('Qualification timed-target recovery requires a stage rule');
    }
    const recoveryStageIds = new Set<string>();
    for (const stageRule of recovery.interruption.stages) {
      validateText(stageRule.stageId, 'timedTarget.recovery.interruption.stageId');
      validateText(stageRule.ruleReference, `Timed-target recovery stage ${stageRule.stageId} ruleReference`);
      if (recoveryStageIds.has(stageRule.stageId)) {
        throw new Error('Qualification timed-target recovery stage IDs must be unique');
      }
      recoveryStageIds.add(stageRule.stageId);
      const stage = stages.find((candidate) => candidate.id === stageRule.stageId);
      if (!stage || stage.phase !== 'MATCH' || !stage.series.some((series) => series.timedTargetProgramId)) {
        throw new Error(`Timed-target recovery stage ${stageRule.stageId} must reference a timed MATCH stage`);
      }
      if (stageRule.seriesRecovery.treatment === 'COMPLETE_REMAINING_SHOTS') {
        const completion = stageRule.seriesRecovery.completion;
        if (completion.mode === 'SECONDS_PER_SHOT') {
          validatePositiveInteger(
            completion.secondsPerShot,
            `Timed-target recovery stage ${stageRule.stageId} secondsPerShot`,
          );
        }
      }
    }
    const missingRecoveryStage = stages.find(
      (stage) =>
        stage.phase === 'MATCH' &&
        stage.series.some((series) => series.timedTargetProgramId) &&
        !recoveryStageIds.has(stage.id),
    );
    if (missingRecoveryStage) {
      throw new Error(`Timed MATCH stage ${missingRecoveryStage.id} requires a Qualification recovery rule`);
    }
    if (recovery.missingShotComplaints) {
      const ids = new Set<string>();
      for (const procedure of recovery.missingShotComplaints) {
        if (ids.has(procedure.stageId) || !recoveryStageIds.has(procedure.stageId))
          throw new Error('Missing-shot complaint procedures require unique timed MATCH stage IDs');
        ids.add(procedure.stageId);
        if (
          !['BEFORE_NEXT_SHOT', 'AFTER_SERIES'].includes(procedure.notification) ||
          procedure.seriesRepeatAllowed !== false
        )
          throw new Error('Invalid missing-shot notification or repeat policy');
        validateText(procedure.ruleReference, 'missingShotComplaints.ruleReference');
      }
    }
    if (recovery.targetFailure) {
      const failure = recovery.targetFailure;
      validatePositiveInteger(failure.extraSightingSeriesShots, 'targetFailure.extraSightingSeriesShots');
      validatePositiveInteger(
        failure.minimumPauseAfterSightingSeconds,
        'targetFailure.minimumPauseAfterSightingSeconds',
      );
      if (failure.ruleReferences.length === 0) throw new Error('Target failure rule references are required');
      failure.ruleReferences.forEach((reference) => validateText(reference, 'targetFailure.ruleReference'));
      const ids = failure.stages.map((stage) => stage.stageId);
      if (
        new Set(ids).size !== ids.length ||
        ids.length !== recoveryStageIds.size ||
        ids.some((id) => !recoveryStageIds.has(id))
      ) {
        throw new Error('Target failure stages must match the timed MATCH stages');
      }
      for (const stage of failure.stages) {
        validateText(stage.ruleReference, 'targetFailure.stage.ruleReference');
        if (
          stage.seriesRecovery.treatment === 'COMPLETE_REMAINING_SHOTS' &&
          stage.seriesRecovery.completion.mode === 'SECONDS_PER_SHOT'
        ) {
          validatePositiveInteger(stage.seriesRecovery.completion.secondsPerShot, 'targetFailure.secondsPerShot');
        }
      }
    }
  } else {
    validatePositiveInteger(recovery.remedyReadySeconds, 'timedTarget.recovery.remedyReadySeconds');
    if (recovery.nonAllowableMalfunctionPenaltyHits !== undefined) {
      validatePositiveInteger(
        recovery.nonAllowableMalfunctionPenaltyHits,
        'timedTarget.recovery.nonAllowableMalfunctionPenaltyHits',
      );
    }
  }
  if (recovery.procedure === 'FINAL') {
    validatePositiveInteger(recovery.malfunctionClaims.maximum, 'timedTarget.recovery.malfunctionClaims.maximum');
  }
  if (recovery.ruleReferences.length === 0) throw new Error('timedTarget.recovery.ruleReferences must not be empty');
  recovery.ruleReferences.forEach((reference) => validateText(reference, 'timedTarget.recovery.ruleReferences'));
}
