// SPDX-License-Identifier: MIT
import type {
  MalfunctionFiringEvidencePayload,
  MalfunctionFiringRequestPayload,
} from '@sasakiuri/saika-protocol/MalfunctionFiring';

export interface FinalFiringIntent {
  readinessConfirmed: true;
  id: string;
  caseId: string;
  authorizationId: string;
  laneId: string;
  loadAt: string;
}
export interface FinalFiringRecord {
  intent: FinalFiringIntent;
  request: MalfunctionFiringRequestPayload;
  evidence: MalfunctionFiringEvidencePayload | null;
}
export interface IFinalFiringRepository {
  create(record: FinalFiringRecord): void;
  find(id: string): FinalFiringRecord | null;
  list(caseId: string): FinalFiringRecord[];
  appendEvidence(id: string, evidence: MalfunctionFiringEvidencePayload): void;
}
