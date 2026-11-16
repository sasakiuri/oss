// SPDX-License-Identifier: MIT
import { classificationSuppressesScore } from '@/shared/utils/resultClassification';
import type { VistaParticipant, VistaSnapshot } from '@sasakiuri/saika-protocol/Vista';

import type { CompetitionShotObservation } from '@/main/modules/mqtt';
import { assembleRankingEvidence } from '@/main/modules/results';
import type { CompetitionTypeRegistry, QualificationRankingInput } from '@/shared/competitionTypes';
import type { ResultBoardSnapshotDto } from '@/shared/ipc/contracts';

import { vistaDigest } from './directorVistaDefinition';
import {
  missingResetOperations,
  type CanonicalSnapshot,
  type DirectorVistaResultProjection,
  type Lane,
  type SavedSource,
  type VistaOperations,
} from './VistaSourceModel';
import type { VistaLinkedResult, VistaParticipantRecord } from './VistaSourceStore';

/** The data a projection reads; the coordinator answers from the store, journal and operation history. */
export interface VistaProjectionReaders {
  readonly registry: CompetitionTypeRegistry;
  readonly now: () => number;
  observations(source: SavedSource): CompetitionShotObservation[];
  operations(competitionId: string): VistaOperations;
  participant(id: string): VistaParticipantRecord | null;
  resultLinks(source: SavedSource): VistaLinkedResult[];
}

/** Projects a saved competition source into Vista participants, rankings and clocks. */
export class VistaSnapshotProjector {
  constructor(private readonly readers: VistaProjectionReaders) {}

  publicScores(snapshot: CanonicalSnapshot): CanonicalSnapshot {
    const publicRanking = (ranking: VistaSnapshot['ranking']) => {
      if (!ranking) return null;
      const rows = ranking.rows.map((row) =>
        classificationSuppressesScore(row.classification) ? { ...row, total: null } : row,
      );
      if (rows.every((row, index) => row.total === ranking.rows[index]!.total)) return ranking;
      const next = { ...ranking, rows, revision: '' };
      return { ...next, revision: vistaDigest(next) };
    };
    return {
      ...snapshot,
      participants: snapshot.participants.map((participant) =>
        classificationSuppressesScore(participant.status)
          ? { ...participant, total: null, series: participant.series.map((series) => ({ ...series, total: null })) }
          : participant,
      ),
      ranking: publicRanking(snapshot.ranking),
      eventRanking: publicRanking(snapshot.eventRanking),
    };
  }

  resultSlot(source: SavedSource, stageIndex: number, seriesIndex: number) {
    let shotOffset = 0;
    let seriesOffset = 0;
    for (const [stage, definition] of source.definition!.stages.entries()) {
      if (!definition.scored) continue;
      for (const [series, shots] of definition.seriesShots.entries()) {
        if (stage === stageIndex && series === seriesIndex) return { shotOffset, seriesOffset, shots };
        shotOffset += shots;
        seriesOffset++;
      }
    }
    return null;
  }

  applyResultShots(
    participant: VistaParticipant,
    projection: DirectorVistaResultProjection,
    source: SavedSource,
    observations: Map<string, CompetitionShotObservation>,
  ): void {
    const byId = new Map(participant.shots.filter((shot) => shot.mode === 'match').map((shot) => [shot.id, shot]));
    const byOriginalPosition = new Map<number, VistaParticipant['shots'][number]>();
    const ambiguousPositions = new Set<number>();
    // Unidentified original Final shots can be linked only to the acknowledged finish snapshot.
    if (participant.dataState === 'saved')
      for (const shot of byId.values()) {
        const observation = observations.get(shot.id);
        const slot = observation ? this.resultSlot(source, observation.stageIndex, observation.seriesIndex) : null;
        if (shot.recorded && slot && observation && observation.shotNumberInSeries <= slot.shots) {
          const index = slot.shotOffset + observation.shotNumberInSeries - 1;
          if (byOriginalPosition.has(index)) ambiguousPositions.add(index);
          byOriginalPosition.set(index, shot);
        }
      }
    for (const index of ambiguousPositions) byOriginalPosition.delete(index);
    const positions = source.definition!.stages.flatMap((stage, stageIndex) =>
      stage.scored
        ? stage.seriesShots.flatMap((count, series) =>
            Array.from({ length: count }, () => ({ stage: stageIndex, series })),
          )
        : [],
    );
    const laneScore = source.lanes.find((lane) => lane.laneId === participant.laneId)?.score;
    const recordedPositions = new Set<number>();
    if (participant.dataState === 'saved' && laneScore)
      for (const stage of laneScore.stages)
        for (const series of stage.series) {
          const slot = this.resultSlot(source, stage.stageIndex, series.seriesIndex);
          if (slot) series.shots.forEach((_, index) => recordedPositions.add(slot.shotOffset + index));
        }
    // Stored results may pad positions not fired with zero. Only actual finish slots or an
    // explicit corrected shot establish a shot count; unknown coverage stays unknown.
    const unidentifiedShots = projection.shots.some(
      (shot) => shot.sourceShotId === null && shot.sourceShotIndex === null && !shot.corrected,
    );
    if (unidentifiedShots) participant.historyComplete = false;
    participant.shotCount =
      !unidentifiedShots &&
      participant.dataState === 'saved' &&
      laneScore &&
      recordedPositions.size === laneScore.totalShotCount
        ? projection.shots.filter(
            (shot) =>
              shot.sourceShotId !== null ||
              shot.corrected ||
              (shot.sourceShotIndex !== null && recordedPositions.has(shot.sourceShotIndex)),
          ).length
        : null;
    const projected: VistaParticipant['shots'] = [];
    const used = new Set<string>();
    for (const [index, correction] of projection.shots.entries()) {
      const position = positions[index];
      if (!position) throw new Error('Result shots exceed the selected competition definition');
      const original =
        correction.sourceShotId !== null
          ? byId.get(correction.sourceShotId)
          : correction.sourceShotIndex !== null
            ? byOriginalPosition.get(correction.sourceShotIndex)
            : undefined;
      if (!original && correction.sourceShotId === null && !correction.corrected) continue;
      const id = original?.id ?? correction.sourceShotId ?? `${projection.resultId}:corrected:${index}`;
      if (used.has(id)) throw new Error('A corrected source shot cannot be counted twice');
      used.add(id);
      if (!original) participant.historyComplete = false;
      projected.push({
        id,
        sequence: 0,
        x: original?.x ?? null,
        y: original?.y ?? null,
        score: correction.score,
        mode: 'match',
        ...position,
        recorded: true,
        corrected: correction.corrected || (original !== undefined && original.score !== correction.score),
      });
    }
    // Retain physical observations that the corrected result excludes, without counting them twice.
    const originalIds = new Set([...byOriginalPosition.values()].map((shot) => shot.id));
    const remaining = participant.shots
      .filter((shot) => !used.has(shot.id))
      .map((shot) => {
        if (shot.mode !== 'match' || !shot.recorded) return shot;
        if (originalIds.has(shot.id)) return { ...shot, recorded: false, corrected: true };
        participant.historyComplete = false;
        return shot;
      });
    participant.shots = [
      ...remaining.filter((shot) => shot.mode === 'sighting'),
      ...projected,
      ...remaining.filter((shot) => shot.mode !== 'sighting'),
    ].map((shot, index) => ({ ...shot, sequence: index + 1 }));
  }

  projectParticipants(source: SavedSource): { participants: VistaParticipant[]; shootOffActive: boolean } {
    const observations = this.readers.observations(source);
    const operations =
      source.frozenShotIds === null
        ? this.readers.operations(source.competition.competitionId)
        : source.frozenOperations;
    if (!operations) throw new Error(missingResetOperations);
    const { completedTransfers: completed, decisions, shootOff, shootOffShots } = operations;
    const retired = new Set(completed.map((request) => request.sourceLaneId));
    const participants: VistaParticipant[] = source.lanes
      .filter((lane) => source.competition.laneIds.includes(lane.laneId) && !retired.has(lane.laneId))
      .map((lane) => {
        const state = lane.competitionState!;
        const score =
          lane.score?.sessionId === state.sessionId && lane.score.acc === source.definition!.scoring
            ? lane.score
            : null;
        const athlete = lane.assignment?.athlete;
        const participant = athlete ? this.readers.participant(athlete.id) : null;
        const originLanes = new Set([lane.laneId]);
        // Only an acknowledged transfer is allowed to establish continuity, including chained moves.
        for (let changed = true; changed;) {
          changed = false;
          for (const transfer of completed)
            if (originLanes.has(transfer.destinationLaneId) && !originLanes.has(transfer.sourceLaneId)) {
              originLanes.add(transfer.sourceLaneId);
              changed = true;
            }
        }
        const sessions = new Set(source.sessionHistory?.[state.sessionId] ?? [state.sessionId]);
        const unique = new Map<string, CompetitionShotObservation>();
        for (const shot of observations) {
          if (!originLanes.has(shot.laneId) || !sessions.has(shot.sessionId)) continue;
          const old = unique.get(shot.shotId);
          if (!old || old.publishedAt <= shot.publishedAt) unique.set(shot.shotId, shot);
        }
        const shots = [...unique.values()]
          .sort(
            (a, b) =>
              a.stageIndex - b.stageIndex ||
              a.seriesIndex - b.seriesIndex ||
              a.shotNumberInSeries - b.shotNumberInSeries ||
              a.firedAt.getTime() - b.firedAt.getTime(),
          )
          .map((shot, index) => ({
            id: shot.shotId,
            sequence: index + 1,
            x: shot.targetProfileId === source.definition!.target.profileId ? shot.x : null,
            y: shot.targetProfileId === source.definition!.target.profileId ? shot.y : null,
            score: shot.effectiveScoreX10 / 10,
            mode: shot.mode === 'SIGHTING' ? ('sighting' as const) : ('match' as const),
            stage: shot.stageIndex,
            series: shot.seriesIndex,
            recorded: shot.isRecorded,
            corrected: false,
          }));
        let historyComplete = source.observedFromStart.includes(state.sessionId) && score !== null;
        for (const [key, expected] of Object.entries(source.observedSeriesCounts ?? {})) {
          const [recordedSession, stage, series] = key.split(':');
          if (!recordedSession || !sessions.has(recordedSession)) continue;
          const actual = [...unique.values()].filter(
            (shot) =>
              shot.sessionId === recordedSession &&
              shot.stageIndex === Number(stage) &&
              shot.seriesIndex === Number(series) &&
              (shot.isRecorded || (!shot.scored && shot.mode === 'SIGHTING')),
          ).length;
          if (actual !== expected) historyComplete = false;
        }
        const recorded = [...unique.values()].filter(
          (shot) => shot.scored && shot.isRecorded && shot.sessionId === state.sessionId,
        );
        if (score) {
          historyComplete &&= recorded.length === score.totalShotCount;
          for (const stage of score.stages)
            for (const series of stage.series)
              for (const [index, value] of series.shots.entries()) {
                const slot = recorded.filter(
                  (shot) =>
                    shot.stageIndex === stage.stageIndex &&
                    shot.seriesIndex === series.seriesIndex &&
                    shot.shotNumberInSeries === index + 1,
                );
                if (slot.length !== 1 || slot[0]!.effectiveScoreX10 !== value) historyComplete = false;
              }
        }
        const currentShots = [...unique.values()].filter(
          (shot) =>
            shot.stageIndex === state.currentStage.index &&
            shot.seriesIndex === state.currentSeries.index &&
            (shot.isRecorded || (!shot.scored && shot.mode === 'SIGHTING')),
        );
        if (currentShots.length !== state.currentSeries.shotsRecorded) historyComplete = false;
        const decision = [...decisions].reverse().find((candidate) => candidate.selectedLaneId === lane.laneId);
        const inShootOff = shootOff?.eligibleLaneIds.includes(lane.laneId) === true;
        const finalBoundary =
          state.phase === 'FINISHED' &&
          Boolean(state.finalSnapshotCommandId) &&
          state.finalSnapshotCommandId === score?.finalSnapshotCommandId;
        const dataState: VistaParticipant['dataState'] = source.competition.finishedAt
          ? finalBoundary
            ? 'saved'
            : 'stale'
          : !source.upstreamConnected ||
              !source.confirmedLaneIds?.includes(lane.laneId) ||
              (lane.hardware && lane.hardware.connection.status !== 'connected')
            ? 'stale'
            : 'live';
        const extra = shootOffShots
          .filter((shot) => originLanes.has(shot.laneId))
          .map((shot, index) => ({
            id: `shoot-off:${shot.shotId}`,
            sequence: shots.length + index + 1,
            x: shot.x,
            y: shot.y,
            score: shot.scoreX10 / 10,
            mode: 'shoot-off' as const,
            stage: state.currentStage.index,
            series: shot.iteration - 1,
            recorded: true,
            corrected: false,
          }));
        return {
          id: athlete?.id || `${lane.laneId}:${state.sessionId}`,
          laneId: lane.laneId,
          laneName: lane.laneAlias || (lane.firingPointNumber ? `Lane ${lane.firingPointNumber}` : lane.laneId),
          name: participant?.player_name ?? athlete?.name ?? null,
          affiliation: participant?.affiliation ?? athlete?.teamName ?? null,
          assignmentRevision: vistaDigest({
            laneId: lane.laneId,
            sessionId: state.sessionId,
            assignment: lane.assignment,
            transfers: completed
              .filter((transfer) => originLanes.has(transfer.sourceLaneId))
              .map((transfer) => transfer.id),
          }),
          dataState,
          status:
            participant?.entry_status && participant.entry_status !== 'COMPETING'
              ? participant.entry_status
              : decision
                ? `${decision.commandCompleted ? 'Eliminated' : 'Elimination pending'} · rank ${decision.rank} · after shot ${decision.afterShot}`
                : inShootOff
                  ? shootOff?.status === 'AWAITING_RESOLUTION'
                    ? 'Shoot-off · awaiting resolution'
                    : 'Shoot-off'
                  : state.phase,
          total: state.currentStage.scored && score ? score.totalScoreX10 / 10 : null,
          shotCount: state.currentStage.scored ? (score?.totalShotCount ?? null) : state.currentSeries.shotsRecorded,
          currentStage: state.currentStage.index,
          currentSeries: inShootOff ? shootOff!.iteration - 1 : state.currentSeries.index,
          mode: inShootOff
            ? 'shoot-off'
            : state.interruption?.status === 'SIGHTING'
              ? 'sighting'
              : state.currentStage.scored
                ? 'match'
                : 'sighting',
          series:
            score?.stages.flatMap((stage) =>
              stage.series.map((series) => ({
                stage: stage.stageIndex,
                index: series.seriesIndex,
                total: series.seriesTotalX10 / 10,
              })),
            ) ?? [],
          shots: [...shots, ...extra],
          historyComplete,
          // The Final ledger does not preserve the acknowledged shoot-off timer origin.
          clock: dataState === 'stale' || inShootOff ? null : this.laneClock(source, lane, this.readers.now()),
        };
      });
    return { participants, shootOffActive: shootOff !== null };
  }

  ranking(board: ResultBoardSnapshotDto, source: SavedSource): VistaSnapshot['ranking'] {
    return {
      scope: `${source.eventName ?? source.eventId} · ${board.resultScope} · all relays`,
      kind: 'competition',
      revision: board.snapshotRevision,
      state: board.state,
      rows: board.results.map((row) => ({
        id: this.readers.resultLinks(source).find((link) => link.id === row.resultId)?.participant_id ?? row.resultId,
        rank: row.rank > 0 ? row.rank : null,
        name: row.playerName,
        affiliation: row.affiliation,
        total: classificationSuppressesScore(row.classificationCode ?? row.entryStatus) ? null : row.totalScore,
        classification: row.classificationCode ?? (row.entryStatus === 'COMPETING' ? null : row.entryStatus),
      })),
    };
  }

  /** Director owns the comparison and its live scope; no persisted official ranking is changed. */
  liveRanking(
    participants: VistaParticipant[],
    source: SavedSource,
    projections: DirectorVistaResultProjection[] = [],
  ): VistaSnapshot['ranking'] {
    const definition = this.readers.registry.get(source.competition.competitionTypeId);
    const strategy = this.readers.registry.getStrategyFor(definition);
    const observations = this.readers.observations(source);
    const inputs = new Map(
      participants.map((participant) => {
        const lane = source.lanes.find((candidate) => candidate.laneId === participant.laneId);
        const projection = projections.find((result) => result.participantId === participant.id);
        const series =
          lane?.score?.stages
            .flatMap((stage) =>
              stage.series.map((entry) => ({
                stageIndex: stage.stageIndex,
                seriesIndex: entry.seriesIndex,
                scoresX10: entry.shots.map((score, index) => {
                  const slot = this.resultSlot(source, stage.stageIndex, entry.seriesIndex);
                  const corrected = slot ? projection?.shots[slot.shotOffset + index]?.score : undefined;
                  return corrected === undefined ? score : Math.round(corrected * 10);
                }),
              })),
            )
            .sort((a, b) => a.stageIndex - b.stageIndex || a.seriesIndex - b.seriesIndex) ?? [];
        const shotIds = new Set(
          participant.shots.filter((shot) => shot.mode === 'match' && shot.recorded).map((shot) => shot.id),
        );
        return [
          participant.id,
          {
            totalScore: participant.total ?? 0,
            seriesScores: projection?.seriesScores ?? participant.series.map((series) => series.total ?? 0),
            shots:
              projection?.shots.map((shot) => shot.score) ??
              series.flatMap((entry) => entry.scoresX10.map((score) => score / 10)),
            rankingShots:
              projection?.rankingShots ??
              assembleRankingEvidence(
                series,
                observations.filter((shot) => shotIds.has(shot.shotId)),
              ),
            familyName: projection?.familyName ?? participant.name ?? participant.laneName,
          } satisfies QualificationRankingInput,
        ] as const;
      }),
    );
    const input = (participant: VistaParticipant): QualificationRankingInput => inputs.get(participant.id)!;
    const classified = (participant: VistaParticipant) =>
      ['DSQ', 'DQB', 'AD_DSQ', 'DNS', 'DNF', 'RPO', 'MQS', 'OOC'].includes(participant.status);
    const rankable = (participant: VistaParticipant) => participant.total !== null && !classified(participant);
    const compare = (a: VistaParticipant, b: VistaParticipant) =>
      strategy.compareResults(input(a), input(b), definition.resultFormat);
    const displayOrder = (a: VistaParticipant, b: VistaParticipant) =>
      strategy.compareEqualResultsForDisplay?.(input(a), input(b)) ?? 0;
    const eligible = participants.filter(rankable).sort((a, b) => b.total! - a.total!);
    const ordered: VistaParticipant[] = [];
    const ranks = new Map<string, number | null>();
    // Missing higher-priority evidence makes the whole tied total provisional.
    for (let offset = 0; offset < eligible.length;) {
      const group = eligible.slice(offset).filter((participant) => participant.total === eligible[offset]!.total);
      const uncertain = group.some((left, index) =>
        group
          .slice(index + 1)
          .some(
            (right) =>
              (strategy.assessComparison?.(input(left), input(right), definition.resultFormat).issues.length ?? 0) > 0,
          ),
      );
      group.sort(uncertain ? displayOrder : (a, b) => compare(a, b) || displayOrder(a, b));
      let rank = offset + 1;
      for (const [index, participant] of group.entries()) {
        if (index > 0 && compare(group[index - 1]!, participant) !== 0) rank = offset + index + 1;
        ranks.set(participant.id, uncertain ? null : rank);
      }
      ordered.push(...group);
      offset += group.length;
    }
    ordered.push(...participants.filter((participant) => !rankable(participant)));
    const ranking: NonNullable<VistaSnapshot['ranking']> = {
      scope: `${this.label(source)} · current competition only`,
      kind: 'live',
      revision: '',
      state: 'DRAFT',
      rows: ordered.map((participant) => {
        // Final eliminations are an official operation, never inferred from a live total.
        const eliminated = /^Eliminated · rank (\d+)/.exec(participant.status);
        return {
          id: participant.id,
          rank: !rankable(participant)
            ? null
            : definition.config.name === 'Final'
              ? eliminated
                ? Number(eliminated[1])
                : null
              : (ranks.get(participant.id) ?? null),
          name: participant.name ?? participant.laneName,
          affiliation: participant.affiliation,
          total: classificationSuppressesScore(participant.status) ? null : participant.total,
          classification: classified(participant) ? participant.status : null,
        };
      }),
    };
    ranking.revision = vistaDigest(ranking);
    return ranking;
  }

  rangeClock(source: SavedSource, sampledAt: number): VistaSnapshot['clock'] {
    if (
      !source.competition.finishedAt &&
      source.competition.laneIds.some(
        (laneId) =>
          !source.competition.transferredSourceLaneIds?.includes(laneId) && !source.confirmedLaneIds?.includes(laneId),
      )
    )
      return null;
    if (source.lanes.some((lane) => lane.competitionState?.interruption || lane.safetyState?.status === 'STOPPED'))
      return null;
    return this.competitionClock(source, sampledAt);
  }

  private competitionClock(source: SavedSource, sampledAt: number): VistaSnapshot['clock'] {
    const competition = source.competition;
    const timer = competition.activeTimer;
    if ((!source.upstreamConnected && !competition.finishedAt) || !timer) return null;
    const startsAt = Date.parse(timer.timerStartAt);
    const scheduled = !competition.finishedAt && sampledAt < startsAt;
    sampledAt = scheduled
      ? Date.parse(competition.publishedAt)
      : Math.max(Date.parse(competition.publishedAt), startsAt);
    return {
      generation: `${competition.competitionId}:${timer.timerStartAt}:${timer.stageIndex}:${timer.seriesIndex}`,
      revision: Math.max(0, sampledAt),
      label: scheduled ? 'Scheduled' : timer.timerScope === 'STAGE' ? 'Stage' : 'Series',
      state: competition.finishedAt || scheduled ? 'stopped' : 'running',
      remainingMs: scheduled
        ? timer.timerDurationSeconds * 1000
        : Math.max(
            0,
            startsAt +
              timer.timerDurationSeconds * 1000 -
              (competition.finishedAt ? Date.parse(competition.finishedAt) : sampledAt),
          ),
      sampledAt,
    };
  }

  private laneClock(source: SavedSource, lane: Lane, sampledAt: number): VistaParticipant['clock'] {
    const state = lane.competitionState!;
    const now = sampledAt;
    sampledAt = Date.parse(state.publishedAt);
    const interruption = state.interruption;
    const safety = lane.safetyState;
    const finished = Boolean(source.competition.finishedAt) || state.phase === 'FINISHED';
    if (safety?.status === 'STOPPED' && safety.timerSnapshot?.competitionId === source.competition.competitionId)
      return {
        generation: `${state.sessionId}:${safety.safetyStopId}`,
        revision: Math.max(0, Date.parse(safety.publishedAt)),
        label: 'Stopped',
        state: 'stopped',
        remainingMs: safety.timerSnapshot.remainingSeconds * 1000,
        sampledAt,
      };
    if (safety?.status === 'STOPPED') return null;
    if (interruption) {
      const running = ['RUNNING_MATCH', 'SIGHTING'].includes(interruption.status) && interruption.resumeAt !== null;
      // Finish does not capture the interruption timer's actual stopped sample.
      if (finished && running) return null;
      const startsAt = interruption.resumeAt === null ? null : Date.parse(interruption.resumeAt);
      const scheduled = running && now < startsAt!;
      if (running && !scheduled) sampledAt = Math.max(sampledAt, startsAt!);
      return {
        generation: `${state.sessionId}:${interruption.interruptionId}`,
        revision: Math.max(0, sampledAt),
        label: scheduled ? 'Scheduled' : interruption.status,
        state: running && !scheduled ? 'running' : 'stopped',
        remainingMs: running
          ? Math.max(
              0,
              (interruption.authorizedRemainingSeconds ?? interruption.capturedRemainingSeconds) * 1000 -
                (scheduled ? 0 : sampledAt - startsAt!),
            )
          : interruption.capturedRemainingSeconds * 1000,
        sampledAt,
      };
    }
    const clock = this.competitionClock(source, this.readers.now());
    return finished && clock?.state === 'running' ? null : clock;
  }

  label(source: SavedSource): string {
    return `${source.eventName ?? source.competition.competitionTypeName} · ${source.competition.roundName}${source.relay ? ` · Relay ${source.relay}` : ''} · ${source.competition.competitionId.slice(0, 8)}${source.resetCommandId ? ` · Reset ${source.resetCommandId.slice(0, 8)}` : ''}`;
  }
}
