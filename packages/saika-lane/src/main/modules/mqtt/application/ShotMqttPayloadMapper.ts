// SPDX-License-Identifier: MIT
import type { CompetitionShotPayload } from '@sasakiuri/saika-protocol/Shots';

import type { Shot } from '@/main/modules/session/domain/Shot';

import type { CompetitionShotPlacement } from './ShotCompetitionPlacement';

/**
 * Score evidence sent over MQTT.
 *
 * `rawScoreX10` remains as a backwards-compatible alias for the effective
 * score. New consumers should use the three explicitly named score fields.
 */
export interface ShotMqttEvidencePayload {
  rawScoreX10: number;
  deviceScoreX10: number | null;
  calculatedScoreX10: number;
  effectiveScoreX10: number;
  receivedAt: string;
  observationId?: string;
  targetProfileId?: string;
  scoringGaugeProfileId?: string;
}

/** Keeps transport mapping independent from the publishers and competition flow. */
export function toShotMqttEvidencePayload(shot: Shot): ShotMqttEvidencePayload {
  return {
    rawScoreX10: shot.score.value,
    deviceScoreX10: shot.deviceScore?.value ?? null,
    calculatedScoreX10: shot.calculatedScore.value,
    effectiveScoreX10: shot.score.value,
    receivedAt: shot.receivedAt.toISOString(),
    ...(shot.sourceObservationId === undefined ? {} : { observationId: shot.sourceObservationId }),
    ...(shot.targetProfileId === undefined ? {} : { targetProfileId: shot.targetProfileId }),
    ...(shot.scoringGaugeProfileId === undefined ? {} : { scoringGaugeProfileId: shot.scoringGaugeProfileId }),
  };
}

/** A shot placed in its competition series, as published live or replayed after a reconnect. */
export function toCompetitionShotPayload(input: {
  readonly laneId: string;
  readonly shot: Shot;
  readonly competitionId: string;
  readonly sessionId: string;
  readonly placement: CompetitionShotPlacement;
  /** Whether the stage of the placement is scored. */
  readonly scored: boolean;
  readonly isReplay: boolean;
}): CompetitionShotPayload {
  const { shot, placement, scored } = input;
  return {
    laneId: input.laneId,
    shotId: shot.id,
    x: shot.impactPoint?.x ?? null,
    y: shot.impactPoint?.y ?? null,
    ...toShotMqttEvidencePayload(shot),
    innerTen: shot.innerTen,
    mode: shot.mode.value,
    timestamp: shot.timestamp.toISOString(),
    competitionId: input.competitionId,
    sessionId: input.sessionId,
    stageIndex: placement.stageIndex,
    scored,
    seriesIndex: placement.seriesIndex,
    shotNumberInSeries: placement.shotNumberInSeries,
    isRecorded: shot.mode.isMatch() && scored,
    isReplay: input.isReplay,
    publishedAt: new Date().toISOString(),
  };
}
