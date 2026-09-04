import type {
  DecisionApplicationTrace,
  ScoreDecisionProjection,
  ScoringClassificationCode,
} from '@/main/modules/scoring-decisions';

/** Classification supplied by an independent, wider-scoped officiating module. */
export interface ResultClassificationOverlay {
  readonly participantId: string;
  readonly classificationCode: ScoringClassificationCode;
  readonly decisionIds: readonly string[];
  readonly publicRemarks: readonly string[];
}

/**
 * Consumer-owned port for event- or championship-wide classifications.
 *
 * Results stays unaware of the module that owns the decisions. A deployment may
 * omit that module and use the no-op implementation without changing scoring.
 */
export interface IResultClassificationOverlaySource {
  findByEventId(eventId: string): readonly ResultClassificationOverlay[];
}

export const noResultClassificationOverlays: IResultClassificationOverlaySource = Object.freeze({
  findByEventId: () => [],
});

/** Applies an external classification without mutating source scores or scoring decisions. */
export function applyResultClassificationOverlay(
  projection: ScoreDecisionProjection,
  overlay: ResultClassificationOverlay | undefined,
): ScoreDecisionProjection {
  if (!overlay) return projection;

  const classificationCode = strongerClassification(projection.classificationCode, overlay.classificationCode);
  const newlyClassifiedScoreX10 = projection.classificationCode === null ? projection.totalScoreX10 : 0;
  const applications: DecisionApplicationTrace[] = overlay.decisionIds.map((decisionId) => ({
    decisionId,
    seriesIndex: null,
    shotIndex: null,
  }));

  return Object.freeze({
    ...projection,
    totalScoreX10: 0,
    scoreAdjustmentX10: projection.scoreAdjustmentX10 + newlyClassifiedScoreX10,
    classificationCode,
    remarks: Object.freeze([...projection.remarks, ...overlay.publicRemarks]),
    activeDecisionIds: Object.freeze([...projection.activeDecisionIds, ...overlay.decisionIds]),
    applications: Object.freeze([...projection.applications, ...applications]),
  });
}

function strongerClassification(
  current: ScoringClassificationCode | null,
  incoming: ScoringClassificationCode,
): ScoringClassificationCode {
  if (current === null) return incoming;
  return classificationPriority(incoming) > classificationPriority(current) ? incoming : current;
}

function classificationPriority(code: ScoringClassificationCode): number {
  if (code === 'AD_DSQ') return 3;
  if (code === 'DQB') return 2;
  return 1;
}
