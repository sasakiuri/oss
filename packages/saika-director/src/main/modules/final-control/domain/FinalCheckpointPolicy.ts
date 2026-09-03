import { buildRoundConfig, totalShotsBeforeStage } from '@/shared/constants/roundConfig';
import type { CompetitionTypeDefinition } from '@/shared/competitionTypes';
import type { FinalCheckpointAssessmentDto, FinalControlLaneSnapshotDto } from '@/shared/ipc/contracts';
import type { FinalCountbackCriterion, FinalTieResolutionPolicy } from '@sasakiuri/saika-rules';

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
    const ruleReference = formatRuleReference(definition.resultFormat.finalRuleReference);
    if (new Set(input.lanes.map((lane) => lane.laneId)).size !== input.lanes.length) {
      throw new Error('Final Lane snapshots must have unique Lane IDs');
    }
    if (input.lanes.length !== input.participantCount) {
      return inconsistent(
        input.lanes,
        `Expected ${input.participantCount} finalist snapshots; received ${input.lanes.length}`,
        ruleReference,
      );
    }

    const explicitCheckpoints = definition.resultFormat.finalCheckpoints;
    const config = buildRoundConfig(definition, input.participantCount);
    const checkpoints = explicitCheckpoints
      ? explicitCheckpoints.map((checkpoint) => ({
          seriesIndex: -1,
          rank: checkpoint.rank,
          afterShot: checkpoint.afterMatchShot,
          tieResolution: checkpoint.tieResolution,
        }))
      : derivedCheckpoints(config, definition.id);
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
        resolutionRequirement: null,
        ruleReference,
        guidance: 'All configured Final checkpoints have a completed Lane command.',
      };
    }
    if (active.length !== next.rank) {
      return inconsistent(
        input.lanes,
        `Rank ${next.rank} checkpoint requires ${next.rank} active finalists; found ${active.length}`,
        ruleReference,
        next.afterShot,
        next.rank,
      );
    }
    const shotCounts = [...new Set(active.map((lane) => lane.totalShotCount))];
    if (shotCounts.length !== 1) {
      return inconsistent(
        input.lanes,
        `Active finalists do not have the same recorded shot count (${shotCounts.sort((a, b) => a - b).join(', ')})`,
        ruleReference,
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
        resolutionRequirement: null,
        ruleReference,
        guidance: `Next elimination is rank ${next.rank} after shot ${next.afterShot}; active finalists have ${shotCount}.`,
      };
    }
    if (shotCount > next.afterShot) {
      return inconsistent(
        input.lanes,
        `Rank ${next.rank} checkpoint after shot ${next.afterShot} was bypassed; active finalists have ${shotCount} shots`,
        ruleReference,
        next.afterShot,
        next.rank,
      );
    }
    const lowestScore = Math.min(...active.map((lane) => lane.totalScoreX10));
    const candidateLaneIds = active.filter((lane) => lane.totalScoreX10 === lowestScore).map((lane) => lane.laneId);
    const tied = candidateLaneIds.length > 1;
    if (tied && next.tieResolution?.type === 'FINAL_START_NUMBER') {
      const tieResolution = next.tieResolution;
      const candidates = active.filter((lane) => candidateLaneIds.includes(lane.laneId));
      const startNumbers = candidates.map((lane) => lane.finalStartNumber);
      if (
        startNumbers.some((startNumber) => startNumber === undefined) ||
        new Set(startNumbers).size !== startNumbers.length
      ) {
        return inconsistent(
          input.lanes,
          'The Finals Start Number tie-break requires a unique Start Number for every tied finalist.',
          ruleReference,
          next.afterShot,
          next.rank,
        );
      }
      const lower = [...candidates].sort((left, right) => {
        const direction = tieResolution.lowerNumberRanksHigher ? -1 : 1;
        return direction * (left.finalStartNumber! - right.finalStartNumber!);
      })[0]!;
      return {
        status: 'READY',
        afterShot: next.afterShot,
        expectedRank: next.rank,
        activeLaneIds,
        candidateLaneIds: [lower.laneId],
        resolutionRequirement: 'FINAL_START_NUMBER',
        ruleReference,
        guidance: `Lane ${lower.laneId} is rank ${next.rank} by Finals Start Number ${lower.finalStartNumber}.`,
      };
    }
    if (tied && next.tieResolution?.type === 'COUNTBACK_FOR_EXACT_TIE') {
      if (candidateLaneIds.length === next.tieResolution.athleteCount) {
        const countback = resolveCountback(
          active.filter((lane) => candidateLaneIds.includes(lane.laneId)),
          definition,
          next.tieResolution,
        );
        if (countback.status === 'MISSING_DATA') {
          return inconsistent(input.lanes, countback.guidance, ruleReference, next.afterShot, next.rank);
        }
        if (countback.status === 'RESOLVED') {
          return {
            status: 'READY',
            afterShot: next.afterShot,
            expectedRank: next.rank,
            activeLaneIds,
            candidateLaneIds: [countback.lowerLaneId],
            resolutionRequirement: 'COUNTBACK',
            ruleReference,
            guidance: countback.guidance,
          };
        }
      }
    }
    return {
      status: tied ? 'TIE' : 'READY',
      afterShot: next.afterShot,
      expectedRank: next.rank,
      activeLaneIds,
      candidateLaneIds,
      resolutionRequirement: tied ? 'SHOOT_OFF_OR_JURY' : 'CLEAR_LOWEST',
      ruleReference,
      guidance: tied
        ? `The lowest total is tied on ${candidateLaneIds.length} Lanes. Record the shoot-off or Jury resolution before retiring rank ${next.rank}.`
        : `Lane ${candidateLaneIds[0]} has the lowest total and may be retired as rank ${next.rank}.`,
    };
  }
}

type CountbackOutcome =
  | { readonly status: 'RESOLVED'; readonly lowerLaneId: string; readonly guidance: string }
  | { readonly status: 'STILL_TIED' | 'MISSING_DATA'; readonly guidance: string };

function resolveCountback(
  lanes: readonly FinalControlLaneSnapshotDto[],
  definition: CompetitionTypeDefinition,
  policy: Extract<FinalTieResolutionPolicy, { type: 'COUNTBACK_FOR_EXACT_TIE' }>,
): CountbackOutcome {
  if (lanes.length !== 2) return { status: 'STILL_TIED', guidance: 'The configured countback does not apply.' };
  const left = countbackVector(lanes[0]!, definition, policy.criteria);
  const right = countbackVector(lanes[1]!, definition, policy.criteria);
  if (!left || !right || left.length !== right.length) {
    return {
      status: 'MISSING_DATA',
      guidance: 'The exact two-athlete countback requires complete per-series and per-shot score evidence.',
    };
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue;
    const lower = left[index]! < right[index]! ? lanes[0]! : lanes[1]!;
    return {
      status: 'RESOLVED',
      lowerLaneId: lower.laneId,
      guidance: `Lane ${lower.laneId} is rank ${definition.resultFormat.finalCheckpoints?.[0]?.rank ?? 8} by the required ISSF countback.`,
    };
  }
  return {
    status: 'STILL_TIED',
    guidance: 'The two finalists remain tied after every configured countback criterion; conduct a shoot-off.',
  };
}

function countbackVector(
  lane: FinalControlLaneSnapshotDto,
  definition: CompetitionTypeDefinition,
  criteria: readonly FinalCountbackCriterion[],
): number[] | null {
  const vector: number[] = [];
  for (const criterion of criteria) {
    const stageIndex = definition.config.stages.findIndex((stage) => stage.id === criterion.stageId);
    if (stageIndex < 0) return null;
    const stage = lane.scoreBreakdown?.find((candidate) => candidate.stageIndex === stageIndex);
    const series = stage?.series.find((candidate) => candidate.seriesIndex === criterion.seriesIndex);
    if (!series) return null;
    if (criterion.type === 'SERIES_TOTAL') vector.push(series.seriesTotalX10);
    else {
      if (series.shotsX10.length === 0) return null;
      vector.push(...[...series.shotsX10].reverse());
    }
  }
  return vector;
}

function derivedCheckpoints(config: ReturnType<typeof buildRoundConfig>, definitionId: string) {
  const eliminationStageIndex = config.eliminationStageIndex;
  if (eliminationStageIndex === undefined) throw new Error(`${definitionId} has no elimination checkpoints`);
  const eliminationStage = config.stages[eliminationStageIndex]!;
  const shotsBefore = totalShotsBeforeStage(config, eliminationStageIndex);
  return Object.entries(config.eliminationSchedule)
    .map(([seriesIndexText, rank]) => {
      const seriesIndex = Number(seriesIndexText);
      const afterShot =
        shotsBefore + eliminationStage.series.slice(0, seriesIndex + 1).reduce((sum, series) => sum + series.shots, 0);
      return { seriesIndex, rank, afterShot, tieResolution: undefined };
    })
    .sort((left, right) => left.afterShot - right.afterShot || right.rank - left.rank);
}

function inconsistent(
  lanes: readonly FinalControlLaneSnapshotDto[],
  guidance: string,
  ruleReference: string,
  afterShot: number | null = null,
  expectedRank: number | null = null,
): FinalCheckpointAssessmentDto {
  return {
    status: 'INCONSISTENT',
    afterShot,
    expectedRank,
    activeLaneIds: lanes.filter((lane) => !lane.finished).map((lane) => lane.laneId),
    candidateLaneIds: [],
    resolutionRequirement: null,
    ruleReference,
    guidance,
  };
}

function formatRuleReference(reference: string | undefined): string {
  return reference ? `ISSF ${reference}` : 'Competition definition';
}
