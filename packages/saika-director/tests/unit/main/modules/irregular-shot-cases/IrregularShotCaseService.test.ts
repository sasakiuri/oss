import { describe, expect, it } from 'vitest';
import { ISSF_2026_P25_FINAL, ISSF_2026_RFPM_FINAL } from '@sasakiuri/saika-rules';

import { IrregularShotCaseService, IrregularShotPublicationBlocker } from '@/main/modules/irregular-shot-cases';
import type {
  IIrregularShotCaseRepository,
  IrregularShotCase,
  IrregularShotCaseEntry,
  IrregularShotEvidence,
  IrregularShotResultScope,
} from '@/main/modules/irregular-shot-cases';
import type { IRangeIncidentReportRepository } from '@/main/modules/incident-reports';
import { RangeIncidentReport } from '@/main/modules/incident-reports/domain/RangeIncidentReport';
import type { CompetitionShotObservation, ICompetitionShotJournal } from '@/main/modules/mqtt';
import type { IScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import { ScoringDecision } from '@/main/modules/scoring-decisions/domain/ScoringDecision';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITION_ID = '22222222-2222-4222-8222-222222222222';
const SUBJECT_LANE = '33333333-3333-4333-8333-333333333333';
const ADJACENT_LANE = '44444444-4444-4444-8444-444444444444';
const OTHER_LANE = '55555555-5555-4555-8555-555555555555';
const REPORT_ID = '66666666-6666-4666-8666-666666666666';
const DECISION_ID = '77777777-7777-4777-8777-777777777777';

class InMemoryRepository implements IIrregularShotCaseRepository {
  readonly cases: IrregularShotCase[] = [];
  readonly evidence: IrregularShotEvidence[] = [];
  readonly entries: IrregularShotCaseEntry[] = [];

  appendCase(value: IrregularShotCase) {
    this.cases.push(value);
  }
  appendEvidence(value: IrregularShotEvidence) {
    this.evidence.push(value);
  }
  appendEntry(value: IrregularShotCaseEntry) {
    this.entries.push(value);
  }
  findCaseById(id: string) {
    return this.cases.find((value) => value.id === id) ?? null;
  }
  findCasesByEvent(eventId: string, resultScope?: IrregularShotResultScope) {
    return this.cases.filter(
      (value) => value.eventId === eventId && (!resultScope || value.resultScope === resultScope),
    );
  }
  findEntries(caseIds: readonly string[]) {
    return new Map(caseIds.map((id) => [id, this.entries.filter((value) => value.caseId === id)]));
  }
  findEvidence(caseIds: readonly string[]) {
    return new Map(caseIds.map((id) => [id, this.evidence.filter((value) => value.caseId === id)]));
  }
}

function observation(id: string, shotId: string, laneId: string, firedAt: string): CompetitionShotObservation {
  return {
    id,
    competitionId: COMPETITION_ID,
    laneId,
    sessionId: '88888888-8888-4888-8888-888888888888',
    shotId,
    sourceObservationId: null,
    x: 1,
    y: 2,
    legacyRawScoreX10: 100,
    deviceScoreX10: 100,
    calculatedScoreX10: 100,
    calculatedScoreAvailable: true,
    effectiveScoreX10: 100,
    targetProfileId: null,
    scoringGaugeProfileId: null,
    innerTen: false,
    mode: 'MATCH',
    firedAt: new Date(firedAt),
    receivedAt: new Date(new Date(firedAt).getTime() + 30),
    stageIndex: 1,
    scored: true,
    seriesIndex: 0,
    shotNumberInSeries: 1,
    isRecorded: true,
    isReplay: false,
    publishedAt: new Date(firedAt),
    observedAt: new Date(firedAt),
    payloadJson: '{}',
  };
}

function createFixture(options?: { eventType?: string; round?: string; competitionTypes?: CompetitionTypeRegistry }) {
  const repository = new InMemoryRepository();
  const observations = [
    observation(
      '99999999-9999-4999-8999-999999999991',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      SUBJECT_LANE,
      '2026-09-02T03:00:00.000Z',
    ),
    observation(
      '99999999-9999-4999-8999-999999999992',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      ADJACENT_LANE,
      '2026-09-02T03:00:01.000Z',
    ),
    observation(
      '99999999-9999-4999-8999-999999999993',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      OTHER_LANE,
      '2026-09-02T03:00:01.000Z',
    ),
  ];
  const shots: ICompetitionShotJournal = {
    append: () => {},
    findByCompetition: () => observations,
  };
  const report = RangeIncidentReport.reconstruct({
    id: REPORT_ID,
    eventId: EVENT_ID,
    serialNumber: 'IR-1',
    eventName: '10m Final',
    occurredAt: new Date('2026-09-02T03:00:00.000Z'),
    relayNumber: 1,
    firingPointNumber: 1,
    athleteName: null,
    bibNumber: null,
    nationality: null,
    stage: 'MATCH',
    series: '1',
    details: 'Disputed shot',
    ruleReferences: 'ISSF 6.11.6',
    penalty: null,
    scoreAmendmentReference: null,
    initiatorRole: 'RANGE_OFFICER',
    initiatorName: 'RO A',
    createdAt: new Date('2026-09-02T03:01:00.000Z'),
  });
  const reportRepository: IRangeIncidentReportRepository = {
    appendReport: () => {},
    findReportById: (id) => (id === REPORT_ID ? report : null),
    findReportBySerial: () => null,
    findReportsByEvent: () => [report],
    appendEntry: () => {},
    findEntriesByReportIds: (ids) => new Map(ids.map((id) => [id, []])),
  };
  const decision = ScoringDecision.reconstruct({
    id: DECISION_ID,
    eventId: EVENT_ID,
    participantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    relayNumber: 1,
    resultScope: 'QUALIFICATION',
    resultIdAtDecision: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    sourceCompetitionId: COMPETITION_ID,
    type: 'MARK_MISS',
    applicationPolicy: 'SPECIFIC_SHOT',
    pointsX10: null,
    seriesIndex: 0,
    shotIndex: 0,
    classificationCode: null,
    ruleReference: 'ISSF 6.11.6.1',
    incidentReportNumber: 'IR-1',
    publicRemark: 'Crossfire scored as miss',
    internalNote: null,
    officialName: 'Jury A',
    decidedAt: new Date('2026-09-02T03:02:00.000Z'),
    reversesDecisionId: null,
  });
  const decisions: ScoringDecision[] = [decision];
  const decisionRepository: IScoringDecisionRepository = {
    append: (value) => decisions.push(value),
    findById: (id) => decisions.find((value) => value.id === id) ?? null,
    findByTarget: () => decisions,
    findByEventId: () => decisions,
  };
  const queryBus = {
    execute: async () => ({
      id: EVENT_ID,
      name: 'Event',
      eventType: options?.eventType ?? 'AR60',
      round: options?.round ?? 'Qualification',
    }),
  } as unknown as QueryBus;
  const service = new IrregularShotCaseService(
    queryBus,
    repository,
    shots,
    reportRepository,
    decisionRepository,
    options?.competitionTypes,
  );
  return { service, repository, reportRepository, decisionRepository, decisions, observations };
}

async function openCase(fixture = createFixture()) {
  const value = await fixture.service.create({
    eventId: EVENT_ID,
    competitionId: COMPETITION_ID,
    resultScope: 'QUALIFICATION',
    kind: 'CROSS_FIRE',
    subjectLaneId: SUBJECT_LANE,
    adjacentLaneIds: [ADJACENT_LANE],
    windowStartAt: '2026-09-02T02:59:59.000Z',
    windowEndAt: '2026-09-02T03:00:02.000Z',
    summary: 'Possible crossfire from the adjacent firing point.',
    openedBy: 'RO A',
    occurredAt: '2026-09-02T03:00:00.000Z',
  });
  return { fixture, value };
}

describe('IrregularShotCaseService', () => {
  it('accepts only Final-series incident kinds supplied by the event Rule Pack', async () => {
    const competitionTypes = new CompetitionTypeRegistry();
    competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_RFPM_FINAL));
    competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_P25_FINAL));
    const rapidFire = createFixture({ eventType: 'RFPM_FINAL', round: 'Final', competitionTypes });

    const value = await rapidFire.service.create({
      eventId: EVENT_ID,
      competitionId: COMPETITION_ID,
      resultScope: 'FINAL',
      kind: 'LATE_OR_UNFIRED_SHOT',
      subjectLaneId: SUBJECT_LANE,
      adjacentLaneIds: [],
      windowStartAt: '2026-09-02T02:59:59.000Z',
      windowEndAt: '2026-09-02T03:00:02.000Z',
      summary: 'One shot was fired after the valid target exposure.',
      openedBy: 'Jury A',
      occurredAt: '2026-09-02T03:00:00.000Z',
    });
    expect(value.ruleReference).toBe('6.17.4(m)');

    const women = createFixture({ eventType: 'P25_FINAL', round: 'Final', competitionTypes });
    await expect(
      women.service.create({
        eventId: EVENT_ID,
        competitionId: COMPETITION_ID,
        resultScope: 'FINAL',
        kind: 'LATE_OR_UNFIRED_SHOT',
        subjectLaneId: SUBJECT_LANE,
        adjacentLaneIds: [],
        windowStartAt: '2026-09-02T02:59:59.000Z',
        windowEndAt: '2026-09-02T03:00:02.000Z',
        summary: 'This policy does not belong to the Women Final Rule Pack.',
        openedBy: 'Jury A',
        occurredAt: '2026-09-02T03:00:00.000Z',
      }),
    ).rejects.toThrow('is not available for competition type P25_FINAL');
  });

  it('builds an adjacent-Lane timeline and snapshots selected evidence without judging it', async () => {
    const { fixture, value } = await openCase();

    expect(value.ruleReference).toBe('ISSF 6.11.6');
    expect(value.timeline.map((item) => item.laneId)).toEqual([SUBJECT_LANE, ADJACENT_LANE]);
    expect(value.publicationBlocked).toBe(true);

    const linked = await fixture.service.addEvidence({
      caseId: value.id,
      observationId: fixture.observations[1]!.id,
      relation: 'POSSIBLE_SOURCE',
      officialName: 'RO A',
    });
    expect(linked.evidence[0]).toMatchObject({
      laneId: ADJACENT_LANE,
      relation: 'POSSIBLE_SOURCE',
      effectiveScoreX10: 100,
    });
    await expect(
      fixture.service.addEvidence({
        caseId: value.id,
        observationId: fixture.observations[1]!.id,
        relation: 'POSSIBLE_SOURCE',
        officialName: 'RO A',
      }),
    ).rejects.toThrow('already linked');
  });

  it('requires current IR and scoring-decision artifacts before resolving a score-affecting case', async () => {
    const { fixture, value } = await openCase();

    await expect(
      fixture.service.appendEntry({
        caseId: value.id,
        type: 'RESOLVED',
        resolutionCode: 'CROSS_FIRE_CONFIRMED',
        statement: 'Confirmed by the Jury.',
        officialName: 'Jury A',
      }),
    ).rejects.toThrow('requires a resolution code and Range Incident Report');

    const resolved = await fixture.service.appendEntry({
      caseId: value.id,
      type: 'RESOLVED',
      resolutionCode: 'CROSS_FIRE_CONFIRMED',
      incidentReportId: REPORT_ID,
      scoringDecisionIds: [DECISION_ID],
      ruleReference: 'ISSF 6.11.6.1, 6.14.6',
      statement: 'Crossfire confirmed and the firing athlete was scored a miss.',
      officialName: 'Jury A',
    });

    expect(resolved).toMatchObject({ status: 'RESOLVED', publicationBlocked: false });
    await expect(
      fixture.service.addEvidence({
        caseId: value.id,
        observationId: fixture.observations[0]!.id,
        relation: 'SUBJECT',
        officialName: 'RO A',
      }),
    ).rejects.toThrow('cannot add evidence');
  });

  it('blocks publication while open and again if a linked decision is revoked', async () => {
    const { fixture, value } = await openCase();
    const blocker = new IrregularShotPublicationBlocker(
      fixture.repository,
      fixture.reportRepository,
      fixture.decisionRepository,
    );
    expect(blocker.getIssues(EVENT_ID, 'QUALIFICATION')).toEqual([`Irregular shot case ${value.id} is unresolved`]);

    await fixture.service.appendEntry({
      caseId: value.id,
      type: 'RESOLVED',
      resolutionCode: 'CROSS_FIRE_CONFIRMED',
      incidentReportId: REPORT_ID,
      scoringDecisionIds: [DECISION_ID],
      statement: 'Resolved.',
      officialName: 'Jury A',
    });
    expect(blocker.getIssues(EVENT_ID, 'QUALIFICATION')).toEqual([]);

    fixture.decisions.push(
      ScoringDecision.reconstruct({
        ...fixture.decisions[0]!,
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        type: 'REVOCATION',
        applicationPolicy: 'NONE',
        seriesIndex: null,
        shotIndex: null,
        publicRemark: 'Decision revoked',
        reversesDecisionId: DECISION_ID,
      }),
    );
    expect(blocker.getIssues(EVENT_ID, 'QUALIFICATION')).toEqual([
      `Irregular shot case ${value.id} references a revoked scoring decision`,
    ]);
    const underReview = (await fixture.service.list({ eventId: EVENT_ID, resultScope: 'QUALIFICATION' }))[0]!;
    expect(underReview).toMatchObject({ status: 'RESOLVED', publicationBlocked: true });
  });
});
