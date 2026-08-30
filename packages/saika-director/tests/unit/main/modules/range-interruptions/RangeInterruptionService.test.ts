import { describe, expect, it, vi } from 'vitest';

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

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_ID = '33333333-3333-4333-8333-333333333333';

function harness() {
  const cases: RangeInterruptionCase[] = [];
  const scopes: RangeInterruptionScopeLink[] = [];
  const entries: RangeInterruptionEntry[] = [];
  const targetRecoveryAssessments: TargetRecoveryAssessment[] = [];
  const commandBatches: RangeInterruptionCommandBatch[] = [];
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
    findActiveDataHolds: vi.fn((scope, laneId) => {
      return repository.findCasesByScope(scope).filter((interruption) => {
        if (laneId !== undefined && interruption.laneId !== null && interruption.laneId !== laneId) return false;
        return getRangeInterruptionState(entries.filter((entry) => entry.caseId === interruption.id)).dataHoldActive;
      });
    }),
  };
  return {
    service: new RangeInterruptionService(repository),
    guard: new InterruptionCompetitionDataGuard(repository),
    entries,
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
});
