// SPDX-License-Identifier: MIT

import type { ShotObservation, ShotObservationOutcome } from './ShotObservation';
import type { ShotObservationEvidence } from './ShotObservationEvidence';

/** Port for the independent, append-only target observation journal. */
export interface IShotObservationRepository {
  append(observation: ShotObservation): Promise<void>;
  appendOutcome(outcome: ShotObservationOutcome): Promise<void>;
  /** Atomically appends the routing outcome and its outbound evidence. */
  appendOutcomeWithEvidence(outcome: ShotObservationOutcome, evidence: ShotObservationEvidence): Promise<void>;
  findById(id: string): Promise<ShotObservation | null>;
  findOutcomes(observationId: string): Promise<readonly ShotObservationOutcome[]>;
}
