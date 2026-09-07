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
import { EventId, ParticipantId, SqliteEventRepository } from '@/main/modules/championship';
import {
  QualificationMalfunctionCase,
  QualificationMalfunctionEntry,
  SqliteQualificationMalfunctionRepository,
  SqliteMalfunctionScoreSheetRepository,
  qualificationMalfunctionStatus,
  type MalfunctionScoreSheetInput,
} from '@/main/modules/qualification-malfunctions';
import { MalfunctionScoreSheetService } from '@/main/modules/qualification-malfunctions/application/MalfunctionScoreSheetService';
import {
  MalfunctionScoreApplicationService,
  SqliteMalfunctionScoreApplicationRepository,
  ResultMalfunctionScoreTargetSource,
  MalfunctionQualificationScoreOverlaySource,
} from '@/main/modules/malfunction-score-applications';
import type { MalfunctionScoreApplicationRequest } from '@/main/modules/malfunction-score-applications/domain/MalfunctionScoreApplication';
import { Result, ResultId, SqliteResultRepository, QualificationResultsReader } from '@/main/modules/results';
import { ScoringDecision } from '@/main/modules/scoring-decisions/domain/ScoringDecision';
import { SqliteScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import { SqliteCompetitionEvidenceSource } from '@/main/modules/operational-archives';
import { CompetitionTypeRegistry, competitionTypeFromRulePack, IssfStandardStrategy } from '@/shared/competitionTypes';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';

let db: Database.Database;
afterEach(() => db?.close());
function setup(pack: RulePack = ISSF_2026_RFPM, nonAllowable = false) {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  new MigrationRunner(db).run(allMigrations);
  const championshipId = crypto.randomUUID(),
    eventId = crypto.randomUUID(),
    participantId = crypto.randomUUID(),
    competitionId = crypto.randomUUID();
  const definition = competitionTypeFromRulePack(pack);
  const registry = new CompetitionTypeRegistry();
  registry.registerStrategy(new IssfStandardStrategy());
  registry.register(definition);
  const identity = definition.rulePackIdentity!;
  db.prepare('INSERT INTO championships (id,name,date,venue) VALUES (?,?,?,?)').run(
    championshipId,
    'Match',
    '2026-09-07',
    'Range',
  );
  db.prepare(
    `INSERT INTO events (id,championship_id,name,event_type,round,sort_order,rule_pack_id,rule_pack_schema_version,rule_pack_fingerprint_sha256)
    VALUES (?,?,?,?,?,0,?,?,?)`,
  ).run(
    eventId,
    championshipId,
    '25m',
    definition.id,
    'Qualification',
    identity.id,
    identity.schemaVersion,
    identity.fingerprint.value,
  );
  db.prepare("INSERT INTO participants (id,event_id,player_name,affiliation,sort_order) VALUES (?,?,?,'',0)").run(
    participantId,
    eventId,
    'Athlete',
  );
  let tick = 0;
  const now = () => new Date(Date.parse('2026-09-07T01:00:00.000Z') + tick++ * 1000);
  const policy = definition.qualificationMalfunction!;
  const stageIndex = definition.config.stages.reduce(
    (last, stage, index) => (stage.type === 'match' ? index : last),
    -1,
  );
  const stage = definition.config.stages[stageIndex]!;
  const treatment = policy.stages.find((rule) => rule.stageId === stage.id)!.allowableTreatment;
  const cases = new SqliteQualificationMalfunctionRepository(db);
  const value = QualificationMalfunctionCase.create({
    competitionId,
    eventId,
    competitionTypeId: definition.id,
    rulePackIdentity: identity,
    policySnapshot: policy,
    participantId,
    participantNameSnapshot: 'Athlete',
    laneId: crypto.randomUUID(),
    laneChannelSnapshot: 7,
    relayNumberSnapshot: 1,
    reportSource: 'DIRECTOR_MANUAL',
    claimMode: 'CLAIM',
    phase: 'MATCH',
    stageId: stage.id,
    stageIndex,
    seriesIndex: stage.series.length - 1,
    seriesShotLimit: 5,
    recordedShots: 2,
    existingClaimsInScope: 0,
    claimAssessment: assessQualificationMalfunctionClaim(policy, { phase: 'MATCH', existingClaimsInScope: 0 }),
    summary: 'Fault',
    openedBy: 'RO',
    createdAt: now(),
  });
  cases.appendCase(value);
  const append = (
    props: Partial<Parameters<typeof QualificationMalfunctionEntry.create>[0]> & {
      type: QualificationMalfunctionEntry['type'];
    },
  ) => {
    cases.appendEntry(
      QualificationMalfunctionEntry.create({
        caseId: value.id,
        statement: 'Confirmed',
        officialName: 'RTS',
        officialRole: 'RTS_OFFICER',
        recordedAt: now(),
        ...props,
      }),
    );
  };
  append({ type: 'INSPECTION_RECORDED' });
  append({
    type: 'CLASSIFIED',
    classification: nonAllowable ? 'NON_ALLOWABLE' : 'ALLOWABLE',
    causeCode: 'RECORDED_CAUSE',
  });
  append({
    type: 'REMEDY_AUTHORIZED',
    remedy: nonAllowable ? 'SCORE_UNFIRED_AS_MISS' : treatment.type,
    shotsToFire: nonAllowable ? 0 : treatment.type === 'REPEAT_FULL_SERIES' ? 5 : 3,
  });
  append({ type: 'EXECUTION_RECORDED', artifactId: 'signed-recovery-record' });
  const targetGroup = pack === ISSF_2026_RFPM;
  const shot = (id: string, score: number, index: number) => ({
    shotId: id,
    scoreX10: score * 10,
    evidenceReference: 'Independent EST',
    outcome: 'HIT' as const,
    ...(targetGroup ? { targetIndex: index } : {}),
  });
  const input: MalfunctionScoreSheetInput = {
    caseId: value.id,
    original: [shot('o1', 9, 0), shot('o2', 10, 1)],
    recovery: nonAllowable
      ? []
      : (treatment.type === 'REPEAT_FULL_SERIES' ? [10, 8, 9, 7, 10] : [10, 8, 9]).map((score, index) =>
          shot(`r${index}`, score, index),
        ),
    officialName: 'RTS',
    officialRole: 'RTS_OFFICER',
    statement: 'Original and recovery checked',
  };
  const sheets = new SqliteMalfunctionScoreSheetRepository(db);
  const calculations = new MalfunctionScoreSheetService(
    cases,
    sheets,
    { export: async () => ({ status: 'CANCELLED' }) },
    now,
  );
  const sheet = calculations.save(input, crypto.randomUUID(), calculations.preview(input).digest);
  const results = new SqliteResultRepository(db);
  const source = Result.create(
    ResultId.generate(),
    EventId.create(eventId),
    ParticipantId.create(participantId),
    'Athlete',
    '',
    569,
    [...Array(11).fill(50), 19],
    [...Array(55).fill(10), 9, 10, 0, 0, 0],
    1,
    'published',
    definition.resultFormat,
    competitionId,
  );
  results.save(source);
  const applications = new SqliteMalfunctionScoreApplicationRepository(db);
  const targets = new ResultMalfunctionScoreTargetSource(results, new SqliteEventRepository(db, registry), registry);
  const service = new MalfunctionScoreApplicationService(cases, sheets, applications, targets, now);
  const decisions = new SqliteScoringDecisionRepository(db);
  const reader = new QualificationResultsReader(
    { execute: vi.fn(async () => ({ eventType: definition.id })) } as unknown as QueryBus,
    results,
    decisions,
    registry,
    undefined,
    new MalfunctionQualificationScoreOverlaySource(applications, cases),
  );
  const request: MalfunctionScoreApplicationRequest = {
    sheetId: sheet.id,
    innerTens: Array(5).fill(false),
    officialName: 'RTS',
    officialRole: 'RTS_OFFICER',
    statement: 'Source slots, target mapping and inner tens checked',
  };
  const status = () => qualificationMalfunctionStatus(cases.findEntries([value.id]).get(value.id)!);
  return {
    championshipId,
    eventId,
    participantId,
    competitionId,
    registry,
    cases,
    value,
    append,
    sheets,
    calculations,
    input,
    sheet,
    results,
    source,
    applications,
    targets,
    service,
    decisions,
    reader,
    request,
    status,
    now,
  };
}

describe('Malfunction score application', () => {
  it.each([ISSF_2026_RFPM, ISSF_2026_STDP, ISSF_2026_P25, ISSF_2026_CFP])(
    'applies an official calculation once to the last series and retains original scores ($id)',
    async (pack) => {
      const f = setup(pack);
      const preview = f.service.preview(f.request);
      const id = crypto.randomUUID();
      const saved = f.service.apply({ id, request: f.request, expectedDigest: preview.digest, confirmed: true });
      expect(saved.seriesIndex).toBe(11);
      expect(f.status()).toBe('SETTLED');
      expect(f.results.findById(f.source.id.value)!.totalScore).toBe(569);
      const projected = (await f.reader.getByEvent(f.eventId))[0]!;
      expect(projected.totalScore).toBe(550 + f.sheet.calculation.totalX10 / 10);
      expect(projected.seriesScores.slice(0, 11)).toEqual(Array(11).fill(50));
      expect(projected.scoreAdjustment).toBe(19 - f.sheet.calculation.totalX10 / 10);
      expect(projected.projectionIssues).toEqual([]);
      const restarted = new MalfunctionScoreApplicationService(
        f.cases,
        f.sheets,
        new SqliteMalfunctionScoreApplicationRepository(db),
        f.targets,
        f.now,
      );
      expect(restarted.apply({ id, request: f.request, expectedDigest: preview.digest, confirmed: true })).toEqual(
        saved,
      );
      expect(restarted.list(f.value.id)).toHaveLength(1);
      expect(() =>
        restarted.apply({
          id,
          request: { ...f.request, statement: 'Different' },
          expectedDigest: preview.digest,
          confirmed: true,
        }),
      ).toThrow('different evidence');
      f.decisions.append(
        ScoringDecision.create({
          eventId: f.eventId,
          participantId: f.participantId,
          relayNumber: 1,
          resultScope: 'QUALIFICATION',
          sourceCompetitionId: f.competitionId,
          resultIdAtDecision: f.source.id.value,
          type: 'DEDUCTION',
          applicationPolicy: 'SPECIFIC_SHOT',
          seriesIndex: 11,
          shotIndex: 59,
          pointsX10: 20,
          officialName: 'Jury',
          ruleReference: 'Official penalty',
          publicRemark: 'Two points',
        }),
      );
      expect((await f.reader.getByEvent(f.eventId))[0]!.totalScore).toBe(projected.totalScore - 2);
      expect(() => db.prepare('DELETE FROM malfunction_score_applications').run()).toThrow('append-only');
      expect(() => db.prepare("UPDATE malfunction_score_applications SET snapshot_json = '{}' ").run()).toThrow(
        'append-only',
      );
      expect(
        new SqliteCompetitionEvidenceSource(db)
          .collect(f.championshipId)
          .find((s) => s.id === 'malfunction-score-applications')!.records,
      ).toHaveLength(1);
    },
  );

  it('withdraws without deleting history, reopens scoring, and allows a corrected calculation', async () => {
    const f = setup();
    const preview = f.service.preview(f.request);
    const applied = f.service.apply({
      id: crypto.randomUUID(),
      request: f.request,
      expectedDigest: preview.digest,
      confirmed: true,
    });
    f.append({ type: 'COMPLETED' });
    const request = {
      id: crypto.randomUUID(),
      applicationId: applied.id,
      officialName: 'Jury',
      officialRole: 'JURY_MEMBER' as const,
      statement: 'Correct evidence reference',
    };
    const withdrawn = f.service.withdraw(request);
    expect(f.service.withdraw(request)).toEqual(withdrawn);
    expect(f.status()).toBe('EXECUTED');
    expect((await f.reader.getByEvent(f.eventId))[0]!.totalScore).toBe(569);
    expect(() => db.prepare('DELETE FROM malfunction_score_withdrawals').run()).toThrow('append-only');
    const input = { ...f.input, statement: 'Corrected evidence' };
    const second = f.calculations.save(input, crypto.randomUUID(), f.calculations.preview(input).digest);
    const next = { ...f.request, sheetId: second.id };
    const nextPreview = f.service.preview(next);
    f.service.apply({ id: crypto.randomUUID(), request: next, expectedDigest: nextPreview.digest, confirmed: true });
    expect(f.service.list(f.value.id)).toHaveLength(2);
    expect(f.sheets.list(f.value.id)).toHaveLength(2);
    expect((await f.reader.getByEvent(f.eventId))[0]!.totalScore).toBe(593);
  });

  it('rejects stale previews, then blocks a stale active application when source evidence changes', async () => {
    const f = setup();
    const preview = f.service.preview(f.request);
    db.prepare('UPDATE results SET ranking_shots_detail = ? WHERE id = ?').run(
      JSON.stringify([{ shotId: 'later', ringScore: 10, decimalScore: 10.1, innerTen: false, seriesIndex: 0 }]),
      f.source.id.value,
    );
    expect(() =>
      f.service.apply({ id: crypto.randomUUID(), request: f.request, expectedDigest: preview.digest, confirmed: true }),
    ).toThrow('changed; preview');
    expect(f.service.list(f.value.id)).toHaveLength(0);
    const current = f.service.preview(f.request);
    f.service.apply({ id: crypto.randomUUID(), request: f.request, expectedDigest: current.digest, confirmed: true });
    db.prepare("UPDATE results SET ranking_shots_detail = '[]' WHERE id = ?").run(f.source.id.value);
    const projected = (await f.reader.getByEvent(f.eventId))[0]!;
    expect(projected.totalScore).toBe(569);
    expect(projected.projectionIssues).toContainEqual(expect.stringContaining('reconciliation'));
  });

  it('rolls back the application if settlement journaling fails', () => {
    const f = setup();
    const preview = f.service.preview(f.request);
    db.exec(
      "CREATE TRIGGER fail_settlement BEFORE INSERT ON qualification_malfunction_entries WHEN NEW.entry_type = 'SCORE_SETTLED' BEGIN SELECT RAISE(ABORT,'test failure'); END;",
    );
    expect(() =>
      f.service.apply({ id: crypto.randomUUID(), request: f.request, expectedDigest: preview.digest, confirmed: true }),
    ).toThrow('test failure');
    expect(f.service.list(f.value.id)).toEqual([]);
    expect(f.status()).toBe('EXECUTED');
  });

  it('rejects invalid identity, original evidence, inner tens, Rule Pack and overlapping applications', () => {
    const f = setup();
    expect(() => f.service.preview({ ...f.request, officialName: '' })).toThrow('identity');
    expect(() => f.service.preview({ ...f.request, innerTens: [true, false, false, false, false] })).toThrow(
      'Only a counted ten',
    );
    db.prepare('UPDATE results SET source_competition_id = ?').run(crypto.randomUUID());
    expect(() => f.service.preview(f.request)).toThrow('matching Lane result');
    db.prepare('UPDATE results SET source_competition_id = ?, shots_detail = ?').run(
      f.competitionId,
      JSON.stringify([...Array(55).fill(10), 8, 10, 0, 0, 0]),
    );
    expect(() => f.service.preview(f.request)).toThrow('original calculation row');
    f.results.save(f.source);
    db.prepare('UPDATE events SET rule_pack_fingerprint_sha256 = ?').run('0'.repeat(64));
    expect(() => f.service.preview(f.request)).toThrow('exact Qualification Rule Pack');
    db.prepare('UPDATE events SET rule_pack_fingerprint_sha256 = ?').run(f.value.rulePackIdentity!.fingerprint.value);
    const preview = f.service.preview(f.request);
    f.service.apply({ id: crypto.randomUUID(), request: f.request, expectedDigest: preview.digest, confirmed: true });
    f.append({ type: 'SCORE_REOPENED', artifactId: 'manual-correction-reference' });
    expect(() => f.service.preview(f.request)).toThrow('Withdraw the existing application');
  });

  it('keeps no-fire zeros and rejects applications after a void ruling', async () => {
    const f = setup(ISSF_2026_P25, true);
    const preview = f.service.preview(f.request);
    const applied = f.service.apply({
      id: crypto.randomUUID(),
      request: f.request,
      expectedDigest: preview.digest,
      confirmed: true,
    });
    expect((await f.reader.getByEvent(f.eventId))[0]!.totalScore).toBe(569);
    f.append({ type: 'VOID' });
    expect((await f.reader.getByEvent(f.eventId))[0]!.projectionIssues).toContain('Malfunction case is VOID');
    f.service.withdraw({
      id: crypto.randomUUID(),
      applicationId: applied.id,
      officialName: 'Jury',
      officialRole: 'JURY_MEMBER',
      statement: 'Void case',
    });
    expect(f.status()).toBe('VOID');
    expect(() => f.service.preview(f.request)).toThrow('unsettled scoring');
  });
});
