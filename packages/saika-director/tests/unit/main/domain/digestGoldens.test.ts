// SPDX-License-Identifier: MIT
/**
 * Characterization goldens for every Director main-process SHA-256 digest of a JSON value.
 *
 * These digests are persisted and compared across releases, so each test pins the exact hex value produced
 * today from a fixed, deterministic input. A refactor of the hashing expression must keep every value identical.
 */
import Database from 'better-sqlite3';
import { ISSF_2026_ARMIX_FINAL, ISSF_2026_RFPM, assessQualificationMalfunctionClaim } from '@sasakiuri/saika-rules';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sha256Json } from '@/main/domain/sha256Json';
import { BackupCaptureReadinessService } from '@/main/modules/backup-capture-readiness/application/BackupCaptureReadinessService';
import { EventId, Participant, ParticipantId } from '@/main/modules/championship';
import { SqliteEliminationPlanningSource } from '@/main/modules/elimination-planning';
import { backupRecordsDigest } from '@/main/modules/est-backup-sources';
import {
  EstBackupResultCheckService,
  EstBackupVerificationService,
  compareEstBackup,
  type IEstBackupVerificationRepository,
} from '@/main/modules/est-backup-verification';
import { estComplaintSnapshotHash } from '@/main/modules/est-complaints/domain/EstComplaintSnapshot';
import type { EstComplaintSignalSnapshot } from '@/main/modules/est-complaints/domain/IEstComplaintSignalSource';
import type { IFinalPlacementReviewRepository } from '@/main/modules/final-placement-review/domain/IFinalPlacementReviewRepository';
import { OperationalProfileService } from '@/main/modules/operational-profiles/application/OperationalProfileService';
import {
  PolicyBoundVerificationSource,
  PublicationReviewPolicyService,
} from '@/main/modules/publication-review-policies';
import {
  QualificationMalfunctionCase,
  QualificationMalfunctionEntry,
  type IQualificationMalfunctionRepository,
} from '@/main/modules/qualification-malfunctions';
import { MalfunctionScoreSheetService } from '@/main/modules/qualification-malfunctions/application/MalfunctionScoreSheetService';
import type { MalfunctionScoreEvidence } from '@/main/modules/qualification-malfunctions/domain/MalfunctionScoreSheet';
import {
  FinalResultVerificationSource,
  ResultVerificationService,
  type IResultVerificationRepository,
  type IResultVerificationSource,
  type ResultVerificationSourceSnapshot,
  type VerifiableResult,
} from '@/main/modules/result-verification';
import { FinalResultsReader } from '@/main/modules/results/application/FinalResultsReader';
import { qualificationScoreSourceDigest } from '@/main/modules/results/application/QualificationScoreOverlaySource';
import { QualificationResultsReader } from '@/main/modules/results/application/QualificationResultsReader';
import {
  finalCorrectionBasis,
  qualificationCorrectionBasis,
} from '@/main/modules/results/application/ResultScoreCorrectionSource';
import { FinalResult } from '@/main/modules/results/domain/FinalResult';
import { FinalResultId } from '@/main/modules/results/domain/FinalResultId';
import type { IFinalResultRepository } from '@/main/modules/results/domain/IFinalResultRepository';
import type { IResultRepository } from '@/main/modules/results/domain/IResultRepository';
import { Result } from '@/main/modules/results/domain/Result';
import { ResultId } from '@/main/modules/results/domain/ResultId';
import {
  QualificationTeamRecordCandidateSource,
  SqliteResultsBookSource,
  type IResultsBookResultSnapshotSource,
} from '@/main/modules/results-books';
import type { IScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import { SquaddingService } from '@/main/modules/squadding/application/SquaddingService';
import { SqliteSquaddingRepository } from '@/main/modules/squadding/infra/SqliteSquaddingRepository';
import { SqliteStartListRepository, StartListService } from '@/main/modules/start-lists';
import type { MixedTeamFinalResultRecord } from '@/main/modules/team-results';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { BR60S_FINAL } from '@/shared/competitionTypes/definitions/BR60S_FINAL';
import { IssfStandardStrategy } from '@/shared/competitionTypes/strategies/IssfStandardStrategy';
import type { EstBackupVerificationRunDto, ResultPublicationReviewSettingsDto } from '@/shared/ipc/contracts';

import { championshipSources } from '../../../helpers/championshipSources';
import { migratedDatabase } from '../../../helpers/database';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_A = '33333333-3333-4333-8333-333333333333';
const PARTICIPANT_B = '44444444-4444-4444-8444-444444444444';
const COMPETITION_ID = '55555555-5555-4555-8555-555555555555';
const LANE_ID = '66666666-6666-4666-8666-666666666666';
const RESULT_ID = '77777777-7777-4777-8777-777777777777';
const SECOND_RESULT_ID = '88888888-8888-4888-8888-888888888888';
const RUN_ID = '99999999-9999-4999-8999-999999999999';
const CONFIRMED_AT = new Date('2026-09-01T03:00:00.000Z');

const databases: Database.Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

/** A migrated database with one BR60S event, two athletes and their firing-point assignments. */
function rangeDatabase(): Database.Database {
  const database = migratedDatabase();
  databases.push(database);
  database.pragma('foreign_keys = ON');
  database
    .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
    .run(CHAMPIONSHIP_ID, 'Golden Championship', '2026-09-01', 'Range A');
  database
    .prepare('INSERT INTO events (id, championship_id, name, event_type, round, sort_order) VALUES (?, ?, ?, ?, ?, 0)')
    .run(EVENT_ID, CHAMPIONSHIP_ID, '10m Air Rifle Women', BR60S.id, 'Qualification');
  const participant = database.prepare(
    `INSERT INTO participants (
      id, event_id, player_name, family_name, affiliation, sort_order,
      start_number, issf_id, nation_code, gender, entry_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'F', 'COMPETING')`,
  );
  participant.run(PARTICIPANT_A, EVENT_ID, 'Aiko Sato', 'Sato', 'Japan', 0, '101', 'ISSF-101', 'JPN');
  participant.run(PARTICIPANT_B, EVENT_ID, 'Zoë Müller', 'Müller', 'Germany', 1, '102', 'ISSF-102', 'GER');
  const assignment = database.prepare(
    `INSERT INTO firing_point_assignments (id, event_id, relay_number, firing_point_number, participant_id)
     VALUES (?, ?, ?, ?, ?)`,
  );
  assignment.run('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', EVENT_ID, 1, 1, PARTICIPANT_A);
  assignment.run('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', EVENT_ID, 1, 2, PARTICIPANT_B);
  return database;
}

function qualificationResult(): Result {
  const shots = Array.from({ length: 60 }, (_, index) => (index % 3 === 0 ? 10.2 : 9.8));
  const seriesScores = Array.from({ length: 6 }, (_, series) =>
    Number(
      shots
        .slice(series * 10, series * 10 + 10)
        .reduce((sum, shot) => sum + shot, 0)
        .toFixed(1),
    ),
  );
  return Result.reconstruct(
    ResultId.reconstruct(RESULT_ID),
    EventId.reconstruct(EVENT_ID),
    ParticipantId.reconstruct(PARTICIPANT_A),
    'Aiko Sato',
    'Japan',
    Number(seriesScores.reduce((sum, score) => sum + score, 0).toFixed(1)),
    seriesScores,
    shots,
    1,
    CONFIRMED_AT,
    'confirmed',
    COMPETITION_ID,
    'Sato',
    LANE_ID,
    shots.map((score, index) => ({
      shotId: `shot-${index}`,
      ringScore: Math.floor(score),
      decimalScore: score,
      innerTen: index % 2 === 0,
      seriesIndex: Math.floor(index / 10),
    })),
  );
}

function finalResult(): FinalResult {
  return FinalResult.reconstruct(
    FinalResultId.create(RESULT_ID),
    EventId.reconstruct(EVENT_ID),
    ParticipantId.reconstruct(PARTICIPANT_A),
    'Aiko Sato',
    'Japan',
    3,
    Array.from({ length: 10 }, (_, index) => (index % 2 === 0 ? 10.4 : 9.9)),
    101.5,
    Array.from({ length: 14 }, (_, index) => (index % 2 === 0 ? 10.1 : 10.6)),
    149.1,
    250.6,
    1,
    undefined,
    undefined,
    'Final record',
    'finished',
  );
}

function emptyDecisions(): IScoringDecisionRepository {
  return {
    append: vi.fn(),
    findById: vi.fn(() => null),
    findByTarget: vi.fn(() => []),
    findByEventId: vi.fn(() => []),
  };
}

function eventQueryBus(eventType: string, name: string, round: string): QueryBus {
  return {
    execute: vi.fn(async () => ({ id: EVENT_ID, name, eventType, round, sortOrder: 0 })),
  } as unknown as QueryBus;
}

function emptyVerificationRepository(): IResultVerificationRepository {
  return {
    appendCheck: vi.fn(),
    findChecksByEvent: () => [],
    appendApprovalEntry: vi.fn(),
    findApprovalEntryById: () => null,
    findApprovalEntriesByEvent: () => [],
  };
}

function verifiableResults(): VerifiableResult[] {
  return [RESULT_ID, SECOND_RESULT_ID].map((resultId, index) => ({
    resultId,
    participantId: index === 0 ? PARTICIPANT_A : PARTICIPANT_B,
    playerName: index === 0 ? 'Aiko Sato' : 'Zoë Müller',
    affiliation: index === 0 ? 'Japan' : 'Germany',
    relayNumber: 1,
    rank: index + 1,
    totalScore: 630.4 - index,
    revision: String(index + 1).repeat(64),
    decisionCount: index,
    status: 'confirmed',
    entryStatus: 'COMPETING' as const,
    classificationCode: null,
    projectionIssues: [],
    evidenceSummary: {
      expectedShots: 60,
      linkedShots: 60,
      independentDecimalShots: 60,
      innerTenClassifiedShots: 60,
      scoreConflicts: 0,
    },
  }));
}

function verificationSnapshot(): ResultVerificationSourceSnapshot {
  return {
    eventId: EVENT_ID,
    resultScope: 'QUALIFICATION',
    configuredIndividualChecks: 2,
    configuredTeamChecks: 0,
    teamVerificationSupported: true,
    requiredTeamChecks: 0,
    checkedTeamResults: 0,
    teamVerificationRunId: null,
    teamSnapshotRevision: null,
    sourceRevision: 'c'.repeat(64),
    results: verifiableResults(),
    issues: [],
  };
}

function fixedVerificationSource(snapshot = verificationSnapshot()): IResultVerificationSource {
  return { resultScope: snapshot.resultScope, load: async () => snapshot };
}

function mixedTeamResult(rank: number): MixedTeamFinalResultRecord {
  return {
    id: `${rank}4444444-4444-4444-8444-444444444444`,
    eventId: EVENT_ID,
    sourceCompetitionId: COMPETITION_ID,
    teamId: `team-${rank}`,
    teamName: `Team ${rank}`,
    nationCode: rank === 1 ? 'JPN' : 'GER',
    members: [
      {
        participantId: `athlete-${rank}-f`,
        playerName: 'Female',
        gender: 'F',
        firingPointNumber: rank * 2 - 1,
        stage1Shots: [10.1],
        stage2Shots: [10.2],
        totalScore: 20.3,
      },
      {
        participantId: `athlete-${rank}-m`,
        playerName: 'Male',
        gender: 'M',
        firingPointNumber: rank * 2,
        stage1Shots: [10.1],
        stage2Shots: [10.2],
        totalScore: 20.3,
      },
    ],
    stage1Total: 20.2,
    stage2Total: 20.4,
    totalScore: 40.6,
    finalRank: rank,
    eliminatedAtShot: rank === 1 ? null : 24 - rank,
    shootoffId: null,
    remarks: '',
    createdAt: '2026-08-01T00:00:00.000Z',
  };
}

describe('exported JSON digest functions', () => {
  it('pins sha256Json for observation review revisions', () => {
    expect(
      sha256Json({
        subjectId: 'observation-1',
        scoresX10: [104, 99, 100],
        remark: 'Zoë Müller — reviewed',
        nested: { reviewed: true, note: null, omitted: undefined },
      }),
    ).toBe('8b01483897c92f1804f8d661833ba1d031c2756103aded4824cc320ab759cabf');
  });

  it('pins sha256Json for malfunction score application digests', () => {
    expect(
      sha256Json({
        input: { sheetId: RESULT_ID, seriesIndex: 0, statement: 'Applied after RTS review' },
        calculation: {
          form: 'RFPM',
          totalX10: 476,
          rowsX10: [
            [90, 100],
            [100, 80, 90, 70, 100],
          ],
        },
        context: { competitionId: COMPETITION_ID, laneChannel: 7, startNumber: null },
      }),
    ).toBe('6df899cdecfd9adbac6820de2227e8e3d684d5fe96c6a1c40bc24a55451bceb0');
  });

  it('pins sha256Json for score corrections, including the correction-basis source revisions', () => {
    expect(sha256Json(['a'.repeat(64), 'correction-v1'])).toBe(
      'b4b6a79b5da5b47de6ea4697d408bb73f274950ffd71cac2a7ee9180ecb308bf',
    );
    expect(finalCorrectionBasis(finalResult(), [5, 5, 14]).sourceRevision).toBe(
      '401215dbdf90655dc9fcd122474e6585e3fb8dd62101c338f4224629db0eac81',
    );
    expect(
      qualificationCorrectionBasis(qualificationResult(), { revision: 'overlay-v1', active: [] }).sourceRevision,
    ).toBe('98eed307544c8b93ad34ab26b785b2abf6ed823658e83c8e3df406cf76b407bf');
  });

  it('pins estComplaintSnapshotHash (est-complaints)', () => {
    const snapshot: EstComplaintSignalSnapshot = {
      signalId: RUN_ID,
      laneId: LANE_ID,
      firingPointNumber: 7,
      status: 'ACTIVE',
      issue: 'SHOT_VALUE',
      context: {
        rules: {
          round: 'QUALIFICATION',
          identity: {
            id: 'ISSF_2026_RFPM',
            schemaVersion: 1,
            fingerprint: { algorithm: 'SHA-256', value: 'd'.repeat(64) },
          },
          procedures: [],
        },
        competitionId: COMPETITION_ID,
        sessionId: '12121212-1212-4212-8212-121212121212',
        participantId: PARTICIPANT_A,
        participantName: 'Aiko Sato',
        startNumber: '101',
        phase: 'MATCH',
        stageIndex: 1,
        seriesIndex: 2,
        seriesShotLimit: 5,
        recordedShots: 3,
        timedTargetProgramId: 'RFPM_PROGRAM',
        exposureIndex: 2,
        lastShot: {
          shotId: RESULT_ID,
          shotNumberInSeries: 3,
          firedAt: '2026-09-04T00:58:59.000Z',
          receivedAt: '2026-09-04T00:59:00.000Z',
        },
      },
      message: 'Displayed value appears incorrect.',
      signalledAt: new Date('2026-09-04T01:00:00.000Z'),
    };
    expect(estComplaintSnapshotHash(snapshot)).toBe('7ce4bc138089351193965c400f5a2641533c907984205bb78741789423ecd97e');
  });

  it('pins backupRecordsDigest (est-backup-sources)', () => {
    expect(
      backupRecordsDigest([
        { key: '101', rank: 1, totalScore: 630.5, shotScores: [10.5, 10.1], seriesScores: [105.2, 104.9] },
        { key: '102', totalScore: 629.1 },
        { key: '103', rank: null, totalScore: 0, seriesScores: [] },
      ]),
    ).toBe('5292c765c1406c94165d083e2052ad2f605792abbccdc0fc98f82a4483ded8cf');
  });

  it('pins qualificationScoreSourceDigest (results)', () => {
    expect(qualificationScoreSourceDigest(qualificationResult())).toBe(
      '5b44ae180ea71d14afff3a33447f6d005db3425952236dacc9b218416e487282',
    );
  });
});

describe('qualification malfunctions', () => {
  it('pins MalfunctionScoreSheetService digest returned by preview', () => {
    const recordedAt = new Date('2026-09-07T01:00:00.000Z');
    const policy = ISSF_2026_RFPM.capabilities.qualificationMalfunction!;
    const stage = policy.stages[0]!;
    const value = QualificationMalfunctionCase.create({
      id: RUN_ID,
      competitionId: COMPETITION_ID,
      eventId: EVENT_ID,
      competitionTypeId: 'RFPM',
      policySnapshot: policy,
      participantId: PARTICIPANT_A,
      participantNameSnapshot: 'Aiko Sato',
      laneId: LANE_ID,
      laneChannelSnapshot: 7,
      relayNumberSnapshot: 1,
      reportSource: 'DIRECTOR_MANUAL',
      claimMode: 'CLAIM',
      phase: 'MATCH',
      stageId: stage.stageId,
      stageIndex: 1,
      seriesIndex: 0,
      seriesShotLimit: 5,
      recordedShots: 2,
      existingClaimsInScope: 0,
      claimAssessment: assessQualificationMalfunctionClaim(policy, { phase: 'MATCH', existingClaimsInScope: 0 }),
      summary: 'Projectile lodged',
      openedBy: 'RO A',
      occurredAt: recordedAt,
      createdAt: recordedAt,
    });
    const entry = (index: number, input: Partial<Parameters<typeof QualificationMalfunctionEntry.create>[0]>) =>
      QualificationMalfunctionEntry.create({
        id: `${index}${'0'.repeat(7)}-0000-4000-8000-000000000000`,
        caseId: value.id,
        type: 'NOTE',
        statement: 'Official confirmation',
        officialName: 'RO A',
        officialRole: 'RANGE_OFFICER',
        occurredAt: recordedAt,
        recordedAt,
        ...input,
      });
    const allowableCause = policy.causes.find((cause) => cause.classification === 'ALLOWABLE')!;
    const entries = [
      entry(1, { type: 'INSPECTION_RECORDED' }),
      entry(2, { type: 'CLASSIFIED', classification: 'ALLOWABLE', causeCode: allowableCause.code }),
      entry(3, {
        type: 'REMEDY_AUTHORIZED',
        remedy: stage.allowableTreatment.type,
        shotsToFire: stage.allowableTreatment.type === 'REPEAT_FULL_SERIES' ? 5 : 3,
      }),
      entry(4, { type: 'EXECUTION_RECORDED', artifactId: 'signed-execution-record:7' }),
    ];
    const cases = {
      findCaseById: (id: string) => (id === value.id ? value : null),
      findEntries: () => new Map([[value.id, entries]]),
    } as unknown as IQualificationMalfunctionRepository;
    const service = new MalfunctionScoreSheetService(
      cases,
      { find: () => null, list: () => [], append: vi.fn() },
      { export: vi.fn() },
      () => recordedAt,
    );
    const shot = (id: string, score: number, targetIndex: number): MalfunctionScoreEvidence => ({
      shotId: id,
      scoreX10: score * 10,
      evidenceReference: `EST printout / ${id}`,
      outcome: score ? 'HIT' : 'MISS',
      targetIndex,
    });

    const preview = service.preview({
      caseId: value.id,
      original: [shot('o1', 9, 0), shot('o2', 10, 1)],
      recovery: [shot('r1', 10, 0), shot('r2', 8, 1), shot('r3', 9, 2), shot('r4', 7, 3), shot('r5', 10, 4)],
      officialName: 'RTS A',
      officialRole: 'RTS_OFFICER',
      statement: 'Compared with independent EST printouts and confirmed target mapping.',
    });

    expect(preview.digest).toBe('a16f1f487e32ffbdedba2a999336e0a961f320c8f4ad3bedf8fc7a4b5a6954e4');
  });
});

describe('result verification', () => {
  it('pins FinalResultVerificationSource Mixed Team result and source revisions from load', async () => {
    const competitionTypes = new CompetitionTypeRegistry();
    competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_ARMIX_FINAL, { includeTeamResults: true }));
    const source = new FinalResultVerificationSource(
      eventQueryBus(ISSF_2026_ARMIX_FINAL.eventCode, 'Mixed Team Final', 'Final'),
      {
        getByEvent: async () => [],
        getSnapshot: async () => ({
          eventId: EVENT_ID,
          scoringRevision: 'a'.repeat(64),
          currentPlacementReviewId: null,
          results: [],
        }),
      },
      { findByEvent: () => [mixedTeamResult(1), mixedTeamResult(2)] },
      competitionTypes,
    );

    const snapshot = await source.load(EVENT_ID);

    expect(snapshot.results).toHaveLength(2);
    expect(snapshot.results[0]!.revision).toBe('fa4cc827851a63a92267b45d6bc25a18a786dc3bf35dd56d2bdb09018d909e70');
    expect(snapshot.results[1]!.revision).toBe('92c7ac86e23559abc16ef41cd7da3eb254d0647d801e3973b6972dc0e7cc2919');
    expect(snapshot.sourceRevision).toBe('cc764c7caf550bb21d313b394ad1793b656cd4f4fb285ed44177fd77a79e41f6');
  });

  it('pins ResultVerificationService snapshotRevision from getStatus', async () => {
    const service = new ResultVerificationService(emptyVerificationRepository(), {
      resolve: () => fixedVerificationSource(),
    });

    expect((await service.getStatus(EVENT_ID, 'QUALIFICATION')).snapshotRevision).toBe(
      'bdc87369ccb1b04b66e8140a43cd39f4c9866edb0651b569fd488357b2e179da',
    );
  });
});

describe('publication review policies', () => {
  const defaults: ResultPublicationReviewSettingsDto = {
    requireObservationReviews: true,
    requireIncidentReports: false,
    requireFinalRecoveriesComplete: true,
    requireProtestCasesComplete: true,
    requireEquipmentChecksComplete: false,
  };

  it('pins PolicyBoundVerificationSource sourceRevision from load', async () => {
    const source = new PolicyBoundVerificationSource(fixedVerificationSource(), () => 'e'.repeat(64));

    expect((await source.load(EVENT_ID)).sourceRevision).toBe(
      '7c272779872f6449088f671964d4448a3a3b5a34e797b3d03d6bb51aed3d25f0',
    );
  });

  it('pins PublicationReviewPolicyService revision from get and approvalRevision', () => {
    const pinned = {
      id: RUN_ID,
      eventId: EVENT_ID,
      resultScope: 'FINAL' as const,
      mode: 'PINNED' as const,
      settings: { ...defaults, requireIncidentReports: true },
      reason: 'Local event requirements',
      signingEvidence: {
        method: 'MANUAL' as const,
        actorId: null,
        recordedBy: 'RTS official',
        evidenceReference: null,
      },
      recordedAt: '2026-09-01T00:00:00.000Z',
    };
    const service = new PublicationReviewPolicyService(
      {
        find: (_eventId, scope) => (scope === 'FINAL' ? [pinned] : []),
        append: vi.fn(),
      },
      () => defaults,
      () => true,
    );

    expect(service.get(EVENT_ID, 'QUALIFICATION').revision).toBe(
      'a364309902c99e6ff8a74698cd855018dee264a8ea5afe3701189a67e4d297a5',
    );
    expect(service.get(EVENT_ID, 'FINAL').revision).toBe(
      '75194fd7c6886ac99107ec868e3f0069461231ea87fb3de5069a7b1bb4c230e7',
    );
    expect(service.approvalRevision(EVENT_ID, 'FINAL')).toBe(
      'c167282930152faec6deaa179e621964f37081513e5b7c5b62429a0ac33431c4',
    );
  });
});

describe('operational settings', () => {
  it('pins BackupCaptureReadinessService revision from get', () => {
    const stored = {
      competitionId: COMPETITION_ID,
      eventId: EVENT_ID,
      mode: 'ADVISORY' as const,
      maximumAgeMilliseconds: 30_000,
    };
    const service = (settings: typeof stored | null) =>
      new BackupCaptureReadinessService(
        { find: () => settings, save: vi.fn() },
        () => {
          throw new Error('Backup capture facts are not read by this golden');
        },
        () => false,
        undefined,
        () => CONFIRMED_AT,
      );

    expect(service(null).get(COMPETITION_ID).revision).toBe(
      '4c493c3a32890ac0c6d4ac4bcdee452949d4ee26e6a559a156bcc04574b57ed8',
    );
    expect(service(stored).get(COMPETITION_ID).revision).toBe(
      'fee4139a2dfd47d1a1e0fa8c9912cb4f641ac4f14c0a15f64ba0c042d2705837',
    );
  });

  it('pins OperationalProfileService fingerprint from preview', async () => {
    const service = new OperationalProfileService(
      [
        {
          id: 'backup-capture',
          label: 'Backup capture readiness',
          scope: 'COMPETITION',
          read: () => ({ mode: 'DISABLED', context: 'No backup source' }),
          write: vi.fn(),
        },
        {
          id: 'observation-reviews',
          label: 'Observation reviews',
          scope: 'DIRECTOR',
          supportedModes: ['DISABLED', 'REQUIRED'],
          read: async () => ({ mode: 'REQUIRED', context: 'Director default' }),
          write: vi.fn(),
        },
      ],
      () => undefined,
    );

    const preview = await service.preview({ competitionId: COMPETITION_ID, modes: { 'backup-capture': 'ADVISORY' } });

    expect(preview.fingerprint).toBe('24a6c6e864696f22cf8d8a0c347496dcdc8b9f30ddf87007fd1dc5cfab6b1d17');
  });
});

describe('EST backup verification', () => {
  it('pins EstBackupResultCheckService digest from preview', async () => {
    const results = verifiableResults();
    const subjects = results.map((result) => ({
      key: result.participantId,
      name: result.playerName,
      rank: result.rank,
      totalScore: result.totalScore,
      interventionCount: result.decisionCount,
      resultBinding: {
        resultId: result.resultId,
        participantId: result.participantId,
        resultRevision: result.revision,
      },
    }));
    const records = subjects.map((subject) => ({
      key: subject.key,
      totalScore: subject.totalScore,
      rank: subject.rank,
    }));
    const run: EstBackupVerificationRunDto = {
      id: RUN_ID,
      eventId: EVENT_ID,
      resultScope: 'QUALIFICATION',
      resultKind: 'INDIVIDUAL',
      keyType: 'PARTICIPANT_ID',
      sourceName: 'Independent EST memory',
      sourceReference: 'sha256:abc',
      items: compareEstBackup(subjects, records),
      snapshotRevision: 'a'.repeat(64),
      verified: true,
      officialName: 'RTS A',
      verifiedAt: '2026-09-09T00:00:00.000Z',
      interventionReviewStatement: 'Compared incident reports',
    };
    const target = new ResultVerificationService(emptyVerificationRepository(), {
      resolve: () => fixedVerificationSource({ ...verificationSnapshot(), results }),
    });
    const service = new EstBackupResultCheckService({ findByEvent: () => [run] }, target);

    expect((await service.preview(EVENT_ID, RUN_ID)).digest).toBe(
      '48fe8d4d2ee23efdfb1a82c62d07f222be6a5f9641a059783d9e52dc169ab601',
    );
  });

  it('pins EstBackupVerificationService snapshotRevision from verify', async () => {
    const repository: IEstBackupVerificationRepository = { append: vi.fn(), findByEvent: () => [] };
    const service = new EstBackupVerificationService(
      repository,
      { findByEventId: () => [] },
      { getByEvent: async () => [], getByRelay: async () => [] },
      { getQualification: async () => [] },
      {
        load: async () => [
          {
            resultBinding: { resultId: RESULT_ID, participantId: PARTICIPANT_A, resultRevision: 'f'.repeat(64) },
            key: PARTICIPANT_A,
            name: 'Aiko Sato',
            rank: 1,
            totalScore: 250.6,
            seriesScores: [52.1, 49.4],
            interventionCount: 0,
          },
          { key: PARTICIPANT_B, name: 'Zoë Müller', rank: 2, totalScore: 248.9, interventionCount: 1 },
        ],
      },
      { get: vi.fn() },
    );

    const run = await service.verify({
      id: RUN_ID,
      eventId: EVENT_ID,
      resultScope: 'FINAL',
      resultKind: 'INDIVIDUAL',
      keyType: 'PARTICIPANT_ID',
      sourceName: 'Independent EST memory',
      records: [
        { key: PARTICIPANT_A, rank: 1, totalScore: 250.6 },
        { key: PARTICIPANT_B, rank: 2, totalScore: 248.9 },
      ],
      interventionReviewStatement: 'Compared incident reports',
      officialName: 'RTS A',
      verifiedAt: '2026-09-09T00:00:00.000Z',
    });

    expect(run.snapshotRevision).toBe('014e62cfaa3115ffdff2f1160fe0f3b08b6fd55a06f643307e48ed202778c156');
  });
});

describe('results books', () => {
  const officialRevision = 'a'.repeat(64);
  const snapshots: IResultsBookResultSnapshotSource = {
    load: async (eventId, resultScope) => ({
      eventId,
      resultScope,
      snapshotRevision: officialRevision,
      officialPublicationRevision: officialRevision,
      publicationIssues: [],
      results: [
        {
          resultId: RESULT_ID,
          participantId: PARTICIPANT_A,
          rank: 1,
          playerName: 'Aiko Sato',
          affiliation: 'Japan',
          totalScore: 632.4,
          classificationCode: null,
          status: 'confirmed' as const,
        },
      ],
    }),
  };

  it('pins QualificationTeamRecordCandidateSource snapshotRevision from eligibleRecordResults', async () => {
    const member = (participantId: string, playerName: string, totalScore: number) => ({
      participantId,
      playerName,
      familyName: playerName.split(' ').at(-1) ?? playerName,
      nationCode: 'JPN',
      gender: 'F',
      entryStatus: 'COMPETING',
      totalScore,
      classificationCode: null,
      decisionCount: 0,
    });
    const source = new QualificationTeamRecordCandidateSource(
      rangeDatabase(),
      {
        getQualification: async () => [
          {
            rank: 1,
            teamId: 'JPN-WOMEN-A',
            teamName: 'Japan',
            nationCode: 'JPN',
            eligible: true,
            totalScore: 1888.6,
            members: [
              member('33333333-3333-4333-8333-333333333332', 'Mei Ito', 629.1),
              member('33333333-3333-4333-8333-333333333331', 'Aiko Sato', 632.4),
              member('33333333-3333-4333-8333-333333333333', 'Yui Abe', 627.1),
            ],
          },
        ],
      },
      snapshots,
    );

    const candidates = await source.eligibleRecordResults(CHAMPIONSHIP_ID);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.snapshotRevision).toBe('b8719fee16fbe0ece88e16a8bb39420a700426d0b89b733e1df208edf60481f6');
  });

  it('pins SqliteResultsBookSource sourceHash from build', async () => {
    const source = new SqliteResultsBookSource(rangeDatabase(), snapshots);

    expect((await source.build(CHAMPIONSHIP_ID, [], [])).sourceHash).toBe(
      '9c78ca2a54e0488ba01f3a6cee1a9e4376f8e41d6ea1d6fe22d27c9b9c7c9a0c',
    );
  });
});

describe('result readers', () => {
  it('pins QualificationResultsReader result revision from getByEvent', async () => {
    const result = qualificationResult();
    const registry = new CompetitionTypeRegistry();
    registry.registerStrategy(new IssfStandardStrategy());
    registry.register(BR60S);
    const reader = new QualificationResultsReader(
      eventQueryBus(BR60S.id, 'Qualification', 'Qualification'),
      { findByEventId: () => [result], findByEventIdAndRelay: () => [result] } as unknown as IResultRepository,
      emptyDecisions(),
      registry,
      {
        findByEventId: () => [
          Participant.create(result.participantId, result.eventId, result.playerName, result.affiliation),
        ],
      },
    );

    const ranked = await reader.getByEvent(EVENT_ID);

    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.revision).toBe('92169249752386c998103a64ff09c54a0899770a567858ad0daa7b76f61a84e8');
  });

  it('pins FinalResultsReader result scoring revision and snapshot scoring revision from getSnapshot', async () => {
    const result = finalResult();
    const registry = new CompetitionTypeRegistry();
    registry.register(BR60S_FINAL);
    const reader = new FinalResultsReader(
      eventQueryBus(BR60S_FINAL.id, 'Final', 'Final'),
      { findByEventId: () => [result] } as unknown as IFinalResultRepository,
      emptyDecisions(),
      { findByEventId: () => [] } as unknown as IFinalPlacementReviewRepository,
      registry,
    );

    const snapshot = await reader.getSnapshot(EVENT_ID);

    expect(snapshot.results).toHaveLength(1);
    expect(snapshot.results[0]!.scoringRevision).toBe(
      'fcc4739e157630dc613bba6c45e3122b98a26fa30413ab61f8aebfe1e18d0183',
    );
    expect(snapshot.scoringRevision).toBe('9c1760a45277c29d00b44e707df15b340a5ae5db8dc301532209df1513a9f382');
  });
});

describe('range planning', () => {
  it('pins SqliteEliminationPlanningSource sourceHash from get', () => {
    expect(new SqliteEliminationPlanningSource(rangeDatabase()).get(EVENT_ID)?.sourceHash).toBe(
      '770dd85db97c5ed01915e89122a944ee008996c6384b23421ce0f1cae20762a2',
    );
  });

  it('pins StartListService sourceHash from createVersion', () => {
    const database = rangeDatabase();
    const service = new StartListService(new SqliteStartListRepository(database), championshipSources(database));

    const version = service.createVersion({
      eventId: EVENT_ID,
      listKind: 'QUALIFICATION',
      disciplineGroup: 'RIFLE_PISTOL',
      distributionMode: 'PRINTED',
      scheduledStartAt: '2026-09-05T01:00:00.000Z',
      publicationDueAt: '2026-09-03T07:00:00.000Z',
      createdBy: 'RTS A',
      createdAt: '2026-09-03T06:00:00.000Z',
    });

    expect(version.sourceHash).toBe('59eb89f115b3c6735708c57e23a8a4e526b7a45c933f4d5f65a0721e675ed105');
  });

  it('pins SquaddingService participantSnapshotHash and outputHash from createDraw', () => {
    const database = rangeDatabase();
    const registry = new CompetitionTypeRegistry();
    registry.register(BR60S);
    const service = new SquaddingService(
      new SqliteSquaddingRepository(database),
      championshipSources(database),
      registry,
    );

    const draw = service.createDraw({
      eventId: EVENT_ID,
      competitionTypeId: BR60S.id,
      seed: 'published-draw-seed',
      relayCount: 1,
      firstFiringPoint: 5,
      firingPointCount: 4,
      statusSectionPolicy: 'OFF',
      createdBy: 'RTS Operator',
      createdAt: '2026-09-03T06:00:00.000Z',
    });

    expect(draw.participantSnapshotHash).toBe('812fa2543600ff54a4e17e2705128f6b9893d5f55f40db4336114daae1ca29c8');
    expect(draw.outputHash).toBe('9508ea2ed92a5be67b05d5f3b7781bfa0e602509059e2b907c5c902adba829d8');
  });
});
