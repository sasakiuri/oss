import type { CompetitionTypeDefinition } from '@/shared/competitionTypes';
import type { MixedTeamFinalAssessmentDto, MixedTeamFinalSnapshotDto } from '@/shared/ipc/contracts';

export class MixedTeamFinalCheckpointPolicy {
  assess(
    definition: CompetitionTypeDefinition,
    input: { teams: readonly MixedTeamFinalSnapshotDto[]; completedRanks: ReadonlySet<number> },
  ): MixedTeamFinalAssessmentDto {
    if (definition.config.name !== 'Final' || definition.teamFormat !== 'MIXED_PAIR') {
      throw new Error(`${definition.id} is not a Mixed Team Final`);
    }
    const expectedTeams = (definition.config.maxParticipants ?? 0) / 2;
    if (!Number.isInteger(expectedTeams) || expectedTeams < 2 || input.teams.length !== expectedTeams) {
      return inconsistent(input.teams, `Mixed Team Final requires ${expectedTeams} teams; found ${input.teams.length}`);
    }
    if (new Set(input.teams.map((team) => team.teamId)).size !== input.teams.length) {
      return inconsistent(input.teams, 'Mixed Team IDs must be unique');
    }
    for (const team of input.teams) {
      if (team.members.length !== 2)
        return inconsistent(input.teams, `${team.teamName} does not have two Lane members`);
      if (new Set(team.members.map((member) => member.laneId)).size !== 2) {
        return inconsistent(input.teams, `${team.teamName} member Lane IDs are not unique`);
      }
      const genders = team.members.map((member) => member.gender);
      if (!(genders.includes('F') && genders.includes('M'))) {
        return inconsistent(input.teams, `${team.teamName} must contain one female and one male athlete`);
      }
      if (!team.nationCode) return inconsistent(input.teams, `${team.teamName} has no nation code`);
      const memberFinished = team.members.map((member) => member.finished);
      if (memberFinished.some(Boolean) && !memberFinished.every(Boolean)) {
        return inconsistent(input.teams, `${team.teamName} has a partially completed retirement command`);
      }
    }

    const checkpoints = checkpointsFromDefinition(definition, expectedTeams);
    const next = checkpoints.find((checkpoint) => !input.completedRanks.has(checkpoint.rank));
    const active = input.teams.filter((team) => team.members.every((member) => !member.finished));
    const activeTeamIds = active.map((team) => team.teamId);
    if (!next)
      return {
        status: 'COMPLETE',
        afterShot: null,
        expectedRank: null,
        activeTeamIds,
        candidateTeamIds: [],
        guidance: 'All Mixed Team medal checkpoints have completed Lane commands.',
      };
    if (active.length !== next.rank) {
      return inconsistent(
        input.teams,
        `Rank ${next.rank} checkpoint requires ${next.rank} active teams; found ${active.length}`,
        next,
      );
    }
    const shotCounts = [...new Set(active.flatMap((team) => team.members.map((member) => member.totalShotCount)))];
    if (shotCounts.length !== 1) {
      return inconsistent(
        input.teams,
        `Active team members have different shot counts (${shotCounts.sort((a, b) => a - b).join(', ')})`,
        next,
      );
    }
    const shotCount = shotCounts[0] ?? 0;
    if (shotCount < next.afterShot)
      return {
        status: 'NOT_DUE',
        afterShot: next.afterShot,
        expectedRank: next.rank,
        activeTeamIds,
        candidateTeamIds: [],
        guidance: `Next team elimination is rank ${next.rank} after shot ${next.afterShot}; athletes have ${shotCount}.`,
      };
    if (shotCount > next.afterShot) {
      return inconsistent(input.teams, `Rank ${next.rank} checkpoint after shot ${next.afterShot} was bypassed`, next);
    }
    const totals = active.map((team) => ({
      teamId: team.teamId,
      total: team.members.reduce((sum, member) => sum + member.totalScoreX10, 0),
    }));
    const lowest = Math.min(...totals.map((team) => team.total));
    const candidateTeamIds = totals.filter((team) => team.total === lowest).map((team) => team.teamId);
    const tied = candidateTeamIds.length > 1;
    return {
      status: tied ? 'TIE' : 'READY',
      afterShot: next.afterShot,
      expectedRank: next.rank,
      activeTeamIds,
      candidateTeamIds,
      guidance: tied
        ? `The lowest combined total is tied. Record the team shoot-off or Jury resolution for rank ${next.rank}.`
        : `${candidateTeamIds[0]} has the lowest combined total and may be retired as rank ${next.rank}.`,
    };
  }
}

function checkpointsFromDefinition(definition: CompetitionTypeDefinition, teamCount: number) {
  const stage1Shots = definition.resultFormat.stage1Shots ?? 0;
  const stage = definition.config.stages.find((candidate) => candidate.elimination);
  if (!stage?.elimination) throw new Error(`${definition.id} has no Mixed Team elimination stage`);
  const interval = stage.elimination.checkpointEverySeries ?? 1;
  const checkpointCount = teamCount - 1;
  const lastIndex = stage.series.length - 1;
  const firstIndex = lastIndex - interval * (checkpointCount - 1);
  return Array.from({ length: checkpointCount }, (_, offset) => {
    const seriesIndex = firstIndex + offset * interval;
    return {
      rank: teamCount - offset,
      afterShot: stage1Shots + stage.series.slice(0, seriesIndex + 1).reduce((sum, series) => sum + series.shots, 0),
    };
  });
}

function inconsistent(
  teams: readonly MixedTeamFinalSnapshotDto[],
  guidance: string,
  checkpoint?: { afterShot: number; rank: number },
): MixedTeamFinalAssessmentDto {
  return {
    status: 'INCONSISTENT',
    afterShot: checkpoint?.afterShot ?? null,
    expectedRank: checkpoint?.rank ?? null,
    activeTeamIds: teams.filter((team) => team.members.every((member) => !member.finished)).map((team) => team.teamId),
    candidateTeamIds: [],
    guidance,
  };
}
