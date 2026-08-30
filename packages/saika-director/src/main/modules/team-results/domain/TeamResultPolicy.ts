import type { ParticipantEntryStatus, ParticipantGender } from '@/main/modules/championship';
import type { RankingShotEvidence } from '@/shared/competitionTypes';

export const TEAM_RESULT_FORMATS = ['THREE_MEMBER', 'MIXED_PAIR'] as const;
export type TeamResultFormat = (typeof TEAM_RESULT_FORMATS)[number];
export const TEAM_TIE_BREAK_POLICIES = ['ISSF_FULL_RING', 'ISSF_DECIMAL_RIFLE'] as const;
export type TeamTieBreakPolicy = (typeof TEAM_TIE_BREAK_POLICIES)[number];

export interface TeamResultMemberInput {
  participantId: string;
  playerName: string;
  familyName: string;
  nationCode: string | null;
  gender: ParticipantGender;
  entryStatus: ParticipantEntryStatus;
  totalScore: number | null;
  seriesScores: readonly number[];
  rankingShots: readonly RankingShotEvidence[];
  classificationCode: string | null;
  decisionCount: number;
}

export interface TeamResultCandidateInput {
  teamId: string;
  teamName: string;
  members: readonly TeamResultMemberInput[];
}

export interface TeamTieEvidence {
  innerTens: number | null;
  seriesTotals: number[];
  ringShotTotals: number[];
  innerTenByShot: Array<number | null>;
  decimalShotTotals: Array<number | null>;
  manualReviewRequired: boolean;
}

export interface EvaluatedTeamResult {
  teamId: string;
  teamName: string;
  nationCode: string | null;
  eligible: boolean;
  totalScore: number;
  issues: string[];
  members: readonly TeamResultMemberInput[];
  tieBreakPolicy: TeamTieBreakPolicy;
  tieEvidence: TeamTieEvidence;
}

export interface ITeamResultPolicy {
  evaluate(
    input: TeamResultCandidateInput,
    format: TeamResultFormat,
    tieBreakPolicy: TeamTieBreakPolicy,
  ): EvaluatedTeamResult;
  compare(left: EvaluatedTeamResult, right: EvaluatedTeamResult): number;
}

/** Pure ISSF team composition and tie-breaking policy (3.3.2.3, 6.15.5, 6.18). */
export class IssfTeamResultPolicy implements ITeamResultPolicy {
  evaluate(
    input: TeamResultCandidateInput,
    format: TeamResultFormat,
    tieBreakPolicy: TeamTieBreakPolicy,
  ): EvaluatedTeamResult {
    const expectedMembers = format === 'MIXED_PAIR' ? 2 : 3;
    const issues: string[] = [];
    if (input.members.length !== expectedMembers) {
      issues.push(`ISSF requires exactly ${expectedMembers} team members; found ${input.members.length}`);
    }
    if (input.members.some((member) => member.entryStatus !== 'COMPETING')) {
      issues.push('Only COMPETING entries are eligible for an official team result');
    }
    if (input.members.some((member) => member.totalScore === null || member.classificationCode !== null)) {
      issues.push('Every team member must have a classifiable qualification result');
    }

    const genders = input.members.map((member) => member.gender);
    if (format === 'MIXED_PAIR') {
      if (!(genders.length === 2 && genders.includes('M') && genders.includes('F'))) {
        issues.push('A Mixed Team must contain one male and one female athlete');
      }
    } else if (new Set(genders).size !== 1 || genders[0] === 'UNSPECIFIED') {
      issues.push('A three-member Team must contain athletes of the same recorded gender');
    }

    const nations = [...new Set(input.members.map((member) => member.nationCode).filter(Boolean))];
    if (nations.length !== 1 || input.members.some((member) => member.nationCode === null)) {
      issues.push('All team members must have the same recorded nation code');
    }
    const tieEvidence = aggregateTieEvidence(input.members);
    return {
      teamId: input.teamId,
      teamName: input.teamName,
      nationCode: nations.length === 1 ? nations[0]! : null,
      eligible: issues.length === 0,
      totalScore: input.members.reduce((sum, member) => sum + (member.totalScore ?? 0), 0),
      issues,
      members: input.members,
      tieBreakPolicy,
      tieEvidence,
    };
  }

  compare(left: EvaluatedTeamResult, right: EvaluatedTeamResult): number {
    if (left.tieBreakPolicy !== right.tieBreakPolicy) {
      throw new Error('Team results using different tie-break policies cannot be compared');
    }
    if (left.totalScore !== right.totalScore) return right.totalScore - left.totalScore;
    const leftEvidence = left.tieEvidence;
    const rightEvidence = right.tieEvidence;
    if (left.tieBreakPolicy === 'ISSF_FULL_RING') {
      if (
        leftEvidence.innerTens !== null &&
        rightEvidence.innerTens !== null &&
        leftEvidence.innerTens !== rightEvidence.innerTens
      ) {
        return rightEvidence.innerTens - leftEvidence.innerTens;
      }
    }
    const seriesOrder = compareBackward(leftEvidence.seriesTotals, rightEvidence.seriesTotals);
    if (seriesOrder !== 0) return seriesOrder;
    if (leftEvidence.manualReviewRequired || rightEvidence.manualReviewRequired) return 0;
    if (left.tieBreakPolicy === 'ISSF_DECIMAL_RIFLE') {
      return compareNullableBackward(leftEvidence.decimalShotTotals, rightEvidence.decimalShotTotals);
    }
    for (
      let index = Math.max(leftEvidence.ringShotTotals.length, rightEvidence.ringShotTotals.length) - 1;
      index >= 0;
      index -= 1
    ) {
      const ringDifference = (rightEvidence.ringShotTotals[index] ?? 0) - (leftEvidence.ringShotTotals[index] ?? 0);
      if (ringDifference !== 0) return ringDifference;
      const leftInner = leftEvidence.innerTenByShot[index];
      const rightInner = rightEvidence.innerTenByShot[index];
      if (
        leftInner !== null &&
        leftInner !== undefined &&
        rightInner !== null &&
        rightInner !== undefined &&
        leftInner !== rightInner
      ) {
        return rightInner - leftInner;
      }
      const leftDecimal = leftEvidence.decimalShotTotals[index];
      const rightDecimal = rightEvidence.decimalShotTotals[index];
      if (
        leftDecimal !== null &&
        leftDecimal !== undefined &&
        rightDecimal !== null &&
        rightDecimal !== undefined &&
        leftDecimal !== rightDecimal
      ) {
        return rightDecimal - leftDecimal;
      }
    }
    return 0;
  }
}

function aggregateTieEvidence(members: readonly TeamResultMemberInput[]): TeamTieEvidence {
  const maxSeries = Math.max(0, ...members.map((member) => member.seriesScores.length));
  const seriesTotals = Array.from({ length: maxSeries }, (_, index) =>
    members.reduce((sum, member) => sum + (member.seriesScores[index] ?? 0), 0),
  );
  const maxShots = Math.max(0, ...members.map((member) => member.rankingShots.length));
  const allInnerTensKnown = members.every(
    (member) => member.rankingShots.length > 0 && member.rankingShots.every((shot) => shot.innerTen !== null),
  );
  const innerTenByShot = Array.from({ length: maxShots }, (_, index) => {
    const values = members.map((member) => member.rankingShots[index]?.innerTen);
    return values.every((value) => value !== null && value !== undefined) ? values.filter(Boolean).length : null;
  });
  const decimalShotTotals = Array.from({ length: maxShots }, (_, index) => {
    const values = members.map((member) => member.rankingShots[index]?.decimalScore);
    return values.every((value) => value !== null && value !== undefined)
      ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null;
  });
  const ringShotTotals = Array.from({ length: maxShots }, (_, index) =>
    members.reduce((sum, member) => sum + (member.rankingShots[index]?.ringScore ?? 0), 0),
  );
  return {
    innerTens: allInnerTensKnown ? innerTenByShot.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null,
    seriesTotals,
    ringShotTotals,
    innerTenByShot,
    decimalShotTotals,
    manualReviewRequired: members.some((member) => member.decisionCount > 0),
  };
}

function compareBackward(left: readonly number[], right: readonly number[]): number {
  for (let index = Math.max(left.length, right.length) - 1; index >= 0; index -= 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function compareNullableBackward(left: readonly (number | null)[], right: readonly (number | null)[]): number {
  for (let index = Math.max(left.length, right.length) - 1; index >= 0; index -= 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === null || leftValue === undefined || rightValue === null || rightValue === undefined) return 0;
    const difference = rightValue - leftValue;
    if (difference !== 0) return difference;
  }
  return 0;
}
