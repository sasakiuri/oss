// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  VistaSnapshotSchema,
  type VistaCatalog,
  type VistaDefinition,
  type VistaIdentity,
  type VistaParticipant,
  type VistaSnapshot,
} from '@sasakiuri/saika-protocol/Vista';
import type { CompetitionTypeRegistry, QualificationRankingInput } from '@/shared/competitionTypes';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';
import { ReserveLaneTransferBundleSchema } from '@/shared/mqtt/ReserveLaneTransfer';
import type { ResultBoardSnapshotDto } from '@/shared/ipc/contracts/resultPublication.contract';
import type { CompetitionShotObservation, ICompetitionShotJournal } from '@/main/modules/mqtt';
import { SqliteFinalControlRepository } from '@/main/modules/final-control';
import { SqliteReserveTransferRepository } from '@/main/modules/reserve-lane-transfers';
import { SqliteFinalOperationRepository, projectFinalOperation } from '@/main/modules/final-operations';
import { assembleRankingEvidence, type ResultDisplayProjection } from '@/main/modules/results';
import { directorVistaDefinition, vistaDigest } from './directorVistaDefinition';

type Competition = MqttControlSnapshotDto['competitions'][number];
type Lane = MqttControlSnapshotDto['lanes'][number];
const CanonicalSnapshotSchema = VistaSnapshotSchema.and(z.object({ eventRanking: VistaSnapshotSchema.shape.ranking }));
type CanonicalSnapshot = z.infer<typeof CanonicalSnapshotSchema>;
type RankingScope = 'relay' | 'event';
type CompletedTransfer = ReturnType<SqliteReserveTransferRepository['list']>[number] & {
  sessionId: string;
  athleteId: string;
};
interface VistaOperations {
  completedTransfers: CompletedTransfer[];
  decisions: ReturnType<SqliteFinalControlRepository['findByCompetition']>;
  shootOff: ReturnType<typeof projectFinalOperation>['shootOff'];
  shootOffShots: ReturnType<SqliteFinalOperationRepository['findShootOffShotsByRun']>;
}
const missingResetOperations = 'This saved archive lacks operation history at its reset boundary';
interface SavedSource {
  upstreamConnected: boolean;
  confirmedLaneIds: string[];
  resetCommandId: string | null;
  sessionHistory: Record<string, string[]>;
  observedSeriesCounts: Record<string, number>;
  shotWindows: Record<string, { after: string | null; before: string | null }>;
  frozenShotIds: string[] | null;
  /** Absent in older saved sources; an archive must not acquire later operations as a substitute. */
  frozenOperations?: VistaOperations | null;
  excludedResultIds: string[];
  competition: Competition;
  lanes: Lane[];
  observedFromStart: string[];
  definition: VistaDefinition | null;
  reason: string | null;
  eventId: string | null;
  eventName: string | null;
  championship: string | null;
  relay: string | null;
}
interface SourceRow {
  id: string;
  source_json: string;
  snapshot_json: string | null;
  revision: number;
}
interface ParticipantRecord {
  id: string;
  event_id: string;
  player_name: string;
  affiliation: string;
  entry_status: string;
}
interface LinkedResult {
  id: string;
  participant_id: string;
  source_competition_id: string | null;
  source_lane_id: string | null;
  relay_number: number;
}
export type DirectorVistaResultProjection = ResultDisplayProjection;
export interface DirectorVistaBoards {
  getSnapshot(eventId: string, scope: 'QUALIFICATION' | 'FINAL'): Promise<ResultBoardSnapshotDto>;
}

/** Owns a durable read projection; no competition command ports are reachable from this source. */
export class DirectorVistaSource {
  private latestControlSnapshot: MqttControlSnapshotDto | null = null;
  private transferRevision = 0;

  constructor(
    private readonly db: Database.Database,
    private readonly registry: CompetitionTypeRegistry,
    private readonly journal: ICompetitionShotJournal,
    private readonly boards: DirectorVistaBoards,
    private readonly identity: VistaIdentity,
    private readonly now: () => number = Date.now,
    private readonly projectResults?: (eventId: string, final: boolean) => Promise<DirectorVistaResultProjection[]>,
  ) {
    // A persisted connection flag cannot confirm the upstream connection in a new Director process.
    this.db.transaction(() => {
      for (const row of this.rows()) {
        const source = JSON.parse(row.source_json) as SavedSource;
        if (source.competition.finishedAt) continue;
        source.upstreamConnected = false;
        source.confirmedLaneIds = [];
        this.db
          .prepare('UPDATE vista_competition_sources SET source_json = ? WHERE id = ?')
          .run(JSON.stringify(source), row.id);
      }
    })();
  }

  /** Synchronous event capture also retains prior competitions when physical Lanes are reused. */
  observe(snapshot: MqttControlSnapshotDto): void {
    this.db.transaction(() => {
      for (const row of this.rows()) {
        const stored = JSON.parse(row.source_json) as SavedSource;
        if (
          snapshot.connected &&
          snapshot.competitions.some((competition) => competition.competitionId === stored.competition.competitionId)
        )
          continue;
        if (stored.upstreamConnected && !stored.competition.finishedAt) {
          stored.upstreamConnected = false;
          stored.confirmedLaneIds = [];
          this.db
            .prepare('UPDATE vista_competition_sources SET source_json = ? WHERE id = ?')
            .run(JSON.stringify(stored), row.id);
        }
      }
      for (const competition of snapshot.competitions) {
        const previousRow = this.rows()
          .reverse()
          .find(
            (row) =>
              (JSON.parse(row.source_json) as SavedSource).competition.competitionId === competition.competitionId,
          );
        const previous = previousRow ? (JSON.parse(previousRow.source_json) as SavedSource) : null;
        if (previous && Date.parse(previous.competition.publishedAt) > Date.parse(competition.publishedAt)) continue;
        const reset =
          previous &&
          snapshot.lastCommand?.action === 'reset-session' &&
          snapshot.lastCommand.competitionId === competition.competitionId &&
          snapshot.lastCommand.success &&
          competition.phase === 'NOT_STARTED' &&
          competition.finishedAt === null &&
          snapshot.lastCommand.commandId !== previous.resetCommandId &&
          snapshot.lastCommand.lanes.some((commandLane) => {
            const lane = snapshot.lanes.find((candidate) => candidate.laneId === commandLane.laneId);
            return (
              commandLane.status === 'done' &&
              lane?.competitionState?.competitionId === competition.competitionId &&
              lane.score?.competitionId === competition.competitionId &&
              lane.score.sessionId === lane.competitionState.sessionId &&
              lane.score.totalShotCount === 0
            );
          })
            ? snapshot.lastCommand.commandId
            : null;
        const subjectId = reset
          ? `${competition.competitionId}:reset:${reset}`
          : (previousRow?.id ?? competition.competitionId);
        const resetLanes = reset
          ? snapshot.lanes.filter(
              (lane) =>
                lane.competitionState?.competitionId === competition.competitionId &&
                snapshot.lastCommand!.lanes.some(
                  (commandLane) => commandLane.laneId === lane.laneId && commandLane.status === 'done',
                ) &&
                lane.score?.totalShotCount === 0,
            )
          : [];
        const shotWindows = { ...previous?.shotWindows };
        if (reset && previousRow && previous) {
          const archivedWindows = { ...previous.shotWindows };
          for (const lane of resetLanes) {
            const boundary = lane.score!.publishedAt;
            archivedWindows[lane.laneId] = { after: archivedWindows[lane.laneId]?.after ?? null, before: boundary };
            shotWindows[lane.laneId] = { after: boundary, before: null };
          }
          const archived = { ...previous, shotWindows: archivedWindows };
          const frozenShotIds = [...new Set(this.observations(archived).map((shot) => shot.shotId))];
          this.db.prepare('UPDATE vista_competition_sources SET source_json = ? WHERE id = ?').run(
            JSON.stringify({
              ...previous,
              shotWindows: archivedWindows,
              frozenShotIds,
              frozenOperations: this.operations(previous.competition.competitionId),
              upstreamConnected: false,
              reason:
                previous.reason === 'An unconfirmed Lane session replacement requires source synchronization'
                  ? null
                  : previous.reason,
            }),
            previousRow.id,
          );
        }
        const sessionHistory = { ...previous?.sessionHistory };
        const observedSeriesCounts = { ...previous?.observedSeriesCounts };
        for (const lane of resetLanes) {
          const session = lane.competitionState!.sessionId;
          sessionHistory[session] = [session];
          for (const key of Object.keys(observedSeriesCounts))
            if (key.startsWith(`${session}:`)) delete observedSeriesCounts[key];
        }
        let unconfirmedReplacement = false;
        const lanes = new Map(
          (previous?.lanes ?? [])
            .filter((lane) => competition.laneIds.includes(lane.laneId))
            .map((lane) => [lane.laneId, lane]),
        );
        const observedFromStart = new Set(previous?.observedFromStart ?? []);
        const confirmedLaneIds: string[] = [];
        const completedTransfers = this.completedTransfers(competition.competitionId);
        for (const lane of snapshot.lanes) {
          if (!competition.laneIds.includes(lane.laneId)) continue;
          if (lane.competitionState?.competitionId !== competition.competitionId) continue;
          const prior = lanes.get(lane.laneId);
          const next = {
            ...lane,
            score: lane.score?.competitionId === competition.competitionId ? lane.score : null,
            assignment: lane.assignment?.competitionId === competition.competitionId ? lane.assignment : null,
          };

          for (const key of ['competitionState', 'score', 'assignment', 'safetyState'] as const) {
            const oldValue = prior?.[key];
            const newValue = next[key];
            if (oldValue && (!newValue || Date.parse(oldValue.publishedAt) > Date.parse(newValue.publishedAt))) {
              // Each upstream retained stream has its own publication timestamp.
              Object.assign(next, { [key]: oldValue });
            }
          }
          if (
            !reset &&
            competition.phase === 'NOT_STARTED' &&
            prior?.score &&
            prior.score.totalShotCount > 0 &&
            next.score?.totalShotCount === 0 &&
            next.score.sessionId === prior.score.sessionId
          ) {
            unconfirmedReplacement = true;
            continue;
          }
          const state = next.competitionState;
          const priorState = prior?.competitionState;
          if (state) {
            sessionHistory[state.sessionId] ??= [state.sessionId];
            if (priorState && priorState.sessionId !== state.sessionId) {
              // Retirement clears the source assignment before the target publishes its state.
              // Continuity is established by the acknowledged saved bundle, not that live assignment.
              const confirmedTransfer = completedTransfers.some(
                (transfer) =>
                  transfer.destinationLaneId === lane.laneId &&
                  transfer.sessionId === state.sessionId &&
                  transfer.athleteId === next.assignment?.athlete?.id,
              );
              const forwardStage =
                !confirmedTransfer &&
                !priorState.currentStage.scored &&
                state.currentStage.scored &&
                state.currentStage.index > priorState.currentStage.index &&
                prior?.assignment?.athlete?.id === next.assignment?.athlete?.id;
              if (forwardStage) {
                sessionHistory[state.sessionId] = [
                  ...(sessionHistory[priorState.sessionId] ?? [priorState.sessionId]),
                  state.sessionId,
                ];
                if (
                  observedFromStart.has(priorState.sessionId) &&
                  ['SIGHTING_COMPLETE', 'STAGE_COMPLETE', 'SERIES_COMPLETE'].includes(priorState.phase)
                )
                  observedFromStart.add(state.sessionId);
              } else if (!reset && !confirmedTransfer) {
                unconfirmedReplacement = true;
                continue;
              }
            }
            const key = `${state.sessionId}:${state.currentStage.index}:${state.currentSeries.index}`;
            observedSeriesCounts[key] = Math.max(observedSeriesCounts[key] ?? 0, state.currentSeries.shotsRecorded);
          }
          lanes.set(lane.laneId, next);
          // Retained state and score arrive independently after the MQTT read model is cleared.
          // Saved streams remain displayable, but cannot substitute for either current stream.
          if (
            snapshot.connected &&
            state?.sessionId === lane.competitionState.sessionId &&
            lane.score?.competitionId === competition.competitionId &&
            lane.score.sessionId === state.sessionId &&
            lane.score.acc === competition.acc
          )
            confirmedLaneIds.push(lane.laneId);
          if (
            state &&
            state.phase === 'READY' &&
            state.currentSeries.shotsRecorded === 0 &&
            (!next.score || next.score.totalShotCount === 0)
          ) {
            observedFromStart.add(state.sessionId);
          }
        }
        let definition = previous?.definition ?? null;
        let reason = previous?.reason ?? null;
        try {
          const current = directorVistaDefinition(competition, this.registry);
          if (definition && current.fingerprint !== definition.fingerprint)
            throw new Error('The definition changed within this competition');
          definition = current;
          reason = null;
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
        }
        const participants = [...lanes.values()].flatMap((lane) => lane.assignment?.athlete?.id ?? []);
        const eventIds = [...new Set(participants.flatMap((id) => this.participant(id)?.event_id ?? []))];
        const eventId = eventIds.length === 1 ? eventIds[0]! : (previous?.eventId ?? null);
        const event = eventId
          ? (this.db
              .prepare(
                `SELECT e.name, c.name championship FROM events e JOIN championships c ON c.id = e.championship_id WHERE e.id = ?`,
              )
              .get(eventId) as { name: string; championship: string } | undefined)
          : undefined;
        const relay = eventId
          ? (this.db
              .prepare('SELECT relay_number FROM results WHERE event_id = ? AND source_competition_id = ? LIMIT 1')
              .get(eventId, competition.competitionId) as { relay_number: number } | undefined)
          : undefined;
        if (unconfirmedReplacement) reason = 'An unconfirmed Lane session replacement requires source synchronization';
        const source: SavedSource = {
          upstreamConnected: snapshot.connected,
          confirmedLaneIds,
          resetCommandId: reset ?? previous?.resetCommandId ?? null,
          sessionHistory,
          observedSeriesCounts,
          shotWindows,
          frozenShotIds: null,
          frozenOperations: null,
          excludedResultIds:
            reset && previous
              ? [
                  ...new Set([
                    ...(previous.excludedResultIds ?? []),
                    ...this.resultLinks(previous).map((result) => result.id),
                  ]),
                ]
              : (previous?.excludedResultIds ?? []),
          competition,
          lanes: [...lanes.values()],
          observedFromStart: [...observedFromStart],
          definition,
          reason,
          eventId,
          eventName: event?.name ?? previous?.eventName ?? null,
          championship: event?.championship ?? previous?.championship ?? null,
          relay: relay ? String(relay.relay_number) : (previous?.relay ?? null),
        };
        const json = JSON.stringify(source);
        if (reset || !previous || json !== JSON.stringify(previous))
          this.db
            .prepare(
              `INSERT INTO vista_competition_sources (id, source_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET source_json = excluded.source_json`,
            )
            .run(subjectId, json);
      }
    })();
    this.latestControlSnapshot = structuredClone(snapshot);
    this.transferRevision = this.currentTransferRevision();
  }

  catalog(): VistaCatalog {
    this.refreshCompletedTransfers();
    return {
      identity: this.identity,
      subjects: this.rows().flatMap((row) => {
        const source = JSON.parse(row.source_json) as SavedSource;
        const reason =
          source.reason ??
          (source.frozenShotIds !== null && !source.frozenOperations && !this.hasPublishedArchive(row)
            ? missingResetOperations
            : null);
        const subject = {
          eventCode: source.competition.competitionTypeId,
          competition: source.championship,
          relay: source.relay,
          availability: source.definition && !reason ? ('available' as const) : ('unsupported' as const),
          reason,
        };
        return [
          { ...subject, id: `${row.id}:relay`, label: `${this.label(source)} · Current competition` },
          ...(source.eventId
            ? [{ ...subject, id: `${row.id}:event`, label: `${this.label(source)} · Event results · all relays` }]
            : []),
        ];
      }),
    };
  }

  /** The selected subject fixes the ranking scope, including after finish, reset and restoration. */
  async snapshot(subjectId: string): Promise<VistaSnapshot> {
    const match = /^(.*):(relay|event)$/.exec(subjectId);
    if (!match) throw new Error('Select a current competition or event-results Vista subject');
    const scope = match[2] as RankingScope;
    const { eventRanking, ...snapshot } = await this.canonicalSnapshot(match[1]!);
    if (scope === 'event' && !eventRanking)
      throw new Error('Event results have not been acquired for this competition');
    return VistaSnapshotSchema.parse({
      ...snapshot,
      subjectId,
      generation: vistaDigest({ generation: snapshot.generation, scope }),
      label: `${snapshot.label} · ${scope === 'relay' ? 'Current competition' : 'Event results · all relays'}`,
      ranking: scope === 'event' ? eventRanking : snapshot.ranking,
    });
  }

  /** Retries if any local result, evidence, assignment or publication changed across an async board read. */
  private async canonicalSnapshot(subjectId: string): Promise<CanonicalSnapshot> {
    for (let attempt = 0; attempt < 3; attempt++) {
      this.refreshCompletedTransfers();
      const boundary = this.boundary();
      const source = this.load(subjectId);
      if (!source) throw new Error('Unknown Vista competition');
      if (!source.definition || source.reason) throw new Error(source.reason ?? 'Unsupported competition definition');
      if (directorVistaDefinition(source.competition, this.registry).fingerprint !== source.definition.fingerprint) {
        throw new Error('The stored competition definition is unavailable; preserve the last display snapshot');
      }
      if (source.frozenShotIds !== null) {
        const archived = this.archivedPublishedSnapshot(subjectId);
        if (archived) return archived;
        if (!source.frozenOperations) throw new Error(missingResetOperations);
      }
      if (source.eventId) {
        const event = this.db.prepare('SELECT event_type FROM events WHERE id = ?').get(source.eventId) as
          { event_type: string } | undefined;
        if (!event || event.event_type !== source.competition.competitionTypeId)
          throw new Error('The event binding no longer matches the selected competition');
      }
      const board =
        source.eventId && source.frozenShotIds === null
          ? await this.boards.getSnapshot(
              source.eventId,
              source.competition.roundName === 'Final' || source.competition.competitionTypeId.endsWith('_FINAL')
                ? 'FINAL'
                : 'QUALIFICATION',
            )
          : null;
      const resultProjections =
        board?.results.length && source.eventId && this.projectResults
          ? await this.projectResults(source.eventId, board.resultScope === 'FINAL')
          : [];
      if (boundary !== this.boundary()) continue;
      const { participants, shootOffActive } = this.projectParticipants(source);
      const currentParticipantIds = new Set(participants.map((participant) => participant.id));
      const eventResults = this.resultLinks(source);
      const linkedResults = eventResults.filter(
        (link) =>
          link.source_competition_id === source.competition.competitionId &&
          !source.excludedResultIds?.includes(link.id),
      );
      const replacedResults = eventResults.some(
        (link) =>
          currentParticipantIds.has(link.participant_id) &&
          link.source_competition_id !== source.competition.competitionId,
      );
      const row = this.row(subjectId)!;
      const previous = row.snapshot_json ? CanonicalSnapshotSchema.parse(JSON.parse(row.snapshot_json)) : null;
      // A deleted result cannot revoke corrections already acquired for this
      // finished subject. Partial result acquisition can still add new rows.
      const missingResults =
        previous?.finished &&
        previous.participants.some(
          (participant) =>
            previous.eventRanking?.rows.some((result) => result.id === participant.id) &&
            !linkedResults.some((link) => link.participant_id === participant.id),
        );
      const usePublishedResults = Boolean(
        !replacedResults &&
        source.competition.finishedAt &&
        board?.results.some((row) =>
          linkedResults.some((link) => link.id === row.resultId && currentParticipantIds.has(link.participant_id)),
        ),
      );
      if (replacedResults || missingResults) {
        const archived = this.archivedPublishedSnapshot(subjectId);
        if (archived) return archived;
      }
      if (usePublishedResults && board) {
        const observations = new Map(this.observations(source).map((shot) => [shot.shotId, shot]));
        for (const participant of participants) {
          const link = linkedResults.find((result) => result.participant_id === participant.id);
          const row = board.results.find((result) => result.resultId === link?.id);
          if (row) {
            participant.total = row.totalScore;
            if (row.classificationCode) participant.status = row.classificationCode;
            const projection = resultProjections.find(
              (result) => result.resultId === row.resultId && result.participantId === participant.id,
            );
            if (projection) {
              if (!row.classificationCode && ['eliminated', 'finished'].includes(projection.status))
                participant.status = projection.status;
              this.applyResultShots(participant, projection, source, observations);
              participant.series = source.definition.stages.flatMap((stage, stageIndex) =>
                stage.scored
                  ? stage.seriesShots.flatMap((_, seriesIndex) => {
                      const slot = this.resultSlot(source, stageIndex, seriesIndex)!;
                      const total = projection.seriesScores[slot.seriesOffset];
                      return total === undefined ? [] : [{ stage: stageIndex, index: seriesIndex, total }];
                    })
                  : [],
              );
            }
          }
        }
      }
      const capturedAt = this.now();
      const competition = source.competition;
      const ranking = this.liveRanking(
        participants,
        source,
        usePublishedResults
          ? resultProjections.filter((projection) => linkedResults.some((link) => link.id === projection.resultId))
          : [],
      );
      if (ranking && usePublishedResults && board?.resultScope === 'FINAL') {
        for (const result of ranking.rows) {
          const link = linkedResults.find((candidate) => candidate.participant_id === result.id);
          const declared = board.results.find((candidate) => candidate.resultId === link?.id);
          if (declared) result.rank = declared.rank > 0 ? declared.rank : null;
        }
        ranking.rows.sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
        ranking.revision = vistaDigest({ ...ranking, revision: '' });
      }
      const next = CanonicalSnapshotSchema.parse({
        protocolVersion: 1,
        sourceId: this.identity.sourceId,
        subjectId,
        generation: vistaDigest({
          competition: subjectId,
          definition: source.definition.fingerprint,
        }),
        revision: row.revision + 1,
        capturedAt,
        label: this.label(source),
        phase: competition.phase,
        finished: competition.phase === 'MATCH_COMPLETE' && competition.finishedAt !== null,
        definition: source.definition,
        participants,
        clock: shootOffActive ? null : this.rangeClock(source, capturedAt),
        ranking,
        eventRanking: board && board.results.length ? this.ranking(board, source) : null,
      });
      if (previous) {
        const semantic = (value: CanonicalSnapshot) => ({ ...value, capturedAt: 0, revision: 0 });
        if (vistaDigest(semantic(previous)) === vistaDigest(semantic(next))) return { ...previous, capturedAt };
      }
      this.db
        .prepare('UPDATE vista_competition_sources SET snapshot_json = ?, revision = ? WHERE id = ?')
        .run(JSON.stringify(next), next.revision, subjectId);
      return next;
    }
    throw new Error('Source data is changing; waiting for a coherent Vista snapshot');
  }

  /** A later run cannot re-certify an earlier run's last coherent published scores. */
  private hasPublishedArchive(row: SourceRow): boolean {
    if (!row.snapshot_json) return false;
    const previous = CanonicalSnapshotSchema.parse(JSON.parse(row.snapshot_json));
    return previous.finished && previous.eventRanking?.kind === 'competition';
  }

  private archivedPublishedSnapshot(subjectId: string): CanonicalSnapshot | null {
    const row = this.row(subjectId)!;
    if (!row.snapshot_json) return null;
    const previous = CanonicalSnapshotSchema.parse(JSON.parse(row.snapshot_json));
    if (!previous.finished || previous.eventRanking?.kind !== 'competition') return null;
    const archived: CanonicalSnapshot = {
      ...previous,
      capturedAt: this.now(),
      participants: previous.participants.map((participant) => ({ ...participant, dataState: 'stale', clock: null })),
      clock: null,
      ranking: previous.ranking ? { ...previous.ranking, state: 'UNVERIFIED' } : null,
      eventRanking: { ...previous.eventRanking, state: 'UNVERIFIED' },
    };
    if (vistaDigest({ ...archived, capturedAt: 0 }) !== vistaDigest({ ...previous, capturedAt: 0 })) {
      archived.revision = row.revision + 1;
      this.db
        .prepare('UPDATE vista_competition_sources SET snapshot_json = ?, revision = ? WHERE id = ?')
        .run(JSON.stringify(archived), archived.revision, subjectId);
    }
    return archived;
  }

  private resultSlot(source: SavedSource, stageIndex: number, seriesIndex: number) {
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

  private applyResultShots(
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

  /** A reset may keep the Lane session ID, so its acknowledged publication boundary scopes the journal. */
  private observations(source: SavedSource): CompetitionShotObservation[] {
    const observations = this.journal.findByCompetition(source.competition.competitionId);
    const firstPublications = new Map<string, number>();
    for (const shot of observations)
      firstPublications.set(
        shot.shotId,
        Math.min(firstPublications.get(shot.shotId) ?? Infinity, shot.publishedAt.getTime()),
      );
    const frozen = source.frozenShotIds ? new Set(source.frozenShotIds) : null;
    return observations.filter((shot) => {
      if (frozen && !frozen.has(shot.shotId)) return false;
      const window = source.shotWindows?.[shot.laneId];
      if (!window) return true;
      const publishedAt = firstPublications.get(shot.shotId)!;
      return (
        // Replays may first arrive after reset; their original firing time still belongs to the prior run.
        (window.after === null ||
          (publishedAt > Date.parse(window.after) && shot.firedAt.getTime() > Date.parse(window.after))) &&
        (window.before === null || publishedAt <= Date.parse(window.before))
      );
    });
  }

  private projectParticipants(source: SavedSource): { participants: VistaParticipant[]; shootOffActive: boolean } {
    const observations = this.observations(source);
    const operations =
      source.frozenShotIds === null ? this.operations(source.competition.competitionId) : source.frozenOperations;
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
        const participant = athlete ? this.participant(athlete.id) : null;
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
          clock: dataState === 'stale' || inShootOff ? null : this.laneClock(source, lane, this.now()),
        };
      });
    return { participants, shootOffActive: shootOff !== null };
  }

  private ranking(board: ResultBoardSnapshotDto, source: SavedSource): VistaSnapshot['ranking'] {
    return {
      scope: `${source.eventName ?? source.eventId} · ${board.resultScope} · all relays`,
      kind: 'competition',
      revision: board.snapshotRevision,
      state: board.state,
      rows: board.results.map((row) => ({
        id: this.resultLinks(source).find((link) => link.id === row.resultId)?.participant_id ?? row.resultId,
        rank: row.rank > 0 ? row.rank : null,
        name: row.playerName,
        affiliation: row.affiliation,
        total: row.totalScore,
        classification: row.classificationCode,
      })),
    };
  }

  /** Director owns the comparison and its live scope; no persisted official ranking is changed. */
  private liveRanking(
    participants: VistaParticipant[],
    source: SavedSource,
    projections: DirectorVistaResultProjection[] = [],
  ): VistaSnapshot['ranking'] {
    const definition = this.registry.get(source.competition.competitionTypeId);
    const strategy = this.registry.getStrategyFor(definition);
    const observations = this.observations(source);
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
          total: participant.total,
          classification: classified(participant) ? participant.status : null,
        };
      }),
    };
    ranking.revision = vistaDigest(ranking);
    return ranking;
  }

  private rangeClock(source: SavedSource, sampledAt: number): VistaSnapshot['clock'] {
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
    const clock = this.competitionClock(source, this.now());
    return finished && clock?.state === 'running' ? null : clock;
  }
  private participant(id: string): ParticipantRecord | null {
    return (
      (this.db
        .prepare('SELECT id, event_id, player_name, affiliation, entry_status FROM participants WHERE id = ?')
        .get(id) as ParticipantRecord | undefined) ?? null
    );
  }
  private resultLinks(source: SavedSource): LinkedResult[] {
    if (!source.eventId) return [];
    if (source.competition.competitionTypeId.endsWith('_FINAL'))
      return this.db
        .prepare(
          'SELECT id, participant_id, source_competition_id, NULL source_lane_id, 1 relay_number FROM final_results WHERE event_id = ?',
        )
        .all(source.eventId) as LinkedResult[];
    return this.db
      .prepare(
        'SELECT id, participant_id, source_competition_id, source_lane_id, relay_number FROM results WHERE event_id = ?',
      )
      .all(source.eventId) as LinkedResult[];
  }
  private label(source: SavedSource): string {
    return `${source.eventName ?? source.competition.competitionTypeName} · ${source.competition.roundName}${source.relay ? ` · Relay ${source.relay}` : ''} · ${source.competition.competitionId.slice(0, 8)}${source.resetCommandId ? ` · Reset ${source.resetCommandId.slice(0, 8)}` : ''}`;
  }
  private boundary(): string {
    const changes = this.db.prepare('SELECT total_changes() AS count').get() as { count: number };
    return String(changes.count);
  }
  private operations(competitionId: string): VistaOperations {
    const finals = new SqliteFinalOperationRepository(this.db);
    const run = finals.findLatestRunByCompetition(competitionId);
    const shootOffShots = run ? finals.findShootOffShotsByRun(run.id) : [];
    const finalEntries = run ? finals.findEntriesByRun(run.id) : [];
    return {
      completedTransfers: this.completedTransfers(competitionId),
      decisions: new SqliteFinalControlRepository(this.db)
        .findByCompetition(competitionId)
        .filter((decision) => !decision.voided),
      shootOff: run ? projectFinalOperation(run, finalEntries, shootOffShots).shootOff : null,
      shootOffShots,
    };
  }
  private completedTransfers(competitionId: string): CompletedTransfer[] {
    const transfers = new SqliteReserveTransferRepository(this.db);
    return transfers.list(competitionId).flatMap((request) => {
      const entries = transfers.entries(request.id);
      const prepared = ReserveLaneTransferBundleSchema.safeParse(
        entries.find((entry) => entry.operation === 'SOURCE_PREPARED')?.detail,
      );
      const activated = ReserveLaneTransferBundleSchema.safeParse(
        entries.find((entry) => entry.operation === 'TARGET_ACTIVE')?.detail,
      );
      if (!prepared.success || !activated.success) return [];
      const { digest, ...content } = prepared.data;
      if (
        request.competitionId !== competitionId ||
        request.sourceLaneId === request.destinationLaneId ||
        vistaDigest(request) !== vistaDigest(content.request) ||
        vistaDigest(content) !== digest ||
        vistaDigest(prepared.data) !== vistaDigest(activated.data)
      )
        return [];
      try {
        // Lane owns the opaque snapshot. Read only the identities needed for display continuity.
        const competition = z
          .object({ id: z.string().uuid(), sessionId: z.string().uuid() })
          .parse(JSON.parse(content.competitionJson));
        const session = z.object({ id: z.string().uuid() }).parse(JSON.parse(content.sessionJson));
        const assignment = z
          .object({ competitionId: z.string().uuid(), athlete: z.object({ id: z.string().min(1) }) })
          .parse(JSON.parse(content.assignmentJson));
        if (
          competition.id !== competitionId ||
          session.id !== competition.sessionId ||
          assignment.competitionId !== competitionId ||
          assignment.athlete.id !== content.summary.athleteId
        )
          return [];
        return [{ ...request, sessionId: session.id, athleteId: content.summary.athleteId }];
      } catch {
        return [];
      }
    });
  }
  private currentTransferRevision(): number {
    return (
      this.db
        .prepare(
          "SELECT COALESCE(MAX(rowid), 0) AS revision FROM reserve_lane_transfer_events WHERE operation = 'TARGET_ACTIVE'",
        )
        .get() as { revision: number }
    ).revision;
  }
  private refreshCompletedTransfers(): void {
    // Lane publishes its transferred state before Director persists TARGET_ACTIVE.
    // Replay only a locally observed snapshot, without waiting for another shot or command.
    if (this.latestControlSnapshot && this.currentTransferRevision() !== this.transferRevision)
      this.observe(this.latestControlSnapshot);
  }
  private rows(): SourceRow[] {
    return this.db.prepare('SELECT * FROM vista_competition_sources ORDER BY rowid').all() as SourceRow[];
  }
  private row(id: string): SourceRow | null {
    return (
      (this.db.prepare('SELECT * FROM vista_competition_sources WHERE id = ?').get(id) as SourceRow | undefined) ?? null
    );
  }
  private load(id: string): SavedSource | null {
    const row = this.row(id);
    return row ? (JSON.parse(row.source_json) as SavedSource) : null;
  }
}
