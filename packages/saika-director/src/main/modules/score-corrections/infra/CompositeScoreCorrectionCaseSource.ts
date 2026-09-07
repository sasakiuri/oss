import type { ScoreCorrectionBasis } from '@/main/modules/results';
import type { IScoreCorrectionCaseSource, ScoreCorrectionRequest } from '../domain/ScoreCorrection';

/** Each evidence source owns its validation and revision; correction projection uses the common port. */
export class CompositeScoreCorrectionCaseSource implements IScoreCorrectionCaseSource {
  constructor(private readonly sources: readonly IScoreCorrectionCaseSource[]) {}
  list(basis: ScoreCorrectionBasis) {
    return this.sources.flatMap((source) => source.list(basis));
  }
  revision(caseId: string, decisionId: string, basis: ScoreCorrectionBasis) {
    return this.source(caseId, decisionId, basis).revision(caseId, decisionId, basis);
  }
  validate(request: ScoreCorrectionRequest, basis: ScoreCorrectionBasis) {
    this.source(request.caseId, request.decisionId, basis).validate?.(request, basis);
  }
  private source(caseId: string, decisionId: string, basis: ScoreCorrectionBasis) {
    const sources = this.sources.filter((source) =>
      source.list(basis).some((item) => item.id === caseId && item.decisionId === decisionId),
    );
    if (sources.length !== 1) throw new Error('Select one current Jury decision linked to this result');
    return sources[0]!;
  }
}
