import type { ScoreCorrectionService } from '@/main/modules/score-corrections';
import type { IScoreCorrectionRepository } from '@/main/modules/score-corrections';
import type { IReviewCorrectionSource, ReviewSubject } from './ObservationReviewService';

/** Rechecks live correction projection, so withdrawal or stale Jury evidence reopens the publication hold. */
export class AppliedReviewCorrections implements IReviewCorrectionSource {
  constructor(
    private readonly repository: IScoreCorrectionRepository,
    private readonly service: ScoreCorrectionService,
    private readonly competitions: (eventId: string, scope: 'QUALIFICATION' | 'FINAL') => readonly string[],
  ) {}
  issue(subject: ReviewSubject, correctionId: string): string | null {
    try {
      const correction = this.repository.find(correctionId);
      if (!correction || this.repository.withdrawal(correctionId)) return 'Score correction is missing or withdrawn';
      const basis = correction.basis;
      const scoped =
        basis.competitionId === subject.competitionId ||
        (basis.resultScope === 'FINAL' && this.competitions(basis.eventId, 'FINAL').includes(subject.competitionId));
      if (
        !scoped ||
        !correction.request.changes.some((change) => change.evidenceReference === subject.evidenceReference)
      )
        return 'The correction must belong to this competition and explicitly reference this evidence';
      const { projection } = this.service.workspace(correction.request);
      if (!projection.ids.includes(correctionId) || projection.issues.length)
        return 'Score correction is no longer current; reconcile the source result and Jury decision';
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Score correction could not be verified';
    }
  }
}
