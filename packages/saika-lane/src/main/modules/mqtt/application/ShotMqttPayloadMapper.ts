// SPDX-License-Identifier: MIT
import type { Shot } from '@/main/modules/session/domain/Shot';

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
