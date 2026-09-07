import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { migration071FinalRecoveryFiring } from '@/main/infrastructure/database/migrations/071_final_recovery_firing';
import { FinalRecoveryCase, FinalRecoveryEntry, type IFinalRecoveryRepository } from '@/main/modules/final-recoveries';
import { AuthorizedFinalFiringSource } from '@/main/modules/final-recovery-firing/AuthorizedFinalFiringSource';
import {
  FinalRecoveryFiringService,
  type FinalFiringIntent,
  type IFinalFiringAuthorizationSource,
} from '@/main/modules/final-recovery-firing/FinalRecoveryFiringService';
import { SqliteFinalFiringRepository } from '@/main/modules/final-recovery-firing/SqliteFinalFiringRepository';
import type {
  MalfunctionFiringRequestPayload,
  MalfunctionFiringEvidencePayload,
} from '@/shared/mqtt/MalfunctionFiring';

const databases: Database.Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
const intent: FinalFiringIntent = {
  readinessConfirmed: true,
  id: crypto.randomUUID(),
  caseId: crypto.randomUUID(),
  authorizationId: crypto.randomUUID(),
  laneId: crypto.randomUUID(),
  loadAt: '2026-09-07T00:00:10Z',
};
const request: MalfunctionFiringRequestPayload = {
  workflow: 'FINAL_RECOVERY',
  finalIncident: 'MALFUNCTION',
  runId: intent.id,
  caseId: intent.caseId,
  authorizationId: intent.authorizationId,
  competitionId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
  participantId: 'athlete',
  rulePackFingerprint: 'a'.repeat(64),
  stageIndex: 1,
  seriesIndex: 0,
  recordedShots: 2,
  remedy: 'COMPLETE_REMAINING_SHOTS',
  shotsToFire: 3,
  officialName: 'Jury',
  decidedAt: '2026-09-07T00:00:00Z',
  loadAt: intent.loadAt,
};
function evidence(status: 'RUNNING' | 'COMPLETED' | 'CANCELLED' = 'RUNNING'): MalfunctionFiringEvidencePayload {
  return {
    request,
    status,
    terminalReason: null,
    captureIssues: [],
    startedAt: request.decidedAt,
    targetProfileId: 'pistol-25m',
    shots: [],
  };
}
describe('Final recovery firing', () => {
  it('persists exact instructions before transmission, survives lost ACK, and reads/cancels after a ruling is voided', async () => {
    const db = new Database(':memory:');
    databases.push(db);
    migration071FinalRecoveryFiring.up(db);
    const repository = new SqliteFinalFiringRepository(db);
    const source: IFinalFiringAuthorizationSource = { assertAuthorized: vi.fn(), prepare: vi.fn(async () => request) };
    const transport = vi.fn(async () => evidence());
    transport.mockRejectedValueOnce(new Error('ACK lost'));
    const service = new FinalRecoveryFiringService(repository, source, transport);
    await expect(service.start(intent)).rejects.toThrow('ACK lost');
    expect(repository.find(intent.id)?.request).toEqual(request);
    await expect(service.start({ ...intent, loadAt: '2026-09-07T00:01:00Z' })).rejects.toThrow(/unchanged/);
    await service.start(intent);
    expect(source.prepare).toHaveBeenCalledOnce();
    await expect(service.start({ ...intent, id: crypto.randomUUID() })).rejects.toThrow(/already/);
    vi.mocked(source.assertAuthorized).mockImplementation(() => {
      throw new Error('Voided');
    });
    await expect(service.start(intent)).rejects.toThrow('Voided');
    await service.read(intent.id);
    transport.mockResolvedValueOnce(evidence('CANCELLED'));
    expect((await service.cancel(intent.id, 'Jury voided the remedy')).evidence?.status).toBe('CANCELLED');
    transport.mockResolvedValueOnce({ ...evidence(), request: { ...request, participantId: 'other' } });
    await expect(service.read(intent.id)).rejects.toThrow(/different firing/);
    expect(() => db.exec('DELETE FROM final_recovery_firing_evidence')).toThrow(/append-only/);
  });

  it.each([2, 5])(
    'allows one P25 EST replacement with %i recorded shots and rejects legacy multi-shot authorization',
    async (recordedShots) => {
      const value = FinalRecoveryCase.create({
        id: intent.caseId,
        competitionId: request.competitionId,
        procedureProfile: 'PISTOL_25M_WOMEN',
        incidentType: 'EST_FAILURE',
        phase: 'MATCH_SERIES',
        affectedLaneIds: [intent.laneId],
        summary: 'Missing shot',
        openedBy: 'Jury',
      });
      const ruling = FinalRecoveryEntry.create({
        caseId: value.id,
        type: 'JURY_RULING',
        classification: 'TARGET_MALFUNCTION',
        statement: 'Confirmed',
        officialName: 'Jury',
      });
      const authorize = (shotCount: number) =>
        FinalRecoveryEntry.create({
          id: intent.authorizationId,
          caseId: value.id,
          type: 'REMEDY_AUTHORIZED',
          remedy: 'COMPLETE_SERIES',
          shotCount,
          statement: 'Replace missing shot',
          officialName: 'Jury',
        });
      let entries = [ruling, authorize(1)];
      const repository = {
        findCaseById: () => value,
        findEntries: () => new Map([[value.id, entries]]),
      } as unknown as IFinalRecoveryRepository;
      const source = new AuthorizedFinalFiringSource(repository, async () => ({
        sessionId: request.sessionId,
        participantId: 'athlete',
        rulePackFingerprint: request.rulePackFingerprint,
        stageIndex: 1,
        seriesIndex: 0,
        recordedShots,
        seriesShotLimit: 5,
      }));
      expect((await source.prepare(intent)).shotsToFire).toBe(1);
      entries = [ruling, authorize(3)];
      expect(() => source.assertAuthorized(intent)).toThrow('do not permit');
    },
  );

  it('requires the latest matching Jury authorization, exact remaining count and stable finalist', async () => {
    const value = FinalRecoveryCase.create({
      id: intent.caseId,
      competitionId: request.competitionId,
      procedureProfile: 'PISTOL_25M_WOMEN',
      incidentType: 'MALFUNCTION',
      phase: 'MATCH_SERIES',
      affectedLaneIds: [intent.laneId],
      summary: 'Pistol malfunction',
      openedBy: 'Jury',
      allowanceSubject: { kind: 'ATHLETE', key: 'athlete', description: 'Finalist' },
    });
    const entries = [
      FinalRecoveryEntry.create({
        caseId: value.id,
        type: 'JURY_RULING',
        classification: 'ALLOWABLE_MALFUNCTION',
        statement: 'Inspected',
        officialName: 'Jury',
      }),
      FinalRecoveryEntry.create({
        id: intent.authorizationId,
        caseId: value.id,
        type: 'REMEDY_AUTHORIZED',
        remedy: 'COMPLETE_SERIES',
        shotCount: 3,
        statement: 'Complete three shots',
        officialName: 'Jury',
      }),
    ];
    const repository = {
      findCaseById: () => value,
      findEntries: () => new Map([[value.id, entries]]),
    } as unknown as IFinalRecoveryRepository;
    const context = vi.fn(async () => ({
      sessionId: request.sessionId,
      participantId: 'athlete',
      rulePackFingerprint: request.rulePackFingerprint,
      stageIndex: 1,
      seriesIndex: 0,
      recordedShots: 2,
      seriesShotLimit: 5,
    }));
    const source = new AuthorizedFinalFiringSource(repository, context);
    expect((await source.prepare(intent)).shotsToFire).toBe(3);
    context.mockResolvedValueOnce({ ...(await context()), recordedShots: 3 });
    await expect(source.prepare(intent)).rejects.toThrow(/exact recovery shot count/);
    context.mockResolvedValueOnce({ ...(await context()), participantId: 'other' });
    await expect(source.prepare(intent)).rejects.toThrow(/differs from the athlete/);
    entries.push(
      FinalRecoveryEntry.create({ caseId: value.id, type: 'VOID', statement: 'Wrong case', officialName: 'Jury' }),
    );
    expect(() => source.assertAuthorized(intent)).toThrow(/current Jury/);
  });
});
