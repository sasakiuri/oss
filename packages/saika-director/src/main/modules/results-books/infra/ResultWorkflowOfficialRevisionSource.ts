import type {
  IFinalResultDeclarationRepository,
  IResultPublicationRepository,
} from '@/main/modules/result-publication';

import type { IResultsBookOfficialRevisionSource } from '../domain/ResultsBookModels';

/**
 * Bridges the Qualification publication and Final declaration workflows while
 * keeping their persistence details outside the Results Book policy.
 */
export class ResultWorkflowOfficialRevisionSource implements IResultsBookOfficialRevisionSource {
  constructor(
    private readonly publications: IResultPublicationRepository,
    private readonly finalDeclarations: IFinalResultDeclarationRepository,
  ) {}

  findOfficial(
    eventId: string,
    resultScope: 'QUALIFICATION' | 'FINAL',
  ): { readonly snapshotRevision: string; readonly approvalId: string } | null {
    if (resultScope === 'FINAL') {
      const declaration = this.finalDeclarations.findByEvent(eventId);
      return declaration
        ? { snapshotRevision: declaration.snapshotRevision, approvalId: declaration.approvalId }
        : null;
    }
    const publication = [...this.publications.findByEvent(eventId, resultScope)]
      .reverse()
      .find((entry) => entry.type === 'OFFICIAL_PUBLISHED');
    return publication ? { snapshotRevision: publication.snapshotRevision, approvalId: publication.approvalId } : null;
  }
}
