import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { identifyRulePack, ISSF_2026_P25, recommendQualificationTimedTargetInterruption } from '@sasakiuri/saika-rules';

import { migration020RangeInterruptions } from '@/main/infrastructure/database/migrations/020_range_interruptions';
import { migration021TargetRecoveryAssessments } from '@/main/infrastructure/database/migrations/021_target_recovery_assessments';
import { migration053QualificationTimedTargetInterruptions } from '@/main/infrastructure/database/migrations/053_qualification_timed_target_interruptions';
import { migration054QualificationTimedTargetRecoveryDecisions } from '@/main/infrastructure/database/migrations/054_qualification_timed_target_recovery_decisions';
import { RangeInterruptionCase } from '@/main/modules/range-interruptions/domain/RangeInterruptionCase';
import { QualificationTimedTargetRecoveryDecision } from '@/main/modules/range-interruptions/domain/QualificationTimedTargetRecoveryDecision';
import { RangeInterruptionEntry } from '@/main/modules/range-interruptions/domain/RangeInterruptionEntry';
import { RangeInterruptionScopeLink } from '@/main/modules/range-interruptions/domain/RangeInterruptionScopeLink';
import { TargetRecoveryAssessment } from '@/main/modules/range-interruptions/domain/TargetRecoveryAssessment';
import { SqliteRangeInterruptionRepository } from '@/main/modules/range-interruptions/infra/SqliteRangeInterruptionRepository';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_ID = '33333333-3333-4333-8333-333333333333';

describe('SqliteRangeInterruptionRepository', () => {
  let database: Database.Database;
  let repository: SqliteRangeInterruptionRepository;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration020RangeInterruptions.up(database);
    migration021TargetRecoveryAssessments.up(database);
    migration053QualificationTimedTargetInterruptions.up(database);
    migration054QualificationTimedTargetRecoveryDecisions.up(database);
    repository = new SqliteRangeInterruptionRepository(database);
  });

  afterEach(() => database.close());

  it('persists structured entries in append order and derives active data holds', () => {
    const interruption = createCase();
    const scope = RangeInterruptionScopeLink.create({
      caseId: interruption.id,
      scopeType: 'COMPETITION',
      scopeId: COMPETITION_ID,
      linkedBy: 'Range Officer A',
    });
    const ended = RangeInterruptionEntry.create({
      caseId: interruption.id,
      type: 'ENDED',
      occurredAt: new Date('2026-08-31T01:04:00.000Z'),
      statement: 'Service restored',
      officialName: 'Range Officer A',
      lostTimeSeconds: 240,
      ruleReference: 'ISSF 6.11.3',
      recordedAt: new Date('2026-08-31T01:05:00.000Z'),
    });
    const closed = RangeInterruptionEntry.create({
      caseId: interruption.id,
      type: 'CLOSED',
      // A corrected operational timestamp may predate an earlier entry. The
      // workflow must still be derived from immutable append order.
      occurredAt: new Date('2026-08-31T01:03:59.000Z'),
      statement: 'Record completed',
      officialName: 'Range Officer A',
      recordedAt: new Date('2026-08-31T01:06:00.000Z'),
    });

    repository.appendCase(interruption, [scope]);
    repository.appendEntry(ended);
    expect(repository.findActiveDataHolds({ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }, LANE_ID)).toEqual([
      interruption,
    ]);
    repository.appendEntry(closed);

    expect(repository.findCaseById(interruption.id)).toEqual(interruption);
    expect(repository.findCasesByScope({ scopeType: 'COMPETITION', scopeId: COMPETITION_ID })).toEqual([interruption]);
    expect(repository.findEntriesByCaseIds([interruption.id]).get(interruption.id)).toEqual([ended, closed]);
    expect(repository.findActiveDataHolds({ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }, LANE_ID)).toEqual([]);
  });

  it('rejects mutation and deletion at the database boundary', () => {
    const interruption = createCase();
    const scope = RangeInterruptionScopeLink.create({
      caseId: interruption.id,
      scopeType: 'COMPETITION',
      scopeId: COMPETITION_ID,
      linkedBy: 'Range Officer A',
    });
    repository.appendCase(interruption, [scope]);

    expect(() =>
      database.prepare('UPDATE range_interruption_cases SET summary = ? WHERE id = ?').run('Changed', interruption.id),
    ).toThrow('append-only');
    expect(() => database.prepare('DELETE FROM range_interruption_scope_links WHERE id = ?').run(scope.id)).toThrow(
      'append-only',
    );
  });

  it('persists target recovery assessments independently and append-only', () => {
    const interruption = createCase();
    const scope = RangeInterruptionScopeLink.create({
      caseId: interruption.id,
      scopeType: 'COMPETITION',
      scopeId: COMPETITION_ID,
      linkedBy: 'Range Officer A',
    });
    const assessment = TargetRecoveryAssessment.create({
      caseId: interruption.id,
      movedToReserveFiringPoint: true,
      reserveFiringPointNumber: 14,
      statement: 'Moved after repair exceeded five minutes',
      officialName: 'Range Officer A',
    });
    repository.appendCase(interruption, [scope]);
    repository.appendTargetRecoveryAssessment(assessment);

    expect(repository.findTargetRecoveryAssessmentsByCaseIds([interruption.id]).get(interruption.id)).toEqual([
      assessment,
    ]);
    expect(() => database.prepare('DELETE FROM target_recovery_assessments WHERE id = ?').run(assessment.id)).toThrow(
      'append-only',
    );
  });

  it('round-trips the immutable 25m Qualification Rule Pack and Lane snapshot', () => {
    const recovery = ISSF_2026_P25.capabilities.timedTarget?.recovery;
    if (recovery?.procedure !== 'QUALIFICATION') throw new Error('Qualification recovery is unavailable');
    const identity = identifyRulePack(ISSF_2026_P25);
    const interruption = RangeInterruptionCase.create({
      cause: 'ATHLETE_NON_FAULT',
      phase: 'MATCH',
      startedAt: new Date('2026-08-31T01:00:00.000Z'),
      remainingSecondsAtStart: 0,
      laneId: LANE_ID,
      summary: '25m timed-target interruption',
      details: 'Two shots were recorded before the technical interruption.',
      openedBy: 'Range Officer A',
      qualificationTimedTargetContext: {
        competitionTypeId: 'P25',
        rulePack: {
          id: identity.id,
          schemaVersion: identity.schemaVersion,
          fingerprintSha256: identity.fingerprint.value,
        },
        stageId: 'PRECISION_STAGE',
        stageIndex: 1,
        seriesIndex: 0,
        timedTargetProgramId: 'P25_MATCH_PRECISION_240',
        seriesShotLimit: 5,
        recordedShots: 2,
        seriesComplete: false,
        laneSnapshotCapturedAt: '2026-08-31T01:00:01.000Z',
        recoveryCapability: recovery,
      },
    });
    const scope = RangeInterruptionScopeLink.create({
      caseId: interruption.id,
      scopeType: 'COMPETITION',
      scopeId: COMPETITION_ID,
      linkedBy: 'Range Officer A',
    });

    repository.appendCase(interruption, [scope]);

    const recommendation = recommendQualificationTimedTargetInterruption(recovery, {
      stageId: 'PRECISION_STAGE',
      interruptionSeconds: 901,
      seriesShotLimit: 5,
      recordedShots: 2,
      seriesComplete: false,
    });
    const decision = QualificationTimedTargetRecoveryDecision.create({
      caseId: interruption.id,
      recommendation,
      authorizedRecovery: {
        extraSightingSeriesShots: recommendation.extraSighting.shots,
        seriesRecovery: recommendation.seriesRecovery,
      },
      statement: 'The Jury authorizes the recommended recovery.',
      officialName: 'Jury Member A',
      incidentReportReference: 'RIR-25M-001',
      ruleReference: recommendation.ruleReferences.join('; '),
    });
    repository.appendQualificationTimedTargetRecoveryDecision(decision);

    expect(repository.findCaseById(interruption.id)).toEqual(interruption);
    expect(
      repository.findQualificationTimedTargetRecoveryDecisionsByCaseIds([interruption.id]).get(interruption.id),
    ).toEqual([decision]);
    expect(() =>
      database
        .prepare('UPDATE range_interruption_cases SET qualification_timed_target_context_json = NULL WHERE id = ?')
        .run(interruption.id),
    ).toThrow('append-only');
    expect(() =>
      database.prepare('DELETE FROM qualification_timed_target_recovery_decisions WHERE id = ?').run(decision.id),
    ).toThrow('append-only');
  });
});

function createCase(): RangeInterruptionCase {
  return RangeInterruptionCase.create({
    cause: 'ATHLETE_NON_FAULT',
    phase: 'MATCH',
    startedAt: new Date('2026-08-31T01:00:00.000Z'),
    remainingSecondsAtStart: 600,
    laneId: LANE_ID,
    firingPointNumber: 12,
    athleteName: 'Alex Athlete',
    summary: 'Target service interruption',
    details: 'The athlete could not continue through no fault of their own.',
    openedBy: 'Range Officer A',
  });
}
