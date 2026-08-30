import { describe, expect, it } from 'vitest';

import {
  IssfTeamResultPolicy,
  type TeamResultCandidateInput,
  type TeamResultMemberInput,
  type TeamTieBreakPolicy,
} from '@/main/modules/team-results';

function member(participantId: string, decimalScores: readonly number[], innerTen: boolean): TeamResultMemberInput {
  return {
    participantId,
    playerName: participantId,
    familyName: participantId,
    nationCode: 'JPN',
    gender: 'M',
    entryStatus: 'COMPETING',
    totalScore: decimalScores.reduce((sum, score) => sum + score, 0),
    seriesScores: [decimalScores.reduce((sum, score) => sum + score, 0)],
    rankingShots: decimalScores.map((decimalScore, index) => ({
      ringScore: Math.floor(decimalScore),
      decimalScore,
      decimalScoreSource: 'DEVICE',
      innerTen,
      shotId: `${participantId}-${index}`,
      seriesIndex: 0,
    })),
    classificationCode: null,
    decisionCount: 0,
  };
}

function team(teamId: string, decimalScores: readonly number[], innerTen: boolean): TeamResultCandidateInput {
  return {
    teamId,
    teamName: teamId,
    members: [1, 2, 3].map((index) => member(`${teamId}-${index}`, decimalScores, innerTen)),
  };
}

function evaluate(
  input: TeamResultCandidateInput,
  tieBreakPolicy: TeamTieBreakPolicy,
): ReturnType<IssfTeamResultPolicy['evaluate']> {
  return new IssfTeamResultPolicy().evaluate(input, 'THREE_MEMBER', tieBreakPolicy);
}

describe('IssfTeamResultPolicy', () => {
  it('skips inner tens and uses reverse decimal shots for decimal rifle teams', () => {
    const policy = new IssfTeamResultPolicy();
    const left = evaluate(team('left', [10.2, 10.0], true), 'ISSF_DECIMAL_RIFLE');
    const right = evaluate(team('right', [10.1, 10.1], false), 'ISSF_DECIMAL_RIFLE');

    expect(left.totalScore).toBeCloseTo(right.totalScore);
    expect(left.tieEvidence.innerTens).toBeGreaterThan(right.tieEvidence.innerTens ?? 0);
    expect(policy.compare(left, right)).toBeGreaterThan(0);
  });

  it('keeps inner tens ahead of reverse-shot evidence for full-ring teams', () => {
    const policy = new IssfTeamResultPolicy();
    const left = evaluate(team('left', [10.2, 10.0], true), 'ISSF_FULL_RING');
    const right = evaluate(team('right', [10.1, 10.1], false), 'ISSF_FULL_RING');

    expect(policy.compare(left, right)).toBeLessThan(0);
  });

  it('rejects comparison across different event policies', () => {
    const policy = new IssfTeamResultPolicy();
    const fullRing = evaluate(team('left', [10.0], false), 'ISSF_FULL_RING');
    const decimal = evaluate(team('right', [10.0], false), 'ISSF_DECIMAL_RIFLE');

    expect(() => policy.compare(fullRing, decimal)).toThrow(
      'Team results using different tie-break policies cannot be compared',
    );
  });
});
