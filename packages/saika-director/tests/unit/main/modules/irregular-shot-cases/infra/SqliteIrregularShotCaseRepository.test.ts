// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  IrregularShotCase,
  IrregularShotCaseEntry,
  IrregularShotEvidence,
  SqliteIrregularShotCaseRepository,
} from '@/main/modules/irregular-shot-cases';
import type { CompetitionShotObservation } from '@/main/modules/mqtt';

import { migratedDatabase, seedChampionship, seedEvent } from '../../../../../helpers/database';

const CHAMPIONSHIP_ID = '00000000-0000-4000-8000-000000000001';
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITION_ID = '22222222-2222-4222-8222-222222222222';
const SUBJECT_LANE = '33333333-3333-4333-8333-333333333333';
const ADJACENT_LANE = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '88888888-8888-4888-8888-888888888888';

function observation(
  id: string,
  laneId: string,
  firedAt: string,
  effectiveScoreX10: number,
): CompetitionShotObservation {
  return {
    id,
    competitionId: COMPETITION_ID,
    laneId,
    sessionId: SESSION_ID,
    shotId: `shot-${id.slice(-1)}`,
    sourceObservationId: null,
    x: 1,
    y: 2,
    legacyRawScoreX10: effectiveScoreX10,
    deviceScoreX10: effectiveScoreX10,
    calculatedScoreX10: effectiveScoreX10,
    calculatedScoreAvailable: true,
    effectiveScoreX10,
    targetProfileId: null,
    scoringGaugeProfileId: null,
    innerTen: false,
    mode: 'MATCH',
    firedAt: new Date(firedAt),
    receivedAt: new Date(new Date(firedAt).getTime() + 30),
    stageIndex: 1,
    scored: true,
    seriesIndex: 0,
    shotNumberInSeries: 2,
    isRecorded: true,
    isReplay: false,
    publishedAt: new Date(firedAt),
    observedAt: new Date(firedAt),
    payloadJson: '{}',
  };
}

describe('SqliteIrregularShotCaseRepository', () => {
  let db: Database.Database;
  let repository: SqliteIrregularShotCaseRepository;

  beforeEach(() => {
    db = migratedDatabase();
    db.pragma('foreign_keys = ON');
    seedChampionship(db, { id: CHAMPIONSHIP_ID, name: 'Championship', date: '2026-11-28', venue: 'Range' });
    seedEvent(db, {
      id: EVENT_ID,
      championship_id: CHAMPIONSHIP_ID,
      name: '10m Air Rifle Men',
      event_type: 'AR60',
      round: 'Qualification',
      sort_order: 0,
    });
    repository = new SqliteIrregularShotCaseRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function appendCase(kind: 'CROSS_FIRE' | 'EXCESS_SHOTS', occurredAt: string): IrregularShotCase {
    const value = IrregularShotCase.create({
      eventId: EVENT_ID,
      competitionId: COMPETITION_ID,
      resultScope: 'QUALIFICATION',
      kind,
      subjectLaneId: SUBJECT_LANE,
      adjacentLaneIds: kind === 'CROSS_FIRE' ? [ADJACENT_LANE] : [],
      windowStartAt: new Date('2026-11-28T09:00:00.000Z'),
      windowEndAt: new Date('2026-11-28T09:00:10.000Z'),
      summary: `${kind} on the subject target`,
      openedBy: 'RTS Jury A',
      occurredAt: new Date(occurredAt),
    });
    repository.appendCase(value);
    return value;
  }

  it('groups persisted evidence and entries by case and leaves cases without records empty', () => {
    const crossFire = appendCase('CROSS_FIRE', '2026-11-28T09:00:05.000Z');
    const excess = appendCase('EXCESS_SHOTS', '2026-11-28T09:01:00.000Z');

    repository.appendEvidence(
      IrregularShotEvidence.fromObservation({
        caseId: crossFire.id,
        relation: 'SUBJECT',
        observation: observation('99999999-9999-4999-8999-999999999991', SUBJECT_LANE, '2026-11-28T09:00:03.000Z', 104),
        officialName: 'RTS Jury A',
        recordedAt: new Date('2026-11-28T09:02:00.000Z'),
      }),
    );
    repository.appendEvidence(
      IrregularShotEvidence.fromObservation({
        caseId: crossFire.id,
        relation: 'POSSIBLE_SOURCE',
        observation: observation('99999999-9999-4999-8999-999999999992', ADJACENT_LANE, '2026-11-28T09:00:03.500Z', 0),
        statement: 'Adjacent athlete fired at the same time.',
        officialName: 'RTS Jury A',
        recordedAt: new Date('2026-11-28T09:02:01.000Z'),
      }),
    );
    repository.appendEntry(
      IrregularShotCaseEntry.create({
        caseId: crossFire.id,
        type: 'REFERRED',
        statement: 'Referred to the Jury.',
        officialName: 'CRO',
        recordedAt: new Date('2026-11-28T09:03:00.000Z'),
      }),
    );
    repository.appendEntry(
      IrregularShotCaseEntry.create({
        caseId: excess.id,
        type: 'NOTE',
        statement: 'Athlete informed.',
        officialName: 'CRO',
        ruleReference: 'ISSF 6.11.5',
        recordedAt: new Date('2026-11-28T09:03:30.000Z'),
      }),
    );

    const evidence = repository.findEvidence([crossFire.id, excess.id]);
    const entries = repository.findEntries([crossFire.id, excess.id]);

    expect(
      evidence.get(crossFire.id)?.map((item) => [item.relation, item.laneId, item.effectiveScoreX10, item.statement]),
    ).toEqual([
      ['SUBJECT', SUBJECT_LANE, 104, expect.any(String)],
      ['POSSIBLE_SOURCE', ADJACENT_LANE, 0, 'Adjacent athlete fired at the same time.'],
    ]);
    expect(evidence.get(crossFire.id)?.[0]?.firedAt).toEqual(new Date('2026-11-28T09:00:03.000Z'));
    expect(evidence.get(excess.id) ?? []).toEqual([]);
    expect(entries.get(crossFire.id)?.map((entry) => [entry.type, entry.statement])).toEqual([
      ['REFERRED', 'Referred to the Jury.'],
    ]);
    expect(entries.get(excess.id)?.map((entry) => [entry.type, entry.ruleReference])).toEqual([
      ['NOTE', 'ISSF 6.11.5'],
    ]);
    expect(repository.findCasesByEvent(EVENT_ID).map((value) => [value.kind, value.adjacentLaneIds])).toEqual([
      ['CROSS_FIRE', [ADJACENT_LANE]],
      ['EXCESS_SHOTS', []],
    ]);
  });
});
