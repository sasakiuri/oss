import { getSeriesIndexForShot } from '@/shared/competitionTypes';
import type { AddScoringDecisionPayload, ScoringDecisionDto } from '@/shared/ipc/contracts';
import type { IScoringDecisionRepository } from '../domain/IScoringDecisionRepository';
import type { IScoringDecisionTargetResolver } from '../domain/IScoringDecisionTargetResolver';
import { ScoringDecision } from '../domain/ScoringDecision';
import { toScoringDecisionDto } from './toScoringDecisionDto';

export class AppendScoringDecisionHandler {
  constructor(
    private readonly decisions: IScoringDecisionRepository,
    private readonly targets: IScoringDecisionTargetResolver,
  ) {}

  async execute(input: AddScoringDecisionPayload): Promise<ScoringDecisionDto> {
    const target = await this.targets.resolve(input.resultId, input.resultScope);
    if (!target) throw new Error(`${formatScope(input.resultScope)} result ${input.resultId} was not found`);

    validateTargetBounds(input, target.seriesShotCounts);
    const decision = ScoringDecision.create({
      ...target,
      type: input.type,
      applicationPolicy: input.applicationPolicy,
      pointsX10: input.pointsX10,
      seriesIndex: input.seriesIndex,
      shotIndex: input.shotIndex,
      classificationCode: input.classificationCode,
      ruleReference: input.ruleReference,
      incidentReportNumber: input.incidentReportNumber,
      publicRemark: input.publicRemark,
      internalNote: input.internalNote,
      officialName: input.officialName,
    });
    this.decisions.append(decision);
    return toScoringDecisionDto(decision, true);
  }
}

function validateTargetBounds(input: AddScoringDecisionPayload, seriesShotCounts: readonly number[]): void {
  const seriesCount = seriesShotCounts.length;
  const shotCount = seriesShotCounts.reduce((sum, count) => sum + count, 0);
  if (input.seriesIndex !== undefined && input.seriesIndex >= seriesCount) {
    throw new Error(`Series ${input.seriesIndex + 1} is outside this result`);
  }
  if (input.shotIndex !== undefined && input.shotIndex >= shotCount) {
    throw new Error(`Shot ${input.shotIndex + 1} is outside this result`);
  }
  if (
    input.applicationPolicy === 'SPECIFIC_SHOT' &&
    input.seriesIndex !== undefined &&
    input.shotIndex !== undefined &&
    seriesCount > 0 &&
    getSeriesIndexForShot(seriesShotCounts, input.shotIndex) !== input.seriesIndex
  ) {
    throw new Error(`Shot ${input.shotIndex + 1} does not belong to series ${input.seriesIndex + 1}`);
  }
}

function formatScope(scope: AddScoringDecisionPayload['resultScope']): string {
  return scope === 'FINAL' ? 'Final' : 'Qualification';
}
