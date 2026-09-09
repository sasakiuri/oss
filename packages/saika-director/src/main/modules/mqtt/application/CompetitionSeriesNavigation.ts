// SPDX-License-Identifier: MIT
import type { CompetitionTypeDefinition } from '@/shared/competitionTypes';

export function getLaneCompetitionMetadata(definition: CompetitionTypeDefinition): {
  discipline: string;
  acc: 'RING' | 'DECIMAL';
} {
  if (!definition.laneProtocol) {
    throw new Error(`Competition type ${definition.id} is not supported by the current Saika Lane MQTT API`);
  }
  return definition.laneProtocol;
}

export function getNextSeriesTimer(
  definition: CompetitionTypeDefinition,
  stageIndex: number,
  seriesIndex: number,
): { durationSeconds: number; stageIndex: number; seriesIndex: number } | undefined {
  const sourceStage = definition.config.stages[stageIndex];
  if (!sourceStage?.series[seriesIndex]) throw new Error(`Series ${stageIndex}:${seriesIndex} is not configured`);
  const nextStageIndex = seriesIndex + 1 < sourceStage.series.length ? stageIndex : stageIndex + 1;
  const nextSeriesIndex = seriesIndex + 1 < sourceStage.series.length ? seriesIndex + 1 : 0;
  const nextStage = definition.config.stages[nextStageIndex];
  if (!nextStage?.series[nextSeriesIndex]) return undefined;
  if (nextStage.series[nextSeriesIndex]?.timedTargetProgramId) return undefined;
  if (nextStage.timer.mode === 'stage') return undefined;
  return { durationSeconds: nextStage.timer.durationSec, stageIndex: nextStageIndex, seriesIndex: nextSeriesIndex };
}

export function getPreviousSeriesPosition(
  definition: CompetitionTypeDefinition,
  target: { stageIndex: number; seriesIndex: number },
): { stageIndex: number; seriesIndex: number } | null {
  const targetStage = definition.config.stages[target.stageIndex];
  if (!targetStage?.series[target.seriesIndex] || targetStage.type !== 'match') {
    throw new Error(`Final script target ${target.stageIndex}:${target.seriesIndex} is not configured`);
  }
  const firstMatchStageIndex = definition.config.stages.findIndex((stage) => stage.type === 'match');
  if (target.stageIndex === firstMatchStageIndex && target.seriesIndex === 0) return null;
  if (target.seriesIndex > 0) return { stageIndex: target.stageIndex, seriesIndex: target.seriesIndex - 1 };

  for (let stageIndex = target.stageIndex - 1; stageIndex >= firstMatchStageIndex; stageIndex -= 1) {
    const stage = definition.config.stages[stageIndex];
    if (stage?.type === 'match' && stage.series.length > 0) {
      return { stageIndex, seriesIndex: stage.series.length - 1 };
    }
  }
  throw new Error(`Final script target ${target.stageIndex}:${target.seriesIndex} has no preceding MATCH series`);
}
