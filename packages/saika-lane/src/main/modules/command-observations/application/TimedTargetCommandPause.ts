// SPDX-License-Identifier: MIT
import type {
  CommandPauseAssessment,
  CommandPauseMode,
  ITimedTargetCommandPause,
  UnloadObservationInput,
} from '@/main/modules/timed-target/domain/ITimedTargetCommandPause';
import type { TimedTargetSequenceRecord } from '@/main/modules/timed-target/domain/ITimedTargetSequenceRepository';

import type { ICommandObservationRepository } from '../domain/ICommandObservationRepository';

export class TimedTargetCommandPause implements ITimedTargetCommandPause {
  constructor(
    private readonly repository: ICommandObservationRepository,
    private readonly mode: CommandPauseMode,
  ) {}

  assess(record: TimedTargetSequenceRecord, at: Date): CommandPauseAssessment | undefined {
    const policy = record.schedule.unloadPause;
    if (!policy) return undefined;
    // Later confirmations may extend a pause, but must never shorten it.
    const observation = [...this.repository.findBySequence(record.schedule.sequenceId)].sort(
      (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
    )[0];
    const allowedAt = observation ? Date.parse(observation.occurredAt) + policy.minimumSeconds * 1_000 : null;
    return {
      mode: this.mode,
      ruleReference: policy.ruleReference,
      minimumSeconds: policy.minimumSeconds,
      unloadAt: observation?.occurredAt ?? null,
      officialName: observation?.officialName ?? null,
      nextLoadAllowedAt: allowedAt === null ? null : new Date(allowedAt).toISOString(),
      blocked: this.mode === 'REQUIRED' && (allowedAt === null || at.getTime() < allowedAt),
    };
  }

  recordUnload(record: TimedTargetSequenceRecord, input: UnloadObservationInput, now: Date): void {
    if (input.sequenceId !== record.schedule.sequenceId) throw new Error('UNLOAD sequence does not match');
    if (!record.schedule.unloadPause) throw new Error('This program has no UNLOAD pause policy');
    if (!record.terminalStatus || !record.terminalAt) throw new Error('Complete or cancel the series before UNLOAD');
    const officialName = input.officialName.trim();
    if (!officialName || officialName.length > 200) throw new Error('UNLOAD official name is required (max 200)');
    if (!input.observationId.trim()) throw new Error('UNLOAD observation ID is required');
    if (
      !Number.isFinite(input.occurredAt.getTime()) ||
      input.occurredAt.getTime() < record.terminalAt.getTime() ||
      input.occurredAt.getTime() > now.getTime() + 5_000
    )
      throw new Error('UNLOAD must be after series completion and no more than five seconds ahead of the Lane clock');
    const existing = this.repository.findById(input.observationId);
    if (existing) {
      if (
        existing.sequenceId !== input.sequenceId ||
        existing.officialName !== officialName ||
        existing.occurredAt !== input.occurredAt.toISOString()
      )
        throw new Error('UNLOAD observation ID is already bound to different evidence');
      return;
    }
    this.repository.append({
      id: input.observationId,
      sequenceId: input.sequenceId,
      competitionId: record.schedule.competitionId,
      command: 'UNLOAD',
      occurredAt: input.occurredAt.toISOString(),
      recordedAt: now.toISOString(),
      officialName,
    });
  }
}

export function commandPauseModeFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): CommandPauseMode {
  const mode = environment.SAIKA_COMMAND_PAUSE_ENFORCEMENT ?? 'ADVISORY';
  if (mode !== 'DISABLED' && mode !== 'ADVISORY' && mode !== 'REQUIRED') {
    throw new Error('SAIKA_COMMAND_PAUSE_ENFORCEMENT must be DISABLED, ADVISORY or REQUIRED');
  }
  return mode;
}
