import { canonicalJson } from '@sasakiuri/saika-rules';

import {
  MalfunctionFiringEvidenceSchema,
  type MalfunctionFiringEvidencePayload,
} from '@sasakiuri/saika-protocol/MalfunctionFiring';

import type { FinalFiringIntent, FinalFiringRecord, IFinalFiringRepository } from '../domain/IFinalFiringRepository';
import type { FinalFiringTransportInput, IFinalFiringAuthorizationSource } from '../domain/IFinalFiringTransport';

/** Owns acquisition history only; Jury decisions, ordinary shots and result settlement stay independent. */
export class FinalRecoveryFiringService {
  private tail: Promise<void> = Promise.resolve();
  constructor(
    private readonly repository: IFinalFiringRepository,
    private readonly source: IFinalFiringAuthorizationSource,
    private readonly transport: (input: FinalFiringTransportInput) => Promise<MalfunctionFiringEvidencePayload>,
  ) {}
  list(caseId: string) {
    return this.repository.list(caseId);
  }
  start(intent: FinalFiringIntent) {
    return this.serialize(async () => {
      if (intent.readinessConfirmed !== true) throw new Error('Confirm Jury readiness before firing');
      this.source.assertAuthorized(intent);
      let saved = this.repository.find(intent.id);
      if (saved && canonicalJson(saved.intent) !== canonicalJson(intent))
        throw new Error('Retry the original firing instructions unchanged');
      if (!saved) {
        if (
          this.repository
            .list(intent.caseId)
            .some((run) => run.intent.authorizationId === intent.authorizationId && run.intent.laneId === intent.laneId)
        )
          throw new Error('This authorization already has a firing run; read or retry that run');
        saved = { intent, request: await this.source.prepare(intent), evidence: null };
        this.repository.create(saved);
      }
      if (saved.evidence && saved.evidence.status !== 'RUNNING') return saved;
      return this.exchange(saved, 'START');
    });
  }
  read(id: string) {
    return this.serialize(() => this.exchange(this.require(id), 'READ'));
  }
  cancel(id: string, reason: string) {
    return this.serialize(() => {
      if (!reason.trim()) throw new Error('Cancellation reason is required');
      return this.exchange(this.require(id), 'CANCEL', reason);
    });
  }
  private require(id: string) {
    const saved = this.repository.find(id);
    if (!saved) throw new Error('Final firing run not found');
    return saved;
  }
  private async exchange(saved: FinalFiringRecord, operation: FinalFiringTransportInput['operation'], reason?: string) {
    const evidence = MalfunctionFiringEvidenceSchema.parse(
      await this.transport({ laneId: saved.intent.laneId, request: saved.request, operation, reason }),
    );
    if (canonicalJson(evidence.request) !== canonicalJson(saved.request))
      throw new Error('Lane returned evidence for different firing instructions');
    this.repository.appendEvidence(saved.intent.id, evidence);
    return this.require(saved.intent.id);
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
