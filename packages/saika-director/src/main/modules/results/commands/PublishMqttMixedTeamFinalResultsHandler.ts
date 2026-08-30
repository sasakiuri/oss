import {
  GetEventByIdToken,
  GetFiringPointAssignmentsByRelayToken,
  type GetEventByIdResponse,
} from '@/main/modules/championship';
import type { IMixedTeamFinalControlRepository } from '@/main/modules/mixed-team-final-control';
import type {
  IMixedTeamFinalResultRepository,
  MixedTeamFinalMemberResult,
  MixedTeamFinalResultRecord,
} from '@/main/modules/team-results';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { PublishResultsResponse } from '@/shared/ipc/contracts';
import type { LaneScorePayload } from '@/shared/mqtt';

import type { PublishMqttResultLane, PublishMqttResultsCommand } from './PublishMqttResults';

interface PreparedMember extends MixedTeamFinalMemberResult {
  laneId: string;
  teamId: string;
  teamName: string;
  nationCode: string;
}

/**
 * Builds team-level Final results from immutable Lane score snapshots and the
 * independent Mixed Team checkpoint ledger. It never infers an official rank
 * from score alone.
 */
export class PublishMqttMixedTeamFinalResultsHandler {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly repository: IMixedTeamFinalResultRepository,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly finalControl: IMixedTeamFinalControlRepository,
  ) {}

  async execute(command: PublishMqttResultsCommand): Promise<PublishResultsResponse> {
    const event = (await this.queryBus.execute(GetEventByIdToken, {
      eventId: command.eventId,
    })) as GetEventByIdResponse | null;
    if (!event) return failure(`Event ${command.eventId} not found`);
    if (event.eventType !== command.competitionTypeId) {
      return failure(`Event uses ${event.eventType}, but competition uses ${command.competitionTypeId}`);
    }

    const definition = this.competitionTypes.get(command.competitionTypeId);
    if (definition.config.name !== 'Final' || definition.teamFormat !== 'MIXED_PAIR') {
      return failure(`${definition.id} is not a Mixed Team Final`);
    }
    const expectedTeamCount = (definition.config.maxParticipants ?? 0) / 2;
    if (!Number.isInteger(expectedTeamCount) || expectedTeamCount < 2) {
      return failure(`${definition.id} does not define a valid Mixed Team Final field`);
    }
    if (command.lanes.length !== expectedTeamCount * 2) {
      return failure(
        `Mixed Team Final requires ${expectedTeamCount * 2} Lane snapshots; found ${command.lanes.length}`,
      );
    }

    const assignments = await this.queryBus.execute(GetFiringPointAssignmentsByRelayToken, {
      eventId: command.eventId,
      relayNumber: command.relayNumber,
    });
    if (assignments.length !== command.lanes.length) {
      return failure(
        `Final relay has ${assignments.length} firing-point assignments, but ${command.lanes.length} Lane snapshots were supplied`,
      );
    }
    const assignmentByParticipant = new Map(assignments.map((assignment) => [assignment.participantId, assignment]));

    const decisions = this.finalControl
      .findByCompetition(command.competitionId)
      .filter((decision) => !decision.voided && decision.commandCompleted);
    const decisionByRank = new Map(decisions.map((decision) => [decision.rank, decision]));
    for (let rank = expectedTeamCount; rank >= 2; rank -= 1) {
      const decision = decisionByRank.get(rank);
      if (!decision) return failure(`Mixed Team Final rank ${rank} has no completed checkpoint command`);
      if (decision.eventId && decision.eventId !== command.eventId) {
        return failure(`Mixed Team Final rank ${rank} checkpoint is linked to another event`);
      }
      if (decision.competitionTypeId !== command.competitionTypeId) {
        return failure(`Mixed Team Final rank ${rank} checkpoint uses another competition type`);
      }
    }
    if (decisionByRank.size !== expectedTeamCount - 1) {
      return failure('Mixed Team Final checkpoint history contains duplicate or unexpected ranks');
    }
    const decisionByTeamId = new Map(decisions.map((decision) => [decision.selectedTeamId, decision]));
    if (decisionByTeamId.size !== expectedTeamCount - 1) {
      return failure('Mixed Team Final checkpoint history does not identify each placed team exactly once');
    }

    const expectedAcc = definition.scoring.precision === 0 ? 'RING' : 'DECIMAL';
    const stage1ShotCount = definition.resultFormat.stage1Shots ?? 0;
    const seenParticipants = new Set<string>();
    const membersByTeamId = new Map<string, PreparedMember[]>();
    for (const lane of command.lanes) {
      const prepared = prepareMember(
        lane,
        command.competitionId,
        expectedAcc,
        stage1ShotCount,
        assignmentByParticipant,
      );
      if (typeof prepared === 'string') return failure(prepared);
      if (seenParticipants.has(prepared.participantId)) {
        return failure(`Participant ${prepared.participantId} is assigned more than once`);
      }
      seenParticipants.add(prepared.participantId);
      const members = membersByTeamId.get(prepared.teamId) ?? [];
      members.push(prepared);
      membersByTeamId.set(prepared.teamId, members);
    }

    if (membersByTeamId.size !== expectedTeamCount) {
      return failure(`Mixed Team Final requires ${expectedTeamCount} distinct teams; found ${membersByTeamId.size}`);
    }
    const remainingTeamIds = [...membersByTeamId.keys()].filter((teamId) => !decisionByTeamId.has(teamId));
    if (remainingTeamIds.length !== 1) {
      return failure(`Mixed Team Final history must leave one winner; found ${remainingTeamIds.length}`);
    }

    const now = new Date().toISOString();
    const results: MixedTeamFinalResultRecord[] = [];
    for (const [teamId, members] of membersByTeamId) {
      if (members.length !== 2) return failure(`Team ${teamId} does not have exactly two Lane members`);
      const genders = new Set(members.map((member) => member.gender));
      if (!genders.has('F') || !genders.has('M')) {
        return failure(`Team ${teamId} must contain one female and one male athlete`);
      }
      if (new Set(members.map((member) => member.teamName)).size !== 1) {
        return failure(`Team ${teamId} has inconsistent team names`);
      }
      if (new Set(members.map((member) => member.nationCode)).size !== 1) {
        return failure(`Team ${teamId} has inconsistent nation codes`);
      }

      const decision = decisionByTeamId.get(teamId);
      const rank = decision?.rank ?? 1;
      const expectedShots = decision?.afterShot ?? definition.resultFormat.totalShots;
      if (members.some((member) => member.stage1Shots.length + member.stage2Shots.length !== expectedShots)) {
        return failure(`Team ${teamId} rank ${rank} requires ${expectedShots} shots from each athlete`);
      }
      if (decision) {
        const expectedLanes = [...decision.memberLaneIds].sort();
        const actualLanes = members.map((member) => member.laneId).sort();
        if (!sameStrings(expectedLanes, actualLanes)) {
          return failure(`Team ${teamId} Lane members do not match the rank ${rank} checkpoint command`);
        }
      }

      const publicMembers = members
        .map(({ laneId: _laneId, teamId: _teamId, teamName: _teamName, nationCode: _nationCode, ...member }) => member)
        .sort((left, right) => genderOrder(left.gender) - genderOrder(right.gender));
      const stage1Total = sum(publicMembers.flatMap((member) => member.stage1Shots));
      const stage2Total = sum(publicMembers.flatMap((member) => member.stage2Shots));
      results.push({
        id: crypto.randomUUID(),
        eventId: command.eventId,
        sourceCompetitionId: command.competitionId,
        teamId,
        teamName: members[0]!.teamName,
        nationCode: members[0]!.nationCode,
        members: publicMembers,
        stage1Total,
        stage2Total,
        totalScore: stage1Total + stage2Total,
        finalRank: rank,
        eliminatedAtShot: decision?.afterShot ?? null,
        shootoffId: decision?.resolution === 'SHOOT_OFF' ? decision.id : null,
        remarks: decision?.resolutionStatement ?? '',
        createdAt: now,
      });
    }

    this.repository.replaceByEvent(command.eventId, results);
    return { savedCount: results.length, errors: [] };
  }
}

function prepareMember(
  lane: PublishMqttResultLane,
  competitionId: string,
  expectedAcc: 'RING' | 'DECIMAL',
  stage1ShotCount: number,
  assignments: Map<
    string,
    { firingPointNumber: number; participantId: string; playerName: string; familyName: string; affiliation: string }
  >,
): PreparedMember | string {
  const athlete = lane.assignment?.competitionId === competitionId ? lane.assignment.athlete : null;
  const score = lane.score?.competitionId === competitionId ? lane.score : null;
  if (!athlete) return `Lane ${lane.laneId} has no tournament athlete assigned`;
  if (!score) return `Lane ${lane.laneId} has no final score snapshot`;
  if (!athlete.teamId || !athlete.teamName) return `Lane ${lane.laneId} athlete has no official Mixed Team identity`;
  if (!athlete.nationCode) return `Lane ${lane.laneId} athlete has no official nation code`;
  if (!athlete.gender) return `Lane ${lane.laneId} athlete has no official gender`;
  if (score.acc !== expectedAcc) return `Lane ${lane.laneId} scoring mode does not match the Mixed Team Final`;
  const assignment = assignments.get(athlete.id);
  if (!assignment) return `Participant ${athlete.id} is not in the linked Final firing-point plan`;
  const shots = flattenShots(score);
  if (shots.length !== score.totalShotCount) return `Lane ${lane.laneId} score snapshot is incomplete`;
  const stage1Shots = shots.slice(0, stage1ShotCount);
  const stage2Shots = shots.slice(stage1ShotCount);
  return {
    laneId: lane.laneId,
    teamId: athlete.teamId,
    teamName: athlete.teamName,
    nationCode: athlete.nationCode,
    participantId: athlete.id,
    playerName: assignment.playerName,
    gender: athlete.gender,
    firingPointNumber: assignment.firingPointNumber,
    stage1Shots,
    stage2Shots,
    totalScore: score.totalScoreX10 / 10,
  };
}

function flattenShots(score: LaneScorePayload): number[] {
  return [...score.stages]
    .sort((left, right) => left.stageIndex - right.stageIndex)
    .flatMap((stage) =>
      [...stage.series]
        .sort((left, right) => left.seriesIndex - right.seriesIndex)
        .flatMap((series) => series.shots.map((shot) => shot / 10)),
    );
}

function genderOrder(gender: MixedTeamFinalMemberResult['gender']): number {
  if (gender === 'F') return 0;
  if (gender === 'M') return 1;
  return 2;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function failure(message: string): PublishResultsResponse {
  return { savedCount: 0, errors: [message] };
}
