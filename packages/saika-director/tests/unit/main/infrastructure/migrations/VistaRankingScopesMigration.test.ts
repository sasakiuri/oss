// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';

import { migratedDatabase } from '../../../../helpers/database';

// Snapshots as Director 0.4 stored them before migration 88. Builders list keys in schema order, so
// JSON.stringify of an expected value reproduces the exact bytes the migration writes.
function participant(id: string, name: string | null, total: number) {
  return {
    id,
    laneId: `lane-${id}`,
    laneName: `Lane ${id}`,
    name,
    affiliation: name ? 'Club' : null,
    assignmentRevision: `assignment-${id}`,
    status: 'Match',
    dataState: 'live',
    total,
    shotCount: 1,
    currentStage: 1,
    currentSeries: 0,
    mode: 'match',
    series: [{ stage: 1, index: 0, total }],
    shots: [
      {
        id: `shot-${id}`,
        sequence: 1,
        x: 1.25,
        y: -0.5,
        score: total,
        mode: 'match',
        stage: 1,
        series: 0,
        recorded: true,
        corrected: false,
      },
    ],
    historyComplete: true,
    clock: null,
  };
}

function snapshot(revision: number, ranking: unknown) {
  return {
    protocolVersion: 1,
    sourceId: 'director-1',
    subjectId: 'competition-1:relay',
    generation: 'generation-1',
    revision,
    capturedAt: 1_789_000_000_000,
    label: 'Relay 1',
    phase: 'MATCH',
    finished: false,
    definition: {
      id: 'definition-br60s',
      fingerprint: 'fingerprint-1',
      eventCode: 'BR60S',
      name: 'Beam Rifle 60 Shots',
      scoring: 'DECIMAL',
      target: {
        profileId: 'beam-rifle',
        unit: 'mm',
        origin: 'center',
        xDirection: 'right',
        yDirection: 'up',
        rings: [
          { score: 10, diameter: 0.5 },
          { score: 9, diameter: 5.5 },
        ],
        blackDiameter: 30.5,
        outerDiameter: 45.5,
        shotDiameter: 4.5,
      },
      stages: [
        { name: 'Sighting', scored: false, seriesShots: [] },
        { name: 'Match', scored: true, seriesShots: [10, 10] },
      ],
    },
    participants: [participant('p1', 'Athlete One', 10.4), participant('p2', null, 9.8)],
    clock: {
      generation: 'clock-1',
      revision: 2,
      label: 'Match',
      state: 'running',
      remainingMs: 1_000,
      sampledAt: 1_789_000_000_000,
    },
    ranking,
  };
}

/** Adds fields the snapshot schema does not know; the migration drops them. */
function withUnknownFields(value: ReturnType<typeof snapshot>) {
  const legacy = structuredClone(value) as ReturnType<typeof snapshot> & Record<string, unknown>;
  legacy.legacyField = true;
  legacy.eventRanking = { stale: true };
  Object.assign(legacy.definition.target, { legacyTargetField: 'dropped' });
  Object.assign(legacy.participants[0]!, { legacyParticipantField: 1 });
  Object.assign(legacy.participants[0]!.shots[0]!, { legacyShotField: 'dropped' });
  Object.assign(legacy.participants[0]!.series[0]!, { legacySeriesField: 'dropped' });
  Object.assign(legacy.definition.stages[1]!, { legacyStageField: 'dropped' });
  Object.assign(legacy.clock, { legacyClockField: 'dropped' });
  const ranking = legacy.ranking as { rows: object[] } | null;
  if (ranking) {
    Object.assign(ranking, { legacyRankingField: 'dropped' });
    Object.assign(ranking.rows[0]!, { legacyRowField: 'dropped' });
  }
  return legacy;
}

const eventRanking = {
  scope: 'Event',
  kind: 'competition',
  revision: 'event-3',
  state: 'OFFICIAL',
  rows: [{ id: 'p1', rank: 1, name: 'Athlete One', affiliation: 'Club', total: 10.4, classification: 'Q' }],
};
const liveRanking = {
  scope: 'Relay',
  kind: 'live',
  revision: 'live-1',
  state: 'UNVERIFIED',
  rows: [{ id: 'p2', rank: null, name: 'Lane p2', affiliation: null, total: 9.8, classification: null }],
};

describe('migration 88 (vista_ranking_scopes) on a version 87 database', () => {
  let database: Database.Database;
  afterEach(() => database.close());

  function insert(id: string, snapshotJson: string | null, revision: number) {
    database
      .prepare('INSERT INTO vista_competition_sources (id, source_json, snapshot_json, revision) VALUES (?, ?, ?, ?)')
      .run(id, JSON.stringify({ id }), snapshotJson, revision);
  }
  function migrate() {
    new MigrationRunner(database).run(allMigrations.filter((migration) => migration.version <= 88));
  }
  function rows() {
    return database
      .prepare('SELECT id, source_json, snapshot_json, revision FROM vista_competition_sources ORDER BY id')
      .all();
  }

  it('writes exactly the pinned rows', () => {
    database = migratedDatabase(87);
    insert('competition-ranked', JSON.stringify(withUnknownFields(snapshot(7, eventRanking))), 5);
    insert('live-ranked', JSON.stringify(withUnknownFields(snapshot(3, liveRanking))), 9);
    insert('not-captured', null, 2);
    insert('unranked', JSON.stringify(snapshot(4, null)), 4);

    migrate();

    expect(rows()).toEqual([
      {
        id: 'competition-ranked',
        source_json: '{"id":"competition-ranked"}',
        snapshot_json: JSON.stringify({
          ...snapshot(8, {
            scope: 'Relay 1 · current competition only',
            kind: 'live',
            revision: 'vista-scopes:8',
            state: 'UNVERIFIED',
            rows: [
              { id: 'p1', rank: null, name: 'Athlete One', affiliation: 'Club', total: 10.4, classification: 'Q' },
              { id: 'p2', rank: null, name: 'Lane p2', affiliation: null, total: 9.8, classification: null },
            ],
          }),
          eventRanking,
        }),
        revision: 8,
      },
      {
        id: 'live-ranked',
        source_json: '{"id":"live-ranked"}',
        snapshot_json: JSON.stringify({ ...snapshot(10, liveRanking), eventRanking: null }),
        revision: 10,
      },
      { id: 'not-captured', source_json: '{"id":"not-captured"}', snapshot_json: null, revision: 2 },
      {
        id: 'unranked',
        source_json: '{"id":"unranked"}',
        snapshot_json: JSON.stringify({ ...snapshot(5, null), eventRanking: null }),
        revision: 5,
      },
    ]);
  });

  it('rejects a stored snapshot the schema refuses and leaves the database at version 87', () => {
    database = migratedDatabase(87);
    const duplicate = snapshot(1, null);
    duplicate.participants.push(participant('p1', 'Athlete One', 10.4));
    const stored = JSON.stringify(duplicate);
    insert('duplicate-participant', stored, 1);

    expect(migrate).toThrow('Duplicate participant');
    expect(new MigrationRunner(database).getCurrentVersion()).toBe(87);
    expect(rows()).toEqual([
      {
        id: 'duplicate-participant',
        source_json: '{"id":"duplicate-participant"}',
        snapshot_json: stored,
        revision: 1,
      },
    ]);
  });

  type StoredSnapshot = ReturnType<typeof snapshot>;
  it.each<[string, (value: StoredSnapshot) => void]>([
    [
      'Series is outside the selected definition',
      (value) => {
        value.participants[0]!.series[0]!.index = 2;
      },
    ],
    [
      'Stage is outside the selected definition',
      (value) => {
        value.participants[0]!.currentStage = 5;
      },
    ],
    [
      'Shot score must be an integer from 0 to 10 for RING scoring',
      (value) => {
        value.definition.scoring = 'RING';
      },
    ],
    [
      'Shot score must use at most one decimal place for DECIMAL scoring',
      (value) => {
        value.participants[0]!.shots[0]!.score = 10.45;
      },
    ],
    [
      'Coordinates must both be present or absent',
      (value) => {
        (value.participants[0]!.shots[0]! as { x: number | null }).x = null;
      },
    ],
    [
      'Duplicate shot',
      (value) => {
        value.participants[0]!.shots.push(structuredClone(value.participants[0]!.shots[0]!));
      },
    ],
    [
      'Duplicate result row',
      (value) => {
        value.ranking = { ...liveRanking, rows: [liveRanking.rows[0], liveRanking.rows[0]] };
      },
    ],
    [
      'Duplicate target ring',
      (value) => {
        value.definition.target.rings[1]!.score = 10;
      },
    ],
    [
      'Target rings and black area must fit the declared face',
      (value) => {
        value.definition.target.blackDiameter = 50;
      },
    ],
  ])('rejects a stored snapshot with "%s" and leaves it unchanged', (message, corrupt) => {
    database = migratedDatabase(87);
    const invalid = snapshot(1, null);
    corrupt(invalid);
    const stored = JSON.stringify(invalid);
    insert('invalid', stored, 1);

    expect(migrate).toThrow(message);
    expect(new MigrationRunner(database).getCurrentVersion()).toBe(87);
    expect(rows()).toEqual([{ id: 'invalid', source_json: '{"id":"invalid"}', snapshot_json: stored, revision: 1 }]);
  });
});
