import type { FinalCommandScriptCapability, RuleCommandScriptStep, RulePack } from '../RulePack';

import { validatePositiveInteger, validateText } from './primitives';

export function validateCommands(pack: RulePack): void {
  const commands = pack.capabilities.commands;
  if (commands) {
    validatePositiveInteger(commands.preparationAndSightingSeconds, 'commands.preparationAndSightingSeconds');
    if (commands.athleteCallToLineLeadSeconds !== undefined) {
      validatePositiveInteger(commands.athleteCallToLineLeadSeconds, 'commands.athleteCallToLineLeadSeconds');
    }
    if (commands.sightingTargetVisibilityLeadSeconds !== undefined) {
      validatePositiveInteger(
        commands.sightingTargetVisibilityLeadSeconds,
        'commands.sightingTargetVisibilityLeadSeconds',
      );
    }
    if (commands.setupPeriodSeconds !== undefined) {
      validatePositiveInteger(commands.setupPeriodSeconds, 'commands.setupPeriodSeconds');
    }
    if (commands.resetPauseSeconds !== undefined) {
      validatePositiveInteger(commands.resetPauseSeconds, 'commands.resetPauseSeconds');
    }
    validateWarnings(
      commands.preparationWarningsAtRemainingSeconds,
      commands.preparationAndSightingSeconds,
      'commands.preparationWarningsAtRemainingSeconds',
    );
    validateWarnings(commands.matchWarningsAtRemainingSeconds, undefined, 'commands.matchWarningsAtRemainingSeconds');
    if (commands.finalScript) validateFinalCommandScript(pack, commands.finalScript);
  }
}

function validateFinalCommandScript(pack: RulePack, script: FinalCommandScriptCapability): void {
  if (pack.round !== 'FINAL') throw new Error('commands.finalScript is only valid for Finals');
  validateText(script.version, 'commands.finalScript.version');
  if (script.source) {
    validateText(script.source.organization, 'commands.finalScript.source.organization');
    validateText(script.source.title, 'commands.finalScript.source.title');
    validateText(script.source.version, 'commands.finalScript.source.version');
  }
  if (script.main.length === 0) throw new Error('commands.finalScript.main must not be empty');
  if (script.shootOff.length === 0) throw new Error('commands.finalScript.shootOff must not be empty');

  const ids = new Set<string>();
  for (const [branch, steps] of [
    ['main', script.main],
    ['shootOff', script.shootOff],
  ] as const) {
    for (const step of steps) {
      validateText(step.id, `commands.finalScript.${branch}.id`);
      validateText(step.text, `commands.finalScript step ${step.id} text`);
      validateText(step.ruleReference, `commands.finalScript step ${step.id} ruleReference`);
      if (ids.has(step.id)) throw new Error('commands.finalScript steps must have unique IDs');
      ids.add(step.id);
      validateCommandStepTiming(step);
      validateCommandEffect(pack, step);
    }
  }
}

function validateCommandStepTiming(step: RuleCommandScriptStep): void {
  const timing = step.timing;
  if (timing.mode === 'SCHEDULED_START_OFFSET') {
    if (!Number.isInteger(timing.offsetSeconds)) {
      throw new Error(`Command step ${step.id} scheduled offset must be an integer`);
    }
    return;
  }
  if (timing.mode === 'AFTER_PREVIOUS') {
    if (!Number.isInteger(timing.delaySeconds) || timing.delaySeconds < 0) {
      throw new Error(`Command step ${step.id} delay must be a non-negative integer`);
    }
    return;
  }
  if (timing.mode === 'TIME_OR_ALL_SHOTS') {
    validatePositiveInteger(timing.durationSeconds, `Command step ${step.id} durationSeconds`);
    validatePositiveInteger(timing.shotsPerParticipant, `Command step ${step.id} shotsPerParticipant`);
  }
}

function validateCommandEffect(pack: RulePack, step: RuleCommandScriptStep): void {
  const effect = step.effect;
  if (effect.type === 'NONE' || effect.type === 'DECLARE_RESULTS' || effect.type === 'CHECKPOINT') {
    if (effect.type === 'CHECKPOINT' && effect.afterMatchShot !== undefined) {
      validatePositiveInteger(effect.afterMatchShot, `Command step ${step.id} afterMatchShot`);
      if (effect.afterMatchShot > pack.capabilities.ranking.totalShots) {
        throw new Error(`Command step ${step.id} checkpoint exceeds the course of fire`);
      }
    }
    return;
  }

  const target = effect.target;
  const targetsCourseSeries =
    effect.purpose === 'MATCH' || (effect.type === 'RUN_TIMED_TARGET' && effect.purpose === 'SIGHTING');
  if (targetsCourseSeries) {
    if (!target) throw new Error(`Command step ${step.id} MATCH effect requires a series target`);
    const stage = pack.capabilities.courseOfFire.stages[target.stageIndex];
    if (!stage || stage.id !== target.stageId || stage.phase !== 'MATCH' || !stage.series[target.seriesIndex]) {
      throw new Error(`Command step ${step.id} targets an unavailable MATCH series`);
    }
    const seriesCount = target.seriesCount ?? 1;
    validatePositiveInteger(seriesCount, `Command step ${step.id} target seriesCount`);
    const seriesRange = stage.series.slice(target.seriesIndex, target.seriesIndex + seriesCount);
    if (seriesRange.length !== seriesCount) {
      throw new Error(`Command step ${step.id} targets an unavailable MATCH series range`);
    }
    if (effect.type === 'OPEN_FIRING' || effect.type === 'RUN_TIMED_TARGET') {
      const expectedShots = seriesRange.reduce((sum, series) => sum + series.shots, 0);
      if (effect.shotsPerParticipant !== expectedShots) {
        throw new Error(`Command step ${step.id} shots must match its course-of-fire series`);
      }
      if (effect.type === 'OPEN_FIRING' && effect.durationSeconds !== stage.timer.durationSeconds) {
        throw new Error(`Command step ${step.id} duration must match its course-of-fire timer`);
      }
    }
  } else if (target) {
    throw new Error(`Command step ${step.id} ${effect.purpose} effect must not target a MATCH series`);
  }

  if (effect.type === 'OPEN_FIRING') {
    validatePositiveInteger(effect.durationSeconds, `Command step ${step.id} effect durationSeconds`);
    if (effect.purpose === 'SHOOT_OFF' && effect.shotsPerParticipant === undefined) {
      throw new Error(`Command step ${step.id} SHOOT_OFF effect requires shotsPerParticipant`);
    }
    if (effect.shotsPerParticipant !== undefined) {
      validatePositiveInteger(effect.shotsPerParticipant, `Command step ${step.id} effect shotsPerParticipant`);
    }
    return;
  }

  if (effect.type === 'RUN_TIMED_TARGET') {
    validateText(effect.programId, `Command step ${step.id} programId`);
    validatePositiveInteger(effect.shotsPerParticipant, `Command step ${step.id} effect shotsPerParticipant`);
    if (effect.participantSelection === 'OFFICIAL_SELECTED') {
      if (effect.requiredParticipantCount === undefined) {
        throw new Error(`Command step ${step.id} OFFICIAL_SELECTED effect requires requiredParticipantCount`);
      }
      validatePositiveInteger(
        effect.requiredParticipantCount,
        `Command step ${step.id} effect requiredParticipantCount`,
      );
    } else if (effect.requiredParticipantCount !== undefined) {
      throw new Error(`Command step ${step.id} requiredParticipantCount requires OFFICIAL_SELECTED`);
    }

    const program = pack.capabilities.timedTarget?.programs.find((candidate) => candidate.id === effect.programId);
    if (!program || program.purpose !== effect.purpose) {
      throw new Error(`Command step ${step.id} references an unavailable ${effect.purpose} timed target program`);
    }
    const programShots = program.exposures.reduce((sum, exposure) => sum + exposure.maximumShots, 0);
    if (programShots !== effect.shotsPerParticipant) {
      throw new Error(`Command step ${step.id} shot count must match timed target program ${program.id}`);
    }
    if (effect.purpose === 'SHOOT_OFF') {
      if (effect.participantSelection !== 'TIED_ONLY') {
        throw new Error(`Command step ${step.id} timed SHOOT_OFF must select tied participants only`);
      }
      if (effect.participantExecution !== 'SIMULTANEOUS' && effect.participantExecution !== 'SEQUENTIAL') {
        throw new Error(`Command step ${step.id} timed SHOOT_OFF requires a participant execution mode`);
      }
      if (effect.participantExecution === 'SEQUENTIAL') {
        if (effect.participantOrder !== 'FINAL_START_NUMBER_ASCENDING') {
          throw new Error(`Command step ${step.id} sequential SHOOT_OFF requires a participant order`);
        }
      } else if (effect.participantOrder !== undefined) {
        throw new Error(`Command step ${step.id} simultaneous SHOOT_OFF must not define a participant order`);
      }
      return;
    }
    if (effect.participantExecution !== undefined || effect.participantOrder !== undefined) {
      throw new Error(`Command step ${step.id} participant execution metadata is only valid for a SHOOT_OFF`);
    }
    if (effect.purpose === 'SIGHTING') {
      const stage = pack.capabilities.courseOfFire.stages[target!.stageIndex]!;
      if (stage.sightingTimedTargetProgramId !== program.id) {
        throw new Error(`Command step ${step.id} SIGHTING program does not match its target stage`);
      }
    } else if (effect.purpose === 'MATCH') {
      const stage = pack.capabilities.courseOfFire.stages[target!.stageIndex]!;
      const seriesCount = target!.seriesCount ?? 1;
      const mismatched = stage.series
        .slice(target!.seriesIndex, target!.seriesIndex + seriesCount)
        .some((series) => series.timedTargetProgramId !== program.id);
      if (mismatched) throw new Error(`Command step ${step.id} MATCH program does not match its target series`);
    }
  }
}

function validateWarnings(values: readonly number[], upperBound: number | undefined, name: string): void {
  const unique = new Set<number>();
  for (const value of values) {
    validatePositiveInteger(value, name);
    if (upperBound !== undefined && value >= upperBound) {
      throw new Error(`${name} must occur before the timer starts`);
    }
    if (unique.has(value)) throw new Error(`${name} must not contain duplicates`);
    unique.add(value);
  }
}
