import { describe, expect, it, vi } from 'vitest';

import { TargetExaminationService } from '@/main/modules/target-examinations/application/TargetExaminationService';
import { EvidenceHoldCompetitionDataGuard } from '@/main/modules/target-examinations/application/EvidenceHoldCompetitionDataGuard';
import type {
  ITargetExaminationRepository,
  TargetExaminationScope,
} from '@/main/modules/target-examinations/domain/ITargetExaminationRepository';
import type { TargetExaminationCase } from '@/main/modules/target-examinations/domain/TargetExaminationCase';
import { getTargetExaminationState } from '@/main/modules/target-examinations/domain/TargetExaminationEntry';
import type { TargetExaminationEntry } from '@/main/modules/target-examinations/domain/TargetExaminationEntry';
import type { TargetExaminationEvidence } from '@/main/modules/target-examinations/domain/TargetExaminationEvidence';
import type { TargetExaminationScopeLink } from '@/main/modules/target-examinations/domain/TargetExaminationScopeLink';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const LANE_ID = '33333333-3333-4333-8333-333333333333';

function harness() {
  const cases: TargetExaminationCase[] = [];
  const scopes: TargetExaminationScopeLink[] = [];
  const evidence: TargetExaminationEvidence[] = [];
  const entries: TargetExaminationEntry[] = [];
  const group = <T extends { caseId: string }>(caseIds: readonly string[], values: readonly T[]) => {
    const result = new Map<string, T[]>();
    for (const caseId of caseIds)
      result.set(
        caseId,
        values.filter((value) => value.caseId === caseId),
      );
    return result;
  };
  const repository: ITargetExaminationRepository = {
    appendCase: vi.fn((examination, initialScopes) => {
      cases.push(examination);
      scopes.push(...initialScopes);
    }),
    findCaseById: vi.fn((id) => cases.find((examination) => examination.id === id) ?? null),
    findAllCases: vi.fn(() => [...cases]),
    findCasesByScope: vi.fn((scope: TargetExaminationScope) => {
      const ids = new Set(
        scopes
          .filter((link) => link.scopeType === scope.scopeType && link.scopeId === scope.scopeId)
          .map((link) => link.caseId),
      );
      return cases.filter((examination) => ids.has(examination.id));
    }),
    appendScope: vi.fn((scope) => scopes.push(scope)),
    findScopesByCaseIds: vi.fn((ids) => group(ids, scopes)),
    appendEvidence: vi.fn((item) => evidence.push(item)),
    findEvidenceByCaseIds: vi.fn((ids) => group(ids, evidence)),
    appendEntry: vi.fn((entry) => entries.push(entry)),
    findEntriesByCaseIds: vi.fn((ids) => group(ids, entries)),
    findActiveEvidenceHolds: vi.fn((scope, laneId) => {
      const scopedCases = repository.findCasesByScope(scope);
      return scopedCases.filter((examination) => {
        if (laneId !== undefined && examination.laneId !== null && examination.laneId !== laneId) return false;
        return getTargetExaminationState(entries.filter((entry) => entry.caseId === examination.id)).evidenceHoldActive;
      });
    }),
  };
  return {
    service: new TargetExaminationService(repository),
    guard: new EvidenceHoldCompetitionDataGuard(repository),
    cases,
    scopes,
    evidence,
    entries,
  };
}

async function openCase(service: TargetExaminationService, laneId: string | null = LANE_ID) {
  return service.create({
    scopes: [{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }],
    issueKind: 'NO_SHOT_INDICATION',
    occurredAt: '2026-08-31T01:00:00.000Z',
    ...(laneId ? { laneId } : {}),
    firingPointNumber: 12,
    athleteName: 'Alex Athlete',
    summary: 'Expected shot was not shown',
    details: 'The athlete reported a fired shot while the monitor remained unchanged.',
    ruleReferences: 'ISSF 6.10.5, 6.10.8',
    openedBy: 'RTS Officer A',
  });
}

describe('TargetExaminationService', () => {
  it('keeps evidence and decisions append-only while deriving hold and case state', async () => {
    const { service } = harness();
    const opened = await openCase(service);

    expect(opened).toMatchObject({ status: 'OPEN', evidenceHoldActive: true, evidence: [], entries: [] });

    const withEvidence = await service.addEvidence({
      caseId: opened.id,
      type: 'EST_LOG_PRINT',
      description: 'Independent backup-memory LOG printout',
      reference: 'sealed-envelope-12',
      contentHashSha256: 'A'.repeat(64),
      collectedBy: 'RTS Officer A',
      collectedAt: '2026-08-31T01:02:00.000Z',
    });
    expect(withEvidence.evidence[0]).toMatchObject({
      type: 'EST_LOG_PRINT',
      contentHashSha256: 'a'.repeat(64),
    });

    const decided = await service.appendEntry({
      caseId: opened.id,
      type: 'DECISION',
      statement: 'EST record confirms the shot; scoring correction must be recorded separately.',
      ruleReference: 'ISSF 6.10.8.4',
      officialName: 'RTS Jury A',
    });
    expect(decided).toMatchObject({ status: 'OPEN', evidenceHoldActive: true });

    await expect(
      service.appendEntry({
        caseId: opened.id,
        type: 'CLOSED',
        statement: 'Review complete',
        officialName: 'RTS Jury A',
      }),
    ).rejects.toThrow('Release the evidence hold');

    const released = await service.appendEntry({
      caseId: opened.id,
      type: 'HOLD_RELEASED',
      statement: 'RTS Jury authorized CLEAR LOG after all examination items were secured.',
      officialName: 'RTS Jury A',
    });
    expect(released.entries.at(-1)).toMatchObject({ type: 'HOLD_RELEASED', ruleReference: 'ISSF 6.10.8.3' });
    expect(released.evidenceHoldActive).toBe(false);

    const closed = await service.appendEntry({
      caseId: opened.id,
      type: 'CLOSED',
      statement: 'Examination completed',
      officialName: 'RTS Jury A',
    });
    expect(closed.status).toBe('CLOSED');
    await expect(
      service.addEvidence({
        caseId: opened.id,
        type: 'OTHER',
        description: 'Late item',
        collectedBy: 'RTS Officer A',
        collectedAt: '2026-08-31T01:10:00.000Z',
      }),
    ).rejects.toThrow('reopened');

    const reopened = await service.appendEntry({
      caseId: opened.id,
      type: 'REOPENED',
      statement: 'New material requires review',
      officialName: 'RTS Jury A',
    });
    expect(reopened).toMatchObject({ status: 'OPEN', evidenceHoldActive: true });
  });

  it('supports append-only event linking without depending on the championship module', async () => {
    const { service } = harness();
    const opened = await openCase(service);

    const linked = await service.linkScope({
      caseId: opened.id,
      scope: { scopeType: 'EVENT', scopeId: EVENT_ID },
      linkedBy: 'Competition Jury A',
      note: 'Linked after the championship result context was selected',
    });

    expect(linked.scopes.map((scope) => scope.scopeType)).toEqual(['COMPETITION', 'EVENT']);
    expect(await service.listAll()).toHaveLength(1);
    expect(await service.listByScope({ scopeType: 'EVENT', scopeId: EVENT_ID })).toHaveLength(1);
    await expect(
      service.linkScope({
        caseId: opened.id,
        scope: { scopeType: 'EVENT', scopeId: EVENT_ID },
        linkedBy: 'Competition Jury A',
      }),
    ).rejects.toThrow('already linked');
  });

  it('blocks only data operations covered by an active Lane or competition hold', async () => {
    const { service, guard } = harness();
    const laneCase = await openCase(service);

    expect(() =>
      guard.assertAllowed({ operation: 'RESET_LANE_SESSION', competitionId: COMPETITION_ID, laneId: LANE_ID }),
    ).toThrow(`target examination ${laneCase.id.slice(0, 8)}`);
    expect(() =>
      guard.assertAllowed({
        operation: 'RESET_LANE_SESSION',
        competitionId: COMPETITION_ID,
        laneId: '44444444-4444-4444-8444-444444444444',
      }),
    ).not.toThrow();
    expect(() => guard.assertAllowed({ operation: 'CLEAR_COMPETITION_DATA', competitionId: COMPETITION_ID })).toThrow(
      'Evidence hold is active',
    );

    await service.appendEntry({
      caseId: laneCase.id,
      type: 'HOLD_RELEASED',
      statement: 'Evidence secured and data release authorized',
      officialName: 'RTS Jury A',
    });
    expect(() =>
      guard.assertAllowed({ operation: 'RESET_LANE_SESSION', competitionId: COMPETITION_ID, laneId: LANE_ID }),
    ).not.toThrow();

    await openCase(service, null);
    expect(() =>
      guard.assertAllowed({
        operation: 'LEAVE_LANE',
        competitionId: COMPETITION_ID,
        laneId: '44444444-4444-4444-8444-444444444444',
      }),
    ).toThrow('Evidence hold is active');
  });
});
