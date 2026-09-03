import { describe, expect, it, vi } from 'vitest';

import {
  GuardedResultPublicationReadiness,
  type IResultPublicationBlocker,
  type IResultPublicationReadiness,
} from '@/main/modules/result-publication';

describe('GuardedResultPublicationReadiness', () => {
  it('composes independent blockers without changing the underlying readiness source', async () => {
    const source: IResultPublicationReadiness = {
      getCurrent: vi.fn().mockResolvedValue({
        supported: true,
        resultCount: 8,
        snapshotRevision: 'a'.repeat(64),
        approvalId: 'approval-1',
        approvalSnapshotRevision: 'a'.repeat(64),
        verificationIssues: ['Result verification is pending'],
      }),
    };
    const firstBlocker: IResultPublicationBlocker = {
      getIssues: vi.fn().mockReturnValue(['Open irregular shot case', 'Duplicate issue']),
    };
    const secondBlocker: IResultPublicationBlocker = {
      getIssues: vi.fn().mockResolvedValue(['Duplicate issue', 'Backup evidence unavailable']),
    };

    const readiness = await new GuardedResultPublicationReadiness(source, [firstBlocker, secondBlocker]).getCurrent(
      'event-1',
      'FINAL',
    );

    expect(readiness).toEqual({
      supported: true,
      resultCount: 8,
      snapshotRevision: 'a'.repeat(64),
      approvalId: 'approval-1',
      approvalSnapshotRevision: 'a'.repeat(64),
      verificationIssues: [
        'Result verification is pending',
        'Open irregular shot case',
        'Duplicate issue',
        'Backup evidence unavailable',
      ],
    });
    expect(source.getCurrent).toHaveBeenCalledWith('event-1', 'FINAL');
    expect(firstBlocker.getIssues).toHaveBeenCalledWith('event-1', 'FINAL');
    expect(secondBlocker.getIssues).toHaveBeenCalledWith('event-1', 'FINAL');
  });
});
