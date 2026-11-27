// SPDX-License-Identifier: MIT
import {
  VISTA_PROTOCOL_VERSION,
  VistaSnapshotSchema,
  type VistaCatalog,
  type VistaIdentity,
  type VistaSnapshot,
} from '@sasakiuri/saika-protocol/Vista';
import { z } from 'zod';

import type { IFinalControlRepository } from '@/main/modules/final-control';
import { projectFinalOperation, type IFinalOperationRepository } from '@/main/modules/final-operations';
import type { CompetitionShotObservation, ICompetitionShotJournal } from '@/main/modules/mqtt';
import type { IReserveTransferRepository } from '@/main/modules/reserve-lane-transfers';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';
import type { ResultBoardSnapshotDto } from '@/shared/ipc/contracts';
import { ReserveLaneTransferBundleSchema } from '@sasakiuri/saika-protocol/ReserveLaneTransfer';

import { directorVistaDefinition, vistaDigest } from './directorVistaDefinition';
import { VistaSnapshotProjector } from './VistaSnapshotProjector';
import {
  CanonicalSnapshotSchema,
  missingResetOperations,
  type CanonicalSnapshot,
  type Competition,
  type Lane,
  type CompletedTransfer,
  type DirectorVistaResultProjection,
  type SavedSource,
  type VistaOperations,
} from './VistaSourceModel';
import type { IVistaSourceStore, VistaLinkedResult, VistaSourceRow } from './VistaSourceStore';

type RankingScope = 'relay' | 'event';

const unconfirmedReplacementReason = 'An unconfirmed Lane session replacement requires source synchronization';

export interface DirectorVistaBoards {
  getSnapshot(eventId: string, scope: 'QUALIFICATION' | 'FINAL'): Promise<ResultBoardSnapshotDto>;
}

/** The Final and reserve transfer history a Vista snapshot shows and an archive freezes. */
export interface VistaOperationSources {
  readonly finalOperations: Pick<
    IFinalOperationRepository,
    'findLatestRunByCompetition' | 'findShootOffShotsByRun' | 'findEntriesByRun'
  >;
  readonly finalControls: Pick<IFinalControlRepository, 'findByCompetition'>;
  readonly reserveTransfers: Pick<IReserveTransferRepository, 'list' | 'entries'>;
}

/**
 * Owns a durable read projection; no competition command ports are reachable from this source. It tracks the
 * observed competitions in the store and lets VistaSnapshotProjector build the displayed snapshot.
 */
export class DirectorVistaSource {
  private latestControlSnapshot: MqttControlSnapshotDto | null = null;
  private transferRevision = 0;
  private readonly projector: VistaSnapshotProjector;

  constructor(
    private readonly store: IVistaSourceStore,
    private readonly operationSources: VistaOperationSources,
    private readonly registry: CompetitionTypeRegistry,
    private readonly journal: ICompetitionShotJournal,
    private readonly boards: DirectorVistaBoards,
    private readonly identity: VistaIdentity,
    private readonly now: () => number = Date.now,
    private readonly projectResults?: (eventId: string, final: boolean) => Promise<DirectorVistaResultProjection[]>,
  ) {
    this.projector = new VistaSnapshotProjector({
      registry,
      now,
      observations: (source) => this.observations(source),
      operations: (competitionId) => this.operations(competitionId),
      participant: (id) => this.store.participant(id),
      resultLinks: (source) => this.resultLinks(source),
    });
    // A persisted connection flag cannot confirm the upstream connection in a new Director process.
    this.store.transaction(() => {
      for (const { id, source } of this.store.rows()) {
        if (source.competition.finishedAt) continue;
        source.upstreamConnected = false;
        source.confirmedLaneIds = [];
        this.store.saveSource(id, source);
      }
    });
  }

  /** Synchronous event capture also retains prior competitions when physical Lanes are reused. */
  observe(snapshot: MqttControlSnapshotDto): void {
    this.store.transaction(() => {
      this.disconnectUnreportedSources(snapshot);
      for (const competition of snapshot.competitions) this.observeCompetition(snapshot, competition);
    });
    this.latestControlSnapshot = structuredClone(snapshot);
    this.transferRevision = this.currentTransferRevision();
  }

  /** A running competition that the connected upstream no longer reports cannot stay confirmed. */
  private disconnectUnreportedSources(snapshot: MqttControlSnapshotDto): void {
    for (const { id, source } of this.store.rows()) {
      if (
        snapshot.connected &&
        snapshot.competitions.some((competition) => competition.competitionId === source.competition.competitionId)
      )
        continue;
      if (source.upstreamConnected && !source.competition.finishedAt) {
        source.upstreamConnected = false;
        source.confirmedLaneIds = [];
        this.store.saveSource(id, source);
      }
    }
  }

  private observeCompetition(snapshot: MqttControlSnapshotDto, competition: Competition): void {
    const previousRow = this.store
      .rows()
      .reverse()
      .find((row) => row.source.competition.competitionId === competition.competitionId);
    const previous = previousRow?.source ?? null;
    if (previous && Date.parse(previous.competition.publishedAt) > Date.parse(competition.publishedAt)) return;
    const resetCommand = previous ? this.acknowledgedReset(snapshot, competition, previous) : null;
    const reset = resetCommand?.commandId ?? null;
    const subjectId = reset
      ? `${competition.competitionId}:reset:${reset}`
      : (previousRow?.id ?? competition.competitionId);
    const resetLanes = resetCommand
      ? snapshot.lanes.filter(
          (lane) =>
            lane.competitionState?.competitionId === competition.competitionId &&
            resetCommand.lanes.some(
              (commandLane) => commandLane.laneId === lane.laneId && commandLane.status === 'done',
            ) &&
            lane.score?.totalShotCount === 0,
        )
      : [];
    const shotWindows =
      resetCommand && previousRow ? this.archiveBeforeReset(previousRow, resetLanes) : { ...previous?.shotWindows };
    const sessionHistory = { ...previous?.sessionHistory };
    const observedSeriesCounts = { ...previous?.observedSeriesCounts };
    for (const lane of resetLanes) {
      const session = lane.competitionState!.sessionId;
      sessionHistory[session] = [session];
      for (const key of Object.keys(observedSeriesCounts))
        if (key.startsWith(`${session}:`)) delete observedSeriesCounts[key];
    }
    const { lanes, observedFromStart, confirmedLaneIds, unconfirmedReplacement } = this.mergeLanes(
      snapshot,
      competition,
      previous,
      reset !== null,
      sessionHistory,
      observedSeriesCounts,
    );
    const { definition, reason } = this.resolveDefinition(competition, previous);
    const participants = lanes.flatMap((lane) => lane.assignment?.athlete?.id ?? []);
    const eventIds = [...new Set(participants.flatMap((id) => this.store.participant(id)?.event_id ?? []))];
    const eventId = eventIds.length === 1 ? eventIds[0]! : (previous?.eventId ?? null);
    const event = eventId ? this.store.eventLabels(eventId) : undefined;
    const relay = eventId ? this.store.resultRelay(eventId, competition.competitionId) : undefined;
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
      lanes,
      observedFromStart,
      definition,
      reason: unconfirmedReplacement ? unconfirmedReplacementReason : reason,
      eventId,
      eventName: event?.name ?? previous?.eventName ?? null,
      championship: event?.championship ?? previous?.championship ?? null,
      relay: relay ? String(relay.relay_number) : (previous?.relay ?? null),
    };
    if (reset || !previous || JSON.stringify(source) !== JSON.stringify(previous))
      this.store.upsertSource(subjectId, source);
  }

  /** The reset-session command this snapshot acknowledges as starting a new run of the competition. */
  private acknowledgedReset(
    snapshot: MqttControlSnapshotDto,
    competition: Competition,
    previous: SavedSource,
  ): NonNullable<MqttControlSnapshotDto['lastCommand']> | null {
    const command = snapshot.lastCommand;
    return command?.action === 'reset-session' &&
      command.competitionId === competition.competitionId &&
      command.success &&
      competition.phase === 'NOT_STARTED' &&
      competition.finishedAt === null &&
      command.commandId !== previous.resetCommandId &&
      command.lanes.some((commandLane) => {
        const lane = snapshot.lanes.find((candidate) => candidate.laneId === commandLane.laneId);
        return (
          commandLane.status === 'done' &&
          lane?.competitionState?.competitionId === competition.competitionId &&
          lane.score?.competitionId === competition.competitionId &&
          lane.score.sessionId === lane.competitionState.sessionId &&
          lane.score.totalShotCount === 0
        );
      })
      ? command
      : null;
  }

  /**
   * Freezes the run before a reset: the reset Lanes' shot windows close at their reset score, and the
   * archive keeps its shots and operations. Returns the shot windows of the new run.
   */
  private archiveBeforeReset(row: VistaSourceRow, resetLanes: readonly Lane[]): SavedSource['shotWindows'] {
    const previous = row.source;
    const shotWindows = { ...previous.shotWindows };
    const archivedWindows = { ...previous.shotWindows };
    for (const lane of resetLanes) {
      const boundary = lane.score!.publishedAt;
      archivedWindows[lane.laneId] = { after: archivedWindows[lane.laneId]?.after ?? null, before: boundary };
      shotWindows[lane.laneId] = { after: boundary, before: null };
    }
    const archived = { ...previous, shotWindows: archivedWindows };
    const frozenShotIds = [...new Set(this.observations(archived).map((shot) => shot.shotId))];
    this.store.saveSource(row.id, {
      ...previous,
      shotWindows: archivedWindows,
      frozenShotIds,
      frozenOperations: this.operations(previous.competition.competitionId),
      upstreamConnected: false,
      reason: previous.reason === unconfirmedReplacementReason ? null : previous.reason,
    });
    return shotWindows;
  }

  /**
   * Merges each joined Lane's retained streams into the saved Lanes. A new Lane session continues the
   * saved one only after a reset, a forward stage change or a completed reserve transfer; otherwise
   * the Lane keeps its saved data and the source needs synchronization.
   */
  private mergeLanes(
    snapshot: MqttControlSnapshotDto,
    competition: Competition,
    previous: SavedSource | null,
    reset: boolean,
    sessionHistory: SavedSource['sessionHistory'],
    observedSeriesCounts: SavedSource['observedSeriesCounts'],
  ): Pick<SavedSource, 'lanes' | 'observedFromStart' | 'confirmedLaneIds'> & { unconfirmedReplacement: boolean } {
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
    return {
      lanes: [...lanes.values()],
      observedFromStart: [...observedFromStart],
      confirmedLaneIds,
      unconfirmedReplacement,
    };
  }

  /** A definition change within one competition makes the subject unsupported. */
  private resolveDefinition(
    competition: Competition,
    previous: SavedSource | null,
  ): Pick<SavedSource, 'definition' | 'reason'> {
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
    return { definition, reason };
  }

  catalog(): VistaCatalog {
    this.refreshCompletedTransfers();
    return {
      identity: this.identity,
      subjects: this.store.rows().flatMap((row) => {
        const { source } = row;
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
          { ...subject, id: `${row.id}:relay`, label: `${this.projector.label(source)} · Current competition` },
          ...(source.eventId
            ? [
                {
                  ...subject,
                  id: `${row.id}:event`,
                  label: `${this.projector.label(source)} · Event results · all relays`,
                },
              ]
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
        const event = this.store.eventType(source.eventId);
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
      const { participants, shootOffActive } = this.projector.projectParticipants(source);
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
      const row = this.store.row(subjectId)!;
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
            else if (row.entryStatus && row.entryStatus !== 'COMPETING') participant.status = row.entryStatus;
            const projection = resultProjections.find(
              (result) => result.resultId === row.resultId && result.participantId === participant.id,
            );
            if (projection) {
              if (!row.classificationCode && ['eliminated', 'finished'].includes(projection.status))
                participant.status = projection.status;
              this.projector.applyResultShots(participant, projection, source, observations);
              participant.series = source.definition.stages.flatMap((stage, stageIndex) =>
                stage.scored
                  ? stage.seriesShots.flatMap((_, seriesIndex) => {
                      const slot = this.projector.resultSlot(source, stageIndex, seriesIndex)!;
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
      const ranking = this.projector.liveRanking(
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
      const next = this.projector.publicScores(
        CanonicalSnapshotSchema.parse({
          protocolVersion: VISTA_PROTOCOL_VERSION,
          sourceId: this.identity.sourceId,
          subjectId,
          generation: vistaDigest({
            competition: subjectId,
            definition: source.definition.fingerprint,
          }),
          revision: row.revision + 1,
          capturedAt,
          label: this.projector.label(source),
          phase: competition.phase,
          finished: competition.phase === 'MATCH_COMPLETE' && competition.finishedAt !== null,
          definition: source.definition,
          participants,
          clock: shootOffActive ? null : this.projector.rangeClock(source, capturedAt),
          ranking,
          eventRanking: board && board.results.length ? this.projector.ranking(board, source) : null,
        }),
      );
      if (previous) {
        const semantic = (value: CanonicalSnapshot) => ({ ...value, capturedAt: 0, revision: 0 });
        if (vistaDigest(semantic(previous)) === vistaDigest(semantic(next))) return { ...previous, capturedAt };
      }
      this.store.saveSnapshot(subjectId, JSON.stringify(next), next.revision);
      return next;
    }
    throw new Error('Source data is changing; waiting for a coherent Vista snapshot');
  }

  /** A later run cannot re-certify an earlier run's last coherent published scores. */
  private hasPublishedArchive(row: VistaSourceRow): boolean {
    if (!row.snapshot_json) return false;
    const previous = CanonicalSnapshotSchema.parse(JSON.parse(row.snapshot_json));
    return previous.finished && previous.eventRanking?.kind === 'competition';
  }

  private archivedPublishedSnapshot(subjectId: string): CanonicalSnapshot | null {
    const row = this.store.row(subjectId)!;
    if (!row.snapshot_json) return null;
    const previous = CanonicalSnapshotSchema.parse(JSON.parse(row.snapshot_json));
    if (!previous.finished || previous.eventRanking?.kind !== 'competition') return null;
    const archived = this.projector.publicScores({
      ...previous,
      capturedAt: this.now(),
      participants: previous.participants.map((participant) => ({ ...participant, dataState: 'stale', clock: null })),
      clock: null,
      ranking: previous.ranking ? { ...previous.ranking, state: 'UNVERIFIED' } : null,
      eventRanking: { ...previous.eventRanking, state: 'UNVERIFIED' },
    });
    if (vistaDigest({ ...archived, capturedAt: 0 }) !== vistaDigest({ ...previous, capturedAt: 0 })) {
      archived.revision = row.revision + 1;
      this.store.saveSnapshot(subjectId, JSON.stringify(archived), archived.revision);
    }
    return archived;
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

  private resultLinks(source: SavedSource): VistaLinkedResult[] {
    if (!source.eventId) return [];
    return this.store.resultLinks(source.eventId, source.competition.competitionTypeId.endsWith('_FINAL'));
  }

  private boundary(): string {
    return String(this.store.changeCount());
  }

  private operations(competitionId: string): VistaOperations {
    const finals = this.operationSources.finalOperations;
    const run = finals.findLatestRunByCompetition(competitionId);
    const shootOffShots = run ? finals.findShootOffShotsByRun(run.id) : [];
    const finalEntries = run ? finals.findEntriesByRun(run.id) : [];
    return {
      completedTransfers: this.completedTransfers(competitionId),
      decisions: this.operationSources.finalControls
        .findByCompetition(competitionId)
        .filter((decision) => !decision.voided),
      shootOff: run ? projectFinalOperation(run, finalEntries, shootOffShots).shootOff : null,
      shootOffShots,
    };
  }

  private completedTransfers(competitionId: string): CompletedTransfer[] {
    const transfers = this.operationSources.reserveTransfers;
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
    return this.store.transferRevision();
  }

  private refreshCompletedTransfers(): void {
    // Lane publishes its transferred state before Director persists TARGET_ACTIVE.
    // Replay only a locally observed snapshot, without waiting for another shot or command.
    if (this.latestControlSnapshot && this.currentTransferRevision() !== this.transferRevision)
      this.observe(this.latestControlSnapshot);
  }

  private load(id: string): SavedSource | null {
    return this.store.row(id)?.source ?? null;
  }
}
