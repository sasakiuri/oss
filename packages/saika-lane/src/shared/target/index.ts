// SPDX-License-Identifier: MIT

export {
  SCORING_GAUGE_PROFILE_IDS,
  SCORING_GAUGE_PROFILES,
  getScoringGaugeProfile,
  getScoringGaugeRadiusMm,
  isScoringGaugeProfileId,
  type ScoringGaugeAuthority,
  type ScoringGaugeGeometryKind,
  type ScoringGaugeProfile,
  type ScoringGaugeProfileId,
} from './ScoringGaugeProfile';
export {
  DEFAULT_TARGET_SCORING_PROFILE_BY_DISCIPLINE,
  TARGET_SCORING_PROFILE_IDS,
  TARGET_SCORING_PROFILES,
  getDefaultTargetScoringProfile,
  getTargetRingRadii,
  getTargetScoringProfile,
  isTargetScoringProfileId,
  type TargetRingLine,
  type TargetScoringAuthority,
  type TargetScoringGranularity,
  type TargetInnerTenRule,
  type TargetScoringProfile,
  type TargetScoringProfileId,
} from './TargetScoringProfile';
