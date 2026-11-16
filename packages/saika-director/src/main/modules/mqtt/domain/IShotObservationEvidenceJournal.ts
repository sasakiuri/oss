import type { ShotObservationEvidencePayload } from '@sasakiuri/saika-protocol/Shots';

export interface ShotObservationEvidenceRecord {
  readonly evidence: ShotObservationEvidencePayload;
  readonly observedAt: Date;
  readonly payloadJson: string;
}

/** Independent append-only journal for accepted and unscored target observations. */
export interface IShotObservationEvidenceJournal {
  append(record: ShotObservationEvidenceRecord): void;
  findByCompetition(competitionId: string): ShotObservationEvidenceRecord[];
}
