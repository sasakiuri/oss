import type { IResultPublicationReadiness } from '@/main/modules/result-publication';
import type { ResultVerificationStatusDto } from '@/shared/ipc/contracts';

import type {
  IResultsBookOfficialRevisionSource,
  IResultsBookResultSnapshotSource,
  ResultsBookResultSnapshot,
} from '../domain/ResultsBookModels';

interface ResultVerificationStatusReader {
  getStatus(eventId: string, resultScope: 'QUALIFICATION' | 'FINAL'): Promise<ResultVerificationStatusDto>;
}

/**
 * Adapts the live, decision-aware result projection to Results Book data and
 * records the immutable revision that was actually published as Official.
 */
export class VerifiedResultsBookResultSnapshotSource implements IResultsBookResultSnapshotSource {
  constructor(
    private readonly verification: ResultVerificationStatusReader,
    private readonly officialRevisions: IResultsBookOfficialRevisionSource,
    private readonly readiness: IResultPublicationReadiness,
  ) {}

  async load(eventId: string, resultScope: 'QUALIFICATION' | 'FINAL'): Promise<ResultsBookResultSnapshot> {
    const [status, readiness] = await Promise.all([
      this.verification.getStatus(eventId, resultScope),
      this.readiness.getCurrent(eventId, resultScope),
    ]);
    if (status.eventId !== eventId || status.resultScope !== resultScope) {
      throw new Error('Result verification returned another event or result scope');
    }
    const official = this.officialRevisions.findOfficial(eventId, resultScope);
    const publicationIssues = [...readiness.verificationIssues];
    if (readiness.snapshotRevision !== status.snapshotRevision || readiness.resultCount !== status.results.length) {
      publicationIssues.push('The result list changed while Results Book source data was being read');
    }
    if (official && official.approvalId !== readiness.approvalId) {
      publicationIssues.push('The current RTS approval no longer matches the Official result workflow');
    }
    return {
      eventId,
      resultScope,
      snapshotRevision: status.snapshotRevision,
      officialPublicationRevision: official?.snapshotRevision ?? null,
      publicationIssues: [...new Set(publicationIssues)],
      results: status.results.map((result) => ({
        resultId: result.resultId,
        participantId: result.participantId,
        rank: result.rank,
        playerName: result.playerName,
        affiliation: result.affiliation,
        totalScore: result.totalScore,
        classificationCode: result.classificationCode,
        status: result.status,
      })),
    };
  }
}
