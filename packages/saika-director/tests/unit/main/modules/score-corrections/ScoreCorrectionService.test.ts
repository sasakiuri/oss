import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migration069ScoreCorrections } from '@/main/infrastructure/database/migrations/069_score_corrections';
import type { ScoreCorrectionBasis } from '@/main/modules/results';
import { ScoreCorrectionService } from '@/main/modules/score-corrections';
import type { ScoreCorrectionRequest } from '@/main/modules/score-corrections/domain/ScoreCorrection';
import { SqliteScoreCorrectionRepository } from '@/main/modules/score-corrections/infra/SqliteScoreCorrectionRepository';

const databases: Database.Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function fixture(scoring: 'RING' | 'DECIMAL' | 'HIT_MISS' = 'RING') {
  const db = new Database(':memory:');
  databases.push(db);
  migration069ScoreCorrections.up(db);
  let basis: ScoreCorrectionBasis = {
    resultId: 'result',
    eventId: 'event',
    participantId: 'athlete',
    resultScope: 'QUALIFICATION',
    relayNumber: 1,
    competitionId: 'competition',
    sourceRevision: 'source-v1',
    seriesShotCounts: [5, 5],
    issues: [],
    shots: Array.from({ length: 10 }, (_, index) => ({
      scoreX10: scoring === 'HIT_MISS' ? 10 : 90,
      ranking: {
        shotId: `shot-${index}`,
        ringScore: scoring === 'HIT_MISS' ? 1 : 9,
        decimalScore: null,
        innerTen: null,
        seriesIndex: Math.floor(index / 5),
      },
    })),
  };
  let caseRevision = 'jury-v1';
  const repository = new SqliteScoreCorrectionRepository(db);
  const service = new ScoreCorrectionService(
    repository,
    { resolve: () => ({ basis, scoring }) },
    {
      list: () => [],
      revision: (caseId, decisionId) => {
        if (caseId !== 'case' || decisionId !== 'decision') throw new Error('Jury decision not linked');
        return caseRevision;
      },
    },
    () => new Date('2026-09-07T00:00:00Z'),
  );
  const request: ScoreCorrectionRequest = {
    resultId: 'result',
    resultScope: 'QUALIFICATION',
    caseId: 'case',
    decisionId: 'decision',
    officialName: 'Jury A',
    statement: 'Control sheet and independent EST record reviewed',
    changes: [
      {
        operation: 'INSERT_MISSING',
        shotIndex: 3,
        scoreX10: scoring === 'HIT_MISS' ? 0 : 100,
        decimalScore: null,
        innerTen: null,
        sourceShotId: 'recovered-shot',
        evidenceReference: 'IR 12, independent record 4',
      },
    ],
  };
  return {
    db,
    repository,
    service,
    request,
    basis: () => basis,
    changeSource: () => {
      basis = { ...basis, sourceRevision: 'source-v2' };
    },
    changeJury: () => {
      caseRevision = 'jury-v2';
    },
  };
}

describe('ScoreCorrectionService', () => {
  it('inserts a missing shot, shifts series membership and excludes only the final slot without rewriting source', () => {
    const f = fixture();
    const source = structuredClone(f.basis());
    const preview = f.service.preview(f.request);
    expect(preview.shots.map((shot) => shot.ranking.shotId)).toEqual([
      'shot-0',
      'shot-1',
      'shot-2',
      'recovered-shot',
      'shot-3',
      'shot-4',
      'shot-5',
      'shot-6',
      'shot-7',
      'shot-8',
    ]);
    expect(preview.shots[5]!.ranking.seriesIndex).toBe(1);
    expect(preview.shots[3]!.ranking).toMatchObject({ decimalScore: null, innerTen: null });
    const input = { id: 'application', request: f.request, expectedDigest: preview.digest, confirmed: true as const };
    const saved = f.service.apply(input);
    expect(f.service.apply(input)).toEqual(saved);
    expect(f.repository.list(f.basis())).toHaveLength(1);
    expect(f.service.project(f.basis()).shots).toEqual(preview.shots);
    expect(f.basis()).toEqual(source);
    expect(() => f.service.preview(f.request)).toThrow(/Withdraw/);
    expect(() => f.service.apply({ ...input, request: { ...f.request, statement: 'Changed' } })).toThrow(
      /different evidence/,
    );
    expect(() => f.db.exec('DELETE FROM score_corrections')).toThrow(/append-only/);
    expect(() => f.db.exec("UPDATE score_corrections SET snapshot_json = '{}' ")).toThrow(/append-only/);
    const withdrawal = {
      id: 'withdrawal',
      applicationId: saved.id,
      officialName: 'Jury B',
      statement: 'New evidence requires reconsideration',
    };
    f.service.withdraw(withdrawal);
    expect(f.service.withdraw(withdrawal)).toMatchObject(withdrawal);
    expect(f.service.project(f.basis())).toMatchObject({ shots: source.shots, ids: [], issues: [] });
    expect(f.service.workspace(f.request).history).toHaveLength(1);
    expect(() => f.db.exec('DELETE FROM score_correction_withdrawals')).toThrow(/append-only/);
    expect(f.service.preview(f.request).digest).toBe(preview.digest);
  });

  it.each(['source', 'jury'] as const)(
    'rejects a stale %s preview and suspends an already applied correction',
    (kind) => {
      const f = fixture();
      const preview = f.service.preview(f.request);
      const input = { id: 'application', request: f.request, expectedDigest: preview.digest, confirmed: true as const };
      const change = kind === 'source' ? f.changeSource : f.changeJury;
      change();
      expect(() => f.service.apply(input)).toThrow(/changed/);
      const current = f.service.preview(f.request);
      f.service.apply({ ...input, expectedDigest: current.digest });
      const replacedBasis = { ...f.basis(), resultId: 'reimported-result' };
      const projection = f.service.project(replacedBasis);
      expect(projection.shots).toEqual(replacedBasis.shots);
      expect(projection.ids).toEqual(['application']);
      expect(projection.issues[0]).toMatch(/changed/);
    },
  );

  it('invalidates applied evidence when the current Jury decision changes', () => {
    const f = fixture();
    const preview = f.service.preview(f.request);
    f.service.apply({ id: 'application', request: f.request, expectedDigest: preview.digest, confirmed: true });
    f.changeJury();
    expect(f.service.project(f.basis())).toMatchObject({
      shots: f.basis().shots,
      issues: [expect.stringMatching(/changed/)],
    });
  });

  it('requires explicit evidence and rejects double counting, incompatible decimal and inner-ten values', () => {
    const f = fixture();
    const change = f.request.changes[0]!;
    const preview = (patch: Partial<typeof change>) =>
      f.service.preview({ ...f.request, changes: [{ ...change, ...patch }] });
    expect(() => preview({ evidenceReference: ' ' })).toThrow(/evidence reference/);
    expect(() => preview({ sourceShotId: 'shot-0' })).toThrow(/counted twice/);
    expect(() => preview({ scoreX10: 99 })).toThrow(/scoring mode/);
    expect(() => preview({ decimalScore: 9.9 })).toThrow(/conflicts/);
    expect(() => preview({ scoreX10: 90, innerTen: true })).toThrow(/Only a ten/);
    expect(() => f.service.preview({ ...f.request, decisionId: 'unlinked' })).toThrow(/not linked/);
    expect(preview({ decimalScore: 10.7, innerTen: true }).shots[3]!.ranking).toMatchObject({
      decimalScore: 10.7,
      decimalScoreSource: 'DEVICE',
      innerTen: true,
    });
  });

  it('supports hit/miss finals without fabricating decimal evidence', () => {
    const f = fixture('HIT_MISS');
    const change = f.request.changes[0]!;
    expect(f.service.preview(f.request).shots[3]!.scoreX10).toBe(0);
    expect(() => f.service.preview({ ...f.request, changes: [{ ...change, scoreX10: 20 }] })).toThrow(/scoring mode/);
    expect(() => f.service.preview({ ...f.request, changes: [{ ...change, innerTen: false }] })).toThrow(
      /must not invent/,
    );
  });
});
