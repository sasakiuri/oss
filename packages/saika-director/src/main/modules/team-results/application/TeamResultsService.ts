import type { IParticipantRepository } from '@/main/modules/championship';
import type { IQualificationResultsReader, IResultRepository } from '@/main/modules/results';
import type { TeamResultDto, TeamResultFormatDto } from '@/shared/ipc/contracts';

import {
  IssfTeamResultPolicy,
  type EvaluatedTeamResult,
  type ITeamResultPolicy,
  type TeamResultMemberInput,
} from '../domain/TeamResultPolicy';
import type { ITeamTieBreakPolicyResolver } from './TeamResultPorts';

export class TeamResultsService {
  constructor(
    private readonly participants: Pick<IParticipantRepository, 'findByEventId'>,
    private readonly results: IResultRepository,
    private readonly qualificationResults: IQualificationResultsReader,
    private readonly tieBreakPolicies: ITeamTieBreakPolicyResolver,
    private readonly policy: ITeamResultPolicy = new IssfTeamResultPolicy(),
  ) {}

  async getQualification(eventId: string, format: TeamResultFormatDto): Promise<TeamResultDto[]> {
    const tieBreakPolicy = await this.tieBreakPolicies.resolve(eventId);
    const participants = this.participants
      .findByEventId(eventId)
      .filter((participant) => participant.officialEntry.teamId);
    const officialResults = await this.qualificationResults.getByEvent(eventId);
    const officialByParticipant = new Map(officialResults.map((result) => [result.participantId, result]));
    const sourceById = new Map(this.results.findByEventId(eventId).map((result) => [result.id.value, result]));
    const groups = new Map<string, typeof participants>();
    for (const participant of participants) {
      const teamId = participant.officialEntry.teamId!;
      const group = groups.get(teamId) ?? [];
      group.push(participant);
      groups.set(teamId, group);
    }

    const evaluated = [...groups.entries()].map(([teamId, members]) => {
      const teamNames = [...new Set(members.map((member) => member.officialEntry.teamName).filter(Boolean))];
      const result = this.policy.evaluate(
        {
          teamId,
          teamName: teamNames[0] ?? teamId,
          members: members.map((participant): TeamResultMemberInput => {
            const official = officialByParticipant.get(participant.id.value);
            const source = official ? sourceById.get(official.id) : undefined;
            return {
              participantId: participant.id.value,
              playerName: participant.playerName,
              familyName: participant.familyName,
              nationCode: participant.officialEntry.nationCode,
              gender: participant.officialEntry.gender,
              entryStatus: participant.officialEntry.entryStatus,
              totalScore: official?.totalScore ?? null,
              seriesScores: official?.seriesScores ?? [],
              rankingShots: source?.rankingShots ?? [],
              classificationCode: official?.classificationCode ?? null,
              decisionCount: official?.decisionCount ?? 0,
            };
          }),
        },
        format,
        tieBreakPolicy,
      );
      if (teamNames.length > 1) {
        return { ...result, eligible: false, issues: [...result.issues, 'Team members have inconsistent team names'] };
      }
      return result;
    });

    const eligible = evaluated.filter((team) => team.eligible).sort((a, b) => this.policy.compare(a, b));
    const ranked = eligible.map((team, index) => {
      const prior = eligible[index - 1];
      const rank =
        prior && this.policy.compare(prior, team) === 0 ? rankedRank(eligible, index, this.policy) : index + 1;
      return toDto(team, rank, hasUnresolvedTie(team, eligible, this.policy));
    });
    return [...ranked, ...evaluated.filter((team) => !team.eligible).map((team) => toDto(team, 0, false))];
  }
}

function rankedRank(teams: readonly EvaluatedTeamResult[], index: number, policy: ITeamResultPolicy): number {
  let first = index;
  while (first > 0 && policy.compare(teams[first - 1]!, teams[index]!) === 0) first -= 1;
  return first + 1;
}

function hasUnresolvedTie(
  team: EvaluatedTeamResult,
  teams: readonly EvaluatedTeamResult[],
  policy: ITeamResultPolicy,
): boolean {
  return teams.some((candidate) => candidate !== team && policy.compare(candidate, team) === 0);
}

function toDto(team: EvaluatedTeamResult, rank: number, unresolvedTie: boolean): TeamResultDto {
  return {
    rank,
    teamId: team.teamId,
    teamName: team.teamName,
    nationCode: team.nationCode,
    eligible: team.eligible,
    totalScore: team.totalScore,
    issues: team.issues,
    unresolvedTie,
    ruleReferences: 'ISSF 3.3.2.3 / 6.15.5 / 6.18.1.2, 6.18.2.7',
    tieEvidence: {
      innerTens: team.tieEvidence.innerTens,
      seriesTotals: team.tieEvidence.seriesTotals,
      manualReviewRequired: team.tieEvidence.manualReviewRequired,
    },
    members: team.members.map((member) => ({
      participantId: member.participantId,
      playerName: member.playerName,
      familyName: member.familyName,
      nationCode: member.nationCode,
      gender: member.gender,
      entryStatus: member.entryStatus,
      totalScore: member.totalScore,
      classificationCode: member.classificationCode,
      decisionCount: member.decisionCount,
    })),
  };
}
