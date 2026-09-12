import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migration013ResultVerification } from '@/main/infrastructure/database/migrations/013_result_verification';
import { migration077ResultApprovalSigningIdentity } from '@/main/infrastructure/database/migrations/077_result_approval_signing_identity';
import { migration081PublicationReviewPolicies } from '@/main/infrastructure/database/migrations/081_publication_review_policies';
import { OfficialSigningPolicy } from '@/main/modules/official-signing';
import {
  PolicyBoundVerificationSource,
  PublicationReviewPolicyService,
  SqlitePublicationReviewPolicyRepository,
} from '@/main/modules/publication-review-policies';
import { OptionalResultPublicationBlocker } from '@/main/modules/result-publication';
import {
  ResultVerificationService,
  ResultVerificationSourceRegistry,
  SqliteResultVerificationRepository,
  type ResultVerificationSourceSnapshot,
} from '@/main/modules/result-verification';
import type { ResultPublicationReviewSettingsDto } from '@/shared/ipc/contracts';

const eventId = '11111111-1111-4111-8111-111111111111';
const otherEventId = '22222222-2222-4222-8222-222222222222';
const resultId = '33333333-3333-4333-8333-333333333333';
const resultScope = 'QUALIFICATION' as const;
const defaults: ResultPublicationReviewSettingsDto = {
  requireObservationReviews: true,
  requireIncidentReports: true,
  requireFinalRecoveriesComplete: true,
  requireProtestCasesComplete: true,
  requireEquipmentChecksComplete: true,
};
const databases: Database.Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
function setup() {
  const db = new Database(':memory:');
  databases.push(db);
  migration081PublicationReviewPolicies.up(db);
  let shared = { ...defaults };
  let editable = true;
  const repo = new SqlitePublicationReviewPolicyRepository(db);
  const service = new PublicationReviewPolicyService(
    repo,
    () => shared,
    () => editable,
  );
  const request = () => ({
    eventId,
    resultScope,
    mode: 'PINNED' as const,
    settings: { ...defaults },
    expectedRevision: service.get(eventId, resultScope).revision,
    officialName: 'RTS official',
    reason: 'Local event requirements',
  });
  return {
    db,
    repo,
    service,
    request,
    setDefaults: (value: ResultPublicationReviewSettingsDto) => {
      shared = value;
    },
    close: () => {
      editable = false;
    },
  };
}

describe('Event publication review policies', () => {
  it('isolates pinned requirements by event and round while shared defaults remain live', async () => {
    const h = setup();
    expect(h.service.approvalRevision(eventId, resultScope)).toBeNull();
    h.service.save(h.request());
    const pinnedApproval = h.service.approvalRevision(eventId, resultScope);
    const staleSwitch = { ...h.request(), mode: 'INHERIT' as const };
    h.setDefaults({ ...defaults, requireIncidentReports: false });
    expect(h.service.approvalRevision(eventId, resultScope)).toBe(pinnedApproval);
    expect(() => h.service.save(staleSwitch)).toThrow('defaults changed');
    expect(h.service.get(eventId, resultScope).effectiveSettings.requireIncidentReports).toBe(true);
    expect(h.service.get(eventId, 'FINAL').effectiveSettings.requireIncidentReports).toBe(false);
    expect(h.service.get(otherEventId, resultScope).effectiveSettings.requireIncidentReports).toBe(false);
    const blocker = new OptionalResultPublicationBlocker(
      { getIssues: () => ['Incident report missing'] },
      (id, scope) => h.service.get(id, scope).effectiveSettings.requireIncidentReports,
    );
    expect(await blocker.getIssues(eventId, resultScope)).toEqual(['Incident report missing']);
    expect(await blocker.getIssues(eventId, 'FINAL')).toEqual([]);
    expect(await blocker.getIssues(otherEventId, resultScope)).toEqual([]);

    h.service.save({ ...h.request(), mode: 'INHERIT' });
    const inheritedApproval = h.service.approvalRevision(eventId, resultScope);
    h.setDefaults(defaults);
    expect(h.service.get(eventId, resultScope).effectiveSettings.requireIncidentReports).toBe(true);
    // Shared settings keep the legacy live-readiness semantics, including after official publication.
    expect(h.service.approvalRevision(eventId, resultScope)).toBe(inheritedApproval);
    expect(h.service.get(eventId, resultScope).history[1]?.settings.requireIncidentReports).toBe(false);
  });

  it('rejects stale forms, default changes while inheriting, empty reasons, and changes after publication', () => {
    const h = setup();
    const stale = h.request();
    h.setDefaults({ ...defaults, requireIncidentReports: false });
    expect(() => h.service.save(stale)).toThrow('defaults changed');
    expect(() => h.service.save({ ...h.request(), reason: ' ' })).toThrow();
    const request = h.request();
    h.service.save(request);
    expect(() => h.service.save(request)).toThrow('changed');
    expect(() => h.service.save(h.request())).toThrow('no changes');
    h.close();
    expect(h.service.get(eventId, resultScope).editable).toBe(false);
    expect(() => h.service.save({ ...h.request(), mode: 'INHERIT' })).toThrow('official publication');
    expect(h.repo.find(eventId, resultScope)).toHaveLength(1);
  });

  it('retains append-only history across repository reconstruction and rejects concurrent inserts', () => {
    const h = setup();
    const first = h.service.save(h.request()).history[0]!;
    expect(new SqlitePublicationReviewPolicyRepository(h.db).find(eventId, resultScope)).toEqual([first]);
    expect(() => h.repo.append({ ...first, id: otherEventId }, null)).toThrow('changed');
    expect(() => h.db.prepare('UPDATE publication_review_policies SET payload_json = ?').run('{}')).toThrow(
      'append-only',
    );
    expect(() => h.db.exec('DELETE FROM publication_review_policies')).toThrow('append-only');
    expect(h.repo.find(eventId, resultScope)).toEqual([first]);
  });

  it('requires the authenticated RTS role and records its identity instead of the supplied name', () => {
    const h = setup();
    let roles = ['JURY_MEMBER'];
    const service = new PublicationReviewPolicyService(
      h.repo,
      () => defaults,
      () => true,
      new OfficialSigningPolicy({
        currentActor: () => ({ id: otherEventId, name: 'Signed-in RTS', roles }),
        authenticationRequired: () => true,
        findActiveAccount: () => null,
      }),
    );
    expect(() => service.save(h.request())).toThrow('required official role');
    roles = ['RTS_JURY'];
    expect(service.save(h.request()).history[0]?.signingEvidence).toMatchObject({
      method: 'AUTHENTICATED',
      actorId: otherEventId,
      recordedBy: 'Signed-in RTS',
    });
  });

  it.each(['QUALIFICATION', 'FINAL'] as const)(
    'preserves legacy %s approval, then invalidates list approval without discarding individual checks',
    async (scope) => {
      const h = setup();
      migration013ResultVerification.up(h.db);
      migration077ResultApprovalSigningIdentity.up(h.db);
      const snapshot: ResultVerificationSourceSnapshot = {
        eventId,
        resultScope: scope,
        configuredIndividualChecks: 1,
        configuredTeamChecks: 0,
        teamVerificationSupported: true,
        requiredTeamChecks: 0,
        checkedTeamResults: 0,
        teamVerificationRunId: null,
        teamSnapshotRevision: null,
        sourceRevision: null,
        issues: [],
        results: [
          {
            resultId,
            participantId: otherEventId,
            revision: 'a'.repeat(64),
            rank: 1,
            playerName: 'Athlete',
            affiliation: 'Team',
            relayNumber: 1,
            totalScore: 100,
            entryStatus: null,
            classificationCode: null,
            decisionCount: 0,
            projectionIssues: [],
            status: 'confirmed',
            evidenceSummary: {
              expectedShots: 10,
              linkedShots: 10,
              independentDecimalShots: 10,
              innerTenClassifiedShots: 10,
              scoreConflicts: 0,
            },
          },
        ],
      };
      const source = { resultScope: scope, load: async () => snapshot };
      const repo = new SqliteResultVerificationRepository(h.db);
      const legacy = new ResultVerificationService(repo, new ResultVerificationSourceRegistry([source]));
      const check = await legacy.addCheck({
        eventId,
        resultScope: scope,
        resultId,
        resultRevision: 'a'.repeat(64),
        evidenceSource: 'TARGET_PRINTOUT',
        evidenceReference: 'Printout A',
        comparisonStatus: 'MATCHED',
        manualInterventionsReviewed: true,
        officialName: 'RTS official',
      });
      const approve = {
        eventId,
        resultScope: scope,
        snapshotRevision: (await legacy.getStatus(eventId, scope)).snapshotRevision,
        statement: 'Results verified',
        officialName: 'RTS official',
      };
      const original = await legacy.approve(approve);
      const wrapped = new PolicyBoundVerificationSource(source, (id, round) => h.service.approvalRevision(id, round));
      expect(await wrapped.load(eventId)).toBe(snapshot);
      const service = new ResultVerificationService(repo, new ResultVerificationSourceRegistry([wrapped]));
      expect((await service.getStatus(eventId, scope)).currentApproval?.id).toBe(original.id);
      h.service.save({ ...h.request(), resultScope: scope, expectedRevision: h.service.get(eventId, scope).revision });
      const changed = await service.getStatus(eventId, scope);
      expect(changed.currentApproval).toBeNull();
      expect(changed.readyForApproval).toBe(true);
      expect(changed.results[0]?.currentCheck).toMatchObject({ id: check.id, qualifies: true });
      await expect(service.approve(approve)).rejects.toThrow('changed');
      const fresh = await service.approve({ ...approve, snapshotRevision: changed.snapshotRevision });
      expect(fresh.checkIds).toEqual([check.id]);
      expect((await service.getStatus(eventId, scope)).currentApproval?.id).toBe(fresh.id);
      h.service.save({
        ...h.request(),
        resultScope: scope,
        expectedRevision: h.service.get(eventId, scope).revision,
        settings: { ...defaults, requireIncidentReports: false },
      });
      expect((await service.getStatus(eventId, scope)).currentApproval).toBeNull();
      expect(repo.findChecksByEvent(eventId)).toHaveLength(1);
    },
  );
});
