import { describe, expect, it, vi } from 'vitest';

import {
  ResultBoardSnapshotService,
  type IResultBoardSource,
  type IResultBoardPublication,
  type IResultBoardDeclaration,
} from '@/main/modules/result-publication/application/ResultBoardSnapshotService';

const revision = 'a'.repeat(64);
const changedRevision = 'b'.repeat(64);
function setup(scope: 'QUALIFICATION' | 'FINAL' = 'QUALIFICATION') {
  const snapshot: Awaited<ReturnType<IResultBoardSource['getStatus']>> = {
    eventId: 'event',
    resultScope: scope,
    snapshotRevision: revision,
    currentApproval: { id: 'approval' },
    readyForApproval: true,
    results: [
      {
        resultId: 'result',
        rank: 1,
        playerName: 'Athlete',
        affiliation: 'Team',
        totalScore: 625.4,
        classificationCode: null,
      },
    ],
  };
  const publication: Awaited<ReturnType<IResultBoardPublication['getStatus']>> = {
    eventId: 'event',
    resultScope: 'QUALIFICATION',
    currentSnapshotRevision: revision,
    publicationCurrent: true,
    status: 'OFFICIAL',
    approvalId: 'approval',
    postedAt: new Date('2026-09-09T01:00:00Z'),
    protestEndsAt: new Date('2026-09-09T01:10:00Z'),
  };
  const declaration: Awaited<ReturnType<IResultBoardDeclaration['getStatus']>> = {
    eventId: 'event',
    currentSnapshotRevision: revision,
    declarationCurrent: true,
    declaration: { approvalId: 'approval', declaredAt: '2026-09-09T02:00:00.000Z' },
  };
  const source = { getStatus: vi.fn(async () => snapshot) };
  const qualifications = { getStatus: vi.fn(async () => publication) };
  const finals = { getStatus: vi.fn(async () => declaration) };
  return {
    source,
    snapshot,
    qualifications,
    publication,
    finals,
    declaration,
    service: new ResultBoardSnapshotService(source, qualifications, finals, () => new Date('2026-09-09T03:00:00Z')),
  };
}

describe('ResultBoardSnapshotService', () => {
  it('returns the exact published rows with the actual posting and protest deadline', async () => {
    const context = setup();
    const result = await context.service.getSnapshot('event', 'QUALIFICATION');
    expect(result).toMatchObject({
      state: 'OFFICIAL',
      snapshotRevision: revision,
      results: context.snapshot.results,
      postedAt: '2026-09-09T01:00:00.000Z',
      protestEndsAt: '2026-09-09T01:10:00.000Z',
    });
    expect(context.finals.getStatus).not.toHaveBeenCalled();
  });

  it.each(['PRELIMINARY', 'PROTEST_PENDING', 'PROTEST_CLOSED'] as const)(
    'preserves %s without requiring approval',
    async (status) => {
      const context = setup();
      context.publication.status = status;
      context.snapshot.currentApproval = null;
      context.snapshot.readyForApproval = false;
      expect((await context.service.getSnapshot('event', 'QUALIFICATION')).state).toBe(status);
    },
  );

  it('retries a revision change while assembling the board and withdraws the old publication label', async () => {
    const context = setup();
    context.source.getStatus.mockResolvedValueOnce({ ...context.snapshot });
    context.snapshot.snapshotRevision = changedRevision;
    context.snapshot.results = [{ ...context.snapshot.results[0]!, totalScore: 623.4 }];
    context.publication.currentSnapshotRevision = changedRevision;
    context.publication.publicationCurrent = false;
    const result = await context.service.getSnapshot('event', 'QUALIFICATION');
    expect(result).toMatchObject({
      state: 'REVIEW_REQUIRED',
      snapshotRevision: changedRevision,
      postedAt: null,
      protestEndsAt: null,
      results: [{ totalScore: 623.4 }],
    });
    expect(context.source.getStatus).toHaveBeenCalledTimes(4);
  });

  it.each(['revocation', 'review issue'] as const)(
    'withdraws Official after a late %s without a score change',
    async (change) => {
      const context = setup();
      context.source.getStatus.mockResolvedValueOnce({ ...context.snapshot });
      if (change === 'revocation') context.snapshot.currentApproval = null;
      else context.snapshot.readyForApproval = false;
      expect((await context.service.getSnapshot('event', 'QUALIFICATION')).state).toBe('REVIEW_REQUIRED');
    },
  );

  it('uses the final declaration and never a qualification protest timer', async () => {
    const context = setup('FINAL');
    expect(await context.service.getSnapshot('event', 'FINAL')).toMatchObject({
      state: 'FINAL',
      postedAt: '2026-09-09T02:00:00.000Z',
      protestEndsAt: null,
    });
    expect(context.qualifications.getStatus).not.toHaveBeenCalled();
    context.declaration.declarationCurrent = false;
    expect((await context.service.getSnapshot('event', 'FINAL')).state).toBe('REVIEW_REQUIRED');
    context.declaration.declaration = null;
    expect((await context.service.getSnapshot('event', 'FINAL')).state).toBe('DRAFT');
  });

  it('fails closed after bounded retries and rejects cross-event source data', async () => {
    const context = setup();
    context.publication.currentSnapshotRevision = changedRevision;
    await expect(context.service.getSnapshot('event', 'QUALIFICATION')).rejects.toThrow('consistent board snapshot');
    expect(context.source.getStatus).toHaveBeenCalledTimes(6);
    context.snapshot.eventId = 'another-event';
    await expect(context.service.getSnapshot('event', 'QUALIFICATION')).rejects.toThrow('another event');
  });
});
