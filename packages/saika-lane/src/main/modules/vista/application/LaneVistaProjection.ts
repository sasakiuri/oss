// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';

import {
  VistaDefinitionSchema,
  VistaSnapshotSchema,
  type VistaDefinition,
  type VistaSnapshot,
} from '@sasakiuri/saika-protocol/Vista';

import { resolveCompetitionShotMode } from '@/main/modules/competition/domain/CompetitionShotModePolicy';
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { ALL_COMPETITION_TYPES } from '@/main/modules/competition/domain/competitionTypes';
import type { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import type { Session } from '@/main/modules/session/domain/Session';
import { getDefaultTargetScoringProfile, getScoringGaugeProfile } from '@/shared/target';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** Exact standard configuration matching prevents custom rules from masquerading as a supported event. */
export function laneVistaDefinition(competition: CompetitionState, session: Session): VistaDefinition | null {
  const standard = ALL_COMPETITION_TYPES.find(
    (candidate) =>
      candidate.discipline === session.discipline.value &&
      canonical(candidate.config) === canonical(competition.config),
  );
  if (
    !standard ||
    !['AR60', 'AP60', 'BR60S', 'BP60', 'AR60_FINAL', 'AP60_FINAL', 'BR60S_FINAL', 'BP60_FINAL'].includes(standard.id)
  )
    return null;
  const profile = getDefaultTargetScoringProfile(session.discipline.value);
  const rifle = session.discipline.value.includes('RIFLE');
  const target = {
    profileId: profile.id,
    unit: 'mm' as const,
    origin: 'center' as const,
    xDirection: 'right' as const,
    yDirection: 'up' as const,
    rings: profile.ringLines.map((ring) => ({ score: ring.score, diameter: ring.radiusMm * 2 })),
    blackDiameter: (profile.ringLines.find((ring) => ring.score === (rifle ? 4 : 7))?.radiusMm ?? 0) * 2,
    outerDiameter: Math.max(...profile.ringLines.map((ring) => ring.radiusMm)) * 2,
    shotDiameter: getScoringGaugeProfile(profile.defaultScoringGaugeProfileId).diameterMm,
  };
  const fingerprint = createHash('sha256').update(canonical({ standard, target })).digest('hex');
  return VistaDefinitionSchema.parse({
    id: standard.rulePackId ?? `JRSF-2026:${standard.id}`,
    fingerprint,
    eventCode: standard.id,
    name: standard.name,
    scoring: standard.config.acc,
    target,
    stages: standard.config.stages.map((stage) => ({
      name: stage.name,
      scored: stage.scored,
      seriesShots: stage.series.filter((series) => series.maxShots > 0).map((series) => series.maxShots),
    })),
  });
}

export interface LaneVistaShotContext {
  stage: number;
  series: number;
}

export function projectLaneVista(input: {
  sourceId: string;
  competition: CompetitionState;
  session: Session;
  history: Array<{
    session: Session;
    stage: number;
    shotContexts: ReadonlyMap<string, LaneVistaShotContext>;
    shootOffSeries: ReadonlyMap<string, number>;
  }>;
  historyComplete: boolean;
  definition: VistaDefinition;
  generation: string;
  revision: number;
  laneName: string;
  clock: VistaSnapshot['clock'];
  interruption: LaneInterruptionRecord | null;
  shootOffSeries: number | null;
}): VistaSnapshot {
  const { competition, definition } = input;
  let sequence = 0;
  const shots = input.history.flatMap(({ session: historySession, shotContexts, shootOffSeries }) =>
    historySession.allShots.map((shot) => {
      const mode = shootOffSeries.has(shot.id)
        ? ('shoot-off' as const)
        : shot.mode.isMatch()
          ? ('match' as const)
          : ('sighting' as const);
      // Session groups stay ten shots wide, including during five-shot and
      // single-shot finals. Only the acquisition journal proves rule positions;
      // counting shots would also shift every later series after a missed shot.
      const context = shotContexts.get(shot.id);
      return {
        id: shot.id,
        sequence: ++sequence,
        x: shot.impactPoint?.x ?? null,
        y: shot.impactPoint?.y ?? null,
        score: shot.score.value / 10,
        mode,
        stage: context?.stage ?? null,
        series: context ? (shootOffSeries.get(shot.id) ?? context.series) : null,
        recorded: mode === 'match' || mode === 'shoot-off',
        corrected: false,
      };
    }),
  );
  const matchShots = shots.filter((shot) => shot.recorded && shot.mode === 'match');
  const unassignedMatchShots = matchShots.some((shot) => shot.stage === null || shot.series === null);
  const seriesTotals = new Map<string, { stage: number; index: number; total: number }>();
  for (const shot of matchShots) {
    if (shot.stage === null || shot.series === null) continue;
    const key = `${shot.stage}:${shot.series}`;
    const entry = seriesTotals.get(key) ?? { stage: shot.stage, index: shot.series, total: 0 };
    entry.total = Math.round((entry.total + shot.score) * 10) / 10;
    seriesTotals.set(key, entry);
  }
  return VistaSnapshotSchema.parse({
    protocolVersion: 1,
    sourceId: input.sourceId,
    subjectId: competition.id,
    generation: input.generation,
    revision: input.revision,
    capturedAt: Date.now(),
    label: `${input.laneName} · ${definition.name}`,
    phase: competition.phase,
    finished: competition.phase === 'FINISHED',
    definition,
    clock: input.clock,
    ranking: null,
    participants: [
      {
        id: input.sourceId,
        laneId: input.sourceId,
        laneName: input.laneName,
        name: null,
        affiliation: null,
        assignmentRevision: competition.id,
        status: competition.phase,
        total: Math.round(matchShots.reduce((sum, shot) => sum + shot.score, 0) * 10) / 10,
        shotCount: matchShots.length,
        currentStage: competition.currentStageIndex,
        currentSeries: input.shootOffSeries ?? competition.currentSeriesIndex,
        mode:
          input.shootOffSeries !== null
            ? 'shoot-off'
            : input.interruption?.status === 'SIGHTING' ||
                (input.interruption?.status === 'RESUME_PENDING' && input.interruption.unlimitedSightingShots)
              ? 'sighting'
              : resolveCompetitionShotMode(
                    competition.currentStageConfig,
                    competition.currentSeriesConfig,
                    undefined,
                  ) === 'MATCH'
                ? 'match'
                : 'sighting',
        series: [...seriesTotals.values()].map((series) => ({
          ...series,
          total: unassignedMatchShots ? null : series.total,
        })),
        shots,
        historyComplete: input.historyComplete && shots.every((shot) => shot.stage !== null && shot.series !== null),
        dataState: competition.phase === 'FINISHED' ? 'saved' : 'live',
        clock: input.clock,
      },
    ],
  });
}
