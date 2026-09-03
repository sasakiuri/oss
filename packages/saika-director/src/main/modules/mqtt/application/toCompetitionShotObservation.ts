import type { CompetitionShotPayload } from '@/shared/mqtt';
import type { CompetitionShotObservation } from '../domain/ICompetitionShotJournal';

export function toCompetitionShotObservation(
  shot: CompetitionShotPayload,
  payloadJson: string,
  observedAt: Date,
): CompetitionShotObservation {
  return {
    id: crypto.randomUUID(),
    competitionId: shot.competitionId,
    laneId: shot.laneId,
    sessionId: shot.sessionId,
    shotId: shot.shotId,
    sourceObservationId: shot.observationId ?? null,
    x: shot.x,
    y: shot.y,
    legacyRawScoreX10: shot.rawScoreX10,
    deviceScoreX10: shot.deviceScoreX10 ?? null,
    calculatedScoreX10: shot.calculatedScoreX10 ?? shot.rawScoreX10,
    calculatedScoreAvailable: shot.calculatedScoreX10 !== undefined,
    effectiveScoreX10: shot.effectiveScoreX10 ?? shot.rawScoreX10,
    targetProfileId: shot.targetProfileId ?? null,
    scoringGaugeProfileId: shot.scoringGaugeProfileId ?? null,
    innerTen: shot.innerTen,
    mode: shot.mode,
    firedAt: new Date(shot.timestamp),
    receivedAt: new Date(shot.receivedAt ?? shot.timestamp),
    stageIndex: shot.stageIndex,
    scored: shot.scored,
    seriesIndex: shot.seriesIndex,
    shotNumberInSeries: shot.shotNumberInSeries,
    isRecorded: shot.isRecorded,
    isReplay: shot.isReplay,
    publishedAt: new Date(shot.publishedAt),
    observedAt,
    payloadJson,
  };
}
