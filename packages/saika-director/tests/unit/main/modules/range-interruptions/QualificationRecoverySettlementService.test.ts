import Database from 'better-sqlite3';
import { ISSF_2026_P25 } from '@sasakiuri/saika-rules';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import { QualificationRecoverySettlementService } from '@/main/modules/range-interruptions/application/QualificationRecoverySettlementService';
import { RangeInterruptionService } from '@/main/modules/range-interruptions/application/RangeInterruptionService';
import type { IQualificationRecoverySettlementTransport } from '@/main/modules/range-interruptions/domain/IQualificationRecoverySettlementTransport';
import { SqliteQualificationRecoveryExecutionRepository } from '@/main/modules/range-interruptions/infra/SqliteQualificationRecoveryExecutionRepository';
import { SqliteQualificationRecoverySettlementRepository } from '@/main/modules/range-interruptions/infra/SqliteQualificationRecoverySettlementRepository';
import { SqliteRangeInterruptionRepository } from '@/main/modules/range-interruptions/infra/SqliteRangeInterruptionRepository';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_ID = '22222222-2222-4222-8222-222222222222';

describe('QualificationRecoverySettlementService', () => {
  let database: Database.Database;
  let rangeService: RangeInterruptionService;
  let settlementService: QualificationRecoverySettlementService;
  let applyTransport: ReturnType<typeof vi.fn<IQualificationRecoverySettlementTransport['apply']>>;
  let now: Date;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
    const rangeRepository = new SqliteRangeInterruptionRepository(database);
    const executionRepository = new SqliteQualificationRecoveryExecutionRepository(database);
    const settlementRepository = new SqliteQualificationRecoverySettlementRepository(database);
    const competitionTypes = new CompetitionTypeRegistry();
    competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_P25));
    rangeService = new RangeInterruptionService(
      rangeRepository,
      competitionTypes,
      executionRepository,
      settlementRepository,
    );
    now = new Date('2026-09-04T01:16:00.000Z');
    applyTransport = vi.fn(async (input) => ({
      commandId: crypto.randomUUID(),
      action: 'settle-qualification-recovery' as const,
      success: true,
      lanes: [{ laneId: input.laneId, status: 'done' as const, acknowledgedAt: '2026-09-04T01:16:01.000Z' }],
    }));
    settlementService = new QualificationRecoverySettlementService(
      rangeRepository,
      settlementRepository,
      executionRepository,
      { apply: applyTransport },
      () => new Date(now),
    );
  });

  afterEach(() => database.close());

  it('applies a full retain-series decision through its separate immutable transport', async () => {
    const interruption = await createRetainSeriesDecision(rangeService);
    const decision = interruption.qualificationTimedTargetRecoveryDecisions[0]!;

    const settlement = await settlementService.apply({
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      appliedBy: 'Jury Member B',
      statement: 'The five recorded shots were checked and the series is retained.',
    });

    expect(settlement).toMatchObject({
      caseId: interruption.id,
      decisionId: decision.id,
      treatment: 'KEEP_RECORDED_SERIES',
      status: 'APPLIED',
      expectedRecordedShots: 5,
    });
    expect(applyTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        interruptionId: interruption.id,
        decisionId: decision.id,
        treatment: 'KEEP_RECORDED_SERIES',
        expectedSeriesShotLimit: 5,
        expectedRecordedShots: 5,
        appliedAt: '2026-09-04T01:16:00.000Z',
      }),
    );
    expect((await rangeService.getById(interruption.id)).qualificationRecoverySettlements[0]).toMatchObject({
      settlementId: settlement.settlementId,
      status: 'APPLIED',
    });
    expect(() =>
      database.prepare('UPDATE qualification_recovery_settlement_requests SET statement = ?').run('changed'),
    ).toThrow('immutable');
  });

  it('retries the same request timestamp and never regresses after a successful acknowledgement', async () => {
    const interruption = await createRetainSeriesDecision(rangeService);
    const decision = interruption.qualificationTimedTargetRecoveryDecisions[0]!;
    const input = {
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      appliedBy: 'Jury Member B',
      statement: 'Retain the verified complete series.',
    };
    applyTransport.mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(settlementService.apply(input)).rejects.toThrow('broker unavailable');
    expect((await rangeService.getById(interruption.id)).qualificationRecoverySettlements[0]?.status).toBe(
      'COMMAND_FAILED',
    );
    now = new Date('2026-09-04T01:20:00.000Z');
    const retried = await settlementService.apply(input);

    expect(retried.status).toBe('APPLIED');
    expect(applyTransport.mock.calls.map(([request]) => request.appliedAt)).toEqual([
      '2026-09-04T01:16:00.000Z',
      '2026-09-04T01:16:00.000Z',
    ]);
    await expect(settlementService.apply({ ...input, statement: 'Changed after delivery.' })).rejects.toThrow(
      'different settlement request',
    );

    database
      .prepare(
        `INSERT INTO qualification_recovery_settlement_events (
          id, event_key, settlement_id, event_type, payload_json, occurred_at, recorded_at
        ) VALUES (?, ?, ?, 'SETTLEMENT_ERROR', ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        `settlement-error:late:${retried.settlementId}`,
        retried.settlementId,
        JSON.stringify({ error: 'Late transport timeout' }),
        '2026-09-04T01:21:00.000Z',
        '2026-09-04T01:21:00.000Z',
      );
    expect((await rangeService.getById(interruption.id)).qualificationRecoverySettlements[0]?.status).toBe('APPLIED');
  });
});

async function createRetainSeriesDecision(service: RangeInterruptionService) {
  const opened = await service.create({
    scopes: [{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }],
    cause: 'ATHLETE_NON_FAULT',
    phase: 'MATCH',
    startedAt: '2026-09-04T01:00:00.000Z',
    remainingSecondsAtStart: 0,
    laneId: LANE_ID,
    firingPointNumber: 12,
    summary: '25m series interrupted after the fifth shot',
    details: 'All five shots were recorded before the target timing fault stopped the series window.',
    openedBy: 'Range Officer A',
    qualificationTimedTargetContext: {
      competitionTypeId: 'P25',
      stageIndex: 1,
      seriesIndex: 0,
      recordedShots: 5,
      seriesComplete: false,
      laneSnapshotCapturedAt: '2026-09-04T01:00:01.000Z',
    },
  });
  const ended = await service.appendEntry({
    caseId: opened.id,
    type: 'ENDED',
    occurredAt: '2026-09-04T01:15:01.000Z',
    statement: 'Technical service restored',
    officialName: 'Range Officer A',
  });
  if (ended.recommendation?.type !== 'QUALIFICATION_TIMED_TARGET') throw new Error('Recommendation unavailable');
  return service.recordQualificationTimedTargetRecoveryDecision({
    caseId: opened.id,
    authorizedRecovery: {
      extraSightingSeriesShots: ended.recommendation.extraSighting.shots,
      seriesRecovery: ended.recommendation.seriesRecovery,
    },
    statement: 'The Jury retains the full recorded series.',
    officialName: 'Jury Member A',
    incidentReportReference: 'RIR-25M-KEEP-001',
    ruleReference: ended.recommendation.ruleReferences.join('; '),
    decidedAt: '2026-09-04T01:15:05.000Z',
  });
}
