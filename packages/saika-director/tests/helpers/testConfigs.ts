/**
 * RoundConfig helpers for tests.
 *
 * Tests use factories based on CompetitionTypeDefinition.
 */
import { buildRoundConfig } from '@/shared/constants/roundConfig';
import type { RoundConfig } from '@/shared/constants/roundConfig';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { BR60S_FINAL } from '@/shared/competitionTypes/definitions/BR60S_FINAL';

/** Qualification RoundConfig for tests, based on BR60S. */
export const QUALIFICATION_CONFIG = buildRoundConfig(BR60S);

/** Final RoundConfig factory for tests, based on BR60S_FINAL. */
export function buildFinalConfig(participantCount: number) {
  return buildRoundConfig(BR60S_FINAL, participantCount);
}

/** Synthetic shot-mode fixture used to exercise SHOT_COMPLETE independently of an ISSF course definition. */
export function buildMultiShotSeriesFinalConfig(participantCount: number): RoundConfig {
  const config = buildFinalConfig(participantCount);
  return {
    ...config,
    stages: config.stages.map((stage, index) => (index === 2 ? { ...stage, series: [{ shots: 2 }] } : stage)),
    eliminationSchedule: {},
  };
}
