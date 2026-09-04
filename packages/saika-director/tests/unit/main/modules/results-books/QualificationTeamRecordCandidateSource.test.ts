import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type IResultsBookQualificationTeamSource,
  type IResultsBookResultSnapshotSource,
  QualificationTeamRecordCandidateSource,
} from '@/main/modules/results-books';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const OFFICIAL_REVISION = 'a'.repeat(64);

describe('QualificationTeamRecordCandidateSource', () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  function setup() {
    database = new Database(':memory:');
    database.exec(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        championship_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      )
    `);
    database
      .prepare('INSERT INTO events (id, championship_id, name, sort_order) VALUES (?, ?, ?, ?)')
      .run(EVENT_ID, CHAMPIONSHIP_ID, '10m Air Rifle Women', 1);
    const revisions = [OFFICIAL_REVISION, OFFICIAL_REVISION];
    const snapshots: IResultsBookResultSnapshotSource = {
      load: vi.fn(async (eventId, resultScope) => {
        const snapshotRevision = revisions.shift() ?? OFFICIAL_REVISION;
        return {
          eventId,
          resultScope,
          snapshotRevision,
          officialPublicationRevision: snapshotRevision,
          publicationIssues: [],
          results: [],
        };
      }),
    };
    const team = {
      rank: 1,
      teamId: 'JPN-WOMEN-A',
      teamName: 'Japan',
      nationCode: 'JPN',
      eligible: true,
      totalScore: 1888.6,
      members: [
        member('33333333-3333-4333-8333-333333333331', 'Aiko Sato', 632.4),
        member('33333333-3333-4333-8333-333333333332', 'Mei Ito', 629.1),
        member('33333333-3333-4333-8333-333333333333', 'Yui Abe', 627.1),
      ],
    };
    const teams: IResultsBookQualificationTeamSource = {
      getQualification: vi.fn(async () => [team]),
    };
    return {
      source: new QualificationTeamRecordCandidateSource(database, teams, snapshots),
      revisions,
      snapshots,
      team,
    };
  }

  it('derives a stable Team result id and an immutable revision from a current Official result', async () => {
    const { source, snapshots, team } = setup();

    const first = await source.eligibleRecordResults(CHAMPIONSHIP_ID);
    const second = await source.eligibleRecordResults(CHAMPIONSHIP_ID);

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      eventId: EVENT_ID,
      resultScope: 'QUALIFICATION',
      subjectKind: 'TEAM',
      subjectId: 'JPN-WOMEN-A',
      subjectName: 'Japan',
      nationCode: 'JPN',
      entryStatus: 'COMPETING',
      scoreX10: 18886,
      members: [
        {
          participantId: '33333333-3333-4333-8333-333333333331',
          playerName: 'Aiko Sato',
          scoreX10: 6324,
        },
        {
          participantId: '33333333-3333-4333-8333-333333333332',
          playerName: 'Mei Ito',
          scoreX10: 6291,
        },
        {
          participantId: '33333333-3333-4333-8333-333333333333',
          playerName: 'Yui Abe',
          scoreX10: 6271,
        },
      ],
    });
    expect(first[0]?.resultId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first[0]?.snapshotRevision).toMatch(/^[0-9a-f]{64}$/);
    expect(second[0]).toEqual(first[0]);
    expect(snapshots.load).toHaveBeenCalledTimes(4);

    team.members.reverse();
    const reordered = await source.eligibleRecordResults(CHAMPIONSHIP_ID);
    expect(reordered[0]?.snapshotRevision).toBe(first[0]?.snapshotRevision);

    team.teamName = 'Japan A';
    const changed = await source.eligibleRecordResults(CHAMPIONSHIP_ID);
    expect(changed[0]?.resultId).toBe(first[0]?.resultId);
    expect(changed[0]?.snapshotRevision).not.toBe(first[0]?.snapshotRevision);
  });

  it('omits Team candidates when the Official result changes during aggregation', async () => {
    const { source, revisions } = setup();
    revisions.splice(0, revisions.length, OFFICIAL_REVISION, 'b'.repeat(64));

    await expect(source.eligibleRecordResults(CHAMPIONSHIP_ID)).resolves.toEqual([]);
  });

  it('defensively rejects a malformed Team result from a replaceable source', async () => {
    const { source, team } = setup();
    team.members.pop();

    await expect(source.eligibleRecordResults(CHAMPIONSHIP_ID)).resolves.toEqual([]);
  });

  it('requires three distinct athlete identities in a Team candidate', async () => {
    const { source, team } = setup();
    team.members[2]!.participantId = team.members[0]!.participantId;

    await expect(source.eligibleRecordResults(CHAMPIONSHIP_ID)).resolves.toEqual([]);
  });
});

function member(participantId: string, playerName: string, totalScore: number) {
  return {
    participantId,
    playerName,
    familyName: playerName.split(' ').at(-1) ?? playerName,
    nationCode: 'JPN',
    gender: 'F',
    entryStatus: 'COMPETING',
    totalScore,
    classificationCode: null,
    decisionCount: 0,
  };
}
