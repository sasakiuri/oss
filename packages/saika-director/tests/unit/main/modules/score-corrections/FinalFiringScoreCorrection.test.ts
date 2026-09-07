import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { migration069ScoreCorrections } from '@/main/infrastructure/database/migrations/069_score_corrections';
import { FinalRecoveryCase, FinalRecoveryEntry, type IFinalRecoveryRepository } from '@/main/modules/final-recoveries';
import type { FinalFiringRecord, IFinalFiringRepository } from '@/main/modules/final-recovery-firing';
import type { ScoreCorrectionBasis } from '@/main/modules/results';
import {
  CompositeScoreCorrectionCaseSource,
  FinalFiringScoreCorrectionCaseSource,
  ScoreCorrectionService,
  SqliteScoreCorrectionRepository,
} from '@/main/modules/score-corrections';
import type { ScoreCorrectionRequest } from '@/main/modules/score-corrections/domain/ScoreCorrection';

describe('Final firing evidence to Jury score correction', () => {
  it.each(['MALFUNCTION', 'EST_FAILURE'] as const)(
    'settles %s using reviewed missing slots and invalidates changed evidence',
    (incidentType) => {
      const shotCount = incidentType === 'EST_FAILURE' ? 1 : 3;
      const firstSlot = incidentType === 'EST_FAILURE' ? 1 : 2;
      const expectedScores = incidentType === 'EST_FAILURE' ? [10, 10, 0, 0, 0] : [10, 0, 10, 10, 10];
      const db = new Database(':memory:');
      try {
        migration069ScoreCorrections.up(db);
        const value = FinalRecoveryCase.create({
          competitionId: 'competition',
          eventId: 'event',
          procedureProfile: 'PISTOL_25M_WOMEN',
          incidentType,
          phase: 'MATCH_SERIES',
          affectedLaneIds: ['lane'],
          summary: 'Stopped after two shots',
          openedBy: 'Jury',
        });
        const ruling = FinalRecoveryEntry.create({
          caseId: value.id,
          type: 'JURY_RULING',
          classification: incidentType === 'EST_FAILURE' ? 'TARGET_MALFUNCTION' : 'ALLOWABLE_MALFUNCTION',
          statement: 'Pistol examined',
          officialName: 'Jury',
        });
        const authorization = FinalRecoveryEntry.create({
          caseId: value.id,
          type: 'REMEDY_AUTHORIZED',
          remedy: 'COMPLETE_SERIES',
          shotCount,
          statement: 'Complete remaining shots',
          officialName: 'Jury',
        });
        const entries = [ruling, authorization];
        const run: FinalFiringRecord = {
          intent: {
            id: 'run',
            caseId: value.id,
            authorizationId: authorization.id,
            laneId: 'lane',
            loadAt: '2026-09-07T00:00:00Z',
            readinessConfirmed: true,
          },
          request: {
            workflow: 'FINAL_RECOVERY',
            finalIncident: incidentType,
            runId: 'run',
            caseId: value.id,
            authorizationId: authorization.id,
            competitionId: 'competition',
            sessionId: 'session',
            participantId: 'athlete',
            rulePackFingerprint: 'a'.repeat(64),
            stageIndex: 1,
            seriesIndex: 0,
            recordedShots: 2,
            remedy: 'COMPLETE_REMAINING_SHOTS',
            shotsToFire: shotCount,
            officialName: 'Jury',
            decidedAt: '2026-09-07T00:00:00Z',
            loadAt: '2026-09-07T00:00:00Z',
          },
          evidence: null,
        };
        run.evidence = {
          request: run.request,
          status: 'COMPLETED',
          captureIssues: [],
          startedAt: run.request.loadAt,
          terminalReason: 'Completed',
          targetProfileId: 'pistol',
          shots: Array.from({ length: shotCount }, (_, index) => ({
            shotId: 'recovery-' + index,
            observationId: 'observation-' + index,
            scoreX10: 100,
            deviceScoreX10: 100,
            calculatedScoreX10: 100,
            innerTen: true,
            x: 0,
            y: 0,
            firedAt: run.request.loadAt,
            receivedAt: run.request.loadAt,
            eligible: true,
            reviewReason: null,
          })),
        };
        const basis: ScoreCorrectionBasis = {
          resultScope: 'FINAL',
          resultId: 'result',
          eventId: 'event',
          participantId: 'athlete',
          relayNumber: 1,
          competitionId: null,
          sourceRevision: 'original',
          seriesShotCounts: [5],
          issues: [],
          shots: [10, 0, 0, 0, 0].map((scoreX10) => ({
            scoreX10,
            ranking: { shotId: null, ringScore: scoreX10 / 10, decimalScore: null, innerTen: null, seriesIndex: 0 },
          })),
        };
        const recoveries = {
          findCasesByEvent: (id: string) => (id === 'event' ? [value] : []),
          findEntries: () => new Map([[value.id, entries]]),
        } as unknown as IFinalRecoveryRepository;
        const firings = { list: () => [run] } as unknown as IFinalFiringRepository;
        const cases = new CompositeScoreCorrectionCaseSource([
          new FinalFiringScoreCorrectionCaseSource(recoveries, firings),
        ]);
        const service = new ScoreCorrectionService(
          new SqliteScoreCorrectionRepository(db),
          { resolve: () => ({ basis, scoring: 'HIT_MISS' }) },
          cases,
        );
        const request: ScoreCorrectionRequest = {
          resultScope: 'FINAL',
          resultId: 'result',
          caseId: value.id,
          decisionId: ruling.id,
          officialName: 'Jury',
          statement: 'All recovery hits confirmed',
          changes: run.evidence.shots.map((shot, index) => ({
            operation: 'REPLACE',
            shotIndex: index + firstSlot,
            scoreX10: 10,
            decimalScore: null,
            innerTen: null,
            sourceShotId: shot.shotId,
            evidenceReference: 'run / ' + shot.observationId,
          })),
        };
        expect(cases.list(basis)).toEqual([]);
        entries.push(
          FinalRecoveryEntry.create({
            caseId: value.id,
            type: 'COMPLETED',
            statement: 'All three recovered observations reviewed',
            officialName: 'Jury',
          }),
        );
        expect(cases.list({ ...basis, participantId: 'other' })).toEqual([]);
        expect(cases.list({ ...basis, resultScope: 'QUALIFICATION' })).toEqual([]);
        expect(() => service.preview({ ...request, changes: request.changes.slice(1) })).toThrow(/every authorized/);
        expect(() =>
          service.preview({
            ...request,
            changes: request.changes.map((change) => ({ ...change, shotIndex: change.shotIndex + 5 })),
          }),
        ).toThrow(/original Final slots/);
        expect(() =>
          service.preview({ ...request, changes: request.changes.map((change) => ({ ...change, shotIndex: 0 })) }),
        ).toThrow();
        const preview = service.preview(request);
        expect(preview.shots.map((shot) => shot.scoreX10)).toEqual(expectedScores);
        service.apply({ id: 'correction', request, expectedDigest: preview.digest, confirmed: true });
        expect(service.project(basis).shots.map((shot) => shot.scoreX10)).toEqual(expectedScores);
        expect(basis.shots.map((shot) => shot.scoreX10)).toEqual([10, 0, 0, 0, 0]);
        run.evidence.captureIssues.push('Late observation requires review');
        expect(service.project(basis).issues.length).toBeGreaterThan(0);
        expect(service.project(basis).shots).toEqual(basis.shots);
        run.evidence.captureIssues = [];
        entries.push(
          FinalRecoveryEntry.create({
            caseId: value.id,
            type: 'VOID',
            statement: 'Case superseded',
            officialName: 'Jury',
          }),
        );
        expect(service.project(basis).issues.length).toBeGreaterThan(0);
      } finally {
        db.close();
      }
    },
  );
});
