import type {
  FiringWindowDetectionPolicy,
  FiringWindowDetectionRule,
  FiringWindowViolationKind,
} from '@/shared/competitionTypes';
import type { CompetitionShotObservation } from '../domain/ICompetitionShotJournal';
import type { FiringCommandBoundary } from '../domain/IFiringWindowJournal';

export interface FiringWindowDetectionMatch {
  rule: FiringWindowDetectionRule;
  kind: FiringWindowViolationKind;
  evaluatedShotAt: Date;
  decisiveBoundaryId: string;
}

/**
 * Classifies one shot against an append-only command timeline. A configured
 * tolerance suppresses boundary-adjacent observations instead of creating a
 * legal grace period.
 */
export function detectFiringWindowViolations(
  observation: CompetitionShotObservation,
  boundaries: readonly FiringCommandBoundary[],
  policy: FiringWindowDetectionPolicy,
): FiringWindowDetectionMatch[] {
  if (!Number.isInteger(policy.clockToleranceMilliseconds) || policy.clockToleranceMilliseconds < 0) {
    throw new Error('Firing-window clock tolerance must be a non-negative integer');
  }
  const evaluatedShotAt = selectShotTime(observation, policy.timestampSource);
  const shotTime = evaluatedShotAt.getTime();
  const tolerance = policy.clockToleranceMilliseconds;
  const lowerCertainBoundary = shotTime - tolerance;
  const upperRelevantBoundary = shotTime + tolerance;
  const ordered = boundaries
    .filter((boundary) => boundary.competitionId === observation.competitionId)
    .slice()
    .sort(compareBoundaries);

  const firstSightingOpen = ordered.find((boundary) => boundary.phase === 'SIGHTING' && boundary.transition === 'OPEN');
  if (firstSightingOpen && shotTime < firstSightingOpen.occurredAt.getTime() - tolerance) {
    return matchesForKind(policy.rules, 'BEFORE_PREPARATION_AND_SIGHTING_START', evaluatedShotAt, firstSightingOpen.id);
  }

  const latestMatchBoundary = latestBoundary(ordered, 'MATCH', upperRelevantBoundary);
  if (latestMatchBoundary?.transition === 'CLOSE' && latestMatchBoundary.occurredAt.getTime() < lowerCertainBoundary) {
    return matchesForKind(policy.rules, 'AFTER_MATCH_STOP', evaluatedShotAt, latestMatchBoundary.id);
  }

  const latestSightingBoundary = latestBoundary(ordered, 'SIGHTING', upperRelevantBoundary);
  if (
    latestMatchBoundary === undefined &&
    latestSightingBoundary?.transition === 'CLOSE' &&
    latestSightingBoundary.occurredAt.getTime() < lowerCertainBoundary
  ) {
    return matchesForKind(
      policy.rules,
      'BETWEEN_PREPARATION_AND_SIGHTING_STOP_AND_MATCH_START',
      evaluatedShotAt,
      latestSightingBoundary.id,
    );
  }

  return [];
}

function selectShotTime(
  observation: CompetitionShotObservation,
  source: FiringWindowDetectionPolicy['timestampSource'],
): Date {
  if (source === 'RECEIVED_AT') return observation.receivedAt;
  if (source === 'OBSERVED_AT') return observation.observedAt;
  return observation.firedAt;
}

function latestBoundary(
  boundaries: readonly FiringCommandBoundary[],
  phase: FiringCommandBoundary['phase'],
  atOrBefore: number,
): FiringCommandBoundary | undefined {
  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    const boundary = boundaries[index];
    if (boundary && boundary.phase === phase && boundary.occurredAt.getTime() <= atOrBefore) return boundary;
  }
  return undefined;
}

function compareBoundaries(left: FiringCommandBoundary, right: FiringCommandBoundary): number {
  const timeDifference = left.occurredAt.getTime() - right.occurredAt.getTime();
  if (timeDifference !== 0) return timeDifference;
  // A same-instant restart opens the window and must win over a prior close.
  if (left.transition !== right.transition) return left.transition === 'CLOSE' ? -1 : 1;
  const recordedDifference = left.recordedAt.getTime() - right.recordedAt.getTime();
  return recordedDifference || left.id.localeCompare(right.id);
}

function matchesForKind(
  rules: readonly FiringWindowDetectionRule[],
  kind: FiringWindowViolationKind,
  evaluatedShotAt: Date,
  decisiveBoundaryId: string,
): FiringWindowDetectionMatch[] {
  return rules
    .filter((rule) => rule.kind === kind)
    .map((rule) => ({ rule, kind, evaluatedShotAt, decisiveBoundaryId }));
}
