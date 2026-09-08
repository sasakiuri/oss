// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  AthleteIdentity,
  AthleteIdentityLinkEntry,
  SanctionDecision,
  SqliteAthleteEntryReferenceSource,
  SqliteAthleteSanctionRepository,
} from '@/main/modules/athlete-sanctions';
import {
  createEquipmentControlEntry,
  EquipmentControlPublicationBlocker,
  PostCompetitionEquipmentCheck,
  SqlitePostCompetitionEquipmentCheckRepository,
  StoredEquipmentControlPublicationSource,
} from '@/main/modules/post-competition-equipment-control';
import { GuardedResultPublicationReadiness } from '@/main/modules/result-publication/application/GuardedResultPublicationReadiness';
import { OptionalResultPublicationBlocker } from '@/main/modules/result-publication/application/OptionalResultPublicationBlocker';
import { ResultPublicationService } from '@/main/modules/result-publication/application/ResultPublicationService';
import { SqliteResultPublicationRepository } from '@/main/modules/result-publication/infra/SqliteResultPublicationRepository';

const now = new Date('2026-09-08T12:00:00Z');
const authorization = {
  basis: 'POST_COMPETITION_CHECK',
  officialName: 'EC Jury',
  officialRole: 'EQUIPMENT_CONTROL_JURY',
  mode: 'MANUAL_ATTESTATION',
  officialActorId: null,
  authorityReference: 'EQUIPMENT-CONTROL:check',
} as const;

describe('Equipment publication review', () => {
  let db: Database.Database;
  let checks: SqlitePostCompetitionEquipmentCheckRepository;
  let sanctions: SqliteAthleteSanctionRepository;
  let source: StoredEquipmentControlPublicationSource;
  let blocker: EquipmentControlPublicationBlocker;
  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    new MigrationRunner(db).run(allMigrations);
    db.exec(`INSERT INTO championships (id, name, date, venue) VALUES ('champ', 'Meet', '2026-09-08', 'Range');
      INSERT INTO events (id, championship_id, name, event_type, round, sort_order)
        VALUES ('event', 'champ', 'Air Pistol', 'AP60', 'Qualification', 0),
               ('other-event', 'champ', 'Other', 'AR60', 'Qualification', 1);
      INSERT INTO participants (id, event_id, player_name, affiliation) VALUES ('participant', 'event', 'Athlete', 'Team');`);
    checks = new SqlitePostCompetitionEquipmentCheckRepository(db);
    sanctions = new SqliteAthleteSanctionRepository(db);
    source = new StoredEquipmentControlPublicationSource(checks, sanctions, new SqliteAthleteEntryReferenceSource(db));
    blocker = new EquipmentControlPublicationBlocker(source);
    sanctions.appendIdentity(
      AthleteIdentity.create({
        id: 'identity',
        championshipId: 'champ',
        displayName: 'Athlete',
        createdBy: 'RTS',
        creationStatement: 'Entry checked',
      }),
    );
    sanctions.appendLinkEntry(
      AthleteIdentityLinkEntry.link({
        id: 'link',
        athleteIdentityId: 'identity',
        participantId: 'participant',
        eventIdSnapshot: 'event',
        eventNameSnapshot: 'Air Pistol',
        playerNameSnapshot: 'Athlete',
        linkBasis: 'MANUAL',
        statement: 'Entry checked',
        officialName: 'RTS',
      }),
    );
  });
  afterEach(() => db.close());

  function select(id = 'check', eventId = 'event') {
    checks.appendChecks([
      PostCompetitionEquipmentCheck.create({
        id,
        championshipId: 'champ',
        eventId,
        eventName: 'Air Pistol',
        eventType: 'AP60',
        round: 'Qualification',
        participantId: 'participant',
        athleteName: 'Athlete',
        gender: 'M',
        selectionBasis: 'PISTOL_TRIGGER_RANDOM_DRAW',
        selectionStatement: 'Draw by EC Jury',
        selectedBy: 'EC Jury',
        selectedAt: now,
      }),
    ]);
  }
  function test(outcome: 'PASSED' | 'FAILED' | 'DID_NOT_REPORT') {
    const entry = createEquipmentControlEntry({
      type: 'TEST_RECORDED',
      checkId: 'check',
      outcome,
      testedItems: outcome === 'DID_NOT_REPORT' ? [] : ['Trigger'],
      clothingOrTapingCheck: false,
      sameGenderJudgeAvailable: null,
      attempts: outcome === 'DID_NOT_REPORT' ? null : 3,
      performedBy: 'Officer',
      equipmentControlJurySupervisor: 'EC Jury',
      statement: 'Test recorded',
      occurredAt: now,
    });
    checks.appendEntry(entry);
    return entry;
  }
  function confirm(entryId: string) {
    checks.appendEntry(
      createEquipmentControlEntry({
        type: 'FAILURE_CONFIRMED',
        checkId: 'check',
        confirmsEntryId: entryId,
        calibrationReference: 'CAL-1',
        confirmedBy: 'EC Jury',
        confirmerRole: 'EQUIPMENT_CONTROL_JURY_CHAIR',
        testPerformedCorrectly: true,
        statement: 'Correctly performed',
        occurredAt: now,
      }),
    );
  }
  function impose(overrides: Partial<Parameters<typeof SanctionDecision.impose>[0]> = {}) {
    const decision = SanctionDecision.impose({
      athleteIdentityId: 'identity',
      sourceEventId: 'event',
      classificationCode: 'DSQ',
      scope: 'EVENT',
      authorization,
      ruleReference: '8.4.2.3',
      publicRemark: 'Trigger test failed',
      ...overrides,
    });
    sanctions.appendDecision(decision);
    return decision;
  }

  it('reads pending, passed and voided checks without affecting other events', () => {
    select();
    select('other', 'other-event');
    expect(blocker.getIssues('event')).toEqual([expect.stringContaining('(SELECTED)')]);
    test('PASSED');
    expect(blocker.getIssues('event')).toEqual([]);
    checks.appendEntry(
      createEquipmentControlEntry({
        type: 'CHECK_VOIDED',
        checkId: 'other',
        officialName: 'Jury',
        statement: 'Wrong selection',
        occurredAt: now,
      }),
    );
    expect(blocker.getIssues('other-event')).toEqual([]);
    expect(() => source.load('missing')).toThrow('not found');
  });

  it.each(['FAILED', 'DID_NOT_REPORT'] as const)(
    'requires confirmation and a matching adjudication for %s',
    (outcome) => {
      select();
      const entry = test(outcome);
      const decision = impose();
      expect(blocker.getIssues('event')).toEqual([expect.stringContaining('PENDING_CONFIRMATION')]);
      confirm(entry.id);
      expect(blocker.getIssues('event')).toEqual([]);
      sanctions.appendDecision(
        SanctionDecision.revoke(decision, {
          authorization,
          ruleReference: '6.16',
          reason: 'Jury decision reversed on review',
        }),
      );
      expect(source.load('event')[0]?.disposition).toBe('REVOKED');
      expect(blocker.getIssues('event')).toEqual([]);
    },
  );

  it('does not accept a different event, equipment reference or detached identity', () => {
    select();
    confirm(test('FAILED').id);
    impose({ sourceEventId: 'other-event' });
    impose({ authorization: { ...authorization, authorityReference: 'EQUIPMENT-CONTROL:other' } });
    expect(blocker.getIssues('event')).toEqual([expect.stringContaining('EQUIPMENT-CONTROL:check')]);
    impose();
    expect(blocker.getIssues('event')).toEqual([]);
    sanctions.appendLinkEntry(
      AthleteIdentityLinkEntry.unlink(sanctions.findLinkEntryById('link')!, {
        officialName: 'RTS',
        statement: 'Wrong identity corrected',
      }),
    );
    expect(blocker.getIssues('event')).toHaveLength(1);
  });

  it('holds publication and invalidates current publication when a new check is opened, with an independent override', async () => {
    let required = true;
    let publicationNow = now;
    const revision = 'a'.repeat(64);
    const readiness = new GuardedResultPublicationReadiness(
      {
        getCurrent: async () => ({
          supported: true,
          resultCount: 1,
          snapshotRevision: revision,
          approvalId: 'approval',
          approvalSnapshotRevision: revision,
          verificationIssues: [],
        }),
      },
      [new OptionalResultPublicationBlocker(blocker, () => required)],
    );
    const publication = new ResultPublicationService(
      new SqliteResultPublicationRepository(db),
      readiness,
      { resolve: async () => ({ scoreProtestWindowMs: 600_000 }) },
      { now: () => publicationNow },
    );
    const input = { eventId: 'event', resultScope: 'QUALIFICATION' as const, officialName: 'RTS' };
    await publication.publishPreliminary(input);
    publicationNow = new Date(now.getTime() + 600_000);
    select();
    await expect(publication.publishOfficial(input)).rejects.toThrow('Equipment check');
    expect((await readiness.getCurrent('event', 'FINAL')).verificationIssues).toHaveLength(1);
    required = false;
    expect((await publication.getStatus('event', 'QUALIFICATION')).canPublishOfficial).toBe(true);
    required = true;
    test('PASSED');
    await publication.publishOfficial(input);
    select('second-check');
    expect((await publication.getStatus('event', 'QUALIFICATION')).publicationCurrent).toBe(false);
  });
});
