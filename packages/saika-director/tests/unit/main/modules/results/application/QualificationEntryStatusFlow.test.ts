import { describe, expect, it } from 'vitest';

import { EventId, Participant, ParticipantId, type ParticipantEntryStatus } from '@/main/modules/championship';
import { ResultBoardSnapshotService } from '@/main/modules/result-publication';
import {
  QualificationResultVerificationSource,
  ResultVerificationService,
  ResultVerificationSourceRegistry,
} from '@/main/modules/result-verification';
import type { ResultListApprovalEntry } from '@/main/modules/result-verification/domain/ResultListApprovalEntry';
import type { ResultVerificationCheck } from '@/main/modules/result-verification/domain/ResultVerificationCheck';
import { QualificationResultsReader, type ResultClassificationOverlay } from '@/main/modules/results';
import type { IResultRepository } from '@/main/modules/results/domain/IResultRepository';
import { Result } from '@/main/modules/results/domain/Result';
import { ResultId } from '@/main/modules/results/domain/ResultId';
import type { IScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { CompetitionTypeRegistry, IssfStandardStrategy } from '@/shared/competitionTypes';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';

function setup(statuses: readonly ParticipantEntryStatus[] = ['COMPETING', 'RPO', 'MQS', 'OOC']) {
  const eventId = EventId.generate();
  const participants = statuses.map((entryStatus, index) =>
    Participant.create(ParticipantId.generate(), eventId, `Athlete ${index}`, 'Club', null, index, `Family ${index}`, {
      entryStatus,
    }),
  );
  const results = participants.map((participant, index) => {
    const score = (100 + index) / 10;
    return Result.create(
      ResultId.generate(),
      eventId,
      participant.id,
      participant.playerName,
      participant.affiliation,
      600 + index * 6,
      Array(6).fill(100 + index),
      Array(60).fill(score),
      1,
      'confirmed',
      BR60S.resultFormat,
      null,
      participant.familyName,
      null,
      Array.from({ length: 60 }, (_, shotIndex) => ({
        shotId: `${participant.id.value}:${shotIndex}`,
        ringScore: Math.floor(score),
        decimalScore: score,
        innerTen: false,
        seriesIndex: Math.floor(shotIndex / 10),
      })),
    );
  });
  const registry = new CompetitionTypeRegistry();
  registry.registerStrategy(new IssfStandardStrategy());
  registry.register({ ...BR60S, resultVerification: { topIndividualResults: 1, topTeamResults: 0 } });
  const queryBus = { execute: async () => ({ eventType: BR60S.id }) } as unknown as QueryBus;
  const overlays: ResultClassificationOverlay[] = [];
  const reader = new QualificationResultsReader(
    queryBus,
    { findByEventId: () => results, findByEventIdAndRelay: () => results } as unknown as IResultRepository,
    { findByEventId: () => [] } as unknown as IScoringDecisionRepository,
    registry,
    { findByEventId: () => participants },
    { findByEventId: () => overlays },
  );
  const checks: ResultVerificationCheck[] = [];
  const approvals: ResultListApprovalEntry[] = [];
  const verification = new ResultVerificationService(
    {
      appendCheck: (check) => checks.push(check),
      findChecksByEvent: () => checks,
      appendApprovalEntry: (entry) => approvals.push(entry),
      findApprovalEntryById: (id) => approvals.find((entry) => entry.id === id) ?? null,
      findApprovalEntriesByEvent: () => approvals,
    },
    new ResultVerificationSourceRegistry([new QualificationResultVerificationSource(queryBus, reader, registry)]),
  );
  return {
    eventId: eventId.value,
    participants,
    results,
    overlays,
    reader,
    verification,
    setEntryStatus(index: number, entryStatus: ParticipantEntryStatus) {
      const current = participants[index]!;
      participants[index] = Participant.create(
        current.id,
        current.eventId,
        current.playerName,
        current.affiliation,
        current.logoPath,
        current.sortOrder,
        current.familyName,
        { ...current.officialEntry, entryStatus },
      );
    },
  };
}

describe('Qualification entry status projection', () => {
  it('excludes non-competing entries from ranks while preserving their scores and decision history', async () => {
    const f = setup(['COMPETING', 'RPO', 'MQS', 'OOC', 'DNS', 'DNF', 'DSQ', 'DQB']);
    const rows = await f.reader.getByEvent(f.eventId);
    expect(rows.map((row) => [row.entryStatus, row.rank, row.totalScore])).toEqual([
      ['COMPETING', 1, 600],
      ['RPO', 0, 606],
      ['MQS', 0, 612],
      ['OOC', 0, 618],
      ['DNS', 0, 624],
      ['DNF', 0, 630],
      ['DSQ', 0, 636],
      ['DQB', 0, 642],
    ]);
    for (const [index, row] of rows.entries()) {
      expect(row).toMatchObject({
        classificationCode: null,
        decisionCount: 0,
        scoreAdjustment: 0,
        projectionIssues: [],
      });
      expect(row.seriesScores).toEqual(f.results[index]!.seriesScores);
      expect(row.shotScores).toEqual(f.results[index]!.shots);
      expect(f.results[index]!.totalScore).toBe(row.totalScore);
    }
    expect(await f.reader.getByRelay(f.eventId, 1)).toEqual(rows);

    f.overlays.push({
      participantId: f.participants[1]!.id.value,
      classificationCode: 'DQB',
      decisionIds: ['sanction'],
      publicRemarks: ['Jury sanction'],
    });
    expect((await f.reader.getByEvent(f.eventId)).find((row) => row.entryStatus === 'RPO')).toMatchObject({
      rank: 0,
      totalScore: 0,
      classificationCode: 'DQB',
      decisionCount: 1,
      remarks: ['Jury sanction'],
    });
    expect(f.results[1]!.totalScore).toBe(606);
  });

  it('keeps non-competing rows out of RTS checks and invalidates approval when their entry status changes', async () => {
    const f = setup();
    const before = await f.verification.getStatus(f.eventId);
    expect(before.results.filter((row) => row.required).map((row) => row.participantId)).toEqual([
      f.participants[0]!.id.value,
    ]);
    const competing = before.results[0]!;
    const rpo = before.results.find((row) => row.entryStatus === 'RPO')!;
    const request = {
      eventId: f.eventId,
      resultScope: 'QUALIFICATION' as const,
      resultId: competing.resultId,
      resultRevision: competing.revision,
      evidenceSource: 'INDEPENDENT_MEMORY' as const,
      evidenceReference: 'Target memory',
      comparisonStatus: 'MATCHED' as const,
      manualInterventionsReviewed: false,
      officialName: 'RTS official',
    };
    await expect(
      f.verification.addCheck({ ...request, resultId: rpo.resultId, resultRevision: rpo.revision }),
    ).rejects.toThrow('Only ranked results');
    await f.verification.addCheck(request);
    const checked = await f.verification.getStatus(f.eventId);
    expect(checked.readyForApproval).toBe(true);
    await f.verification.approve({
      eventId: f.eventId,
      resultScope: 'QUALIFICATION',
      snapshotRevision: checked.snapshotRevision,
      statement: 'Results verified',
      officialName: 'RTS official',
    });

    f.setEntryStatus(1, 'OOC');
    const changed = await f.verification.getStatus(f.eventId);
    expect(changed.currentApproval).toBeNull();
    expect(changed.snapshotRevision).not.toBe(checked.snapshotRevision);
    expect(changed.results.find((row) => row.resultId === rpo.resultId)).toMatchObject({
      rank: 0,
      entryStatus: 'OOC',
      totalScore: 606,
    });
    expect(changed.results.find((row) => row.resultId === rpo.resultId)!.revision).not.toBe(rpo.revision);
    expect(changed.results[0]!.currentCheck?.qualifies).toBe(true);

    f.setEntryStatus(1, 'COMPETING');
    const newlyCompeting = await f.verification.getStatus(f.eventId);
    expect(newlyCompeting.results.filter((row) => row.required).map((row) => row.resultId)).toEqual([rpo.resultId]);
    expect(newlyCompeting.results.find((row) => row.resultId === competing.resultId)).toMatchObject({
      rank: 2,
      currentCheck: null,
    });
    expect(newlyCompeting.readyForApproval).toBe(false);
  });

  it('carries entry classification and the recorded score through the saved board snapshot', async () => {
    const f = setup();
    const boards = new ResultBoardSnapshotService(
      f.verification,
      {
        getStatus: async () => ({
          eventId: f.eventId,
          resultScope: 'QUALIFICATION',
          currentSnapshotRevision: null,
          publicationCurrent: false,
          status: 'DRAFT',
          approvalId: null,
          postedAt: null,
          protestEndsAt: null,
        }),
      },
      {
        getStatus: async () => ({
          eventId: f.eventId,
          currentSnapshotRevision: null,
          declarationCurrent: false,
          declaration: null,
        }),
      },
    );
    const board = await boards.getSnapshot(f.eventId, 'QUALIFICATION');
    expect(board.results.map((row) => [row.entryStatus, row.rank, row.totalScore, row.classificationCode])).toEqual([
      ['COMPETING', 1, 600, null],
      ['RPO', 0, 606, null],
      ['MQS', 0, 612, null],
      ['OOC', 0, 618, null],
    ]);
  });

  it('rejects a saved result whose entry no longer belongs to the event', async () => {
    const f = setup();
    f.participants.splice(0, 1);
    await expect(f.reader.getByEvent(f.eventId)).rejects.toThrow('not found in event');
  });
});
