import { describe, expect, it, vi } from 'vitest';
import { ISSF_2026_P25 } from '@sasakiuri/saika-rules';

import { InterruptionCompetitionDataGuard } from '@/main/modules/range-interruptions/application/InterruptionCompetitionDataGuard';
import { RangeInterruptionService } from '@/main/modules/range-interruptions/application/RangeInterruptionService';
import type {
  IRangeInterruptionRepository,
  RangeInterruptionScope,
} from '@/main/modules/range-interruptions/domain/IRangeInterruptionRepository';
import type { RangeInterruptionCase } from '@/main/modules/range-interruptions/domain/RangeInterruptionCase';
import { getRangeInterruptionState } from '@/main/modules/range-interruptions/domain/RangeInterruptionEntry';
import type { RangeInterruptionEntry } from '@/main/modules/range-interruptions/domain/RangeInterruptionEntry';
import type { RangeInterruptionScopeLink } from '@/main/modules/range-interruptions/domain/RangeInterruptionScopeLink';
import type { TargetRecoveryAssessment } from '@/main/modules/range-interruptions/domain/TargetRecoveryAssessment';
import type { RangeInterruptionCommandBatch } from '@/main/modules/range-interruptions/domain/RangeInterruptionCommandBatch';
import type { QualificationTimedTargetRecoveryDecision } from '@/main/modules/range-interruptions/domain/QualificationTimedTargetRecoveryDecision';
import type { QualificationRecoveryExecutionRecord } from '@/main/modules/range-interruptions/domain/QualificationRecoveryExecution';
import type { QualificationRecoverySettlementRecord } from '@/main/modules/range-interruptions/domain/QualificationRecoverySettlement';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_ID = '33333333-3333-4333-8333-333333333333';

function harness(competitionTypes?: CompetitionTypeRegistry) {
  const cases: RangeInterruptionCase[] = [];
  const scopes: RangeInterruptionScopeLink[] = [];
  const entries: RangeInterruptionEntry[] = [];
  const targetRecoveryAssessments: TargetRecoveryAssessment[] = [];
  const commandBatches: RangeInterruptionCommandBatch[] = [];
  const qualificationDecisions: QualificationTimedTargetRecoveryDecision[] = [];
  const qualificationExecutions: QualificationRecoveryExecutionRecord[] = [];
  const qualificationSettlements: QualificationRecoverySettlementRecord[] = [];
  const group = <T extends { caseId: string }>(caseIds: readonly string[], values: readonly T[]) => {
    const result = new Map<string, T[]>();
    for (const caseId of caseIds)
      result.set(
        caseId,
        values.filter((value) => value.caseId === caseId),
      );
    return result;
  };
  const repository: IRangeInterruptionRepository = {
    appendCase: vi.fn((interruption, initialScopes) => {
      cases.push(interruption);
      scopes.push(...initialScopes);
    }),
    findCaseById: vi.fn((id) => cases.find((interruption) => interruption.id === id) ?? null),
    findAllCases: vi.fn(() => [...cases]),
    findCasesByScope: vi.fn((scope: RangeInterruptionScope) => {
      const ids = new Set(
        scopes
          .filter((link) => link.scopeType === scope.scopeType && link.scopeId === scope.scopeId)
          .map((link) => link.caseId),
      );
      return cases.filter((interruption) => ids.has(interruption.id));
    }),
    appendScope: vi.fn((scope) => scopes.push(scope)),
    findScopesByCaseIds: vi.fn((ids) => group(ids, scopes)),
    appendEntry: vi.fn((entry) => entries.push(entry)),
    findEntriesByCaseIds: vi.fn((ids) => group(ids, entries)),
    appendTargetRecoveryAssessment: vi.fn((assessment) => targetRecoveryAssessments.push(assessment)),
    findTargetRecoveryAssessmentsByCaseIds: vi.fn((ids) => group(ids, targetRecoveryAssessments)),
    appendCommandBatch: vi.fn((batch, transitionEntry) => {
      commandBatches.push(batch);
      if (transitionEntry) entries.push(transitionEntry);
    }),
    findCommandBatchesByCaseIds: vi.fn((ids) => group(ids, commandBatches)),
    appendQualificationTimedTargetRecoveryDecision: vi.fn((decision) => qualificationDecisions.push(decision)),
    findQualificationTimedTargetRecoveryDecisionsByCaseIds: vi.fn((ids) => group(ids, qualificationDecisions)),
    findActiveDataHolds: vi.fn((scope, laneId) => {
      return repository.findCasesByScope(scope).filter((interruption) => {
        if (laneId !== undefined && interruption.laneId !== null && interruption.laneId !== laneId) return false;
        return getRangeInterruptionState(entries.filter((entry) => entry.caseId === interruption.id)).dataHoldActive;
      });
    }),
  };
  return {
    service: new RangeInterruptionService(
      repository,
      competitionTypes,
      { findByCaseIds: (ids) => group(ids, qualificationExecutions) },
      { findByCaseIds: (ids) => group(ids, qualificationSettlements) },
    ),
    guard: new InterruptionCompetitionDataGuard(repository),
    entries,
    qualificationExecutions,
    qualificationSettlements,
  };
}

async function openCase(service: RangeInterruptionService) {
  return service.create({
    scopes: [{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }],
    cause: 'ATHLETE_NON_FAULT',
    phase: 'MATCH',
    startedAt: '2026-08-31T01:00:00.000Z',
    remainingSecondsAtStart: 240,
    laneId: LANE_ID,
    firingPointNumber: 12,
    athleteName: 'Alex Athlete',
    summary: 'Target service interruption',
    details: 'The athlete could not continue through no fault of their own.',
    openedBy: 'Range Officer A',
  });
}

describe('RangeInterruptionService', () => {
  it('records measured loss, recommends a remedy, and keeps the official grant separate', async () => {
    const { service } = harness();
    const opened = await openCase(service);
    expect(opened).toMatchObject({ status: 'OPEN', dataHoldActive: true, recommendation: null });

    const ended = await service.appendEntry({
      caseId: opened.id,
      type: 'ENDED',
      occurredAt: '2026-08-31T01:03:01.001Z',
      statement: 'Target service restored',
      officialName: 'Range Officer A',
    });
    expect(ended.entries.at(-1)).toMatchObject({
      type: 'ENDED',
      lostTimeSeconds: 182,
      ruleReference: 'ISSF 6.11.3',
    });
    expect(ended.recommendation).toMatchObject({
      basis: 'LAST_FIVE_MINUTES',
      suggestedAdditionalSeconds: 60,
      suggestedAuthorizedRemainingSeconds: 300,
    });
    expect(ended.status).toBe('ENDED');

    const granted = await service.appendEntry({
      caseId: opened.id,
      type: 'TIME_GRANTED',
      occurredAt: '2026-08-31T01:03:10.000Z',
      statement: 'Jury grants the recommended final-five-minute remedy',
      officialName: 'Jury Member A',
      ruleReference: 'ISSF 6.11.3.1',
      extensionSeconds: 60,
      authorizedRemainingSeconds: 300,
      unlimitedSightingShots: false,
      incidentReportReference: 'RIR-2026-0042',
    });
    expect(granted.status).toBe('GRANTED');
    expect(granted.recommendation).toEqual(ended.recommendation);
  });

  it('enforces append-only workflow transitions and requires closure before cleanup', async () => {
    const { service, guard } = harness();
    const opened = await openCase(service);

    expect(() =>
      guard.assertAllowed({ operation: 'RESET_LANE_SESSION', competitionId: COMPETITION_ID, laneId: LANE_ID }),
    ).toThrow(`Range interruption ${opened.id.slice(0, 8)}`);
    await expect(
      service.appendEntry({
        caseId: opened.id,
        type: 'TIME_GRANTED',
        occurredAt: '2026-08-31T01:00:10.000Z',
        statement: 'Premature grant',
        officialName: 'Jury Member A',
        ruleReference: 'ISSF 6.11.3.1',
        extensionSeconds: 0,
        authorizedRemainingSeconds: 240,
        unlimitedSightingShots: false,
        incidentReportReference: 'RIR-2026-0042',
      }),
    ).rejects.toThrow('End the interruption');

    await service.appendEntry({
      caseId: opened.id,
      type: 'ENDED',
      occurredAt: '2026-08-31T01:02:00.000Z',
      statement: 'Service restored before the entitlement threshold',
      officialName: 'Range Officer A',
    });
    const closed = await service.appendEntry({
      caseId: opened.id,
      type: 'CLOSED',
      occurredAt: '2026-08-31T01:02:10.000Z',
      statement: 'No time extension was granted',
      officialName: 'Range Officer A',
    });
    expect(closed).toMatchObject({ status: 'CLOSED', dataHoldActive: false });
    expect(() =>
      guard.assertAllowed({ operation: 'RESET_LANE_SESSION', competitionId: COMPETITION_ID, laneId: LANE_ID }),
    ).not.toThrow();
  });

  it('does not recommend the single-target remedy until recovery and reserve movement are recorded', async () => {
    const { service } = harness();
    const opened = await service.create({
      scopes: [{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }],
      cause: 'SINGLE_TARGET_FAILURE',
      phase: 'MATCH',
      startedAt: '2026-08-31T01:00:00.000Z',
      remainingSecondsAtStart: 600,
      laneId: LANE_ID,
      firingPointNumber: 12,
      summary: 'Single EST failed',
      details: 'The EST could not be restored.',
      openedBy: 'Range Officer A',
    });
    const ended = await service.appendEntry({
      caseId: opened.id,
      type: 'ENDED',
      occurredAt: '2026-08-31T01:05:30.000Z',
      statement: 'Failure handling ended',
      officialName: 'Range Officer A',
    });
    expect(ended.recommendation).toMatchObject({ basis: 'MANUAL_REVIEW', suggestedAdditionalSeconds: 0 });

    const assessed = await service.recordTargetRecovery({
      caseId: opened.id,
      movedToReserveFiringPoint: true,
      reserveFiringPointNumber: 14,
      statement: 'Target was not repaired within five minutes; athlete moved to reserve point 14',
      officialName: 'Range Officer A',
      assessedAt: '2026-08-31T01:05:35.000Z',
    });
    expect(assessed.targetRecoveryAssessments).toHaveLength(1);
    expect(assessed.recommendation).toMatchObject({
      basis: 'TARGET_FAILURE_RECOVERY',
      suggestedAdditionalSeconds: 300,
      unlimitedSightingShots: true,
    });
  });

  it('snapshots and applies the stage-specific 25m Qualification interruption policy', async () => {
    const competitionTypes = new CompetitionTypeRegistry();
    competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_P25));
    const { service, qualificationExecutions } = harness(competitionTypes);
    const opened = await service.create({
      scopes: [{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }],
      cause: 'ATHLETE_NON_FAULT',
      phase: 'MATCH',
      startedAt: '2026-08-31T01:00:00.000Z',
      remainingSecondsAtStart: 0,
      laneId: LANE_ID,
      firingPointNumber: 12,
      summary: '25m precision series interrupted',
      details: 'The series stopped after two recorded shots because of a technical fault.',
      openedBy: 'Range Officer A',
      qualificationTimedTargetContext: {
        competitionTypeId: 'P25',
        stageIndex: 1,
        seriesIndex: 0,
        recordedShots: 2,
        seriesComplete: false,
        laneSnapshotCapturedAt: '2026-08-31T01:00:01.000Z',
      },
    });

    expect(opened.qualificationTimedTargetContext).toMatchObject({
      competitionTypeId: 'P25',
      stageId: 'PRECISION_STAGE',
      timedTargetProgramId: 'P25_MATCH_PRECISION_240',
      seriesShotLimit: 5,
      recordedShots: 2,
      rulePack: { id: ISSF_2026_P25.id, schemaVersion: 1 },
    });
    const ended = await service.appendEntry({
      caseId: opened.id,
      type: 'ENDED',
      occurredAt: '2026-08-31T01:15:01.000Z',
      statement: 'Technical service restored',
      officialName: 'Range Officer A',
    });
    expect(ended.recommendation).toEqual(
      expect.objectContaining({
        type: 'QUALIFICATION_TIMED_TARGET',
        stageId: 'PRECISION_STAGE',
        extraSighting: { required: true, shots: 5 },
        seriesRecovery: {
          treatment: 'COMPLETE_REMAINING_SHOTS',
          shotsToFire: 3,
          execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 144 },
        },
        ruleReferences: ['8.8.1(a)', '8.8.1(c-d)'],
      }),
    );

    if (ended.recommendation?.type !== 'QUALIFICATION_TIMED_TARGET') {
      throw new Error('Qualification recommendation is unavailable');
    }
    await expect(
      service.appendEntry({
        caseId: opened.id,
        type: 'TIME_GRANTED',
        occurredAt: '2026-08-31T01:15:02.000Z',
        statement: 'Incorrectly use the generic timer workflow',
        officialName: 'Jury Member A',
        extensionSeconds: 0,
        authorizedRemainingSeconds: 144,
        unlimitedSightingShots: false,
        incidentReportReference: 'RIR-25M-001',
        ruleReference: 'ISSF 8.8.1',
      }),
    ).rejects.toThrow('separate decision and execution workflow');
    await expect(
      service.appendEntry({
        caseId: opened.id,
        type: 'CLOSED',
        occurredAt: '2026-08-31T01:15:03.000Z',
        statement: 'Close before an official decision',
        officialName: 'Range Officer A',
      }),
    ).rejects.toThrow('before closing');
    await expect(
      service.recordQualificationTimedTargetRecoveryDecision({
        caseId: opened.id,
        authorizedRecovery: {
          extraSightingSeriesShots: ended.recommendation.extraSighting.shots,
          seriesRecovery: {
            treatment: 'KEEP_RECORDED_SERIES',
            shotsToFire: 0,
            execution: null,
          },
        },
        statement: 'Attempt to retain an incomplete series.',
        officialName: 'Jury Member A',
        incidentReportReference: 'RIR-25M-INVALID',
        ruleReference: ended.recommendation.ruleReferences.join('; '),
        decidedAt: '2026-08-31T01:15:04.000Z',
      }),
    ).rejects.toThrow('requires every series shot');
    const decided = await service.recordQualificationTimedTargetRecoveryDecision({
      caseId: opened.id,
      authorizedRecovery: {
        extraSightingSeriesShots: ended.recommendation.extraSighting.shots,
        seriesRecovery: ended.recommendation.seriesRecovery,
      },
      statement: 'The Jury authorizes the Rule Pack recommendation.',
      officialName: 'Jury Member A',
      incidentReportReference: 'RIR-25M-001',
      ruleReference: ended.recommendation.ruleReferences.join('; '),
      decidedAt: '2026-08-31T01:15:05.000Z',
    });
    expect(decided.qualificationTimedTargetRecoveryDecisions).toEqual([
      expect.objectContaining({
        followsRecommendation: true,
        authorizedRecovery: {
          extraSightingSeriesShots: 5,
          seriesRecovery: {
            treatment: 'COMPLETE_REMAINING_SHOTS',
            shotsToFire: 3,
            execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 144 },
          },
        },
      }),
    ]);
    await expect(
      service.appendEntry({
        caseId: opened.id,
        type: 'CLOSED',
        occurredAt: '2026-08-31T01:19:00.000Z',
        statement: 'Attempt closure before the recovery score is adjudicated.',
        officialName: 'Range Officer A',
      }),
    ).rejects.toThrow('Adjudicate the authorized Qualification series recovery');

    const decision = decided.qualificationTimedTargetRecoveryDecisions[0]!;
    if (decision.authorizedRecovery.seriesRecovery.treatment === 'KEEP_RECORDED_SERIES') {
      throw new Error('The fixture must authorize a series recovery');
    }
    const executionBase = {
      runId: '22222222-2222-4222-8222-222222222222',
      caseId: opened.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      phase: 'SERIES_RECOVERY',
      stageIndex: 1,
      seriesIndex: 0,
      expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
      expectedSeriesShotLimit: 5,
      expectedRecordedShots: 2,
      authorization: { phase: 'SERIES_RECOVERY', seriesRecovery: decision.authorizedRecovery.seriesRecovery },
      officialName: decision.officialName,
      decisionRuleReference: decision.ruleReference,
      decidedAt: new Date(decision.decidedAt),
      requestedAt: new Date('2026-08-31T01:16:00.000Z'),
      latestLaneState: null,
      shots: [],
      events: [],
    } satisfies Omit<QualificationRecoveryExecutionRecord, 'status'>;
    qualificationExecutions.push({ ...executionBase, status: 'CANCELLED' });
    const superseded = await service.recordQualificationTimedTargetRecoveryDecision({
      id: '44444444-4444-4444-8444-444444444444',
      caseId: opened.id,
      supersedesDecisionId: decision.id,
      authorizedRecovery: decision.authorizedRecovery,
      statement: 'A cancelled isolated run is replaced by a new official authorization.',
      officialName: 'Jury Member B',
      incidentReportReference: 'RIR-25M-002',
      ruleReference: decision.ruleReference,
      decidedAt: '2026-08-31T01:19:30.000Z',
    });
    const revisedDecision = superseded.qualificationTimedTargetRecoveryDecisions.at(-1)!;
    qualificationExecutions.push({
      ...executionBase,
      runId: '55555555-5555-4555-8555-555555555555',
      decisionId: revisedDecision.id,
      officialName: revisedDecision.officialName,
      decidedAt: new Date(revisedDecision.decidedAt),
      requestedAt: new Date('2026-08-31T01:19:31.000Z'),
      status: 'ADJUDICATED',
    });
    await expect(
      service.recordQualificationTimedTargetRecoveryDecision({
        id: '66666666-6666-4666-8666-666666666666',
        caseId: opened.id,
        supersedesDecisionId: revisedDecision.id,
        authorizedRecovery: revisedDecision.authorizedRecovery,
        statement: 'Attempt to replace a decision whose execution has already started.',
        officialName: 'Jury Member C',
        incidentReportReference: 'RIR-25M-003',
        ruleReference: revisedDecision.ruleReference,
        decidedAt: '2026-08-31T01:19:40.000Z',
      }),
    ).rejects.toThrow('cannot be superseded while an execution remains active or requires adjudication');
    await expect(
      service.appendEntry({
        caseId: opened.id,
        type: 'CLOSED',
        occurredAt: '2026-08-31T01:20:00.000Z',
        statement: 'The separately operated recovery procedure is complete.',
        officialName: 'Range Officer A',
      }),
    ).resolves.toMatchObject({ status: 'CLOSED', dataHoldActive: false });
  });

  it('requires an applied no-fire settlement before closing a fully recorded Qualification series', async () => {
    const competitionTypes = new CompetitionTypeRegistry();
    competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_P25));
    const { service, qualificationSettlements } = harness(competitionTypes);
    const opened = await service.create({
      scopes: [{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }],
      cause: 'ATHLETE_NON_FAULT',
      phase: 'MATCH',
      startedAt: '2026-09-04T01:00:00.000Z',
      remainingSecondsAtStart: 0,
      laneId: LANE_ID,
      firingPointNumber: 12,
      summary: '25m series interrupted after its fifth shot',
      details: 'The timed window stopped after all five shots were recorded.',
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
      occurredAt: '2026-09-04T01:01:00.000Z',
      statement: 'Technical service restored',
      officialName: 'Range Officer A',
    });
    if (ended.recommendation?.type !== 'QUALIFICATION_TIMED_TARGET') throw new Error('Recommendation unavailable');
    const decided = await service.recordQualificationTimedTargetRecoveryDecision({
      caseId: opened.id,
      authorizedRecovery: {
        extraSightingSeriesShots: ended.recommendation.extraSighting.shots,
        seriesRecovery: ended.recommendation.seriesRecovery,
      },
      statement: 'Retain the complete recorded series.',
      officialName: 'Jury Member A',
      incidentReportReference: 'RIR-25M-KEEP-001',
      ruleReference: ended.recommendation.ruleReferences.join('; '),
      decidedAt: '2026-09-04T01:01:05.000Z',
    });
    const decision = decided.qualificationTimedTargetRecoveryDecisions[0]!;

    await expect(
      service.appendEntry({
        caseId: opened.id,
        type: 'CLOSED',
        occurredAt: '2026-09-04T01:02:00.000Z',
        statement: 'Attempt closure before Lane settlement.',
        officialName: 'Range Officer A',
      }),
    ).rejects.toThrow('retain-series settlement');

    qualificationSettlements.push({
      settlementId: '77777777-7777-4777-8777-777777777777',
      caseId: opened.id,
      decisionId: decision.id,
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      treatment: 'KEEP_RECORDED_SERIES',
      stageIndex: 1,
      seriesIndex: 0,
      expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
      expectedSeriesShotLimit: 5,
      expectedRecordedShots: 5,
      decisionOfficialName: decision.officialName,
      decisionRuleReference: decision.ruleReference,
      decidedAt: new Date(decision.decidedAt),
      appliedBy: 'Jury Member A',
      statement: 'The full recorded series was verified and retained.',
      appliedAt: new Date('2026-09-04T01:02:01.000Z'),
      requestedAt: new Date('2026-09-04T01:02:01.000Z'),
      status: 'APPLIED',
      events: [],
    });
    await expect(
      service.recordQualificationTimedTargetRecoveryDecision({
        id: '88888888-8888-4888-8888-888888888888',
        caseId: opened.id,
        supersedesDecisionId: decision.id,
        authorizedRecovery: decision.authorizedRecovery,
        statement: 'Attempt to replace an applied settlement.',
        officialName: 'Jury Member B',
        incidentReportReference: 'RIR-25M-KEEP-002',
        ruleReference: decision.ruleReference,
        decidedAt: '2026-09-04T01:02:02.000Z',
      }),
    ).rejects.toThrow('after settlement was requested');
    await expect(
      service.appendEntry({
        caseId: opened.id,
        type: 'CLOSED',
        occurredAt: '2026-09-04T01:02:10.000Z',
        statement: 'The retained series is settled on the Lane.',
        officialName: 'Range Officer A',
      }),
    ).resolves.toMatchObject({ status: 'CLOSED', dataHoldActive: false });
  });
});
