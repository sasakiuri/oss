import type { ResultScope } from '@/main/domain/resultScope';
import type { IResultPublicationReadiness, ResultPublicationReadiness } from '../application/ResultPublicationPorts';
import type { ResultVerificationStatusDto } from '@/shared/ipc/contracts';

export interface ResultVerificationStatusReader {
  getStatus(eventId: string, resultScope: ResultScope): Promise<ResultVerificationStatusDto>;
}

/** Scope-neutral adapter from RTS verification to the publication port. */
export class VerifiedResultPublicationReadiness implements IResultPublicationReadiness {
  constructor(private readonly verification: ResultVerificationStatusReader) {}

  async getCurrent(eventId: string, resultScope: ResultScope): Promise<ResultPublicationReadiness> {
    const status = await this.verification.getStatus(eventId, resultScope);
    if (status.resultScope !== resultScope) throw new Error('Verification status returned another result scope');
    return {
      supported: true,
      resultCount: status.results.length,
      snapshotRevision: status.snapshotRevision,
      approvalId: status.currentApproval?.id ?? null,
      approvalSnapshotRevision: status.currentApproval?.snapshotRevision ?? null,
      verificationIssues: status.issues,
    };
  }
}
