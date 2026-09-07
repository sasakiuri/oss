// SPDX-License-Identifier: MIT
import type { IEventRepository } from '@/main/modules/championship';
import {
  finalCorrectionBasis,
  qualificationCorrectionBasis,
  scoreCorrectionDigest,
  type IFinalResultRepository,
  type IResultRepository,
  type IQualificationScoreOverlaySource,
  type ScoreCorrectionBasis,
} from '@/main/modules/results';
import { getTargetExaminationState, type ITargetExaminationRepository } from '@/main/modules/target-examinations';
import {
  getAvailableSeriesShotCounts,
  getMatchSeriesShotCounts,
  type CompetitionTypeRegistry,
} from '@/shared/competitionTypes';

import type { IScoreCorrectionTargetSource, IScoreCorrectionCaseSource } from '../domain/ScoreCorrection';

export class StoredScoreCorrectionTargetSource implements IScoreCorrectionTargetSource {
  constructor(
    private readonly qualifications: IResultRepository,
    private readonly finals: IFinalResultRepository,
    private readonly events: IEventRepository,
    private readonly registry: CompetitionTypeRegistry,
    private readonly qualificationOverlays: IQualificationScoreOverlaySource,
  ) {}
  resolve(resultId: string, scope: 'QUALIFICATION' | 'FINAL') {
    const qualification = scope === 'QUALIFICATION' ? this.qualifications.findById(resultId) : null;
    const final = scope === 'FINAL' ? this.finals.findById(resultId) : null;
    const result = qualification ?? final;
    if (!result) throw new Error('Source result not found');
    const event = this.events.findById(result.eventId.value);
    if (!event) throw new Error('Result event not found');
    const definition = this.registry.get(event.eventType.value);
    const basis =
      scope === 'QUALIFICATION'
        ? qualificationCorrectionBasis(qualification!, this.qualificationOverlays.forResult(qualification!))
        : finalCorrectionBasis(
            final!,
            getAvailableSeriesShotCounts(
              getMatchSeriesShotCounts(definition),
              final!.stage1Shots.length + final!.stage2Shots.length,
            ),
          );
    if (
      !basis.shots.length ||
      basis.seriesShotCounts.some((count) => !Number.isInteger(count) || count < 1) ||
      basis.seriesShotCounts.reduce((sum, count) => sum + count, 0) !== basis.shots.length
    )
      throw new Error('Reconcile the complete source shot layout first');
    const scoring =
      definition.resultProjection?.type === 'HIT_MISS'
        ? ('HIT_MISS' as const)
        : definition.scoring.precision === 0
          ? ('RING' as const)
          : ('DECIMAL' as const);
    return { basis, scoring };
  }
}

/** Uses explicit scope links and an immutable Jury decision, never athlete-name matching. */
export class ExaminationScoreCorrectionCaseSource implements IScoreCorrectionCaseSource {
  constructor(private readonly examinations: ITargetExaminationRepository) {}
  list(basis: ScoreCorrectionBasis) {
    const cases = new Map(
      this.examinations.findCasesByScope({ scopeType: 'EVENT', scopeId: basis.eventId }).map((item) => [item.id, item]),
    );
    if (basis.competitionId)
      for (const item of this.examinations.findCasesByScope({ scopeType: 'COMPETITION', scopeId: basis.competitionId }))
        cases.set(item.id, item);
    return [...cases.values()].flatMap((item) => {
      const entries = this.examinations.findEntriesByCaseIds([item.id]).get(item.id) ?? [];
      if (getTargetExaminationState(entries).status === 'VOID') return [];
      const decision = entries.filter((entry) => entry.type === 'DECISION').at(-1);
      return decision
        ? [{ id: item.id, summary: item.summary, decisionId: decision.id, decision: decision.statement }]
        : [];
    });
  }
  revision(caseId: string, decisionId: string, basis: ScoreCorrectionBasis) {
    const option = this.list(basis).find((item) => item.id === caseId && item.decisionId === decisionId);
    if (!option)
      throw new Error('Select the current Jury decision from an examination linked to this event or competition');
    const entries = this.examinations.findEntriesByCaseIds([caseId]).get(caseId) ?? [];
    return scoreCorrectionDigest({
      case: this.examinations.findCaseById(caseId),
      decision: entries.find((entry) => entry.id === decisionId),
      evidence: this.examinations.findEvidenceByCaseIds([caseId]).get(caseId) ?? [],
    });
  }
}
