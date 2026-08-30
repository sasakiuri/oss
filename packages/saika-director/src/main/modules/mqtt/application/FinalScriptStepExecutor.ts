// SPDX-License-Identifier: MIT
import type { FinalOperationScriptStepDto } from '@/shared/ipc/contracts';
import type { CompetitionCuePayload } from '@/shared/mqtt';

import type { CommandExecutionResult } from '../infra/DirectorMqttService';

export interface FinalScriptStepExecutionInput {
  readonly competitionId: string;
  readonly runId: string;
  readonly confirmationEntryId: string;
  readonly branch: 'MAIN' | 'SHOOT_OFF';
  readonly iteration: number;
  readonly step: FinalOperationScriptStepDto;
  readonly eligibleLaneIds: readonly string[];
  readonly acknowledgedRequirementIds: readonly string[];
}

export interface FinalScriptStepExecutionPort {
  publishCue(cue: CompetitionCuePayload): Promise<void>;
  openSighting(
    durationSeconds: number,
    acknowledgedRequirementIds: readonly string[],
  ): Promise<CommandExecutionResult | null>;
  closeSighting(): Promise<CommandExecutionResult | null>;
  openMatch(
    step: FinalOperationScriptStepDto,
    acknowledgedRequirementIds: readonly string[],
  ): Promise<CommandExecutionResult | null>;
  closeMatch(): Promise<CommandExecutionResult | null>;
  openShootOff(durationSeconds: number, eligibleLaneIds: readonly string[]): Promise<CommandExecutionResult | null>;
  closeShootOff(eligibleLaneIds: readonly string[]): Promise<CommandExecutionResult | null>;
}

export interface FinalScriptStepExecutionResult {
  readonly success: boolean;
  readonly cueId: string;
  readonly cuePublished: true;
  readonly command: CommandExecutionResult | null;
  readonly statement: string;
}

/** Maps an application-neutral Rule Pack step onto Director transport ports. */
export async function executeFinalScriptStep(
  input: FinalScriptStepExecutionInput,
  port: FinalScriptStepExecutionPort,
): Promise<FinalScriptStepExecutionResult> {
  // The confirmation is the idempotency boundary. Retries replace the same
  // retained cue instead of creating a second logical instruction.
  const cueId = input.confirmationEntryId;
  const purpose = 'purpose' in input.step.effect ? input.step.effect.purpose : undefined;
  const cue: CompetitionCuePayload = {
    schemaVersion: 1,
    competitionId: input.competitionId,
    runId: input.runId,
    cueId,
    confirmationEntryId: input.confirmationEntryId,
    branch: input.branch,
    iteration: input.iteration,
    stepId: input.step.id,
    actor: input.step.actor,
    kind: input.step.kind,
    text: input.step.text,
    ruleReference: input.step.ruleReference,
    effect: {
      type: input.step.effect.type,
      ...(purpose ? { purpose } : {}),
    },
    ...(input.eligibleLaneIds.length > 0 ? { targetLaneIds: [...new Set(input.eligibleLaneIds)] } : {}),
    publishedAt: new Date().toISOString(),
  };
  await port.publishCue(cue);

  const command = await executeEffect(input, port);
  const success = command?.success ?? true;
  return {
    success,
    cueId,
    cuePublished: true,
    command,
    statement: command
      ? `${input.step.text}: ${command.action} ${success ? 'completed' : 'did not complete on every Lane'}`
      : `${input.step.text}: cue published`,
  };
}

async function executeEffect(
  input: FinalScriptStepExecutionInput,
  port: FinalScriptStepExecutionPort,
): Promise<CommandExecutionResult | null> {
  const effect = input.step.effect;
  if (effect.type !== 'OPEN_FIRING' && effect.type !== 'CLOSE_FIRING') return null;

  if (effect.purpose === 'SIGHTING') {
    return effect.type === 'OPEN_FIRING'
      ? port.openSighting(effect.durationSeconds, input.acknowledgedRequirementIds)
      : port.closeSighting();
  }
  if (effect.purpose === 'MATCH') {
    return effect.type === 'OPEN_FIRING'
      ? port.openMatch(input.step, input.acknowledgedRequirementIds)
      : port.closeMatch();
  }
  if (input.eligibleLaneIds.length < 2) {
    throw new Error('A shoot-off step requires at least two eligible Lanes');
  }
  return effect.type === 'OPEN_FIRING'
    ? port.openShootOff(effect.durationSeconds, input.eligibleLaneIds)
    : port.closeShootOff(input.eligibleLaneIds);
}
