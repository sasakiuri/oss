import { describe, expect, it, vi } from 'vitest';

import { GuardedResultPublicationReadiness, OptionalResultPublicationBlocker } from '@/main/modules/result-publication';

describe('Optional publication checks', () => {
  it('switches individual checks at runtime without suppressing the other source or its review', async () => {
    let enabled = true;
    const ledger = { getIssues: vi.fn(() => ['IR was voided']) };
    const readiness = new GuardedResultPublicationReadiness(
      {
        getCurrent: async () => ({
          supported: true,
          resultCount: 8,
          snapshotRevision: 'revision',
          approvalId: 'approval',
          approvalSnapshotRevision: 'revision',
          verificationIssues: [],
        }),
      },
      [
        new OptionalResultPublicationBlocker(ledger, () => enabled),
        { getIssues: () => ['Final recovery is unresolved'] },
      ],
    );
    expect((await readiness.getCurrent('event', 'FINAL')).verificationIssues).toEqual([
      'IR was voided',
      'Final recovery is unresolved',
    ]);
    enabled = false;
    expect((await readiness.getCurrent('event', 'FINAL')).verificationIssues).toEqual(['Final recovery is unresolved']);
    expect(ledger.getIssues).toHaveBeenCalledTimes(1);
    enabled = true;
    expect((await readiness.getCurrent('event', 'FINAL')).verificationIssues).toHaveLength(2);
  });
});
