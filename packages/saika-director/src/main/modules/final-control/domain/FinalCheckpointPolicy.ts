import { buildRoundConfig, totalShotsBeforeStage } from '@/shared/constants/roundConfig';
import type { CompetitionTypeDefinition } from '@/shared/competitionTypes';
import type { FinalCheckpointAssessmentDto, FinalControlLaneSnapshotDto } from '@/shared/ipc/contracts';

export interface FinalCheckpointPolicyInput {
  participantCount: number;
  lanes: readonly FinalControlLaneSnapshotDto[];
  completedRanks: ReadonlySet<number>;
}

/** Pure course-of-fire policy. MQTT, persistence and Jury identity stay outside it. */
export class FinalCheckpointPolicy {
  assess(definition: CompetitionTypeDefinition, input: FinalCheckpointPolicyInput): FinalCheckpointAssessmentDto {
    if (definition.config.name !== 'Final') {
      throw new Error(`${definition.id} is not a Final competition type`);
    }
    if (new Set(input.lanes.map((lane) => lane.laneId)).size !== input.lanes.length) {
      throw new Error('Final Lane snapshots must have unique Lane IDs');
    }
    if (input.lanes.length !== input.participantCount) {
      return inconsistent(
        input.lanes,
        `Expected ${input.participantCount} finalist snapshots; received ${input.lanes.length}`,
      );
    }

    const config = buildRoundConfig(definition, input.participantCount);
    const eliminationStageIndex = config.eliminationStageIndex;
    if (eliminationStageIndex === undefined) throw new Error(`${definition.id} has no elimination checkpoints`);
    const eliminationStage = config.stages[eliminationStageIndex]!;
    const shotsBefore = totalShotsBeforeStage(config, eliminationStageIndex);
    const checkpoints = Object.entries(config.eliminationSchedule)
      .map(([seriesIndexText, rank]) => {
        const seriesIndex = Number(seriesIndexText);
        const afterShot =
          shotsBefore +
          eliminationStage.series.slice(0, seriesIndex + 1).reduce((sum, series) => sum + series.shots, 0);
        return { seriesIndex, rank, afterShot };
      })
      .sort((left, right) => left.afterShot - right.afterShot);
    const next = checkpoints.find((checkpoint) => !input.completedRanks.has(checkpoint.rank));
    const active = input.lanes.filter((lane) => !lane.finished);
    const activeLaneIds = active.map((lane) => lane.laneId);
    if (!next) {
      return {
        status: 'COMPLETE',
        afterShot: null,
        expectedRank: null,
        activeLaneIds,
        candidateLaneIds: [],
        guidance: 'All configured Final checkpoints have a completed Lane command.',
      };
    }
    if (active.length !== next.rank) {
      return inconsistent(
        input.lanes,
        `Rank ${next.rank} checkpoint requires ${next.rank} active finalists; found ${active.length}`,
        next.afterShot,
        next.rank,
      );
    }
    const shotCounts = [...new Set(active.map((lane) => lane.totalShotCount))];
    if (shotCounts.length !== 1) {
      return inconsistent(
        input.lanes,
        `Active finalists do not have the same recorded shot count (${shotCounts.sort((a, b) => a - b).join(', ')})`,
        next.afterShot,
        next.rank,
      );
    }
    const shotCount = shotCounts[0] ?? 0;
    if (shotCount < next.afterShot) {
      return {
        status: 'NOT_DUE',
        afterShot: next.afterShot,
        expectedRank: next.rank,
        activeLaneIds,
        candidateLaneIds: [],
        guidance: `Next elimination is rank ${next.rank} after shot ${next.afterShot}; active finalists have ${shotCount}.`,
      };
    }
    if (shotCount > next.afterShot) {
      return inconsistent(
        input.lanes,
        `Rank ${next.rank} checkpoint after shot ${next.afterShot} was bypassed; active finalists have ${shotCount} shots`,
        next.afterShot,
        next.rank,
      );
    }
    const lowestScore = Math.min(...active.map((lane) => lane.totalScoreX10));
    const candidateLaneIds = active.filter((lane) => lane.totalScoreX10 === lowestScore).map((lane) => lane.laneId);
    const tied = candidateLaneIds.length > 1;
    return {
      status: tied ? 'TIE' : 'READY',
      afterShot: next.afterShot,
      expectedRank: next.rank,
      activeLaneIds,
      candidateLaneIds,
      guidance: tied
        ? `The lowest total is tied on ${candidateLaneIds.length} Lanes. Record the shoot-off or Jury resolution before retiring rank ${next.rank}.`
        : `Lane ${candidateLaneIds[0]} has the lowest total and may be retired as rank ${next.rank}.`,
    };
  }
}

function inconsistent(
  lanes: readonly FinalControlLaneSnapshotDto[],
  guidance: string,
  afterShot: number | null = null,
  expectedRank: number | null = null,
): FinalCheckpointAssessmentDto {
  return {
    status: 'INCONSISTENT',
    afterShot,
    expectedRank,
    activeLaneIds: lanes.filter((lane) => !lane.finished).map((lane) => lane.laneId),
    candidateLaneIds: [],
    guidance,
  };
}
