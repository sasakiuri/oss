import type { ResultBoardSnapshotDto } from '@/shared/ipc/contracts/resultPublication.contract';

type Scope = ResultBoardSnapshotDto['resultScope'];
type BoardRow = ResultBoardSnapshotDto['results'][number];

export interface IResultBoardSource {
  getStatus(
    eventId: string,
    scope: Scope,
  ): Promise<{
    eventId: string;
    resultScope: Scope;
    snapshotRevision: string;
    currentApproval: { id: string } | null;
    readyForApproval: boolean;
    results: readonly BoardRow[];
  }>;
}
export interface IResultBoardPublication {
  getStatus(
    eventId: string,
    scope: Scope,
  ): Promise<{
    eventId: string;
    resultScope: Scope;
    currentSnapshotRevision: string | null;
    publicationCurrent: boolean;
    status: 'DRAFT' | 'PRELIMINARY' | 'PROTEST_PENDING' | 'PROTEST_CLOSED' | 'OFFICIAL';
    approvalId: string | null;
    postedAt: Date | null;
    protestEndsAt: Date | null;
  }>;
}
export interface IResultBoardDeclaration {
  getStatus(eventId: string): Promise<{
    eventId: string;
    currentSnapshotRevision: string | null;
    declarationCurrent: boolean;
    declaration: { approvalId: string; declaredAt: string } | null;
  }>;
}

/** A read-only projection: rows and their publication label must describe the same snapshot. */
export class ResultBoardSnapshotService {
  constructor(
    private readonly source: IResultBoardSource,
    private readonly publication: IResultBoardPublication,
    private readonly declaration: IResultBoardDeclaration,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getSnapshot(eventId: string, scope: Scope): Promise<ResultBoardSnapshotDto> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await this.source.getStatus(eventId, scope);
      const qualification = scope === 'QUALIFICATION' ? await this.publication.getStatus(eventId, scope) : null;
      const final = scope === 'FINAL' ? await this.declaration.getStatus(eventId) : null;
      const after = await this.source.getStatus(eventId, scope);
      if (
        before.eventId !== eventId ||
        after.eventId !== eventId ||
        before.resultScope !== scope ||
        after.resultScope !== scope ||
        (qualification && (qualification.eventId !== eventId || qualification.resultScope !== scope)) ||
        (final && final.eventId !== eventId)
      ) {
        throw new Error('The board source returned another event or result scope');
      }
      const publishedRevision = qualification?.currentSnapshotRevision ?? final?.currentSnapshotRevision;
      if (
        before.snapshotRevision !== after.snapshotRevision ||
        (publishedRevision != null && publishedRevision !== after.snapshotRevision)
      )
        continue;

      let state: ResultBoardSnapshotDto['state'] = 'DRAFT';
      let postedAt: string | null = null;
      let protestEndsAt: string | null = null;
      if (qualification && qualification.status !== 'DRAFT') {
        const approvalCurrent =
          qualification.status !== 'OFFICIAL' ||
          (after.readyForApproval && qualification.approvalId === after.currentApproval?.id);
        state =
          qualification.publicationCurrent && publishedRevision === after.snapshotRevision && approvalCurrent
            ? qualification.status
            : 'REVIEW_REQUIRED';
        if (state !== 'REVIEW_REQUIRED') {
          postedAt = qualification.postedAt?.toISOString() ?? null;
          protestEndsAt = qualification.protestEndsAt?.toISOString() ?? null;
        }
      } else if (final?.declaration) {
        state =
          final.declarationCurrent &&
          after.readyForApproval &&
          publishedRevision === after.snapshotRevision &&
          final.declaration.approvalId === after.currentApproval?.id
            ? 'FINAL'
            : 'REVIEW_REQUIRED';
        if (state === 'FINAL') postedAt = final.declaration.declaredAt;
      }
      return {
        eventId,
        resultScope: scope,
        snapshotRevision: after.snapshotRevision,
        checkedAt: this.now().toISOString(),
        state,
        postedAt,
        protestEndsAt,
        results: after.results.map(
          ({ resultId, rank, entryStatus, playerName, affiliation, totalScore, classificationCode }) => ({
            resultId,
            rank,
            entryStatus,
            playerName,
            affiliation,
            totalScore,
            classificationCode,
          }),
        ),
      };
    }
    throw new Error('The results are changing; waiting for a consistent board snapshot');
  }
}
