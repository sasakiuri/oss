import { identifyRulePack, ISSF_2026_RFPM } from '@sasakiuri/saika-rules';
import { describe, expect, it, vi } from 'vitest';

import { EstComplaintCaseService } from '@/main/modules/est-complaints';
import type {
  EstComplaintCaseLink,
  EstComplaintSignalSnapshot,
  IEstComplaintCaseLinkRepository,
  IEstComplaintSignalSource,
  ITargetExaminationCaseGateway,
} from '@/main/modules/est-complaints';
import type { CreateTargetExaminationCasePayload, TargetExaminationCaseDto } from '@/shared/ipc/contracts';

const competitionId = '11111111-1111-4111-8111-111111111111';
const signalId = '22222222-2222-4222-8222-222222222222';
const caseId = '33333333-3333-4333-8333-333333333333';

describe('EstComplaintCaseService', () => {
  it('opens one evidence-hold case from the immutable Lane facts without making a score decision', () => {
    const repository = new InMemoryLinkRepository();
    const gateway = new RecordingTargetExaminationGateway();
    const service = new EstComplaintCaseService(signalSource(), repository, gateway);

    const result = service.openTargetExamination({ signalId, openedBy: 'RTS A', relayNumber: 2 });

    expect(result).toMatchObject({ created: true, targetExaminationCaseId: caseId });
    expect(gateway.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: [{ scopeType: 'COMPETITION', scopeId: competitionId }],
        issueKind: 'SCORE_VALUE_PROTEST',
        shotId: '55555555-5555-4555-8555-555555555555',
        relayNumber: 2,
        openedBy: 'RTS A',
        ruleReferences: expect.stringContaining('6.16.5.2'),
      }),
    );
    const payload = vi.mocked(gateway.create).mock.calls[0]![0];
    expect(payload).not.toHaveProperty('score');
    expect(payload).not.toHaveProperty('decision');
    expect(repository.findBySignalId(signalId)?.snapshot.context.recordedShots).toBe(3);
  });

  it('is idempotent for repeated operator actions and restores linked observations without a live signal', () => {
    const repository = new InMemoryLinkRepository();
    const gateway = new RecordingTargetExaminationGateway();
    const service = new EstComplaintCaseService(signalSource(), repository, gateway);

    service.openTargetExamination({ signalId, openedBy: 'RTS A' });
    const repeated = service.openTargetExamination({ signalId, openedBy: 'RTS B' });
    const restored = new EstComplaintCaseService(emptySignalSource(), repository, gateway).listByCompetition(
      competitionId,
    );

    expect(repeated).toMatchObject({ created: false, targetExaminationCaseId: caseId });
    expect(gateway.create).toHaveBeenCalledTimes(1);
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ signalId, targetExaminationCaseId: caseId, linkedBy: 'RTS A' });
  });
});

class InMemoryLinkRepository implements IEstComplaintCaseLinkRepository {
  private readonly values = new Map<string, EstComplaintCaseLink>();

  executeInTransaction<T>(operation: () => T): T {
    return operation();
  }

  append(link: EstComplaintCaseLink): void {
    if (this.values.has(link.signalId)) throw new Error('duplicate signal');
    this.values.set(link.signalId, structuredClone(link));
  }

  findBySignalId(id: string): EstComplaintCaseLink | null {
    return this.values.get(id) ?? null;
  }

  findByCompetitionId(id: string): EstComplaintCaseLink[] {
    return [...this.values.values()].filter((link) => link.snapshot.context.competitionId === id);
  }
}

class RecordingTargetExaminationGateway implements ITargetExaminationCaseGateway {
  readonly create = vi.fn((input: CreateTargetExaminationCasePayload): TargetExaminationCaseDto => ({
    id: caseId,
    issueKind: input.issueKind,
    occurredAt: input.occurredAt,
    laneId: input.laneId ?? null,
    firingPointNumber: input.firingPointNumber ?? null,
    relayNumber: input.relayNumber ?? null,
    athleteName: input.athleteName ?? null,
    shotId: input.shotId ?? null,
    summary: input.summary,
    details: input.details,
    ruleReferences: input.ruleReferences,
    openedBy: input.openedBy,
    createdAt: '2026-09-04T01:00:01.000Z',
    scopes: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        caseId,
        scopeType: 'COMPETITION',
        scopeId: competitionId,
        linkedBy: input.openedBy,
        note: null,
        linkedAt: '2026-09-04T01:00:01.000Z',
      },
    ],
    evidence: [],
    entries: [],
    status: 'OPEN',
    evidenceHoldActive: true,
    workflow: { policyId: 'test', advisoryOnly: true, readyForJuryDecision: false, steps: [] },
  }));
}

function signalSource(): IEstComplaintSignalSource {
  const value = snapshot();
  return {
    findById: (id) => (id === signalId ? value : null),
    listByCompetition: (id) => (id === competitionId ? [value] : []),
  };
}

function emptySignalSource(): IEstComplaintSignalSource {
  return { findById: () => null, listByCompetition: () => [] };
}

function snapshot(): EstComplaintSignalSnapshot {
  return {
    signalId,
    laneId: '66666666-6666-4666-8666-666666666666',
    firingPointNumber: 7,
    status: 'ACTIVE',
    issue: 'SHOT_VALUE',
    context: {
      rules: { round: 'QUALIFICATION', identity: identifyRulePack(ISSF_2026_RFPM), procedures: [] },
      competitionId,
      sessionId: '77777777-7777-4777-8777-777777777777',
      participantId: 'athlete-a',
      participantName: 'Athlete A',
      startNumber: '101',
      phase: 'MATCH',
      stageIndex: 1,
      seriesIndex: 2,
      seriesShotLimit: 5,
      recordedShots: 3,
      timedTargetProgramId: 'RFPM_PROGRAM',
      exposureIndex: 2,
      lastShot: {
        shotId: '55555555-5555-4555-8555-555555555555',
        shotNumberInSeries: 3,
        firedAt: '2026-09-04T00:58:59.000Z',
        receivedAt: '2026-09-04T00:59:00.000Z',
      },
    },
    message: 'Displayed value appears incorrect.',
    signalledAt: new Date('2026-09-04T01:00:00.000Z'),
  };
}
