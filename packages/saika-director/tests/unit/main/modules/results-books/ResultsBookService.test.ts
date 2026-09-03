import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import type { ArchiveFileGateway } from '@/main/modules/operational-archives';
import {
  type IResultsBookResultSnapshotSource,
  ResultsBookService,
  SqliteResultsBookRepository,
  SqliteResultsBookSource,
} from '@/main/modules/results-books';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_ID = '33333333-3333-4333-8333-333333333333';
const RESULT_ID = '44444444-4444-4444-8444-444444444444';
const SNAPSHOT_REVISION = 'a'.repeat(64);

describe('ResultsBookService', () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  function setup(entryStatus = 'COMPETING') {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
    database
      .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
      .run(CHAMPIONSHIP_ID, 'ISSF Championship', '2026-09-02', 'Range A');
    database
      .prepare(
        `INSERT INTO events (id, championship_id, name, event_type, round, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(EVENT_ID, CHAMPIONSHIP_ID, '10m Air Rifle Women', 'AR60W', 'Qualification', 1);
    database
      .prepare(
        `INSERT INTO participants (
        id, event_id, player_name, affiliation, sort_order, family_name, start_number,
        issf_id, nation_code, gender, entry_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(PARTICIPANT_ID, EVENT_ID, 'Aiko Sato', 'Japan', 1, 'Sato', '101', 'ISSF-101', 'JPN', 'F', entryStatus);
    database
      .prepare(
        `INSERT INTO results (
        id, event_id, participant_id, player_name, affiliation, relay_number, total_score,
        shots_detail, family_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(RESULT_ID, EVENT_ID, PARTICIPANT_ID, 'Aiko Sato', 'Japan', 1, 632.4, '[]', 'Sato');
    database
      .prepare(
        `INSERT INTO result_publication_entries (
        id, event_id, result_scope, entry_type, preliminary_id, payload_json, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        '55555555-5555-4555-8555-555555555555',
        EVENT_ID,
        'QUALIFICATION',
        'OFFICIAL_PUBLISHED',
        '66666666-6666-4666-8666-666666666666',
        JSON.stringify({ snapshotRevision: SNAPSHOT_REVISION }),
        '2026-09-02T06:00:00.000Z',
      );

    const repository = new SqliteResultsBookRepository(database);
    const snapshotState = { revision: SNAPSHOT_REVISION, publicationIssues: [] as string[] };
    const snapshots: IResultsBookResultSnapshotSource = {
      load: vi.fn(async (eventId, resultScope) => {
        if (eventId !== EVENT_ID || resultScope !== 'QUALIFICATION') {
          throw new Error('Unexpected result snapshot request');
        }
        const result = database!.prepare('SELECT total_score FROM results WHERE id = ?').get(RESULT_ID) as {
          total_score: number;
        };
        return {
          eventId,
          resultScope,
          snapshotRevision: snapshotState.revision,
          officialPublicationRevision: SNAPSHOT_REVISION,
          publicationIssues: [...snapshotState.publicationIssues],
          results: [
            {
              resultId: RESULT_ID,
              participantId: PARTICIPANT_ID,
              rank: 1,
              playerName: 'Aiko Sato',
              affiliation: 'Japan',
              totalScore: result.total_score,
              classificationCode: null,
              status: 'confirmed' as const,
            },
          ],
        };
      }),
    };
    const written = { path: '', content: '' };
    const files: ArchiveFileGateway = {
      chooseEvidenceDestination: vi.fn(async () => null),
      chooseResultsBookDestination: vi.fn(async () => '/tmp/official-results-book.json'),
      chooseBackupDestination: vi.fn(async () => null),
      chooseRestoreSource: vi.fn(async () => null),
      writeUtf8Atomic: vi.fn(async (path, content) => {
        written.path = path;
        written.content = content;
      }),
    };
    const service = new ResultsBookService(
      repository,
      new SqliteResultsBookSource(database, snapshots),
      files,
      () => new Date('2026-09-02T07:00:00.000Z'),
    );
    return { service, repository, written, snapshotState };
  }

  async function appointCertifiers(service: ResultsBookService) {
    let workspace = await service.appointOfficial({
      championshipId: CHAMPIONSHIP_ID,
      role: 'TECHNICAL_DELEGATE',
      officialName: 'TD A',
      statement: 'Official appointment list',
      recordedBy: 'Organizing Committee',
    });
    workspace = await service.appointOfficial({
      championshipId: CHAMPIONSHIP_ID,
      role: 'RTS_JURY_CHAIR',
      officialName: 'RTS Chair A',
      statement: 'Official appointment list',
      recordedBy: 'Organizing Committee',
    });
    return workspace;
  }

  it('keeps open record claims out of the official book and certifies a verified claim', async () => {
    const { service, repository, written } = setup();
    let workspace = await appointCertifiers(service);
    const technicalDelegate = workspace.officials.find((official) => official.role === 'TECHNICAL_DELEGATE')!;

    workspace = await service.createRecordClaim({
      championshipId: CHAMPIONSHIP_ID,
      resultId: RESULT_ID,
      resultScope: 'QUALIFICATION',
      code: 'QWR',
      resultBasis: 'QUALIFICATION_OR_ELIMINATION',
      benchmarkScoreX10: 6323,
      olympicGamesConfirmed: false,
      claimedBy: 'RTS Officer A',
      achievedAt: '2026-09-02T05:30:00.000Z',
    });
    const claim = workspace.recordClaims[0]!;

    workspace = await service.generateBook(CHAMPIONSHIP_ID, 'Results Officer A');
    expect(workspace.books[0]?.findings).toContain('Record claim QWR for Aiko Sato is unresolved (DRAFT)');
    expect(JSON.parse(repository.findBooks(CHAMPIONSHIP_ID)[0]!.contentJson).newAndEqualledRecords).toEqual([]);

    workspace = await service.appendRecordClaimEntry({
      championshipId: CHAMPIONSHIP_ID,
      claimId: claim.id,
      type: 'TD_CONFIRMED',
      statement: 'Final result and application checked',
      officialName: technicalDelegate.officialName,
      appointmentId: technicalDelegate.appointmentId,
    });
    workspace = await service.appendRecordClaimEntry({
      championshipId: CHAMPIONSHIP_ID,
      claimId: claim.id,
      type: 'SUBMITTED',
      statement: 'Application submitted to ISSF',
      officialName: 'Secretary General A',
      reference: 'SUB-2026-001',
    });
    workspace = await service.appendRecordClaimEntry({
      championshipId: CHAMPIONSHIP_ID,
      claimId: claim.id,
      type: 'TECHNICAL_COMMITTEE_VERIFIED',
      statement: 'Application verified',
      officialName: 'Technical Committee A',
      reference: 'TC-2026-001',
    });
    expect(workspace.recordClaims[0]?.status).toBe('VERIFIED');

    workspace = await service.generateBook(CHAMPIONSHIP_ID, 'Results Officer A');
    const book = workspace.books[1]!;
    expect(book.findings).toEqual([]);
    const content = JSON.parse(repository.findBookById(book.id)!.contentJson);
    expect(content.newAndEqualledRecords).toMatchObject([
      {
        code: 'QWR',
        resultBasis: 'QUALIFICATION_OR_ELIMINATION',
        subjectName: 'Aiko Sato',
      },
    ]);
    expect(content.finalResults[0].results[0]).toMatchObject({
      name: 'Aiko Sato',
      familyName: 'SATO',
      bibNumber: '101',
      nationCode: 'JPN',
    });

    for (const signer of book.requiredSigners) {
      workspace = await service.signBook({
        championshipId: CHAMPIONSHIP_ID,
        bookId: book.id,
        appointmentId: signer.appointmentId,
        statement: 'I certify this Results Book version',
      });
    }
    workspace = await service.finalizeBook({
      championshipId: CHAMPIONSHIP_ID,
      bookId: book.id,
      officialName: 'Results Officer A',
      statement: 'Required contents and signatures verified',
    });
    expect(workspace.books[1]?.status).toBe('CERTIFIED');

    const exported = await service.exportBook(book.id);
    expect(exported).toMatchObject({ status: 'COMPLETED', fileName: 'official-results-book.json' });
    expect(written.path).toBe('/tmp/official-results-book.json');
    const certification = JSON.parse(written.content).resultsCertification;
    expect(certification.requiredRoles).toEqual(['TECHNICAL_DELEGATE', 'JURY_CHAIR']);
    expect(certification.requiredSigners).toHaveLength(2);
    expect(certification.signatures).toHaveLength(2);

    database!.prepare('UPDATE participants SET entry_status = ? WHERE id = ?').run('OOC', PARTICIPANT_ID);
    workspace = await service.generateBook(CHAMPIONSHIP_ID, 'Results Officer A');
    expect(workspace.books[2]?.findings).toContain(
      'Record claim QWR for Aiko Sato is not based on the current Official result',
    );
  });

  it.each(['RPO', 'MQS', 'OOC'])('rejects an %s entry as a record source', async (entryStatus) => {
    const { service } = setup(entryStatus);
    await expect(
      service.createRecordClaim({
        championshipId: CHAMPIONSHIP_ID,
        resultId: RESULT_ID,
        resultScope: 'QUALIFICATION',
        code: 'QWR',
        resultBasis: 'QUALIFICATION_OR_ELIMINATION',
        benchmarkScoreX10: 6323,
        olympicGamesConfirmed: false,
        claimedBy: 'RTS Officer A',
        achievedAt: '2026-09-02T05:30:00.000Z',
      }),
    ).rejects.toThrow('cannot establish ISSF records');
  });

  it('requires a new version when source data changes after signatures', async () => {
    const { service } = setup();
    let workspace = await appointCertifiers(service);
    workspace = await service.generateBook(CHAMPIONSHIP_ID, 'Results Officer A');
    const book = workspace.books[0]!;
    for (const signer of book.requiredSigners) {
      await service.signBook({
        championshipId: CHAMPIONSHIP_ID,
        bookId: book.id,
        appointmentId: signer.appointmentId,
        statement: 'I certify this Results Book version',
      });
    }
    database!.prepare('UPDATE participants SET start_number = ? WHERE id = ?').run('202', PARTICIPANT_ID);

    await expect(
      service.finalizeBook({
        championshipId: CHAMPIONSHIP_ID,
        bookId: book.id,
        officialName: 'Results Officer A',
        statement: 'Required contents and signatures verified',
      }),
    ).rejects.toThrow('source data changed');
  });

  it('records a no-Final result basis and permits replacement only after a referenced void', async () => {
    const { service } = setup();
    let workspace = await appointCertifiers(service);
    const technicalDelegate = workspace.officials.find((official) => official.role === 'TECHNICAL_DELEGATE')!;
    const create = () =>
      service.createRecordClaim({
        championshipId: CHAMPIONSHIP_ID,
        resultId: RESULT_ID,
        resultScope: 'QUALIFICATION',
        code: 'WRJ',
        resultBasis: 'RECOGNIZED_NO_FINAL_TOTAL',
        benchmarkScoreX10: 6323,
        olympicGamesConfirmed: false,
        claimedBy: 'RTS Officer A',
        achievedAt: '2026-09-02T05:30:00.000Z',
      });

    workspace = await create();
    const claim = workspace.recordClaims[0]!;
    expect(claim.resultBasis).toBe('RECOGNIZED_NO_FINAL_TOTAL');
    await expect(create()).rejects.toThrow('non-void claim already exists');

    await service.appendRecordClaimEntry({
      championshipId: CHAMPIONSHIP_ID,
      claimId: claim.id,
      type: 'TD_CONFIRMED',
      statement: 'Eligibility and total result checked',
      officialName: technicalDelegate.officialName,
      appointmentId: technicalDelegate.appointmentId,
    });
    await service.appendRecordClaimEntry({
      championshipId: CHAMPIONSHIP_ID,
      claimId: claim.id,
      type: 'SUBMITTED',
      statement: 'Submitted',
      officialName: 'Secretary General A',
    });
    await service.appendRecordClaimEntry({
      championshipId: CHAMPIONSHIP_ID,
      claimId: claim.id,
      type: 'TECHNICAL_COMMITTEE_VERIFIED',
      statement: 'Verified',
      officialName: 'Technical Committee A',
      reference: 'TC-2026-002',
    });
    await expect(
      service.appendRecordClaimEntry({
        championshipId: CHAMPIONSHIP_ID,
        claimId: claim.id,
        type: 'VOID',
        statement: 'Official correction required',
        officialName: 'Technical Committee A',
      }),
    ).rejects.toThrow('formal correction or withdrawal reference');

    workspace = await service.appendRecordClaimEntry({
      championshipId: CHAMPIONSHIP_ID,
      claimId: claim.id,
      type: 'VOID',
      statement: 'Official correction required',
      officialName: 'Technical Committee A',
      reference: 'TC-CORRECTION-2026-001',
    });
    expect(workspace.recordClaims[0]?.status).toBe('VOID');

    workspace = await create();
    expect(workspace.recordClaims).toHaveLength(2);
    expect(workspace.recordClaims[1]).toMatchObject({ status: 'DRAFT', resultBasis: 'RECOGNIZED_NO_FINAL_TOTAL' });
  });

  it('excludes results and blocks certification when the Official publication is stale', async () => {
    const { service, snapshotState } = setup();
    snapshotState.revision = 'b'.repeat(64);

    let workspace = await service.getWorkspace(CHAMPIONSHIP_ID);
    expect(workspace.eligibleRecordResults).toEqual([]);

    workspace = await appointCertifiers(service);
    workspace = await service.generateBook(CHAMPIONSHIP_ID, 'Results Officer A');
    expect(workspace.books[0]?.findings).toContain(
      'Event 10m Air Rifle Women Official publication does not match the current result revision',
    );
  });

  it('excludes results and blocks the Results Book when an Official result is under review', async () => {
    const { service, snapshotState } = setup();
    snapshotState.publicationIssues = ['Irregular shot case is unresolved'];

    let workspace = await service.getWorkspace(CHAMPIONSHIP_ID);
    expect(workspace.eligibleRecordResults).toEqual([]);

    workspace = await appointCertifiers(service);
    workspace = await service.generateBook(CHAMPIONSHIP_ID, 'Results Officer A');
    expect(workspace.books[0]?.findings).toContain(
      'Event 10m Air Rifle Women result projection is unavailable: Official result has current publication blockers: Irregular shot case is unresolved',
    );
  });
});
