// SPDX-License-Identifier: MIT
// @vitest-environment node
import { randomUUID } from 'node:crypto';

import { ISSF_2026_RULE_PACKS } from '@sasakiuri/saika-rules';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { migration088VistaRankingScopes } from '@/main/infrastructure/database/migrations/088_vista_ranking_scopes';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import { EventId, ParticipantId, SqliteParticipantRepository, GetEventByIdToken } from '@/main/modules/championship';
import { SqliteFinalControlRepository, type IFinalControlRepository } from '@/main/modules/final-control';
import { SqliteFinalOperationRepository } from '@/main/modules/final-operations';
import { SqliteFinalPlacementReviewRepository } from '@/main/modules/final-placement-review';
import { SqliteCompetitionShotJournal, type CompetitionShotObservation } from '@/main/modules/mqtt';
import { ReserveLaneTransferService, SqliteReserveTransferRepository } from '@/main/modules/reserve-lane-transfers';
import { ResultBoardSnapshotService } from '@/main/modules/result-publication';
import {
  SqliteFinalResultRepository,
  Result,
  ResultId,
  SqliteResultRepository,
  QualificationResultsReader,
  FinalResultsReader,
  qualificationCorrectionBasis,
  finalCorrectionBasis,
} from '@/main/modules/results';
import { PublishMqttFinalResultsHandler } from '@/main/modules/results/commands/PublishMqttFinalResultsHandler';
import { FinalResult } from '@/main/modules/results/domain/FinalResult';
import { FinalResultId } from '@/main/modules/results/domain/FinalResultId';
import { ScoreCorrectionService, SqliteScoreCorrectionRepository } from '@/main/modules/score-corrections';
import type { ScoreCorrectionChange } from '@/main/modules/score-corrections/domain/ScoreCorrection';
import { SqliteScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import { ScoringDecision } from '@/main/modules/scoring-decisions/domain/ScoringDecision';
import { directorVistaDefinition, vistaDigest } from '@/main/modules/vista/application/directorVistaDefinition';
import { DirectorVistaSource } from '@/main/modules/vista/application/DirectorVistaSource';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { CompetitionTypeRegistry, getMatchSeriesShotCounts } from '@/shared/competitionTypes';
import { BP60 } from '@/shared/competitionTypes/definitions/BP60';
import { BP60_FINAL } from '@/shared/competitionTypes/definitions/BP60_FINAL';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { BR60S_FINAL } from '@/shared/competitionTypes/definitions/BR60S_FINAL';
import { competitionTypeFromRulePack } from '@/shared/competitionTypes/fromRulePack';
import { IssfStandardStrategy } from '@/shared/competitionTypes/strategies/IssfStandardStrategy';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';
import type { ResultBoardSnapshotDto } from '@/shared/ipc/contracts/resultPublication.contract';
import { type ReserveLaneTransferBundle } from '@/shared/mqtt/ReserveLaneTransfer';

const competitionId = randomUUID();
const laneId = randomUUID();
const sessionId = randomUUID();
const participantId = randomUUID();
const eventId = randomUUID();
const championshipId = randomUUID();
const startedAt = '2026-09-11T00:00:00.000Z';
const publishedAt = '2026-09-11T00:00:01.000Z';
const identity = {
  protocolVersion: 1 as const,
  sourceId: 'director-test',
  bootId: 'boot',
  kind: 'director' as const,
  name: 'Director',
};

function control(registry: CompetitionTypeRegistry, eventCode = 'BR60S'): MqttControlSnapshotDto {
  const definition = registry.get(eventCode);
  return {
    connected: true,
    brokerUrl: 'mqtt://localhost:1883',
    activeCompetitionId: competitionId,
    lastCommand: null,
    competitions: [
      {
        competitionId,
        competitionTypeId: eventCode,
        competitionTypeName: definition.name,
        discipline: definition.laneProtocol!.discipline,
        roundName: definition.config.name,
        competitionUnit: 'INDIVIDUAL',
        ...(definition.rulePackIdentity
          ? {
              definitionBinding: {
                protocolVersion: 1,
                compatibilityMode: 'REQUIRED',
                rulePack: definition.rulePackIdentity,
              } as const,
            }
          : {}),
        acc: definition.laneProtocol!.acc,
        phase: 'NOT_STARTED',
        shotsPerSeries: 10,
        totalSeries: 6,
        totalShots: 60,
        laneIds: [laneId],
        startedAt: null,
        finishedAt: null,
        publishedAt: startedAt,
      },
    ],
    lanes: [
      {
        laneId,
        laneAlias: 'Lane 1',
        firingPointNumber: 1,
        hardware: null,
        competitionState: {
          competitionId,
          laneId,
          sessionId,
          phase: 'READY',
          currentStage: { index: 0, name: 'Preparation', scored: false, totalSeries: 1 },
          currentSeries: { index: 0, shotsRecorded: 0, maxShots: 0 },
          publishedAt: startedAt,
        },
        assignment: {
          competitionId,
          laneId,
          athlete: { id: participantId, name: 'Athlete', startNumber: 1 },
          assignedAt: startedAt,
          publishedAt: startedAt,
        },
        score: {
          competitionId,
          laneId,
          sessionId,
          totalScoreX10: 0,
          totalShotCount: 0,
          acc: definition.laneProtocol!.acc,
          stages: [],
          publishedAt: startedAt,
        },
        lastRawShot: null,
        lastCompetitionShot: null,
        lastSeenAt: startedAt,
      },
    ],
  };
}
function shot(): CompetitionShotObservation {
  return {
    id: randomUUID(),
    competitionId,
    laneId,
    sessionId,
    shotId: randomUUID(),
    sourceObservationId: null,
    x: 1.5,
    y: -2,
    legacyRawScoreX10: 104,
    deviceScoreX10: 104,
    calculatedScoreX10: 104,
    calculatedScoreAvailable: true,
    effectiveScoreX10: 104,
    targetProfileId: 'JRSF_BEAM_RIFLE_10M',
    scoringGaugeProfileId: 'JRSF_BEAM_RIFLE_VIRTUAL_6_00',
    innerTen: true,
    mode: 'MATCH',
    firedAt: new Date(publishedAt),
    receivedAt: new Date(publishedAt),
    stageIndex: 1,
    scored: true,
    seriesIndex: 0,
    shotNumberInSeries: 1,
    isRecorded: true,
    isReplay: false,
    publishedAt: new Date(publishedAt),
    observedAt: new Date(publishedAt),
    payloadJson: '{}',
  };
}
function fire(snapshot: MqttControlSnapshotDto) {
  const competition = snapshot.competitions[0]!;
  competition.phase = 'MATCH';
  competition.startedAt = publishedAt;
  competition.publishedAt = publishedAt;
  competition.activeTimer = {
    timerScope: 'STAGE',
    timerStartAt: publishedAt,
    timerDurationSeconds: 2700,
    stageIndex: 1,
    seriesIndex: null,
  };
  const lane = snapshot.lanes[0]!;
  lane.competitionState = {
    ...lane.competitionState!,
    phase: 'MATCH',
    currentStage: { index: 1, name: 'Match', scored: true, totalSeries: 6 },
    currentSeries: { index: 0, shotsRecorded: 1, maxShots: 10 },
    publishedAt,
  };
  lane.score = {
    ...lane.score!,
    totalShotCount: 1,
    totalScoreX10: 104,
    stages: [
      {
        stageIndex: 1,
        stageName: 'Match',
        stageTotalX10: 104,
        series: [{ seriesIndex: 0, shots: [104], seriesTotalX10: 104, isComplete: false }],
      },
    ],
    publishedAt,
  };
}

describe('Director Vista source', () => {
  let db: Database.Database;
  let registry: CompetitionTypeRegistry;
  let journal: SqliteCompetitionShotJournal;
  let source: DirectorVistaSource;
  let checkedAt: number;
  const board = vi.fn<(event: string, scope: 'QUALIFICATION' | 'FINAL') => Promise<ResultBoardSnapshotDto>>();
  beforeEach(() => {
    db = new Database(':memory:');
    new MigrationRunner(db).run(allMigrations);
    registry = new CompetitionTypeRegistry();
    registry.registerStrategy(new IssfStandardStrategy());
    for (const definition of [BR60S, BR60S_FINAL, BP60, BP60_FINAL]) registry.register(definition);
    for (const pack of ISSF_2026_RULE_PACKS)
      registry.register(
        competitionTypeFromRulePack(pack, {
          includeTeamResults: pack.round !== 'FINAL' || pack.capabilities.team !== undefined,
        }),
      );
    journal = new SqliteCompetitionShotJournal(db);
    checkedAt = Date.parse(publishedAt);
    board.mockReset();
    board.mockImplementation(async (_, scope) => ({
      eventId,
      resultScope: scope,
      snapshotRevision: 'draft',
      checkedAt: publishedAt,
      state: 'DRAFT',
      postedAt: null,
      protestEndsAt: null,
      results: [],
    }));
    source = new DirectorVistaSource(db, registry, journal, { getSnapshot: board }, identity, () => checkedAt);
  });
  afterEach(() => db.close());

  function seedEvent(eventCode = 'BR60S') {
    db.prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)').run(
      championshipId,
      'Championship',
      '2026-09-11',
      'Range',
    );
    db.prepare('INSERT INTO events (id, championship_id, name, event_type, round) VALUES (?, ?, ?, ?, ?)').run(
      eventId,
      championshipId,
      'Event',
      eventCode,
      'Qualification',
    );
    db.prepare('INSERT INTO participants (id, event_id, player_name) VALUES (?, ?, ?)').run(
      participantId,
      eventId,
      'Athlete',
    );
  }

  function officialSource(eventCode = 'BP60', laneCount = 1, recordedShotCount = Infinity) {
    seedEvent(eventCode);
    const definition = registry.get(eventCode);
    const final = eventCode.endsWith('_FINAL');
    const snapshot = control(registry, eventCode);
    const resultRepository = new SqliteResultRepository(db);
    const finalRepository = new SqliteFinalResultRepository(db);
    const ids: string[] = [];
    const observations: CompetitionShotObservation[][] = [];
    for (let index = 1; index < laneCount; index++) {
      const lane = structuredClone(snapshot.lanes[0]!);
      lane.laneId = randomUUID();
      lane.competitionState!.laneId = lane.laneId;
      lane.competitionState!.sessionId = randomUUID();
      lane.assignment!.laneId = lane.laneId;
      lane.assignment!.athlete!.id = randomUUID();
      lane.assignment!.athlete!.name = `Athlete ${index}`;
      lane.score!.laneId = lane.laneId;
      lane.score!.sessionId = lane.competitionState!.sessionId;
      snapshot.competitions[0]!.laneIds.push(lane.laneId);
      snapshot.lanes.push(lane);
      db.prepare('INSERT INTO participants (id, event_id, player_name) VALUES (?, ?, ?)').run(
        lane.assignment!.athlete!.id,
        eventId,
        lane.assignment!.athlete!.name,
      );
    }
    source.observe(snapshot);
    const positions = definition.config.stages.flatMap((stage, stageIndex) =>
      stage.type === 'match'
        ? stage.series.flatMap((series, seriesIndex) =>
            Array.from({ length: series.shots }, (_, shotIndex) => ({
              stageIndex,
              seriesIndex,
              shotNumberInSeries: shotIndex + 1,
            })),
          )
        : [],
    );
    for (const [index, lane] of snapshot.lanes.entries()) {
      const shots = positions.slice(0, recordedShotCount).map((position, shotIndex) => ({
        ...shot(),
        ...position,
        laneId: lane.laneId,
        sessionId: lane.competitionState!.sessionId,
        effectiveScoreX10: 100,
        calculatedScoreX10: 104,
        deviceScoreX10: 104,
        targetProfileId: eventCode.startsWith('BP') ? 'JRSF_BEAM_PISTOL_10M' : 'JRSF_BEAM_RIFLE_10M',
        innerTen: index === 1 && shotIndex === 0,
      }));
      observations.push(shots);
      shots.forEach((entry) => journal.append(entry));
      const state = lane.competitionState!;
      const last = positions[shots.length - 1]!;
      state.phase = 'FINISHED';
      state.finalSnapshotCommandId = randomUUID();
      state.currentStage = {
        index: last.stageIndex,
        name: definition.config.stages[last.stageIndex]!.name,
        scored: true,
        totalSeries: definition.config.stages[last.stageIndex]!.series.length,
      };
      state.currentSeries = {
        index: last.seriesIndex,
        maxShots: definition.config.stages[last.stageIndex]!.series[last.seriesIndex]!.shots,
        shotsRecorded: last.shotNumberInSeries,
      };
      state.publishedAt = publishedAt;
      lane.score!.finalSnapshotCommandId = state.finalSnapshotCommandId;
      lane.score!.totalShotCount = shots.length;
      lane.score!.totalScoreX10 = shots.length * 100;
      lane.score!.publishedAt = publishedAt;
      lane.score!.stages = definition.config.stages.flatMap((stage, stageIndex) =>
        stage.type === 'match'
          ? [
              {
                stageIndex,
                stageName: stage.name,
                stageTotalX10: shots.filter((entry) => entry.stageIndex === stageIndex).length * 100,
                series: stage.series.flatMap((series, seriesIndex) => {
                  const recorded = shots.filter(
                    (entry) => entry.stageIndex === stageIndex && entry.seriesIndex === seriesIndex,
                  );
                  return recorded.length
                    ? [
                        {
                          seriesIndex,
                          shots: recorded.map(() => 100),
                          seriesTotalX10: recorded.length * 100,
                          isComplete: recorded.length === series.shots,
                        },
                      ]
                    : [];
                }),
              },
            ]
          : [],
      );
      const id = randomUUID();
      ids.push(id);
      if (final)
        finalRepository.save(
          FinalResult.reconstruct(
            FinalResultId.create(id),
            EventId.reconstruct(eventId),
            ParticipantId.reconstruct(lane.assignment!.athlete!.id),
            lane.assignment!.athlete!.name,
            '',
            index + 1,
            Array<number>(10).fill(10),
            100,
            Array<number>(14).fill(10),
            140,
            240,
            index + 1,
            undefined,
            undefined,
            '',
            'finished',
          ),
          competitionId,
        );
      else
        resultRepository.save(
          Result.create(
            ResultId.reconstruct(id),
            EventId.reconstruct(eventId),
            ParticipantId.reconstruct(lane.assignment!.athlete!.id),
            lane.assignment!.athlete!.name,
            '',
            shots.length * 10,
            Array.from(
              { length: 6 },
              (_, seriesIndex) => Math.max(0, Math.min(10, shots.length - seriesIndex * 10)) * 10,
            ),
            Array.from({ length: 60 }, (_, shotIndex) => (shotIndex < shots.length ? 10 : 0)),
            1,
            'confirmed',
            definition.resultFormat,
            competitionId,
            lane.assignment!.athlete!.name,
            lane.laneId,
            shots.map((entry, shotIndex) => ({
              shotId: entry.shotId,
              ringScore: 10,
              decimalScore: 10.4,
              decimalScoreSource: 'DEVICE',
              innerTen: entry.innerTen,
              seriesIndex: Math.floor(shotIndex / 10),
            })),
          ),
        );
    }
    snapshot.competitions[0]!.phase = 'MATCH_COMPLETE';
    snapshot.competitions[0]!.finishedAt = publishedAt;
    snapshot.competitions[0]!.publishedAt = publishedAt;
    const corrections = new ScoreCorrectionService(
      new SqliteScoreCorrectionRepository(db),
      {
        resolve: (id) => ({
          basis: final
            ? finalCorrectionBasis(finalRepository.findById(id)!, getMatchSeriesShotCounts(definition))
            : qualificationCorrectionBasis(resultRepository.findById(id)!, { revision: '', active: [] }),
          scoring: definition.laneProtocol!.acc,
        }),
      },
      { list: () => [], revision: () => 'jury-v1' },
    );
    const queryBus = { execute: async () => ({ eventType: eventCode }) } as unknown as QueryBus;
    const decisions = new SqliteScoringDecisionRepository(db);
    const reader = final
      ? new FinalResultsReader(
          queryBus,
          finalRepository,
          decisions,
          new SqliteFinalPlacementReviewRepository(db),
          registry,
          undefined,
          corrections,
        )
      : new QualificationResultsReader(
          queryBus,
          resultRepository,
          decisions,
          registry,
          new SqliteParticipantRepository(db),
          undefined,
          undefined,
          corrections,
        );
    const boards = new ResultBoardSnapshotService(
      {
        getStatus: async (_, scope) => {
          const results = await reader.getByEvent(eventId);
          return {
            eventId,
            resultScope: scope,
            snapshotRevision: vistaDigest(results),
            currentApproval: null,
            readyForApproval: false,
            results: results.map((result) => ({
              resultId: result.id,
              rank: result.rank,
              entryStatus: 'entryStatus' in result ? result.entryStatus : null,
              playerName: result.playerName,
              affiliation: result.affiliation,
              totalScore: result.totalScore,
              classificationCode: result.classificationCode,
            })),
          };
        },
      },
      {
        getStatus: async (_, resultScope) => ({
          eventId,
          resultScope,
          currentSnapshotRevision: null,
          publicationCurrent: false,
          status: 'DRAFT',
          approvalId: null,
          postedAt: null,
          protestEndsAt: null,
        }),
      },
      {
        getStatus: async () => ({
          eventId,
          currentSnapshotRevision: null,
          declarationCurrent: false,
          declaration: null,
        }),
      },
    );
    const readProjection = vi.fn(() => reader.getDisplayByEvent(eventId));
    source = new DirectorVistaSource(db, registry, journal, boards, identity, () => checkedAt, readProjection);
    source.observe(snapshot);
    const apply = (changes: ScoreCorrectionChange[]) => {
      const request = {
        resultId: ids[0]!,
        resultScope: final ? ('FINAL' as const) : ('QUALIFICATION' as const),
        caseId: randomUUID(),
        decisionId: randomUUID(),
        officialName: 'Jury',
        statement: 'Independent evidence checked',
        changes,
      };
      const preview = corrections.preview(request);
      return corrections.apply({ id: randomUUID(), request, expectedDigest: preview.digest, confirmed: true });
    };
    const withdraw = (applicationId: string) =>
      corrections.withdraw({
        id: randomUUID(),
        applicationId,
        officialName: 'Jury',
        statement: 'Correction withdrawn after review',
      });
    return { ids, observations, reader, corrections, apply, withdraw, readProjection };
  }

  it.each(['RPO', 'MQS', 'OOC', 'DNS', 'DNF', 'DSQ', 'DQB'] as const)(
    'applies the %s public score and rank policy in both saved event and relay views',
    async (entryStatus) => {
      const hidesScore = ['DNS', 'DSQ', 'DQB'].includes(entryStatus);
      officialSource('BP60', 2);
      const before = await source.snapshot(`${competitionId}:event`);
      db.prepare('UPDATE participants SET entry_status = ? WHERE id = ?').run(entryStatus, participantId);
      for (const scope of ['event', 'relay']) {
        const result = await source.snapshot(`${competitionId}:${scope}`);
        expect(result.ranking!.rows.find((row) => row.id === participantId)).toMatchObject({
          rank: null,
          classification: entryStatus,
          total: ['DNS', 'DSQ', 'DQB'].includes(entryStatus) ? null : 600,
        });
        expect(result.ranking!.rows.filter((row) => row.rank !== null).map((row) => row.rank)).toEqual([1]);
        const participant = result.participants.find((row) => row.id === participantId)!;
        expect(participant.total).toBe(['DNS', 'DSQ', 'DQB'].includes(entryStatus) ? null : 600);
        expect(participant.series.every((series) => series.total === null)).toBe(hidesScore);
        expect(participant.shots.length).toBeGreaterThan(0);
      }
      expect((await source.snapshot(`${competitionId}:event`)).revision).not.toBe(before.revision);
      const stored = db
        .prepare('SELECT source_json, snapshot_json FROM vista_competition_sources WHERE id = ?')
        .get(competitionId) as { source_json: string; snapshot_json: string };
      expect(db.prepare('SELECT total_score FROM results WHERE participant_id = ?').get(participantId)).toEqual({
        total_score: 600,
      });
      const archivedSource = { ...JSON.parse(stored.source_json), frozenShotIds: [] };
      db.prepare('UPDATE vista_competition_sources SET source_json = ? WHERE id = ?').run(
        JSON.stringify(archivedSource),
        competitionId,
      );
      const archived = await source.snapshot(`${competitionId}:relay`);
      const participant = archived.participants.find((row) => row.id === participantId)!;
      expect(participant.total).toBe(hidesScore ? null : 600);
      expect(participant.series.every((series) => series.total === null)).toBe(hidesScore);
      expect(participant.shots.length).toBeGreaterThan(0);
      expect(archived.ranking!.rows.find((row) => row.id === participantId)!.total).toBe(hidesScore ? null : 600);
    },
  );

  it.each(['live', 'archive'] as const)(
    'revises legacy %s public scores without changing the selected generation',
    async (kind) => {
      officialSource('BP60', 2);
      db.prepare('UPDATE participants SET entry_status = ? WHERE id = ?').run('DSQ', participantId);
      const before = await source.snapshot(`${competitionId}:relay`);
      const stored = db
        .prepare('SELECT source_json, snapshot_json FROM vista_competition_sources WHERE id = ?')
        .get(competitionId) as { source_json: string; snapshot_json: string };
      const legacy = JSON.parse(stored.snapshot_json);
      const participant = legacy.participants.find((row: { id: string }) => row.id === participantId);
      participant.total = 600;
      participant.series.forEach((series: { total: number }) => {
        series.total = 100;
      });
      for (const ranking of [legacy.ranking, legacy.eventRanking])
        ranking.rows.find((row: { id: string }) => row.id === participantId).total = 600;
      const savedSource = JSON.parse(stored.source_json);
      if (kind === 'archive') savedSource.frozenShotIds = [];
      db.prepare('UPDATE vista_competition_sources SET source_json = ?, snapshot_json = ? WHERE id = ?').run(
        JSON.stringify(savedSource),
        JSON.stringify(legacy),
        competitionId,
      );
      const corrected = await source.snapshot(`${competitionId}:relay`);
      expect(corrected.generation).toBe(before.generation);
      expect(corrected.revision).toBeGreaterThan(before.revision);
      expect(corrected.participants.find((row) => row.id === participantId)!.total).toBeNull();
      expect(corrected.ranking!.rows.find((row) => row.id === participantId)!.total).toBeNull();
      expect((await source.snapshot(`${competitionId}:relay`)).revision).toBe(corrected.revision);
      expect(db.prepare('SELECT total_score FROM results WHERE participant_id = ?').get(participantId)).toEqual({
        total_score: 600,
      });
      if (kind === 'live') {
        db.prepare('UPDATE participants SET entry_status = ? WHERE id = ?').run('COMPETING', participantId);
      }
      const restored = await source.snapshot(`${competitionId}:relay`);
      expect(restored.participants.find((row) => row.id === participantId)!.total).toBe(kind === 'live' ? 600 : null);
      expect(restored.generation).toBe(before.generation);
      expect(restored.revision).toBeGreaterThanOrEqual(corrected.revision);
      expect(restored.revision > corrected.revision).toBe(kind === 'live');
    },
  );

  it.each(
    (['BP60', 'BR60S_FINAL'] as const).flatMap((eventCode) =>
      (['DSQ', 'DQB', 'AD_DSQ'] as const).map((classificationCode) => ({ eventCode, classificationCode })),
    ),
  )(
    'excludes $classificationCode from $eventCode relay places until revoked',
    async ({ eventCode, classificationCode }) => {
      const fixture = officialSource(eventCode, 2);
      const originalRelay = await source.snapshot(`${competitionId}:relay`);
      const originalEvent = await source.snapshot(`${competitionId}:event`);
      const target = {
        eventId,
        participantId,
        relayNumber: 1,
        resultScope: eventCode === 'BR60S_FINAL' ? ('FINAL' as const) : ('QUALIFICATION' as const),
        resultIdAtDecision: fixture.ids[0]!,
        sourceCompetitionId: competitionId,
      };
      const decisions = new SqliteScoringDecisionRepository(db);
      const decision = ScoringDecision.create({
        ...target,
        type: 'DISQUALIFICATION',
        applicationPolicy: 'NONE',
        classificationCode,
        ruleReference: 'Jury classification decision',
        publicRemark: 'Athlete disqualified',
        officialName: 'Jury',
        decidedAt: new Date(publishedAt),
      });
      decisions.append(decision);
      const official = (await fixture.reader.getByEvent(eventId)).find((row) => row.participantId === participantId)!;
      expect(official).toMatchObject({ rank: 0, classificationCode, totalScore: 0 });
      const classifiedRelay = await source.snapshot(`${competitionId}:relay`);
      const classifiedEvent = await source.snapshot(`${competitionId}:event`);
      for (const snapshot of [classifiedRelay, classifiedEvent]) {
        expect(snapshot.ranking!.rows.find((row) => row.id === participantId)).toMatchObject({
          rank: null,
          classification: classificationCode,
          total: null,
        });
        expect(snapshot.participants.find((participant) => participant.id === participantId)!.status).toBe(
          classificationCode,
        );
      }
      expect(classifiedRelay.revision).toBeGreaterThan(originalRelay.revision);

      decisions.append(
        ScoringDecision.createRevocation({
          ...target,
          reversesDecisionId: decision.id,
          ruleReference: 'Jury classification decision withdrawn',
          reason: 'Classification withdrawn after review',
          officialName: 'Jury',
          decidedAt: new Date(Date.parse(publishedAt) + 1000),
        }),
      );
      const restoredRelay = await source.snapshot(`${competitionId}:relay`);
      const restoredEvent = await source.snapshot(`${competitionId}:event`);
      expect(restoredRelay.ranking!.rows).toEqual(originalRelay.ranking!.rows);
      expect(restoredEvent.ranking!.rows).toEqual(originalEvent.ranking!.rows);
      expect(restoredRelay.participants).toEqual(originalRelay.participants);
      expect(restoredRelay.revision).toBeGreaterThan(classifiedRelay.revision);
    },
  );

  it('orders finished Final relay rows by the official placements after a tie is resolved', async () => {
    const fixture = officialSource('BR60S_FINAL', 2);
    db.prepare('UPDATE final_results SET final_rank = ? WHERE id = ?').run(2, fixture.ids[0]!);
    db.prepare('UPDATE final_results SET final_rank = ? WHERE id = ?').run(1, fixture.ids[1]!);

    const relay = await source.snapshot(`${competitionId}:relay`);
    const event = await source.snapshot(`${competitionId}:event`);

    expect(relay.ranking!.rows.map((row) => row.rank)).toEqual([1, 2]);
    expect(relay.ranking!.rows.map((row) => row.id)).toEqual(event.ranking!.rows.map((row) => row.id));
    expect(relay.ranking!.rows[0]!.id).toBe(relay.participants[1]!.id);
  });

  it.each([
    ['BP60', 1],
    ['BP60', 2],
    ['BR60S_FINAL', 1],
    ['BR60S_FINAL', 2],
  ] as const)('retains corrected %s results when one of %i participants is deleted', async (eventCode, count) => {
    const fixture = officialSource(eventCode, count);
    fixture.apply([
      {
        operation: 'REPLACE',
        shotIndex: 0,
        scoreX10: 90,
        decimalScore: 9,
        innerTen: false,
        sourceShotId: fixture.observations[0]![0]!.shotId,
        evidenceReference: 'Jury score correction',
      },
    ]);
    const corrected = await source.snapshot(`${competitionId}:relay`);
    const event = await source.snapshot(`${competitionId}:event`);
    expect(corrected.participants[0]!.total).toBe(eventCode === 'BP60' ? 599 : 239);

    db.prepare('DELETE FROM participants WHERE id = ?').run(participantId);
    await expect(fixture.reader.getByEvent(eventId)).resolves.toHaveLength(count - 1);

    const retained = await source.snapshot(`${competitionId}:relay`);
    expect(retained.participants).toEqual(
      corrected.participants.map((participant) => ({ ...participant, dataState: 'stale', clock: null })),
    );
    expect(retained.ranking).toEqual({ ...corrected.ranking, state: 'UNVERIFIED' });
    expect((await source.snapshot(`${competitionId}:event`)).ranking).toEqual({
      ...event.ranking,
      state: 'UNVERIFIED',
    });
    expect(retained.revision).toBeGreaterThan(corrected.revision);

    source = new DirectorVistaSource(db, registry, journal, { getSnapshot: board }, identity, () => checkedAt);
    expect(await source.snapshot(`${competitionId}:relay`)).toEqual(retained);
  });

  it('uses and withdraws Jury inner-ten corrections for relay places through the official reader', async () => {
    const fixture = officialSource('BP60', 2);
    const before = await source.snapshot(`${competitionId}:relay`);
    expect(before.ranking!.rows.map((row) => row.id)).toEqual([before.participants[1]!.id, participantId]);
    const application = fixture.apply(
      fixture.observations[0]!.slice(0, 2).map((entry, shotIndex) => ({
        operation: 'REPLACE',
        shotIndex,
        scoreX10: 100,
        decimalScore: 10.4,
        innerTen: true,
        sourceShotId: entry.shotId,
        evidenceReference: 'Independent inner-ten evidence',
      })),
    );
    const corrected = await source.snapshot(`${competitionId}:relay`);
    expect(corrected.ranking!.rows.map((row) => ({ id: row.id, rank: row.rank }))).toEqual([
      { id: participantId, rank: 1 },
      { id: before.participants[1]!.id, rank: 2 },
    ]);
    expect((await source.snapshot(`${competitionId}:event`)).ranking!.rows.map((row) => row.id)).toEqual(
      corrected.ranking!.rows.map((row) => row.id),
    );
    expect(corrected.generation).toBe(before.generation);
    expect(corrected.revision).toBeGreaterThan(before.revision);
    fixture.withdraw(application.id);
    const tiedApplication = fixture.apply(
      fixture.observations[0]!.slice(0, 2).map((entry, shotIndex) => ({
        operation: 'REPLACE',
        shotIndex,
        scoreX10: 100,
        decimalScore: 10.4,
        innerTen: shotIndex === 0,
        sourceShotId: entry.shotId,
        evidenceReference: 'Revised inner-ten evidence',
      })),
    );
    const tied = await source.snapshot(`${competitionId}:relay`);
    expect(tied.ranking!.rows.map((row) => row.id)).toEqual(corrected.ranking!.rows.map((row) => row.id));
    expect(tied.ranking!.rows.map((row) => row.rank)).toEqual([1, 1]);
    expect(tied.participants).toEqual(corrected.participants);
    expect(tied.ranking!.revision).not.toBe(corrected.ranking!.revision);
    fixture.withdraw(tiedApplication.id);
    const restored = await source.snapshot(`${competitionId}:relay`);
    expect(restored.ranking!.rows).toEqual(before.ranking!.rows);
    expect(restored.participants[0]!.shots).toEqual(before.participants[0]!.shots);
    expect(restored.revision).toBeGreaterThan(corrected.revision);
  });

  it.each(['BP60', 'BR60S_FINAL'])(
    'preserves original %s shot identity across insertions and unknown replacements',
    async (eventCode) => {
      const fixture = officialSource(eventCode);
      const before = await source.snapshot(`${competitionId}:relay`);
      const originals = before.participants[0]!.shots;
      expect(originals[0]).toMatchObject({
        id: fixture.observations[0]![0]!.shotId,
        score: 10,
        x: 1.5,
        y: -2,
        recorded: true,
      });
      const application = fixture.apply([
        {
          operation: 'INSERT_MISSING',
          shotIndex: 0,
          scoreX10: 90,
          decimalScore: null,
          innerTen: false,
          sourceShotId: null,
          evidenceReference: 'Missing first shot',
        },
        {
          operation: 'INSERT_MISSING',
          shotIndex: 2,
          scoreX10: 80,
          decimalScore: null,
          innerTen: false,
          sourceShotId: null,
          evidenceReference: 'Missing second shot',
        },
        {
          operation: 'REPLACE',
          shotIndex: 3,
          scoreX10: 70,
          decimalScore: null,
          innerTen: false,
          sourceShotId: null,
          evidenceReference: 'Unknown replacement identity',
        },
      ]);
      const corrected = await source.snapshot(`${competitionId}:relay`);
      const shots = corrected.participants[0]!.shots;
      expect(shots.slice(0, 4).map((entry) => ({ score: entry.score, x: entry.x, y: entry.y }))).toEqual([
        { score: 9, x: null, y: null },
        { score: 10, x: 1.5, y: -2 },
        { score: 8, x: null, y: null },
        { score: 7, x: null, y: null },
      ]);
      expect(shots[1]!.id).toBe(originals[0]!.id);
      expect(shots[4]).toMatchObject({ id: originals[2]!.id, score: 10, x: 1.5, y: -2 });
      expect(shots.find((entry) => entry.id === originals[1]!.id)).toMatchObject({ score: 10, recorded: false });
      expect(corrected.participants[0]!.historyComplete).toBe(false);
      expect(corrected.generation).toBe(before.generation);
      expect(corrected.revision).toBeGreaterThan(before.revision);
      expect((await source.snapshot(`${competitionId}:relay`)).revision).toBe(corrected.revision);
      fixture.withdraw(application.id);
      const restored = await source.snapshot(`${competitionId}:relay`);
      expect(restored.participants[0]!.shots).toEqual(originals);
      expect(restored.revision).toBeGreaterThan(corrected.revision);
    },
  );

  it('retries a Jury correction across the board and detailed result boundary before persistence', async () => {
    const fixture = officialSource();
    const before = await source.snapshot(`${competitionId}:relay`);
    fixture.readProjection.mockImplementationOnce(async () => {
      const previous = await fixture.reader.getDisplayByEvent(eventId);
      fixture.apply([
        {
          operation: 'REPLACE',
          shotIndex: 0,
          scoreX10: 90,
          decimalScore: 9.4,
          innerTen: false,
          sourceShotId: fixture.observations[0]![0]!.shotId,
          evidenceReference: 'New Jury decision during acquisition',
        },
      ]);
      return previous;
    });
    const corrected = await source.snapshot(`${competitionId}:relay`);
    expect(corrected.participants[0]!.total).toBe(599);
    expect(corrected.participants[0]!.shots[0]).toMatchObject({ score: 9, corrected: true });
    expect(corrected.ranking!.rows[0]!.total).toBe(599);
    expect(corrected.revision).toBe(before.revision + 1);
    const saved = JSON.parse(
      (
        db.prepare('SELECT snapshot_json FROM vista_competition_sources WHERE id = ?').get(competitionId) as {
          snapshot_json: string;
        }
      ).snapshot_json,
    );
    expect(saved.participants[0].total).toBe(599);
    expect(saved.participants[0].shots[0].score).toBe(9);
    expect(saved.eventRanking.rows[0].total).toBe(599);
  });

  it('counts an inserted shot without counting a padded unused result slot as a real zero', async () => {
    const fixture = officialSource('BP60', 1, 59);
    const before = await source.snapshot(`${competitionId}:relay`);
    expect(before.participants[0]).toMatchObject({ shotCount: 59, total: 590 });
    expect(before.participants[0]!.shots).toHaveLength(59);
    const application = fixture.apply([
      {
        operation: 'INSERT_MISSING',
        shotIndex: 0,
        scoreX10: 90,
        decimalScore: null,
        innerTen: false,
        sourceShotId: null,
        evidenceReference: 'Missing original shot',
      },
    ]);
    const corrected = await source.snapshot(`${competitionId}:relay`);
    expect(corrected.participants[0]).toMatchObject({ shotCount: 60, total: 599, historyComplete: false });
    expect(corrected.participants[0]!.shots).toHaveLength(60);
    expect(corrected.participants[0]!.shots[0]).toMatchObject({ score: 9, x: null, y: null, corrected: true });
    expect(corrected.participants[0]!.series.map((series) => series.total)).toEqual([99, 100, 100, 100, 100, 100]);
    expect(corrected.participants[0]!.shots.filter((entry) => entry.score === 0)).toEqual([]);
    fixture.withdraw(application.id);
    expect((await source.snapshot(`${competitionId}:relay`)).participants[0]).toMatchObject({
      shotCount: 59,
      total: 590,
    });
  });

  it('keeps a result without source identity unknown instead of certifying zero shots', async () => {
    const fixture = officialSource();
    fixture.readProjection.mockImplementation(async () =>
      (await fixture.reader.getDisplayByEvent(eventId)).map((result) => ({
        ...result,
        shots: result.shots.map((entry) => ({ ...entry, sourceShotId: null, sourceShotIndex: null, corrected: false })),
      })),
    );
    const result = await source.snapshot(`${competitionId}:relay`);
    expect(result.participants[0]).toMatchObject({ total: 600, shotCount: null, historyComplete: false });
    expect(result.participants[0]!.shots.filter((entry) => entry.recorded)).toEqual([]);
  });

  it('keeps explicit relay and event scopes through finish, corrections, restart and result replacement', async () => {
    seedEvent();
    const earlierParticipant = randomUUID();
    db.prepare('INSERT INTO participants (id, event_id, player_name) VALUES (?, ?, ?)').run(
      earlierParticipant,
      eventId,
      'Earlier relay',
    );
    const insertResult = db.prepare(
      'INSERT INTO results (id, event_id, participant_id, player_name, relay_number, total_score, shots_detail, source_competition_id, source_lane_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    insertResult.run('earlier', eventId, earlierParticipant, 'Earlier relay', 1, 600, '[]', randomUUID(), laneId);
    insertResult.run('selected', eventId, participantId, 'Athlete', 2, 590, '[]', competitionId, laneId);
    const eventBoard: ResultBoardSnapshotDto = {
      eventId,
      resultScope: 'QUALIFICATION',
      snapshotRevision: 'first',
      checkedAt: publishedAt,
      state: 'OFFICIAL',
      postedAt: publishedAt,
      protestEndsAt: null,
      results: [
        {
          resultId: 'earlier',
          rank: 1,
          playerName: 'Earlier relay',
          affiliation: '',
          totalScore: 600,
          entryStatus: 'COMPETING' as const,
          classificationCode: null,
        },
        {
          resultId: 'selected',
          rank: 2,
          playerName: 'Athlete',
          affiliation: '',
          totalScore: 590,
          entryStatus: 'COMPETING' as const,
          classificationCode: null,
        },
      ],
    };
    board.mockResolvedValue(eventBoard);
    const snapshot = control(registry);
    fire(snapshot);
    source.observe(snapshot);
    const relayId = `${competitionId}:relay`;
    const eventSubjectId = `${competitionId}:event`;
    expect(source.catalog().subjects.map((subject) => ({ id: subject.id, label: subject.label }))).toEqual([
      { id: relayId, label: expect.stringContaining('Current competition') },
      { id: eventSubjectId, label: expect.stringContaining('Event results · all relays') },
    ]);
    const relay = await source.snapshot(relayId);
    const event = await source.snapshot(eventSubjectId);
    expect(relay.ranking!.rows.map((row) => row.id)).toEqual([participantId]);
    expect(event.ranking!.rows.map((row) => row.id)).toEqual([earlierParticipant, participantId]);
    expect(event.revision).toBe(relay.revision);
    expect(event.generation).not.toBe(relay.generation);
    expect(db.prepare('SELECT count(*) AS count FROM vista_competition_sources').get()).toEqual({ count: 1 });

    snapshot.competitions[0]!.phase = 'MATCH_COMPLETE';
    snapshot.competitions[0]!.finishedAt = publishedAt;
    source.observe(snapshot);
    const finishedRelay = await source.snapshot(relayId);
    const finishedEvent = await source.snapshot(eventSubjectId);
    expect(finishedRelay).toMatchObject({
      subjectId: relayId,
      generation: relay.generation,
      ranking: { kind: 'live', rows: [{ id: participantId, rank: 1, total: 590 }] },
    });
    expect(finishedEvent).toMatchObject({
      subjectId: eventSubjectId,
      generation: event.generation,
      ranking: {
        kind: 'competition',
        state: 'OFFICIAL',
        rows: [{ id: earlierParticipant }, { id: participantId, rank: 2 }],
      },
    });
    eventBoard.snapshotRevision = 'corrected';
    eventBoard.results[1]!.totalScore = 580;
    const correctedRelay = await source.snapshot(relayId);
    const correctedEvent = await source.snapshot(eventSubjectId);
    expect(correctedRelay.ranking!.rows).toEqual([expect.objectContaining({ total: 580, rank: 1 })]);
    expect(correctedEvent.ranking!.rows[1]).toMatchObject({ total: 580, rank: 2 });
    expect(correctedRelay.revision).toBeGreaterThan(finishedRelay.revision);

    source = new DirectorVistaSource(db, registry, journal, { getSnapshot: board }, identity, () => checkedAt);
    expect(await source.snapshot(relayId)).toEqual(correctedRelay);
    expect(await source.snapshot(eventSubjectId)).toEqual(correctedEvent);
    db.prepare('UPDATE results SET source_competition_id = ? WHERE id = ?').run(randomUUID(), 'selected');
    eventBoard.snapshotRevision = 'replacement';
    eventBoard.results[1]!.totalScore = 610;
    const archivedRelay = await source.snapshot(relayId);
    const archivedEvent = await source.snapshot(eventSubjectId);
    expect(archivedRelay.ranking).toMatchObject({ state: 'UNVERIFIED', rows: [{ id: participantId, total: 580 }] });
    expect(archivedEvent.ranking).toMatchObject({
      state: 'UNVERIFIED',
      rows: [{ id: earlierParticipant }, { id: participantId, total: 580 }],
    });
    expect(archivedEvent.revision).toBe(archivedRelay.revision);
    expect((await source.snapshot(relayId)).revision).toBe(archivedRelay.revision);
  });

  it('does not substitute relay standings when event results have not been acquired', async () => {
    seedEvent();
    const snapshot = control(registry);
    fire(snapshot);
    source.observe(snapshot);
    expect((await source.snapshot(`${competitionId}:relay`)).ranking!.rows).toHaveLength(1);
    await expect(source.snapshot(`${competitionId}:event`)).rejects.toThrow('Event results have not been acquired');
    await expect(source.snapshot(competitionId)).rejects.toThrow('Select a current competition or event-results');
  });

  it.each(['published', 'reset archive'] as const)(
    'migrates a legacy %s without losing corrected scores or reusing event places for the relay',
    async (kind) => {
      seedEvent();
      db.prepare(
        'INSERT INTO results (id, event_id, participant_id, player_name, relay_number, total_score, shots_detail, source_competition_id, source_lane_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run('result', eventId, participantId, 'Athlete', 2, 8.4, '[10.4]', competitionId, laneId);
      board.mockResolvedValue({
        eventId,
        resultScope: 'QUALIFICATION',
        snapshotRevision: 'official-correction',
        checkedAt: publishedAt,
        state: 'OFFICIAL',
        postedAt: publishedAt,
        protestEndsAt: null,
        results: [
          {
            resultId: 'result',
            rank: 7,
            playerName: 'Athlete',
            affiliation: '',
            totalScore: 8.4,
            entryStatus: 'COMPETING' as const,
            classificationCode: null,
          },
        ],
      });
      const snapshot = control(registry);
      fire(snapshot);
      snapshot.competitions[0]!.phase = 'MATCH_COMPLETE';
      snapshot.competitions[0]!.finishedAt = publishedAt;
      source.observe(snapshot);
      await source.snapshot(`${competitionId}:event`);
      const stored = db
        .prepare('SELECT source_json, snapshot_json FROM vista_competition_sources WHERE id = ?')
        .get(competitionId) as {
        source_json: string;
        snapshot_json: string;
      };
      const { eventRanking, ...canonical } = JSON.parse(stored.snapshot_json);
      const legacy = { ...canonical, ranking: eventRanking };
      const savedSource = JSON.parse(stored.source_json);
      delete savedSource.frozenOperations;
      if (kind === 'reset archive') savedSource.frozenShotIds = [];
      db.prepare('UPDATE vista_competition_sources SET source_json = ?, snapshot_json = ? WHERE id = ?').run(
        JSON.stringify(savedSource),
        JSON.stringify(legacy),
        competitionId,
      );
      db.transaction(() => migration088VistaRankingScopes.up(db))();
      const migrated = JSON.parse(
        (
          db.prepare('SELECT snapshot_json FROM vista_competition_sources WHERE id = ?').get(competitionId) as {
            snapshot_json: string;
          }
        ).snapshot_json,
      );
      expect(migrated.eventRanking).toEqual(legacy.ranking);
      expect(migrated.ranking).toMatchObject({
        kind: 'live',
        state: 'UNVERIFIED',
        rows: [{ id: participantId, rank: null, total: 8.4 }],
      });
      expect(migrated.participants).toEqual(legacy.participants);
      expect(migrated.revision).toBeGreaterThan(legacy.revision);
      if (kind === 'published') db.prepare('UPDATE results SET source_competition_id = ?').run(randomUUID());
      source = new DirectorVistaSource(db, registry, journal, { getSnapshot: board }, identity, () => checkedAt);
      expect(source.catalog().subjects.find((subject) => subject.id === `${competitionId}:relay`)?.availability).toBe(
        'available',
      );
      const relay = await source.snapshot(`${competitionId}:relay`);
      const event = await source.snapshot(`${competitionId}:event`);
      expect(relay.ranking).toMatchObject({ state: 'UNVERIFIED', rows: [{ rank: null, total: 8.4 }] });
      expect(event.ranking).toMatchObject({ state: 'UNVERIFIED', rows: [{ rank: 7, total: 8.4 }] });
      expect(event.revision).toBe(relay.revision);
      expect((await source.snapshot(`${competitionId}:relay`)).revision).toBe(relay.revision);
      expect((await source.snapshot(`${competitionId}:event`)).revision).toBe(event.revision);
    },
  );

  it('migrates legacy live standings without presenting them as event results', async () => {
    const snapshot = control(registry);
    fire(snapshot);
    source.observe(snapshot);
    const before = await source.snapshot(`${competitionId}:relay`);
    const stored = db
      .prepare('SELECT snapshot_json FROM vista_competition_sources WHERE id = ?')
      .get(competitionId) as { snapshot_json: string };
    const legacy = JSON.parse(stored.snapshot_json);
    delete legacy.eventRanking;
    db.prepare('UPDATE vista_competition_sources SET snapshot_json = ? WHERE id = ?').run(
      JSON.stringify(legacy),
      competitionId,
    );
    migration088VistaRankingScopes.up(db);
    expect((await source.snapshot(`${competitionId}:relay`)).ranking).toEqual(before.ranking);
    await expect(source.snapshot(`${competitionId}:event`)).rejects.toThrow('Event results have not been acquired');
  });

  it('waits for the scheduled start and advances the same timer without another MQTT observation', async () => {
    const snapshot = control(registry);
    fire(snapshot);
    const startsAt = checkedAt + 3000;
    snapshot.competitions[0]!.activeTimer!.timerStartAt = new Date(startsAt).toISOString();
    source.observe(snapshot);
    const scheduled = await source.snapshot(`${competitionId}:relay`);
    expect(scheduled.clock).toMatchObject({ state: 'stopped', label: 'Scheduled', remainingMs: 2_700_000 });
    expect(scheduled.participants[0]!.clock).toEqual(scheduled.clock);
    checkedAt += 2000;
    const waiting = await source.snapshot(`${competitionId}:relay`);
    expect(waiting.clock).toEqual(scheduled.clock);
    expect(waiting.revision).toBe(scheduled.revision);

    checkedAt = startsAt;
    const running = await source.snapshot(`${competitionId}:relay`);
    expect(running.clock).toMatchObject({ state: 'running', remainingMs: 2_700_000, sampledAt: startsAt });
    expect(running.clock!.generation).toBe(scheduled.clock!.generation);
    expect(running.clock!.revision).toBeGreaterThan(scheduled.clock!.revision);
    expect(running.revision).toBeGreaterThan(scheduled.revision);
    expect(running.participants[0]!.clock).toEqual(running.clock);
    checkedAt += 2000;
    const elapsed = await source.snapshot(`${competitionId}:relay`);
    expect(elapsed.clock).toEqual(running.clock);
    expect(elapsed.clock!.remainingMs - (elapsed.capturedAt - elapsed.clock!.sampledAt)).toBe(2_698_000);
    expect(elapsed.revision).toBe(running.revision);
  });

  it.each(['BR60S', 'BR60S_FINAL'])('excludes classified athletes from live %s places', async (eventCode) => {
    seedEvent(eventCode);
    db.prepare("UPDATE participants SET entry_status = 'DSQ' WHERE id = ?").run(participantId);
    const snapshot = control(registry, eventCode);
    if (eventCode.endsWith('_FINAL'))
      new SqliteFinalControlRepository(db).appendDecision({
        id: randomUUID(),
        competitionId,
        eventId,
        competitionTypeId: eventCode,
        participantCount: 2,
        afterShot: 24,
        rank: 2,
        selectedLaneId: laneId,
        scoreSnapshot: [],
        tiedLaneIds: [],
        resolution: 'CLEAR_LOWEST',
        resolutionStatement: null,
        officialName: 'Official',
        ruleReference: 'Final',
        recordedAt: publishedAt,
      });
    fire(snapshot);
    const competing = structuredClone(snapshot.lanes[0]!);
    competing.laneId = randomUUID();
    competing.competitionState!.laneId = competing.laneId;
    competing.assignment!.laneId = competing.laneId;
    competing.assignment!.athlete!.id = randomUUID();
    competing.assignment!.athlete!.name = 'Competing';
    competing.score!.laneId = competing.laneId;
    competing.score!.totalScoreX10 = 90;
    snapshot.competitions[0]!.laneIds.push(competing.laneId);
    snapshot.lanes.push(competing);
    source.observe(snapshot);
    const result = await source.snapshot(`${competitionId}:relay`);
    expect(result.ranking!.rows).toEqual([
      expect.objectContaining({
        id: competing.assignment!.athlete!.id,
        rank: eventCode.endsWith('_FINAL') ? null : 1,
        classification: null,
      }),
      expect.objectContaining({ id: participantId, rank: null, classification: 'DSQ' }),
    ]);
  });

  it('uses complete source inner-ten evidence to resolve full-ring live ties', async () => {
    const snapshot = control(registry, 'BP60');
    fire(snapshot);
    const second = structuredClone(snapshot.lanes[0]!);
    second.laneId = randomUUID();
    second.competitionState!.laneId = second.laneId;
    second.competitionState!.sessionId = randomUUID();
    second.assignment!.laneId = second.laneId;
    second.assignment!.athlete!.id = randomUUID();
    second.assignment!.athlete!.name = 'More inner tens';
    second.score!.laneId = second.laneId;
    second.score!.sessionId = second.competitionState!.sessionId;
    snapshot.competitions[0]!.laneIds.push(second.laneId);
    snapshot.lanes.push(second);
    for (const [index, lane] of snapshot.lanes.entries()) {
      lane.competitionState!.currentSeries = { index: 5, shotsRecorded: 10, maxShots: 10 };
      lane.score!.totalShotCount = 60;
      lane.score!.totalScoreX10 = 6000;
      lane.score!.stages[0]!.stageTotalX10 = 6000;
      lane.score!.stages[0]!.series = Array.from({ length: 6 }, (_, seriesIndex) => ({
        seriesIndex,
        shots: Array<number>(10).fill(100),
        seriesTotalX10: 1000,
        isComplete: true,
      }));
      for (let position = 0; position < 60; position++)
        journal.append({
          ...shot(),
          laneId: lane.laneId,
          sessionId: lane.competitionState!.sessionId,
          effectiveScoreX10: 100,
          deviceScoreX10: 104,
          targetProfileId: 'JRSF_BEAM_PISTOL_10M',
          seriesIndex: Math.floor(position / 10),
          shotNumberInSeries: (position % 10) + 1,
          innerTen: index === 1 && position === 0,
        });
    }
    source.observe(snapshot);
    const result = await source.snapshot(`${competitionId}:relay`);
    expect(result.ranking!.rows.map((row) => ({ id: row.id, rank: row.rank }))).toEqual([
      { id: second.assignment!.athlete!.id, rank: 1 },
      { id: participantId, rank: 2 },
    ]);
    db.prepare(
      'DELETE FROM mqtt_competition_shot_observations WHERE lane_id = ? AND series_index = 0 AND shot_number_in_series = 1',
    ).run(second.laneId);
    const incomplete = await source.snapshot(`${competitionId}:relay`);
    expect(incomplete.ranking!.rows.map((row) => row.rank)).toEqual([null, null]);
  });

  it('applies official corrections to the original shot and series slots when history has gaps', async () => {
    seedEvent();
    db.prepare(
      'INSERT INTO results (id, event_id, participant_id, player_name, relay_number, total_score, shots_detail, source_competition_id, source_lane_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('result', eventId, participantId, 'Athlete', 1, 17, '[8,9]', competitionId, laneId);
    const snapshot = control(registry);
    fire(snapshot);
    snapshot.competitions[0]!.phase = 'MATCH_COMPLETE';
    snapshot.competitions[0]!.finishedAt = publishedAt;
    snapshot.lanes[0]!.competitionState!.currentSeries.index = 1;
    snapshot.lanes[0]!.score!.stages[0]!.series[0]!.seriesIndex = 1;
    const received = { ...shot(), seriesIndex: 1, shotNumberInSeries: 2 };
    journal.append(received);
    board.mockResolvedValue({
      eventId,
      resultScope: 'QUALIFICATION',
      snapshotRevision: 'corrected',
      checkedAt: publishedAt,
      state: 'OFFICIAL',
      postedAt: publishedAt,
      protestEndsAt: null,
      results: [
        {
          resultId: 'result',
          rank: 1,
          playerName: 'Athlete',
          affiliation: '',
          totalScore: 17,
          entryStatus: 'COMPETING' as const,
          classificationCode: null,
        },
      ],
    });
    const correctedShots = Array<number>(60).fill(10);
    correctedShots[0] = 8;
    correctedShots[11] = 9;
    const corrected = new DirectorVistaSource(
      db,
      registry,
      journal,
      { getSnapshot: board },
      identity,
      () => checkedAt,
      async () => [
        {
          resultId: 'result',
          participantId,
          familyName: null,
          rankingShots: [],
          shots: correctedShots.map((score, index) => ({
            score,
            sourceShotId: index === 11 ? received.shotId : null,
            sourceShotIndex: index,
            corrected: index === 11,
          })),
          seriesScores: [98, 99, 100, 100, 100, 100],
          status: 'confirmed',
        },
      ],
    );
    corrected.observe(snapshot);
    const result = await corrected.snapshot(`${competitionId}:relay`);
    expect(result.participants[0]!.historyComplete).toBe(false);
    expect(result.participants[0]!.shots).toEqual([
      expect.objectContaining({ id: received.shotId, score: 9, corrected: true }),
    ]);
    expect(result.participants[0]!.series).toEqual(
      [98, 99, 100, 100, 100, 100].map((total, index) => ({ stage: 1, index, total })),
    );
  });

  it('keeps qualification scores separate when the same athlete has a result from another competition', async () => {
    seedEvent();
    db.prepare(
      'INSERT INTO results (id, event_id, participant_id, player_name, relay_number, total_score, shots_detail, source_competition_id, source_lane_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('replacement-result', eventId, participantId, 'Athlete', 1, 600, '[]', randomUUID(), laneId);
    const snapshot = control(registry);
    fire(snapshot);
    snapshot.competitions[0]!.phase = 'MATCH_COMPLETE';
    snapshot.competitions[0]!.finishedAt = publishedAt;
    board.mockResolvedValue({
      eventId,
      resultScope: 'QUALIFICATION',
      snapshotRevision: 'replacement',
      checkedAt: publishedAt,
      state: 'OFFICIAL',
      postedAt: publishedAt,
      protestEndsAt: null,
      results: [
        {
          resultId: 'replacement-result',
          rank: 1,
          playerName: 'Athlete',
          affiliation: '',
          totalScore: 600,
          entryStatus: 'COMPETING' as const,
          classificationCode: null,
        },
      ],
    });
    source.observe(snapshot);
    const result = await source.snapshot(`${competitionId}:relay`);
    expect(result.participants[0]!.total).toBe(10.4);
    expect(result.ranking).toMatchObject({
      kind: 'live',
      state: 'DRAFT',
      rows: [expect.objectContaining({ total: 10.4 })],
    });
  });

  it.each(['reset', 'replacement', 'partial replacement'] as const)(
    'preserves corrected archived scores as unverified after a %s',
    async (change) => {
      seedEvent();
      db.prepare(
        'INSERT INTO results (id, event_id, participant_id, player_name, relay_number, total_score, shots_detail, source_competition_id, source_lane_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run('result', eventId, participantId, 'Athlete', 1, 8.4, '[10.4]', competitionId, laneId);
      const snapshot = control(registry);
      fire(snapshot);
      snapshot.competitions[0]!.phase = 'MATCH_COMPLETE';
      snapshot.competitions[0]!.finishedAt = publishedAt;
      const finalCommand = randomUUID();
      snapshot.lanes[0]!.competitionState!.phase = 'FINISHED';
      snapshot.lanes[0]!.competitionState!.finalSnapshotCommandId = finalCommand;
      snapshot.lanes[0]!.score!.finalSnapshotCommandId = finalCommand;
      if (change === 'partial replacement') {
        const other = structuredClone(snapshot.lanes[0]!);
        other.laneId = randomUUID();
        other.competitionState!.laneId = other.laneId;
        other.assignment!.laneId = other.laneId;
        other.assignment!.athlete!.id = randomUUID();
        other.score!.laneId = other.laneId;
        snapshot.competitions[0]!.laneIds.push(other.laneId);
        snapshot.lanes.push(other);
        db.prepare('INSERT INTO participants (id, event_id, player_name) VALUES (?, ?, ?)').run(
          other.assignment!.athlete!.id,
          eventId,
          'Other',
        );
        db.prepare(
          'INSERT INTO results (id, event_id, participant_id, player_name, relay_number, total_score, shots_detail, source_competition_id, source_lane_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(
          'other-result',
          eventId,
          other.assignment!.athlete!.id,
          'Other',
          1,
          7,
          '[10.4]',
          competitionId,
          other.laneId,
        );
      }
      board.mockResolvedValue({
        eventId,
        resultScope: 'QUALIFICATION',
        snapshotRevision: 'original',
        checkedAt: publishedAt,
        state: 'OFFICIAL',
        postedAt: publishedAt,
        protestEndsAt: null,
        results: [
          {
            resultId: 'result',
            rank: 1,
            playerName: 'Athlete',
            affiliation: '',
            totalScore: 8.4,
            entryStatus: 'COMPETING' as const,
            classificationCode: null,
          },
        ],
      });
      if (change === 'partial replacement') {
        const firstBoard = await board(eventId, 'QUALIFICATION');
        firstBoard.results.push({
          resultId: 'other-result',
          rank: 2,
          playerName: 'Other',
          affiliation: '',
          totalScore: 7,
          entryStatus: 'COMPETING' as const,
          classificationCode: null,
        });
        board.mockResolvedValue(firstBoard);
      }
      source.observe(snapshot);
      const published = await source.snapshot(`${competitionId}:relay`);
      let nextRun: Awaited<ReturnType<typeof source.snapshot>> | undefined;
      if (change === 'reset') {
        const reset = control(registry);
        reset.competitions[0]!.publishedAt = '2026-09-11T00:00:02.000Z';
        reset.lanes[0]!.competitionState!.publishedAt = reset.competitions[0]!.publishedAt;
        reset.lanes[0]!.score!.publishedAt = reset.competitions[0]!.publishedAt;
        reset.lastCommand = {
          commandId: randomUUID(),
          competitionId,
          action: 'reset-session',
          success: true,
          lanes: [{ laneId, status: 'done' }],
        };
        source.observe(reset);
        const nextSubject = source
          .catalog()
          .subjects.find((subject) => subject.id.includes(':reset:') && subject.id.endsWith(':relay'))!;
        fire(reset);
        reset.competitions[0]!.publishedAt = '2026-09-11T00:00:03.000Z';
        reset.competitions[0]!.phase = 'MATCH_COMPLETE';
        reset.competitions[0]!.finishedAt = reset.competitions[0]!.publishedAt;
        reset.lanes[0]!.competitionState!.publishedAt = reset.competitions[0]!.publishedAt;
        reset.lanes[0]!.score!.publishedAt = reset.competitions[0]!.publishedAt;
        source.observe(reset);
        nextRun = await source.snapshot(nextSubject.id);
      } else {
        db.prepare('UPDATE results SET source_competition_id = ? WHERE participant_id = ?').run(
          randomUUID(),
          participantId,
        );
      }
      expect(nextRun?.ranking?.kind).toBe(change === 'reset' ? 'live' : undefined);
      expect(nextRun?.participants[0]?.total).toBe(change === 'reset' ? 10.4 : undefined);
      const laterBoard = await board(eventId, 'QUALIFICATION');
      board.mockResolvedValue({
        ...laterBoard,
        snapshotRevision: 'later',
        results: laterBoard.results.map((row) => (row.resultId === 'result' ? { ...row, totalScore: 600 } : row)),
      });
      const archived = await source.snapshot(`${competitionId}:relay`);
      expect(archived.participants[0]).toMatchObject({ total: 8.4, dataState: 'stale', clock: null });
      expect(archived.ranking!.state).toBe('UNVERIFIED');
      expect(archived.ranking!.rows[0]!.total).toBe(8.4);
      expect(archived.revision).toBeGreaterThan(published.revision);
      expect((await source.snapshot(`${competitionId}:relay`)).revision).toBe(archived.revision);
    },
  );

  it('persists MQTT Final provenance and excludes another Final from the selected source', async () => {
    seedEvent('BR60S_FINAL');
    const snapshot = control(registry, 'BR60S_FINAL');
    fire(snapshot);
    const second = structuredClone(snapshot.lanes[0]!);
    second.laneId = randomUUID();
    second.assignment!.laneId = second.laneId;
    second.assignment!.athlete!.id = randomUUID();
    second.score!.laneId = second.laneId;
    db.prepare('INSERT INTO participants (id, event_id, player_name) VALUES (?, ?, ?)').run(
      second.assignment!.athlete!.id,
      eventId,
      'Second',
    );
    const lanes = [snapshot.lanes[0]!, second];
    for (const lane of lanes) {
      lane.score!.totalShotCount = 24;
      lane.score!.totalScoreX10 = 2400;
      lane.score!.stages = [
        {
          stageIndex: 1,
          stageName: 'Match',
          stageTotalX10: 2400,
          series: [{ seriesIndex: 0, shots: Array<number>(24).fill(100), seriesTotalX10: 2400, isComplete: true }],
        },
      ];
    }
    const queryBus = {
      execute: vi.fn(async (token) =>
        token === GetEventByIdToken
          ? { eventType: 'BR60S_FINAL' }
          : lanes.map((lane, index) => ({
              participantId: lane.assignment!.athlete!.id,
              playerName: 'Athlete',
              affiliation: '',
              firingPointNumber: index + 1,
            })),
      ),
    } as unknown as QueryBus;
    const controlRepository = {
      findByCompetition: () => [
        {
          id: randomUUID(),
          eventId,
          rank: 2,
          selectedLaneId: second.laneId,
          afterShot: 24,
          commandCompleted: true,
          voided: false,
        },
      ],
    } as unknown as IFinalControlRepository;
    const repository = new SqliteFinalResultRepository(db);
    const handler = new PublishMqttFinalResultsHandler(queryBus, repository, registry, controlRepository);
    const result = await handler.execute({
      competitionId,
      competitionTypeId: 'BR60S_FINAL',
      eventId,
      relayNumber: 1,
      lanes: lanes.map((lane) => ({ laneId: lane.laneId, assignment: lane.assignment, score: lane.score, shots: [] })),
    });
    expect(result).toEqual({ savedCount: 2, errors: [] });
    const saved = db
      .prepare('SELECT id, source_competition_id FROM final_results WHERE participant_id = ?')
      .get(participantId) as { id: string; source_competition_id: string };
    expect(saved.source_competition_id).toBe(competitionId);
    repository.save(repository.findById(saved.id)!);
    expect(db.prepare('SELECT source_competition_id FROM final_results WHERE id = ?').get(saved.id)).toEqual({
      source_competition_id: competitionId,
    });
    snapshot.competitions[0]!.phase = 'MATCH_COMPLETE';
    snapshot.competitions[0]!.finishedAt = publishedAt;
    board.mockResolvedValue({
      eventId,
      resultScope: 'FINAL',
      snapshotRevision: 'final',
      checkedAt: publishedAt,
      state: 'FINAL',
      postedAt: publishedAt,
      protestEndsAt: null,
      results: [
        {
          resultId: saved.id,
          rank: 1,
          playerName: 'Athlete',
          affiliation: '',
          totalScore: 239,
          entryStatus: 'COMPETING' as const,
          classificationCode: null,
        },
      ],
    });
    source.observe(snapshot);
    const declared = await source.snapshot(`${competitionId}:relay`);
    expect(declared.participants[0]!.total).toBe(239);
    expect(declared.ranking!.rows[0]!.rank).toBe(1);
    const reviewedBoard = await board(eventId, 'FINAL');
    board.mockResolvedValue({
      ...reviewedBoard,
      snapshotRevision: 'reviewed-placement',
      results: reviewedBoard.results.map((row) => ({ ...row, rank: 2 })),
    });
    const reviewed = await source.snapshot(`${competitionId}:relay`);
    expect(reviewed.ranking!.rows[0]!.rank).toBe(2);
    expect(reviewed.ranking!.revision).not.toBe(declared.ranking!.revision);
    db.prepare('UPDATE final_results SET source_competition_id = ?').run(randomUUID());
    const archived = await source.snapshot(`${competitionId}:relay`);
    expect(archived.ranking!.state).toBe('UNVERIFIED');
    expect(archived.participants[0]!.total).toBe(239);
  });

  it('uses the active shoot-off round as the zero-based current series', async () => {
    const snapshot = control(registry, 'AR60_FINAL');
    fire(snapshot);
    snapshot.lanes[0]!.competitionState!.phase = 'SERIES_COMPLETE';
    snapshot.lanes[0]!.competitionState!.currentSeries.index = 6;
    const pack = ISSF_2026_RULE_PACKS.find((candidate) => candidate.eventCode === 'AR60_FINAL')!;
    const script = pack.capabilities.commands!.finalScript!;
    const checkpoint = script.main.find((step) => step.effect.type === 'CHECKPOINT')!;
    const repository = new SqliteFinalOperationRepository(db);
    const runId = randomUUID();
    repository.insertRun({
      id: runId,
      competitionId,
      eventId: null,
      competitionTypeId: 'AR60_FINAL',
      rulePackId: pack.id,
      scriptVersion: script.version,
      script,
      scheduledStartAt: startedAt,
      createdBy: 'Official',
      createdAt: startedAt,
    });
    repository.appendEntry({
      id: randomUUID(),
      runId,
      entryType: 'SHOOT_OFF_STARTED',
      branch: 'SHOOT_OFF',
      iteration: 2,
      stepId: checkpoint.id,
      stepSnapshot: checkpoint,
      confirmationEntryId: null,
      executionStatus: null,
      commandId: null,
      eligibleLaneIds: [laneId, randomUUID()],
      statement: 'Tie',
      officialName: 'Official',
      recordedAt: publishedAt,
      metadata: null,
    });
    const shotIds = [randomUUID(), randomUUID()];
    for (const [index, id] of shotIds.entries())
      repository.appendShootOffShot({
        id: randomUUID(),
        runId,
        iteration: index + 1,
        laneId,
        shotId: id,
        scoreX10: 104,
        sourceScoreX10: 104,
        x: 1,
        y: 2,
        firedAt: publishedAt,
        observedAt: publishedAt,
      });
    source.observe(snapshot);
    const result = await source.snapshot(`${competitionId}:relay`);
    const participant = result.participants[0]!;
    expect(participant).toMatchObject({ mode: 'shoot-off', currentSeries: 1 });
    expect(snapshot.competitions[0]!.activeTimer!.timerDurationSeconds).toBe(2700);
    expect(participant.clock).toBeNull();
    expect(result.clock).toBeNull();
    expect(participant.shots.map((shot) => shot.series)).toEqual([0, 1]);
    expect(
      participant.shots
        .filter((shot) => shot.mode === participant.mode && shot.series === participant.currentSeries)
        .map((shot) => shot.id),
    ).toEqual([`shoot-off:${shotIds[1]}`]);
  });

  it.each(['DONE', 'VOID'] as const)('keeps an unconfirmed Final elimination pending until %s', async (outcome) => {
    const snapshot = control(registry, 'BR60S_FINAL');
    fire(snapshot);
    source.observe(snapshot);
    const repository = new SqliteFinalControlRepository(db);
    const decisionId = randomUUID();
    repository.appendDecision({
      id: decisionId,
      competitionId,
      eventId: null,
      competitionTypeId: 'BR60S_FINAL',
      participantCount: 2,
      afterShot: 24,
      rank: 2,
      selectedLaneId: laneId,
      scoreSnapshot: [],
      tiedLaneIds: [],
      resolution: 'CLEAR_LOWEST',
      resolutionStatement: null,
      officialName: 'Official',
      ruleReference: 'Final',
      recordedAt: publishedAt,
    });
    const pending = await source.snapshot(`${competitionId}:relay`);
    expect(pending.participants[0]!.status).toBe('Elimination pending · rank 2 · after shot 24');
    expect(pending.ranking!.rows[0]!.rank).toBeNull();

    repository.appendEntry({
      id: randomUUID(),
      decisionId,
      entryType: outcome === 'DONE' ? 'COMMAND_RESULT' : 'VOID',
      commandId: outcome === 'DONE' ? randomUUID() : null,
      commandStatus: outcome === 'DONE' ? 'DONE' : null,
      statement: outcome === 'DONE' ? 'Lane acknowledged' : 'Decision withdrawn',
      officialName: 'Official',
      recordedAt: publishedAt,
    });
    const resolved = await source.snapshot(`${competitionId}:relay`);
    expect(resolved.participants[0]!.status).toBe(outcome === 'DONE' ? 'Eliminated · rank 2 · after shot 24' : 'MATCH');
    expect(resolved.ranking!.rows[0]!.rank).toBe(outcome === 'DONE' ? 2 : null);
  });

  it('exports the eight exact standard definitions and rejects missing rule identities and custom rules', () => {
    for (const code of ['BR60S', 'BP60', 'BR60S_FINAL', 'BP60_FINAL', 'AR60', 'AP60', 'AR60_FINAL', 'AP60_FINAL']) {
      const snapshot = control(registry, code);
      const definition = directorVistaDefinition(snapshot.competitions[0]!, registry);
      expect(definition.eventCode).toBe(code);
      expect(definition.stages[0]!.seriesShots).toEqual([]);
    }
    const air = control(registry, 'AR60').competitions[0]!;
    delete air.definitionBinding;
    expect(() => directorVistaDefinition(air, registry)).toThrow(/identity/);
    const custom = new CompetitionTypeRegistry();
    custom.register({ ...BR60S, name: 'Custom' });
    expect(() => directorVistaDefinition(control(registry).competitions[0]!, custom)).toThrow(/Custom/);
  });

  it('keeps the competition generation when Lanes arrive after display selection', async () => {
    const snapshot = control(registry);
    source.observe({ ...snapshot, lanes: [] });
    const waiting = await source.snapshot(`${competitionId}:relay`);
    source.observe(snapshot);
    const joined = await source.snapshot(`${competitionId}:relay`);
    expect(joined.generation).toBe(waiting.generation);
    expect(joined.participants).toHaveLength(1);
  });

  it('removes departed members and accepts their later rejoin without restoring the old assignment', async () => {
    const snapshot = control(registry);
    source.observe(snapshot);
    const joined = await source.snapshot(`${competitionId}:relay`);
    expect(joined.participants.map((participant) => participant.id)).toEqual([participantId]);

    // A successful leave publishes the reduced membership independently of retained Lane topic clears.
    snapshot.competitions[0]!.laneIds = [];
    snapshot.competitions[0]!.publishedAt = publishedAt;
    source.observe(snapshot);
    const departed = await source.snapshot(`${competitionId}:relay`);
    expect(departed.participants).toEqual([]);
    expect(departed.ranking!.rows).toEqual([]);
    expect(departed.generation).toBe(joined.generation);

    source = new DirectorVistaSource(db, registry, journal, { getSnapshot: board }, identity, () => checkedAt);
    expect((await source.snapshot(`${competitionId}:relay`)).participants).toEqual([]);

    snapshot.competitions[0]!.laneIds = [laneId];
    snapshot.lanes[0]!.assignment = null;
    const replacementSession = randomUUID();
    snapshot.lanes[0]!.competitionState!.sessionId = replacementSession;
    snapshot.lanes[0]!.score!.sessionId = replacementSession;
    source.observe(snapshot);
    expect(source.catalog().subjects[0]!.availability).toBe('available');
    const rejoined = await source.snapshot(`${competitionId}:relay`);
    expect(rejoined.participants).toHaveLength(1);
    expect(rejoined.participants[0]).toMatchObject({
      id: `${laneId}:${replacementSession}`,
      name: null,
      shots: [],
      historyComplete: true,
    });
    expect(rejoined.generation).toBe(joined.generation);
  });

  it('preserves sighting history across the real preparation to match session rotation', async () => {
    const snapshot = control(registry);
    source.observe(snapshot);
    const sighting = { ...shot(), mode: 'SIGHTING' as const, stageIndex: 0, scored: false, isRecorded: false };
    journal.append(sighting);
    snapshot.lanes[0]!.competitionState!.phase = 'SIGHTING_COMPLETE';
    snapshot.lanes[0]!.competitionState!.currentSeries.shotsRecorded = 1;
    snapshot.lanes[0]!.competitionState!.publishedAt = publishedAt;
    source.observe(snapshot);
    const before = await source.snapshot(`${competitionId}:relay`);
    expect(before.participants[0]!.historyComplete).toBe(true);
    fire(snapshot);
    const matchSession = randomUUID();
    snapshot.lanes[0]!.competitionState!.sessionId = matchSession;
    snapshot.lanes[0]!.score!.sessionId = matchSession;
    journal.append({ ...shot(), sessionId: matchSession });
    source.observe(snapshot);
    const match = await source.snapshot(`${competitionId}:relay`);
    expect(match.generation).toBe(before.generation);
    expect(match.participants[0]!.historyComplete).toBe(true);
    expect(match.participants[0]!.shots.map((shot) => shot.mode)).toEqual(['sighting', 'match']);
    expect(match.participants[0]!.total).toBe(10.4);
  });

  it.each(['sighting', 'match'] as const)(
    'reconciles a %s shot with later persisted Lane progress before the series completes',
    async (mode) => {
      const snapshot = control(registry);
      source.observe(snapshot);
      if (mode === 'sighting') {
        snapshot.competitions[0]!.phase = 'SIGHTING';
        snapshot.lanes[0]!.competitionState!.phase = 'SIGHTING';
      } else {
        fire(snapshot);
        snapshot.lanes[0]!.competitionState!.currentSeries.shotsRecorded = 0;
      }
      const observation = {
        ...shot(),
        mode: mode === 'sighting' ? ('SIGHTING' as const) : ('MATCH' as const),
        stageIndex: mode === 'sighting' ? 0 : 1,
        scored: mode === 'match',
        isRecorded: mode === 'match',
      };
      // The shot (and match score) can arrive before the counter's save and state publication.
      journal.append(observation);
      source.observe(snapshot);
      const pending = await source.snapshot(`${competitionId}:relay`);
      expect(pending.participants[0]!.shots.map((shot) => shot.id)).toEqual([observation.shotId]);
      expect(pending.participants[0]!.historyComplete).toBe(false);

      snapshot.lanes[0]!.competitionState!.currentSeries.shotsRecorded = 1;
      snapshot.lanes[0]!.competitionState!.publishedAt = '2026-09-11T00:00:02.000Z';
      source.observe(snapshot);
      const updated = await source.snapshot(`${competitionId}:relay`);
      expect(updated.participants[0]).toMatchObject({
        mode,
        shotCount: 1,
        historyComplete: true,
        status: mode === 'sighting' ? 'SIGHTING' : 'MATCH',
      });
      expect(updated.revision).toBeGreaterThan(pending.revision);
      expect(updated.generation).toBe(pending.generation);
    },
  );

  it('rejects an older competition snapshot before archiving a reset and preserves later shots', async () => {
    const snapshot = control(registry);
    snapshot.competitions[0]!.publishedAt = '2026-09-11T00:00:02.000Z';
    source.observe(snapshot);
    const row = db.prepare('SELECT * FROM vista_competition_sources WHERE id = ?');
    const before = row.get(competitionId);
    // Competition, Lane score and command outcomes are separate upstream streams.
    // A newer reset result must not partially mutate a rejected older competition snapshot.
    const resetAt = '2026-09-11T00:00:03.000Z';
    snapshot.competitions[0]!.publishedAt = startedAt;
    snapshot.lanes[0]!.competitionState!.publishedAt = resetAt;
    snapshot.lanes[0]!.score!.publishedAt = resetAt;
    snapshot.lastCommand = {
      commandId: randomUUID(),
      competitionId,
      action: 'reset-session',
      success: true,
      lanes: [{ laneId, status: 'done', acknowledgedAt: resetAt }],
    };
    source.observe(snapshot);
    expect.soft(row.get(competitionId)).toEqual(before);
    expect(source.catalog().subjects.map((subject) => subject.id)).toEqual([`${competitionId}:relay`]);

    fire(snapshot);
    const firedAt = '2026-09-11T00:00:04.000Z';
    snapshot.competitions[0]!.publishedAt = firedAt;
    snapshot.lanes[0]!.competitionState!.publishedAt = firedAt;
    snapshot.lanes[0]!.score!.publishedAt = firedAt;
    const observation = { ...shot(), publishedAt: new Date(firedAt), firedAt: new Date(firedAt) };
    journal.append(observation);
    source.observe(snapshot);
    const result = await source.snapshot(`${competitionId}:relay`);
    expect(result.participants[0]).toMatchObject({ total: 10.4, shotCount: 1, historyComplete: true });
    expect(result.participants[0]!.shots.map((value) => value.id)).toEqual([observation.shotId]);
  });

  it('offers an acknowledged reset as a new selectable incarnation without overwriting the prior subject', async () => {
    const snapshot = control(registry);
    source.observe(snapshot);
    const first = await source.snapshot(`${competitionId}:relay`);
    const replacement = randomUUID();
    snapshot.lanes[0]!.competitionState!.sessionId = replacement;
    snapshot.lanes[0]!.score!.sessionId = replacement;
    source.observe(snapshot);
    expect(source.catalog().subjects[0]!.availability).toBe('unsupported');
    const commandId = randomUUID();
    snapshot.lastCommand = {
      commandId,
      competitionId,
      action: 'reset-session',
      success: true,
      lanes: [{ laneId, status: 'done' }],
    };
    source.observe(snapshot);
    const newSubject = source
      .catalog()
      .subjects.find((subject) => subject.id.includes(':reset:') && subject.id.endsWith(':relay'))!;
    expect(newSubject.label).toContain('Reset');
    const reset = await source.snapshot(newSubject.id);
    expect(reset.subjectId).not.toBe(first.subjectId);
    expect(reset.generation).not.toBe(first.generation);
    expect(reset.participants[0]!.shots).toEqual([]);
  });

  it('isolates an acknowledged same-session reset, later shots and delayed pre-reset replays', async () => {
    const snapshot = control(registry);
    source.observe(snapshot);
    const oldShot = { ...shot(), mode: 'SIGHTING' as const, stageIndex: 0, scored: false, isRecorded: false };
    journal.append(oldShot);
    const original = await source.snapshot(`${competitionId}:relay`);
    const resetAt = '2026-09-11T00:00:02.000Z';
    snapshot.lanes[0]!.score!.publishedAt = resetAt;
    const commandId = randomUUID();
    snapshot.lastCommand = {
      commandId,
      action: 'reset-session',
      competitionId,
      success: true,
      lanes: [{ laneId, status: 'done', acknowledgedAt: resetAt }],
    };
    source.observe(snapshot);
    const newSubject = source
      .catalog()
      .subjects.find((subject) => subject.id.includes(':reset:') && subject.id.endsWith(':relay'))!;
    expect(newSubject).toBeDefined();
    const cleared = await source.snapshot(newSubject.id);
    expect(cleared.participants[0]!.shots).toEqual([]);
    expect(cleared.participants[0]!.historyComplete).toBe(true);
    expect(snapshot.lanes[0]!.competitionState!.sessionId).toBe(sessionId);

    const newAt = '2026-09-11T00:00:03.000Z';
    const newShot = {
      ...oldShot,
      id: randomUUID(),
      shotId: randomUUID(),
      publishedAt: new Date(newAt),
      firedAt: new Date(newAt),
    };
    journal.append(newShot);
    snapshot.competitions[0]!.phase = 'SIGHTING';
    snapshot.competitions[0]!.publishedAt = newAt;
    snapshot.lanes[0]!.competitionState!.phase = 'SIGHTING';
    snapshot.lanes[0]!.competitionState!.currentSeries.shotsRecorded = 1;
    snapshot.lanes[0]!.competitionState!.publishedAt = newAt;
    source.observe(snapshot);
    const continued = await source.snapshot(newSubject.id);
    expect(continued.participants[0]!.shots.map((shot) => shot.id)).toEqual([newShot.shotId]);
    expect(continued.participants[0]!.historyComplete).toBe(true);
    expect(continued.generation).toBe(cleared.generation);
    expect((await source.snapshot(`${competitionId}:relay`)).participants[0]!.shots).toEqual(
      original.participants[0]!.shots,
    );

    journal.append({ ...oldShot, id: randomUUID(), isReplay: true, publishedAt: new Date('2026-09-11T00:00:04.000Z') });
    journal.append({
      ...oldShot,
      id: randomUUID(),
      shotId: randomUUID(),
      isReplay: true,
      publishedAt: new Date('2026-09-11T00:00:04.000Z'),
      firedAt: new Date('2026-09-11T00:00:01.000Z'),
    });
    expect((await source.snapshot(newSubject.id)).participants[0]!.shots.map((shot) => shot.id)).toEqual([
      newShot.shotId,
    ]);
    expect((await source.snapshot(`${competitionId}:relay`)).participants[0]!.shots).toEqual(
      original.participants[0]!.shots,
    );
    const restarted = new DirectorVistaSource(
      db,
      registry,
      journal,
      { getSnapshot: board },
      { ...identity, bootId: 'restart' },
      () => checkedAt,
    );
    expect((await restarted.snapshot(newSubject.id)).participants[0]!.shots.map((shot) => shot.id)).toEqual([
      newShot.shotId,
    ]);
  });

  function appendFinalDecision(rank: number, afterShot: number) {
    const repository = new SqliteFinalControlRepository(db);
    const decisionId = randomUUID();
    repository.appendDecision({
      id: decisionId,
      competitionId,
      eventId: null,
      competitionTypeId: 'AR60_FINAL',
      participantCount: 8,
      afterShot,
      rank,
      selectedLaneId: laneId,
      scoreSnapshot: [],
      tiedLaneIds: [],
      resolution: 'CLEAR_LOWEST',
      resolutionStatement: null,
      officialName: 'Official',
      ruleReference: 'Final',
      recordedAt: publishedAt,
    });
    repository.appendEntry({
      id: randomUUID(),
      decisionId,
      entryType: 'COMMAND_RESULT',
      commandId: randomUUID(),
      commandStatus: 'DONE',
      statement: 'Lane acknowledged',
      officialName: 'Official',
      recordedAt: publishedAt,
    });
    return decisionId;
  }

  function appendFinalShootOff() {
    const pack = ISSF_2026_RULE_PACKS.find((candidate) => candidate.eventCode === 'AR60_FINAL')!;
    const script = pack.capabilities.commands!.finalScript!;
    const checkpoint = script.main.find((step) => step.effect.type === 'CHECKPOINT')!;
    const repository = new SqliteFinalOperationRepository(db);
    const runId = randomUUID();
    repository.insertRun({
      id: runId,
      competitionId,
      eventId: null,
      competitionTypeId: 'AR60_FINAL',
      rulePackId: pack.id,
      scriptVersion: script.version,
      script,
      scheduledStartAt: startedAt,
      createdBy: 'Official',
      createdAt: publishedAt,
    });
    repository.appendEntry({
      id: randomUUID(),
      runId,
      entryType: 'SHOOT_OFF_STARTED',
      branch: 'SHOOT_OFF',
      iteration: 1,
      stepId: checkpoint.id,
      stepSnapshot: checkpoint,
      confirmationEntryId: null,
      executionStatus: null,
      commandId: null,
      eligibleLaneIds: [laneId, randomUUID()],
      statement: 'Tie',
      officialName: 'Official',
      recordedAt: publishedAt,
      metadata: null,
    });
    const shotId = randomUUID();
    repository.appendShootOffShot({
      id: randomUUID(),
      runId,
      iteration: 1,
      laneId,
      shotId,
      scoreX10: 104,
      sourceScoreX10: 104,
      x: 1,
      y: 2,
      firedAt: publishedAt,
      observedAt: publishedAt,
    });
    return shotId;
  }

  it.each([
    { captured: false, priorOperations: false },
    { captured: true, priorOperations: false },
    { captured: false, priorOperations: true },
    { captured: true, priorOperations: true },
  ])(
    'freezes Final operations at reset (snapshot=$captured, prior operations=$priorOperations)',
    async ({ captured, priorOperations }) => {
      const snapshot = control(registry, 'AR60_FINAL');
      source.observe(snapshot);
      const priorDecision = priorOperations ? appendFinalDecision(8, 12) : null;
      const priorShot = priorOperations ? appendFinalShootOff() : null;
      if (captured) await source.snapshot(`${competitionId}:relay`);
      const commandId = randomUUID();
      snapshot.lanes[0]!.score!.publishedAt = publishedAt;
      snapshot.lastCommand = {
        commandId,
        competitionId,
        action: 'reset-session',
        success: true,
        lanes: [{ laneId, status: 'done', acknowledgedAt: publishedAt }],
      };
      source.observe(snapshot);
      if (priorDecision)
        new SqliteFinalControlRepository(db).appendEntry({
          id: randomUUID(),
          decisionId: priorDecision,
          entryType: 'VOID',
          commandId: null,
          commandStatus: null,
          statement: 'Later operation review',
          officialName: 'Official',
          recordedAt: publishedAt,
        });
      appendFinalDecision(7, 14);
      const laterShot = appendFinalShootOff();
      fire(snapshot);
      source.observe(snapshot);
      for (const restarted of [false, true]) {
        if (restarted)
          source = new DirectorVistaSource(db, registry, journal, { getSnapshot: board }, identity, () => checkedAt);
        const archived = await source.snapshot(`${competitionId}:relay`);
        expect(archived.participants[0]!.status).toBe(
          priorOperations ? 'Eliminated · rank 8 · after shot 12' : 'READY',
        );
        expect(archived.participants[0]!.shots.map((shot) => shot.id)).toEqual(
          priorShot ? [`shoot-off:${priorShot}`] : [],
        );
        expect(archived.participants[0]!.mode).toBe(priorOperations ? 'shoot-off' : 'sighting');
        const current = await source.snapshot(`${competitionId}:reset:${commandId}:relay`);
        expect(current.participants[0]!.status).toBe('Eliminated · rank 7 · after shot 14');
        expect(current.participants[0]!.shots.map((shot) => shot.id)).toEqual([`shoot-off:${laterShot}`]);
        expect(current.participants[0]!.mode).toBe('shoot-off');
      }
    },
  );

  it.each([false, true])('freezes previous reserve continuity at reset (snapshot=%s)', async (captured) => {
    const snapshot = control(registry, 'AR60');
    source.observe(snapshot);
    const firstReserve = randomUUID();
    recordTransfer(transferBundle(snapshot, firstReserve));
    const moved = movedLane(snapshot, firstReserve);
    snapshot.lanes.push(moved);
    snapshot.competitions[0]!.laneIds.push(firstReserve);
    snapshot.competitions[0]!.transferredSourceLaneIds = [laneId];
    const sighting = { ...shot(), mode: 'SIGHTING' as const, stageIndex: 0, scored: false, isRecorded: false };
    journal.append(sighting);
    moved.competitionState!.currentSeries.shotsRecorded = 1;
    moved.competitionState!.publishedAt = publishedAt;
    source.observe(snapshot);
    if (captured) await source.snapshot(`${competitionId}:relay`);
    const commandId = randomUUID();
    const resetAt = '2026-09-11T00:00:02.000Z';
    moved.score!.publishedAt = resetAt;
    moved.competitionState!.currentSeries.shotsRecorded = 0;
    moved.competitionState!.publishedAt = resetAt;
    snapshot.lastCommand = {
      commandId,
      competitionId,
      action: 'reset-session',
      success: true,
      lanes: [{ laneId: firstReserve, status: 'done', acknowledgedAt: resetAt }],
    };
    source.observe(snapshot);
    snapshot.lanes = [moved];
    fire(snapshot);
    const laterAt = '2026-09-11T00:00:03.000Z';
    snapshot.competitions[0]!.publishedAt = laterAt;
    moved.competitionState!.publishedAt = laterAt;
    moved.score!.publishedAt = laterAt;
    const secondReserve = randomUUID();
    recordTransfer(transferBundle(snapshot, secondReserve));
    snapshot.lanes.push(movedLane(snapshot, secondReserve));
    snapshot.competitions[0]!.laneIds.push(secondReserve);
    snapshot.competitions[0]!.transferredSourceLaneIds = [laneId, firstReserve];
    source.observe(snapshot);
    for (const restarted of [false, true]) {
      if (restarted)
        source = new DirectorVistaSource(db, registry, journal, { getSnapshot: board }, identity, () => checkedAt);
      const archived = await source.snapshot(`${competitionId}:relay`);
      expect(archived.participants).toHaveLength(1);
      expect(archived.participants[0]).toMatchObject({ id: participantId, laneId: firstReserve });
      expect(archived.participants[0]!.shots.map((shot) => shot.id)).toEqual([sighting.shotId]);
      const current = await source.snapshot(`${competitionId}:reset:${commandId}:relay`);
      expect(current.participants).toHaveLength(1);
      expect(current.participants[0]).toMatchObject({ id: participantId, laneId: secondReserve, total: 10.4 });
    }
  });

  it.each([false, true])('reports legacy reset archives without operation evidence (snapshot=%s)', async (captured) => {
    const snapshot = control(registry);
    source.observe(snapshot);
    if (captured) await source.snapshot(`${competitionId}:relay`);
    snapshot.lanes[0]!.score!.publishedAt = publishedAt;
    snapshot.lastCommand = {
      commandId: randomUUID(),
      competitionId,
      action: 'reset-session',
      success: true,
      lanes: [{ laneId, status: 'done', acknowledgedAt: publishedAt }],
    };
    source.observe(snapshot);
    const row = db.prepare('SELECT source_json FROM vista_competition_sources WHERE id = ?').get(competitionId) as {
      source_json: string;
    };
    const legacy = JSON.parse(row.source_json);
    delete legacy.frozenOperations;
    db.prepare('UPDATE vista_competition_sources SET source_json = ? WHERE id = ?').run(
      JSON.stringify(legacy),
      competitionId,
    );
    source = new DirectorVistaSource(db, registry, journal, { getSnapshot: board }, identity, () => checkedAt);
    expect(source.catalog().subjects.find((subject) => subject.id === `${competitionId}:relay`)).toMatchObject({
      availability: 'unsupported',
      reason: expect.stringContaining('operation history at its reset boundary'),
    });
    await expect(source.snapshot(`${competitionId}:relay`)).rejects.toThrow('operation history at its reset boundary');
  });

  it('does not create reset incarnations for older competitions sharing the same physical Lane', () => {
    const old = control(registry);
    source.observe(old);
    const next = control(registry);
    const nextCompetition = randomUUID();
    next.competitions[0]!.competitionId = nextCompetition;
    next.lanes[0]!.competitionState!.competitionId = nextCompetition;
    next.lanes[0]!.score!.competitionId = nextCompetition;
    next.lanes[0]!.assignment!.competitionId = nextCompetition;
    next.competitions.push(old.competitions[0]!);
    source.observe(next);
    next.lanes[0]!.score!.publishedAt = '2026-09-11T00:00:02.000Z';
    next.lastCommand = {
      commandId: randomUUID(),
      action: 'reset-session',
      competitionId: nextCompetition,
      success: true,
      lanes: [{ laneId, status: 'done' }],
    };
    source.observe({ ...next, lastCommand: { ...next.lastCommand, competitionId } });
    expect(source.catalog().subjects.filter((subject) => subject.id.includes(':reset:'))).toHaveLength(0);
    source.observe(next);
    expect(
      source
        .catalog()
        .subjects.map((subject) => subject.id)
        .filter((id) => id.includes(':reset:')),
    ).toEqual([expect.stringContaining(nextCompetition)]);
  });

  it('provides complete deduplicated history and stable semantic revisions with anchored clocks', async () => {
    const snapshot = control(registry);
    source.observe(snapshot);
    const observation = shot();
    journal.append(observation);
    journal.append({ ...observation, id: randomUUID(), isReplay: true });
    fire(snapshot);
    source.observe(snapshot);
    const first = await source.snapshot(`${competitionId}:relay`);
    expect(first.participants[0]).toMatchObject({
      id: participantId,
      total: 10.4,
      shotCount: 1,
      historyComplete: true,
    });
    expect(first.participants[0]!.shots).toHaveLength(1);
    expect(first.ranking).toMatchObject({ kind: 'live', state: 'DRAFT', rows: [{ rank: 1, total: 10.4 }] });
    checkedAt += 10_000;
    const second = await source.snapshot(`${competitionId}:relay`);
    expect(second.revision).toBe(first.revision);
    expect(second.capturedAt).toBeGreaterThan(first.capturedAt);
    expect(second.clock).toEqual(first.clock);
  });

  it('detects missing/reordered upstream history instead of certifying a fabricated target', async () => {
    const snapshot = control(registry);
    source.observe(snapshot);
    fire(snapshot);
    source.observe(snapshot);
    const incomplete = await source.snapshot(`${competitionId}:relay`);
    expect(incomplete.participants[0]!.historyComplete).toBe(false);
    expect(incomplete.participants[0]!.shots).toEqual([]);
    journal.append(shot());
    const repaired = await source.snapshot(`${competitionId}:relay`);
    expect(repaired.participants[0]!.historyComplete).toBe(true);
    expect(repaired.revision).toBeGreaterThan(incomplete.revision);
    source.observe(control(registry));
    expect((await source.snapshot(`${competitionId}:relay`)).participants[0]!.shotCount).toBe(1);
  });

  it('keeps the selected competition after Lane reuse and source restart', async () => {
    const snapshot = control(registry);
    source.observe(snapshot);
    journal.append(shot());
    fire(snapshot);
    source.observe(snapshot);
    const first = await source.snapshot(`${competitionId}:relay`);
    const next = control(registry);
    const nextId = randomUUID();
    next.competitions[0]!.competitionId = nextId;
    next.lanes[0]!.competitionState!.competitionId = nextId;
    source.observe(next);
    source = new DirectorVistaSource(
      db,
      registry,
      journal,
      { getSnapshot: board },
      { ...identity, bootId: 'restarted' },
      () => checkedAt,
    );
    const restored = await source.snapshot(`${competitionId}:relay`);
    expect(restored.generation).toBe(first.generation);
    expect(restored.participants[0]).toMatchObject({ ...first.participants[0], dataState: 'stale', clock: null });
    expect(source.catalog().subjects).toHaveLength(2);
  });

  it('requires a fresh upstream observation before restoring unfinished sources as live', async () => {
    const snapshot = control(registry);
    source.observe(snapshot);
    journal.append(shot());
    fire(snapshot);
    source.observe(snapshot);
    const live = await source.snapshot(`${competitionId}:relay`);
    const restarted = new DirectorVistaSource(
      db,
      registry,
      journal,
      { getSnapshot: board },
      { ...identity, bootId: 'restarted' },
      () => checkedAt,
    );

    const unconfirmed = await restarted.snapshot(`${competitionId}:relay`);
    expect(unconfirmed.participants[0]).toMatchObject({
      ...live.participants[0],
      dataState: 'stale',
      clock: null,
    });
    expect(unconfirmed.clock).toBeNull();
    expect(unconfirmed.generation).toBe(live.generation);
    restarted.observe(snapshot);
    const confirmed = await restarted.snapshot(`${competitionId}:relay`);
    expect(confirmed.participants).toEqual(live.participants);
    expect(confirmed.clock).toEqual(live.clock);
  });

  it.each(['restart', 'reconnect'] as const)(
    'requires each Lane state and score to be reconfirmed after %s',
    async (recovery) => {
      const snapshot = control(registry);
      source.observe(snapshot);
      journal.append(shot());
      fire(snapshot);
      const other = structuredClone(snapshot.lanes[0]!);
      other.laneId = randomUUID();
      other.competitionState!.laneId = other.laneId;
      other.competitionState!.sessionId = randomUUID();
      other.score!.laneId = other.laneId;
      other.score!.sessionId = other.competitionState!.sessionId;
      other.assignment!.laneId = other.laneId;
      other.assignment!.athlete!.id = randomUUID();
      snapshot.competitions[0]!.laneIds.push(other.laneId);
      snapshot.lanes.push(other);
      source.observe(snapshot);
      const live = await source.snapshot(`${competitionId}:relay`);
      expect(live.participants.map((participant) => participant.dataState)).toEqual(['live', 'live']);
      expect(live.clock?.state).toBe('running');

      if (recovery === 'restart')
        source = new DirectorVistaSource(
          db,
          registry,
          journal,
          { getSnapshot: board },
          { ...identity, bootId: 'restarted' },
          () => checkedAt,
        );
      else source.observe({ ...snapshot, connected: false });

      // Reconnection clears the MQTT read model; the retained competition can arrive before Lane topics.
      source.observe({ ...snapshot, lanes: [] });
      const waiting = await source.snapshot(`${competitionId}:relay`);
      expect(waiting.participants.map((participant) => participant.dataState)).toEqual(['stale', 'stale']);
      expect(waiting.participants.map((participant) => participant.clock)).toEqual([null, null]);
      expect(waiting.participants.map((participant) => participant.total)).toEqual(
        live.participants.map((participant) => participant.total),
      );
      expect(waiting.clock).toBeNull();

      // A Lane with only one retained stream cannot borrow its other stream from the saved projection.
      for (const incomplete of [
        { ...other, score: null },
        { ...other, competitionState: null },
      ]) {
        source.observe({ ...snapshot, lanes: [snapshot.lanes[0]!, incomplete] });
        const partial = await source.snapshot(`${competitionId}:relay`);
        expect(partial.participants.map((participant) => participant.dataState)).toEqual(['live', 'stale']);
        expect(partial.participants[0]!.clock).toEqual(live.participants[0]!.clock);
        expect(partial.participants[1]!.clock).toBeNull();
        expect(partial.clock).toBeNull();
      }

      // Valid retained publications need not have newer timestamps than the saved projection.
      source.observe(snapshot);
      const recovered = await source.snapshot(`${competitionId}:relay`);
      expect(recovered.participants).toEqual(live.participants);
      expect(recovered.clock).toEqual(live.clock);
    },
  );

  it('certifies a saved finish only after matching final state and score boundaries', async () => {
    const snapshot = control(registry);
    source.observe(snapshot);
    journal.append(shot());
    fire(snapshot);
    snapshot.competitions[0]!.phase = 'MATCH_COMPLETE';
    snapshot.competitions[0]!.finishedAt = publishedAt;
    source.observe(snapshot);
    expect((await source.snapshot(`${competitionId}:relay`)).participants[0]!.dataState).toBe('stale');
    const finishCommand = randomUUID();
    snapshot.lanes[0]!.competitionState!.phase = 'FINISHED';
    snapshot.lanes[0]!.competitionState!.finalSnapshotCommandId = finishCommand;
    snapshot.lanes[0]!.score!.finalSnapshotCommandId = finishCommand;
    source.observe(snapshot);
    const saved = await source.snapshot(`${competitionId}:relay`);
    expect(saved.finished).toBe(true);
    expect(saved.participants[0]).toMatchObject({ dataState: 'saved', historyComplete: true });
    source.observe({
      connected: false,
      brokerUrl: null,
      activeCompetitionId: null,
      lanes: [],
      competitions: [],
      lastCommand: null,
    });
    const restarted = new DirectorVistaSource(
      db,
      registry,
      journal,
      { getSnapshot: board },
      { ...identity, bootId: 'restarted' },
      () => checkedAt,
    );
    expect(await restarted.snapshot(`${competitionId}:relay`)).toEqual(saved);
  });

  it.each(['interruption', 'safety-stop', 'safety-stop-without-clock'])(
    'keeps unaffected participant clocks running during another Lane %s',
    async (pauseKind) => {
      const snapshot = control(registry);
      fire(snapshot);
      const paused = structuredClone(snapshot.lanes[0]!);
      paused.laneId = randomUUID();
      paused.competitionState!.laneId = paused.laneId;
      paused.assignment!.laneId = paused.laneId;
      paused.assignment!.athlete!.id = randomUUID();
      paused.score!.laneId = paused.laneId;
      paused.competitionState!.interruption = {
        interruptionId: randomUUID(),
        status: 'PAUSED',
        pausedAt: publishedAt,
        capturedAt: publishedAt,
        capturedRemainingSeconds: 2600,
        capturedTotalSeconds: 2700,
        resumeAt: null,
        authorizedRemainingSeconds: null,
        unlimitedSightingShots: null,
      };
      if (pauseKind !== 'interruption') {
        delete paused.competitionState!.interruption;
        paused.safetyState = {
          laneId: paused.laneId,
          status: 'STOPPED',
          safetyStopId: randomUUID(),
          reason: 'Target fault',
          stoppedBy: 'Official',
          stoppedAt: publishedAt,
          timerSnapshot:
            pauseKind === 'safety-stop'
              ? { competitionId, remainingSeconds: 2600, totalSeconds: 2700, frozenAt: publishedAt }
              : null,
          clearedBy: null,
          clearanceReason: null,
          clearedAt: null,
          publishedAt,
        };
      }
      snapshot.competitions[0]!.laneIds.push(paused.laneId);
      snapshot.lanes.push(paused);
      source.observe(snapshot);

      const projected = await source.snapshot(`${competitionId}:relay`);
      expect(projected.clock).toBeNull();
      const pausedClock = projected.participants.find((participant) => participant.laneId === paused.laneId)!.clock;
      const stoppedClock = expect.objectContaining({ state: 'stopped', remainingMs: 2_600_000 });
      expect(pausedClock).toEqual(pauseKind === 'safety-stop-without-clock' ? null : stoppedClock);
      expect(projected.participants.find((participant) => participant.laneId === laneId)!.clock).toMatchObject({
        state: 'running',
        remainingMs: 2_700_000,
      });
    },
  );

  it.each(['STOPPED', 'CLEAR'] as const)(
    'retains the latest %s safety clock after delayed Lane state',
    async (status) => {
      const snapshot = control(registry);
      fire(snapshot);
      const lane = snapshot.lanes[0]!;
      lane.safetyState = {
        laneId,
        status,
        safetyStopId: randomUUID(),
        reason: 'Target fault',
        stoppedBy: 'Official',
        stoppedAt: publishedAt,
        timerSnapshot: { competitionId, remainingSeconds: 2600, totalSeconds: 2700, frozenAt: publishedAt },
        clearedBy: status === 'CLEAR' ? 'Official' : null,
        clearanceReason: status === 'CLEAR' ? 'Target ready' : null,
        clearedAt: status === 'CLEAR' ? publishedAt : null,
        publishedAt,
      };
      source.observe(snapshot);
      const latest = await source.snapshot(`${competitionId}:relay`);
      lane.safetyState = {
        ...lane.safetyState,
        status: status === 'STOPPED' ? 'CLEAR' : 'STOPPED',
        publishedAt: startedAt,
      };
      source.observe(snapshot);
      const delayed = await source.snapshot(`${competitionId}:relay`);
      expect(delayed.participants[0]!.clock).toEqual(latest.participants[0]!.clock);
      expect(delayed.clock).toEqual(latest.clock);
      expect(delayed.revision).toBe(latest.revision);
    },
  );

  it.each(['RUNNING_MATCH', 'SIGHTING'] as const)(
    'holds the authorized %s timer until its scheduled resume',
    async (status) => {
      const snapshot = control(registry);
      fire(snapshot);
      const startsAt = checkedAt + 3000;
      snapshot.lanes[0]!.competitionState!.interruption = {
        interruptionId: randomUUID(),
        status,
        pausedAt: publishedAt,
        capturedAt: publishedAt,
        capturedRemainingSeconds: 50,
        capturedTotalSeconds: 2700,
        resumeAt: new Date(startsAt).toISOString(),
        authorizedRemainingSeconds: 60,
        unlimitedSightingShots: status === 'SIGHTING',
      };
      source.observe(snapshot);
      const scheduled = await source.snapshot(`${competitionId}:relay`);
      expect(scheduled.participants[0]!.clock).toMatchObject({
        state: 'stopped',
        label: 'Scheduled',
        remainingMs: 60_000,
      });
      checkedAt += 2000;
      const waiting = await source.snapshot(`${competitionId}:relay`);
      expect(waiting.revision).toBe(scheduled.revision);
      expect(waiting.participants[0]!.clock).toEqual(scheduled.participants[0]!.clock);
      checkedAt = startsAt;
      const started = await source.snapshot(`${competitionId}:relay`);
      const clock = started.participants[0]!.clock!;
      expect(clock).toMatchObject({ state: 'running', label: status, remainingMs: 60_000, sampledAt: startsAt });
      expect(clock.generation).toBe(scheduled.participants[0]!.clock!.generation);
      expect(clock.revision).toBeGreaterThan(scheduled.participants[0]!.clock!.revision);
      expect(started.generation).toBe(scheduled.generation);
      expect(started.revision).toBeGreaterThan(scheduled.revision);
      checkedAt += 2000;
      const later = await source.snapshot(`${competitionId}:relay`);
      expect(later.revision).toBe(started.revision);
      expect(later.participants[0]!.clock).toEqual(clock);
      expect(clock.remainingMs - (later.capturedAt - clock.sampledAt)).toBe(58_000);
    },
  );

  it.each(['RUNNING_MATCH', 'PAUSED', 'NONE'] as const)(
    'does not continue a finished Lane interruption clock from %s evidence',
    async (status) => {
      const snapshot = control(registry);
      fire(snapshot);
      const finishedAt = '2026-09-11T00:00:02.000Z';
      const finishCommandId = randomUUID();
      const lane = snapshot.lanes[0]!;
      lane.competitionState!.phase = 'FINISHED';
      lane.competitionState!.finalSnapshotCommandId = finishCommandId;
      lane.competitionState!.publishedAt = finishedAt;
      lane.score!.finalSnapshotCommandId = finishCommandId;
      if (status !== 'NONE')
        lane.competitionState!.interruption = {
          interruptionId: randomUUID(),
          status,
          pausedAt: publishedAt,
          capturedAt: publishedAt,
          capturedRemainingSeconds: 2600,
          capturedTotalSeconds: 2700,
          resumeAt: status === 'RUNNING_MATCH' ? publishedAt : null,
          authorizedRemainingSeconds: status === 'RUNNING_MATCH' ? 2600 : null,
          unlimitedSightingShots: status === 'RUNNING_MATCH' ? false : null,
        };
      source.observe(snapshot);
      const beforeRangeFinish = await source.snapshot(`${competitionId}:relay`);
      snapshot.competitions[0]!.phase = 'MATCH_COMPLETE';
      snapshot.competitions[0]!.finishedAt = finishedAt;
      snapshot.competitions[0]!.publishedAt = finishedAt;
      delete snapshot.competitions[0]!.activeTimer;
      source.observe(snapshot);
      const finished = await source.snapshot(`${competitionId}:relay`);
      expect(finished.participants[0]!.dataState).toBe('saved');
      const stoppedClock = expect.objectContaining({ state: 'stopped', remainingMs: 2_600_000 });
      for (const projected of [beforeRangeFinish, finished]) {
        expect(projected.participants[0]!.clock).toEqual(status !== 'PAUSED' ? null : stoppedClock);
      }
    },
  );

  function transferBundle(snapshot: MqttControlSnapshotDto, destinationLaneId: string): ReserveLaneTransferBundle {
    const lane = snapshot.lanes[0]!;
    const content: Omit<ReserveLaneTransferBundle, 'digest'> = {
      version: 1,
      request: {
        id: randomUUID(),
        competitionId,
        sourceLaneId: lane.laneId,
        destinationLaneId,
        officialName: 'Official',
        statement: 'Target replacement',
      },
      sourceSafetyStopId: randomUUID(),
      capturedAt: publishedAt,
      summary: {
        athleteId: lane.assignment!.athlete!.id,
        athleteName: lane.assignment!.athlete!.name,
        matchShots: lane.score!.totalShotCount,
        totalScoreX10: lane.score!.totalScoreX10,
        remainingSeconds: 2600,
        rulePackFingerprint: snapshot.competitions[0]!.definitionBinding!.rulePack!.fingerprint.value,
      },
      competitionJson: JSON.stringify({ id: competitionId, sessionId: lane.competitionState!.sessionId }),
      sessionJson: JSON.stringify({ id: lane.competitionState!.sessionId }),
      assignmentJson: JSON.stringify({ competitionId, athlete: lane.assignment!.athlete }),
    };
    return { ...content, digest: vistaDigest(content) };
  }

  function addReserve(snapshot: MqttControlSnapshotDto): string {
    const reserve = structuredClone(control(registry, 'AR60').lanes[0]!);
    const destination = randomUUID();
    reserve.laneId = destination;
    reserve.competitionState!.laneId = destination;
    reserve.competitionState!.sessionId = randomUUID();
    reserve.assignment!.laneId = destination;
    reserve.assignment!.athlete = null;
    reserve.score!.laneId = destination;
    reserve.score!.sessionId = reserve.competitionState!.sessionId;
    snapshot.competitions[0]!.laneIds.push(destination);
    snapshot.lanes.push(reserve);
    return destination;
  }

  function movedLane(snapshot: MqttControlSnapshotDto, destination: string) {
    const moved = structuredClone(snapshot.lanes[0]!);
    moved.laneId = destination;
    moved.laneAlias = 'Reserve';
    moved.competitionState!.laneId = destination;
    moved.assignment!.laneId = destination;
    moved.score!.laneId = destination;
    return moved;
  }

  function recordTransfer(bundle: ReserveLaneTransferBundle, prepared: unknown = bundle, active: unknown = bundle) {
    const transfers = new SqliteReserveTransferRepository(db);
    transfers.create(bundle.request);
    for (const [operation, detail] of [
      ['SOURCE_PREPARED', prepared],
      ['TARGET_ACTIVE', active],
    ] as const)
      if (detail !== null)
        transfers.append({
          id: randomUUID(),
          transferId: bundle.request.id,
          operation,
          recordedAt: publishedAt,
          detail,
        });
  }

  it('merges history only after acknowledged reserve transfer and keeps participant/generation identity', async () => {
    const snapshot = control(registry, 'AR60');
    source.observe(snapshot);
    journal.append(shot());
    fire(snapshot);
    source.observe(snapshot);
    const first = await source.snapshot(`${competitionId}:relay`);
    const destination = randomUUID();
    const bundle = transferBundle(snapshot, destination);
    recordTransfer(bundle);
    snapshot.competitions[0]!.laneIds.push(destination);
    snapshot.competitions[0]!.transferredSourceLaneIds = [laneId];
    snapshot.lanes.push(movedLane(snapshot, destination));
    source.observe(snapshot);
    const result = await source.snapshot(`${competitionId}:relay`);
    expect(result.participants).toHaveLength(1);
    expect(result.participants[0]).toMatchObject({
      id: participantId,
      laneId: destination,
      shotCount: 1,
      historyComplete: true,
    });
    expect(result.participants[0]!.shots).toEqual(first.participants[0]!.shots);
    expect(result.generation).toBe(first.generation);
    expect(result.participants[0]!.assignmentRevision).not.toBe(first.participants[0]!.assignmentRevision);
  });

  it.each(['catalog', 'snapshot'] as const)(
    'accepts the retired source assignment on the next %s read after the transfer commits',
    async (read) => {
      const snapshot = control(registry, 'AR60');
      const destination = addReserve(snapshot);
      source.observe(snapshot);
      const originalShot = shot();
      journal.append(originalShot);
      fire(snapshot);
      source.observe(snapshot);
      const first = await source.snapshot(`${competitionId}:relay`);
      const bundle = transferBundle(snapshot, destination);
      const transfers = new SqliteReserveTransferRepository(db);
      const moved = movedLane(snapshot, destination);
      const activationObservations: Array<{ availability: string; targetActive: boolean }> = [];
      const service = new ReserveLaneTransferService(transfers, {
        transfer: async ({ transfer }) => {
          // Lane clears the source assignment while retiring it, before target activation.
          if (transfer.operation === 'RETIRE_SOURCE') {
            const origin = snapshot.lanes[0]!;
            origin.assignment!.athlete = null;
            origin.assignment!.publishedAt = '2026-09-11T00:00:02.000Z';
            origin.competitionState!.phase = 'FINISHED';
            origin.competitionState!.publishedAt = origin.assignment!.publishedAt;
            source.observe(snapshot);
          }
          if (transfer.operation === 'ACTIVATE_TARGET') {
            snapshot.lanes[1] = moved;
            snapshot.competitions[0]!.transferredSourceLaneIds = [laneId];
            source.observe(snapshot);
            // The target publishes state before Director persists the successful command.
            activationObservations.push({
              availability: source.catalog().subjects[0]!.availability,
              targetActive: transfers.entries(bundle.request.id).some((entry) => entry.operation === 'TARGET_ACTIVE'),
            });
          }
          return bundle;
        },
        resume: vi.fn(),
        resumeMatch: vi.fn(),
      });
      await service.prepare(bundle.request);
      await service.complete({ id: bundle.request.id, expectedDigest: bundle.digest, confirmed: true });
      expect(activationObservations).toEqual([{ availability: 'unsupported', targetActive: false }]);
      expect(transfers.entries(bundle.request.id).find((entry) => entry.operation === 'TARGET_ACTIVE')!.detail).toEqual(
        bundle,
      );
      // These changes were never observed and must not enter the replayed projection.
      moved.assignment!.athlete!.name = 'Unobserved athlete name';
      moved.score!.totalScoreX10 = 999;
      const availability = read === 'catalog' ? source.catalog().subjects[0]!.availability : null;
      expect(availability).toBe(read === 'catalog' ? 'available' : null);
      const result = await source.snapshot(`${competitionId}:relay`);
      expect(result.generation).toBe(first.generation);
      expect(result.participants).toHaveLength(1);
      expect(result.participants[0]).toMatchObject({
        id: participantId,
        name: 'Athlete',
        laneId: destination,
        total: 10.4,
        shotCount: 1,
        historyComplete: true,
        shots: [{ id: originalShot.shotId }],
      });
      const writes = db.prepare('SELECT total_changes() AS count').get();
      expect(source.catalog().subjects[0]!.availability).toBe('available');
      expect((await source.snapshot(`${competitionId}:relay`)).participants).toEqual(result.participants);
      expect(db.prepare('SELECT total_changes() AS count').get()).toEqual(writes);
      source = new DirectorVistaSource(db, registry, journal, { getSnapshot: board }, identity, () => checkedAt);
      const restored = await source.snapshot(`${competitionId}:relay`);
      expect(restored.generation).toBe(result.generation);
      expect(restored.participants).toEqual(
        result.participants.map((participant) => ({ ...participant, dataState: 'stale', clock: null })),
      );
    },
  );

  it.each([
    'athlete',
    'session',
    'competition',
    'source Lane',
    'destination Lane',
    'prepared',
    'activated',
    'digest',
    'invalid JSON',
  ] as const)('rejects reserve continuity when the saved %s evidence does not match', async (mismatch) => {
    const snapshot = control(registry, 'AR60');
    const destination = addReserve(snapshot);
    source.observe(snapshot);
    fire(snapshot);
    source.observe(snapshot);
    const bundle = transferBundle(snapshot, destination);
    const evidence = structuredClone(bundle);
    if (mismatch === 'athlete') {
      evidence.summary.athleteId = randomUUID();
      evidence.assignmentJson = JSON.stringify({ competitionId, athlete: { id: evidence.summary.athleteId } });
    }
    if (mismatch === 'session') {
      const anotherSession = randomUUID();
      evidence.competitionJson = JSON.stringify({ id: competitionId, sessionId: anotherSession });
      evidence.sessionJson = JSON.stringify({ id: anotherSession });
    }
    if (mismatch === 'competition') evidence.request.competitionId = randomUUID();
    if (mismatch === 'source Lane') evidence.request.sourceLaneId = randomUUID();
    if (mismatch === 'destination Lane') evidence.request.destinationLaneId = randomUUID();
    if (mismatch === 'invalid JSON') evidence.sessionJson = '{';
    const { digest: _digest, ...content } = evidence;
    evidence.digest = mismatch === 'digest' ? '0'.repeat(64) : vistaDigest(content);
    recordTransfer(bundle, mismatch === 'prepared' ? null : evidence, mismatch === 'activated' ? {} : evidence);
    snapshot.lanes[1] = movedLane(snapshot, destination);
    snapshot.competitions[0]!.transferredSourceLaneIds = [laneId];
    source.observe(snapshot);
    expect(source.catalog().subjects[0]!.availability).toBe('unsupported');
    await expect(source.snapshot(`${competitionId}:relay`)).rejects.toThrow('unconfirmed Lane session replacement');
  });

  it('retries changing result boundaries and preserves authoritative totals, ranks and publication as one unit', async () => {
    db.prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)').run(
      championshipId,
      'Championship',
      '2026-09-11',
      'Range',
    );
    db.prepare('INSERT INTO events (id, championship_id, name, event_type, round) VALUES (?, ?, ?, ?, ?)').run(
      eventId,
      championshipId,
      'Beam Rifle',
      'BR60S',
      'Qualification',
    );
    db.prepare('INSERT INTO participants (id, event_id, player_name) VALUES (?, ?, ?)').run(
      participantId,
      eventId,
      'Athlete',
    );
    const earlierParticipant = randomUUID();
    db.prepare('INSERT INTO participants (id, event_id, player_name) VALUES (?, ?, ?)').run(
      earlierParticipant,
      eventId,
      'Earlier relay',
    );
    db.prepare(
      'INSERT INTO results (id, event_id, participant_id, player_name, relay_number, total_score, shots_detail, source_competition_id, source_lane_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('earlier-result', eventId, earlierParticipant, 'Earlier relay', 1, 500, '[]', randomUUID(), laneId);
    db.prepare(
      'INSERT INTO results (id, event_id, participant_id, player_name, relay_number, total_score, shots_detail, source_competition_id, source_lane_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('result', eventId, participantId, 'Athlete', 1, 8.4, '[10.4]', competitionId, laneId);
    const snapshot = control(registry);
    source.observe(snapshot);
    journal.append(shot());
    fire(snapshot);
    source.observe(snapshot);
    snapshot.competitions[0]!.phase = 'MATCH_COMPLETE';
    snapshot.competitions[0]!.finishedAt = publishedAt;
    const finalCommand = randomUUID();
    snapshot.lanes[0]!.competitionState!.phase = 'FINISHED';
    snapshot.lanes[0]!.competitionState!.finalSnapshotCommandId = finalCommand;
    snapshot.lanes[0]!.score!.finalSnapshotCommandId = finalCommand;
    source.observe(snapshot);
    let reads = 0;
    board.mockImplementation(async () => {
      if (reads++ === 0) db.prepare("UPDATE participants SET affiliation = 'New club' WHERE id = ?").run(participantId);
      return {
        eventId,
        resultScope: 'QUALIFICATION',
        snapshotRevision: 'approved',
        checkedAt: publishedAt,
        state: 'OFFICIAL',
        postedAt: publishedAt,
        protestEndsAt: null,
        results: [
          {
            resultId: 'result',
            rank: 7,
            playerName: 'Athlete',
            affiliation: 'New club',
            totalScore: 8.4,
            entryStatus: 'COMPETING' as const,
            classificationCode: null,
          },
        ],
      };
    });
    const result = await source.snapshot(`${competitionId}:event`);
    expect(reads).toBe(2);
    expect(result.ranking).toMatchObject({
      kind: 'competition',
      state: 'OFFICIAL',
      revision: 'approved',
      rows: [{ id: participantId, rank: 7, total: 8.4 }],
    });
    expect(result.participants[0]).toMatchObject({ total: 8.4, affiliation: 'New club' });
    board.mockResolvedValue({ ...(await board(eventId, 'QUALIFICATION')), state: 'REVIEW_REQUIRED' });
    const changed = await source.snapshot(`${competitionId}:event`);
    expect(changed.revision).toBeGreaterThan(result.revision);
    expect(changed.ranking!.state).toBe('REVIEW_REQUIRED');
  });
});
