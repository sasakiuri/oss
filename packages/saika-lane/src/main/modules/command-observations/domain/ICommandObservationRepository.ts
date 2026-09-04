// SPDX-License-Identifier: MIT
export interface CommandObservation {
  readonly id: string;
  readonly competitionId: string;
  readonly sequenceId: string;
  readonly command: 'UNLOAD';
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly officialName: string;
}

export interface ICommandObservationRepository {
  findById(id: string): CommandObservation | null;
  findBySequence(sequenceId: string): readonly CommandObservation[];
  append(observation: CommandObservation): void;
}
