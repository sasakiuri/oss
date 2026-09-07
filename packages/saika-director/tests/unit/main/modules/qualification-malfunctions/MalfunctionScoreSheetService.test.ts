// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ISSF_2026_RFPM,
  ISSF_2026_STDP,
  ISSF_2026_P25,
  ISSF_2026_CFP,
  assessQualificationMalfunctionClaim,
  type RulePack,
} from '@sasakiuri/saika-rules';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  QualificationMalfunctionCase,
  QualificationMalfunctionEntry,
  SqliteQualificationMalfunctionRepository,
} from '@/main/modules/qualification-malfunctions';
import { MalfunctionScoreSheetService } from '@/main/modules/qualification-malfunctions/application/MalfunctionScoreSheetService';
import type {
  MalfunctionScoreSheetInput,
  MalfunctionScoreEvidence,
} from '@/main/modules/qualification-malfunctions/domain/MalfunctionScoreSheet';
import { SqliteMalfunctionScoreSheetRepository } from '@/main/modules/qualification-malfunctions/infra/SqliteMalfunctionScoreSheetRepository';
import { renderMalfunctionScoreSheetHtml } from '@/main/modules/qualification-malfunctions/domain/renderMalfunctionScoreSheetHtml';
import { SqliteCompetitionEvidenceSource } from '@/main/modules/operational-archives';
import { qualificationMalfunctionsContract } from '@/shared/ipc/contracts';

const championshipId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const participantId = '33333333-3333-4333-8333-333333333333';
const competitionId = '44444444-4444-4444-8444-444444444444';
const laneId = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-09-07T01:00:00.000Z');
let database: Database.Database;
afterEach(() => database?.close());

function setup(pack: RulePack = ISSF_2026_RFPM, recordedShots = 2, nonAllowable = false) {
  database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  const runner = new MigrationRunner(database);
  runner.run(allMigrations.filter((migration) => migration.version <= 63));
  database
    .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
    .run(championshipId, 'Championship', '2026-09-07', 'Range');
  database
    .prepare('INSERT INTO events (id, championship_id, name, event_type, round, sort_order) VALUES (?, ?, ?, ?, ?, 0)')
    .run(eventId, championshipId, '25m', 'RFPM', 'Qualification');
  database
    .prepare(
      "INSERT INTO participants (id, event_id, player_name, affiliation, sort_order, start_number, gender, entry_status) VALUES (?, ?, ?, '', 0, '101', 'M', 'COMPETING')",
    )
    .run(participantId, eventId, 'Athlete A');
  const cases = new SqliteQualificationMalfunctionRepository(database);
  const policy = pack.capabilities.qualificationMalfunction!;
  const stage = policy.stages[0]!;
  const value = QualificationMalfunctionCase.create({
    competitionId,
    eventId,
    competitionTypeId: 'RFPM',
    policySnapshot: policy,
    participantId,
    participantNameSnapshot: 'Athlete A',
    laneId,
    laneChannelSnapshot: 7,
    relayNumberSnapshot: 1,
    reportSource: 'DIRECTOR_MANUAL',
    claimMode: 'CLAIM',
    phase: 'MATCH',
    stageId: stage.stageId,
    stageIndex: 1,
    seriesIndex: 0,
    seriesShotLimit: 5,
    recordedShots,
    existingClaimsInScope: 0,
    claimAssessment: assessQualificationMalfunctionClaim(policy, { phase: 'MATCH', existingClaimsInScope: 0 }),
    summary: 'Projectile lodged',
    openedBy: 'RO A',
    occurredAt: now,
    createdAt: now,
  });
  cases.appendCase(value);
  const append = (
    input: Partial<Parameters<typeof QualificationMalfunctionEntry.create>[0]> & {
      type: QualificationMalfunctionEntry['type'];
    },
  ) => {
    const entry = QualificationMalfunctionEntry.create({
      caseId: value.id,
      statement: 'Official confirmation',
      officialName: 'RO A',
      officialRole: 'RANGE_OFFICER',
      occurredAt: now,
      recordedAt: now,
      ...input,
    });
    cases.appendEntry(entry);
    return entry;
  };
  append({ type: 'INSPECTION_RECORDED' });
  append({
    type: 'CLASSIFIED',
    classification: nonAllowable ? 'NON_ALLOWABLE' : 'ALLOWABLE',
    causeCode: policy.causes.find((cause) => cause.classification === (nonAllowable ? 'NON_ALLOWABLE' : 'ALLOWABLE'))!
      .code,
  });
  append({
    type: 'REMEDY_AUTHORIZED',
    remedy: nonAllowable ? 'SCORE_UNFIRED_AS_MISS' : stage.allowableTreatment.type,
    shotsToFire: nonAllowable ? 0 : stage.allowableTreatment.type === 'REPEAT_FULL_SERIES' ? 5 : 5 - recordedShots,
  });
  append({ type: 'EXECUTION_RECORDED', artifactId: 'signed-execution-record:7' });
  runner.run(allMigrations);
  expect(cases.findCaseById(value.id)?.recordedShots).toBe(recordedShots);
  const sheets = new SqliteMalfunctionScoreSheetRepository(database);
  const exporter = { export: vi.fn().mockResolvedValue({ status: 'CANCELLED' }) };
  const service = new MalfunctionScoreSheetService(cases, sheets, exporter, () => now);
  const input: MalfunctionScoreSheetInput = {
    caseId: value.id,
    original: [shot('o1', 9, 0), shot('o2', 10, 1)],
    recovery: [shot('r1', 10, 0), shot('r2', 8, 1), shot('r3', 9, 2), shot('r4', 7, 3), shot('r5', 10, 4)],
    officialName: 'RTS A',
    officialRole: 'RTS_OFFICER',
    statement: 'Compared with independent EST printouts and confirmed target mapping.',
  };
  return { cases, sheets, exporter, service, value, input, append };
}
function shot(id: string, score: number, targetIndex?: number): MalfunctionScoreEvidence {
  return {
    shotId: id,
    scoreX10: score * 10,
    evidenceReference: `EST printout / ${id}`,
    outcome: score ? 'HIT' : 'MISS',
    ...(targetIndex === undefined ? {} : { targetIndex }),
  };
}
function withoutTargets(input: MalfunctionScoreSheetInput): MalfunctionScoreSheetInput {
  const remove = ({ targetIndex: _target, ...rest }: MalfunctionScoreEvidence) => rest;
  return { ...input, original: input.original.map(remove), recovery: input.recovery.map(remove) };
}

describe('MalfunctionScoreSheetService', () => {
  it('upgrades existing cases and records RFPM target minima without changing the score or settling the case', async () => {
    const { service, input, cases, exporter } = setup();
    const preview = service.preview(input);
    expect(preview.calculation.countedShots.map((shot) => shot.scoreX10)).toEqual([90, 80, 90, 70, 100]);
    const id = crypto.randomUUID();
    const saved = service.save(input, id, preview.digest);
    expect(saved.calculation).toMatchObject({ totalX10: 430, form: 'RFPM', discardedShotIds: ['o2', 'r1'] });
    const retry = new MalfunctionScoreSheetService(
      cases,
      new SqliteMalfunctionScoreSheetRepository(database),
      exporter,
      () => now,
    );
    expect(retry.save(input, id, preview.digest)).toEqual(saved);
    expect(service.list(input.caseId)).toHaveLength(1);
    expect(cases.findEntries([input.caseId]).get(input.caseId)?.at(-1)?.type).toBe('NOTE');
    expect(() => service.save({ ...input, statement: 'changed' }, id, preview.digest)).toThrow('different evidence');
    expect(() => service.save({ ...input, statement: 'changed' }, crypto.randomUUID(), preview.digest)).toThrow(
      'preview and confirm',
    );
    await service.export(id);
    expect(exporter.export).toHaveBeenCalledWith(saved);
    const sections = new SqliteCompetitionEvidenceSource(database).collect(championshipId);
    expect(sections.find((section) => section.id === 'qualification-malfunction-score-sheets')?.records).toHaveLength(
      1,
    );
    expect(() =>
      database.prepare('UPDATE qualification_malfunction_score_sheets SET version = 2 WHERE id = ?').run(id),
    ).toThrow('append-only');
    expect(() => database.prepare('DELETE FROM qualification_malfunction_score_sheets WHERE id = ?').run(id)).toThrow(
      'append-only',
    );
  });

  it('selects the lowest five STDP values and rejects target-group data in that event', () => {
    const { service, input } = setup(ISSF_2026_STDP);
    expect(() => service.preview(input)).toThrow('must not contain targetIndex');
    const calculation = service.preview(withoutTargets(input)).calculation;
    expect(calculation.countedShots.map((shot) => shot.scoreX10)).toEqual([70, 80, 90, 90, 100]);
    expect(calculation.totalX10).toBe(430);
  });

  it('zero-fills only the row with most fired shots after a documented second malfunction', () => {
    const { service, input } = setup(ISSF_2026_RFPM, 3);
    const second = {
      ...input,
      original: [shot('o1', 9, 0), shot('o2', 10, 1), shot('o3', 8, 2)],
      recovery: [shot('r1', 8, 0)],
      secondMalfunction: { zeroFillRow: 'ORIGINAL' as const, evidenceReference: 'Second inspection IR 3' },
    };
    const calculation = service.preview(second).calculation;
    expect(calculation.countedShots.map((shot) => shot.scoreX10)).toEqual([80, 100, 80, 0, 0]);
    expect(calculation.addedZeros.map((shot) => shot.targetIndex)).toEqual([3, 4]);
    expect(() =>
      service.preview({ ...second, secondMalfunction: { ...second.secondMalfunction, zeroFillRow: 'REPEAT' } }),
    ).toThrow('most recorded shots');
    expect(() => service.preview({ ...second, recovery: [{ ...shot('r1', 0, 0), outcome: 'UNFIRED' }] })).toThrow(
      'fired shots only',
    );
  });

  it.each([ISSF_2026_P25, ISSF_2026_CFP])(
    'combines P25/CFP completion and explicit misses without using the repeat comparison',
    (pack) => {
      const { service, input } = setup(pack);
      const completion = {
        ...withoutTargets(input),
        recovery: [
          shot('r1', 10),
          { ...shot('r2', 0), outcome: 'LATE' as const },
          { ...shot('r3', 0), outcome: 'UNFIRED' as const },
        ],
      };
      expect(service.preview(completion).calculation).toMatchObject({
        form: 'IR',
        combination: 'NORMAL_SERIES',
        totalX10: 290,
        addedZeros: [],
      });
      expect(() => service.preview({ ...completion, recovery: completion.recovery.slice(0, 2) })).toThrow(
        'every remaining shot',
      );
    },
  );

  it('retains fired scores and adds unfired zeros for a non-allowable malfunction without allowing recovery', () => {
    const { service, input } = setup(ISSF_2026_P25, 2, true);
    const noFire = { ...withoutTargets(input), recovery: [] };
    expect(service.preview(noFire).calculation).toMatchObject({ totalX10: 190, form: 'IR' });
    expect(service.preview(noFire).calculation.addedZeros).toHaveLength(3);
    expect(() => service.preview(withoutTargets(input))).toThrow('no refire');
  });

  it('rejects missing or duplicated RFPM target identity and cannot count invalid ring scores', () => {
    const { service, input } = setup();
    expect(() => service.preview(withoutTargets(input))).toThrow('targetIndex');
    expect(() => service.preview({ ...input, original: [shot('o1', 9, 0), shot('o2', 10, 0)] })).toThrow(
      'target indices must be unique',
    );
    expect(() => service.preview({ ...input, original: [shot('o1', 9, 0), shot('o1', 10, 1)] })).toThrow(
      'unique across',
    );
    expect(() => service.preview({ ...input, original: [shot('o1', 9, 0)] })).toThrow('exactly the shots fired');
    expect(() => service.preview({ ...input, original: [shot('o1', 10.1, 0), shot('o2', 10, 1)] })).toThrow(
      'whole-ring',
    );
    expect(() =>
      service.preview({ ...input, recovery: [{ ...shot('late', 9, 0), outcome: 'LATE' }, ...input.recovery.slice(1)] }),
    ).toThrow('must score zero');
    expect(
      qualificationMalfunctionsContract.procedures.previewScoreSheet.input.safeParse({
        ...input,
        recovery: [shot('r', 12, 1)],
      }).success,
    ).toBe(false);
  });

  it('keeps revised calculations as separate versions and prevents new records after settlement or voiding', () => {
    const { service, input, append } = setup();
    const first = service.save(input, crypto.randomUUID(), service.preview(input).digest);
    const changed = { ...input, statement: 'Corrected independent record reference' };
    const second = service.save(changed, crypto.randomUUID(), service.preview(changed).digest);
    expect(second.version).toBe(2);
    expect(service.list(input.caseId)[0]).toEqual(first);
    append({ type: 'SCORE_SETTLED', artifactId: second.id, officialRole: 'RTS_OFFICER' });
    expect(() => service.save(input, crypto.randomUUID(), service.preview(input).digest)).toThrow(
      'official correction',
    );
    append({ type: 'VOID' });
    expect(() => service.preview(input)).toThrow('execution evidence');
  });

  it('exports escaped evidence and preserves the distinction between calculation and score application', () => {
    const { service, input } = setup();
    const hostile = { ...input, statement: '<img src=x onerror=alert(1)>', officialName: '<script>alert(1)</script>' };
    const saved = service.save(hostile, crypto.randomUUID(), service.preview(hostile).digest);
    const html = renderMalfunctionScoreSheetHtml(saved);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=');
    expect(html).toContain('&lt;img');
    expect(html).toContain('does not execute firing or change the competition score');
    expect(html).toContain(saved.digest);
    expect(html).toContain('signed-execution-record:7');
  });
});
