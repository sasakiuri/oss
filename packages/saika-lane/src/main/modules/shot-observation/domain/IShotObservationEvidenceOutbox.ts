// SPDX-License-Identifier: MIT

import type { ShotObservationEvidence } from './ShotObservationEvidence';

/** Read/acknowledgement side of the durable evidence outbox. */
export interface IShotObservationEvidenceOutbox {
  findPending(limit?: number): Promise<readonly ShotObservationEvidence[]>;
  markPublished(evidenceId: string, publishedAt: Date): Promise<void>;
}
