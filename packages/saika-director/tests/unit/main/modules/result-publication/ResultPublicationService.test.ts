import { beforeEach, describe, expect, it } from 'vitest';
import { ResultPublicationService } from '@/main/modules/result-publication/application/ResultPublicationService';
import type {
  IResultPublicationPolicyResolver,
  IResultPublicationReadiness,
  PublicationClock,
  ResultPublicationReadiness,
} from '@/main/modules/result-publication/application/ResultPublicationPorts';
import type { IResultPublicationRepository } from '@/main/modules/result-publication/domain/IResultPublicationRepository';
import type {
  ResultPublicationEntry,
  ResultPublicationScope,
} from '@/main/modules/result-publication/domain/ResultPublicationEntry';

const REVISION = 'a'.repeat(64);

class MemoryRepository implements IResultPublicationRepository {
  readonly entries: ResultPublicationEntry[] = [];

  append(entry: ResultPublicationEntry): void {
    this.entries.push(entry);
  }

  findByEvent(eventId: string, resultScope: ResultPublicationScope): ResultPublicationEntry[] {
    return this.entries.filter((entry) => entry.eventId === eventId && entry.resultScope === resultScope);
  }
}

describe('ResultPublicationService', () => {
  let now: Date;
  let repository: MemoryRepository;
  let readiness: ResultPublicationReadiness;
  let service: ResultPublicationService;

  beforeEach(() => {
    now = new Date('2026-08-29T01:00:00.000Z');
    repository = new MemoryRepository();
    readiness = {
      supported: true,
      resultCount: 8,
      snapshotRevision: REVISION,
      approvalId: null,
      approvalSnapshotRevision: null,
      verificationIssues: ['A current approval is required'],
    };
    const readinessPort: IResultPublicationReadiness = { getCurrent: async () => readiness };
    const policyPort: IResultPublicationPolicyResolver = {
      resolve: async () => ({ scoreProtestWindowMs: 600_000 }),
    };
    const clock: PublicationClock = { now: () => new Date(now.getTime()) };
    service = new ResultPublicationService(repository, readinessPort, policyPort, clock);
  });

  it('uses the injected policy to publish a preliminary result list', async () => {
    const view = await service.publishPreliminary({
      eventId: 'event-1',
      resultScope: 'QUALIFICATION',
      officialName: 'RTS Officer',
    });

    expect(view.status).toBe('PRELIMINARY');
    expect(view.protestEndsAt).toEqual(new Date('2026-08-29T01:10:00.000Z'));
    expect(view.canRegisterProtest).toBe(true);
    expect(view.canPublishOfficial).toBe(false);
  });

  it('marks a preliminary publication stale when the result revision changes', async () => {
    await service.publishPreliminary({
      eventId: 'event-1',
      resultScope: 'QUALIFICATION',
      officialName: 'RTS Officer',
    });
    readiness = { ...readiness, snapshotRevision: 'b'.repeat(64) };

    const view = await service.getStatus('event-1', 'QUALIFICATION');

    expect(view.publicationCurrent).toBe(false);
    expect(view.issues).toContain('The result list changed after preliminary publication');
  });

  it('publishes official results after the deadline when the same revision is approved', async () => {
    await service.publishPreliminary({
      eventId: 'event-1',
      resultScope: 'QUALIFICATION',
      officialName: 'RTS Officer',
    });
    now = new Date('2026-08-29T01:10:00.000Z');
    readiness = {
      ...readiness,
      approvalId: 'approval-1',
      approvalSnapshotRevision: REVISION,
      verificationIssues: [],
    };

    const view = await service.publishOfficial({
      eventId: 'event-1',
      resultScope: 'QUALIFICATION',
      officialName: 'RTS Jury Member',
    });

    expect(view.status).toBe('OFFICIAL');
    expect(view.approvalId).toBe('approval-1');
    expect(view.canRegisterProtest).toBe(false);
  });

  it('reports an official publication that no longer matches current results', async () => {
    await service.publishPreliminary({
      eventId: 'event-1',
      resultScope: 'QUALIFICATION',
      officialName: 'RTS Officer',
    });
    now = new Date('2026-08-29T01:10:00.000Z');
    readiness = {
      ...readiness,
      approvalId: 'approval-1',
      approvalSnapshotRevision: REVISION,
      verificationIssues: [],
    };
    await service.publishOfficial({
      eventId: 'event-1',
      resultScope: 'QUALIFICATION',
      officialName: 'RTS Jury Member',
    });
    readiness = { ...readiness, snapshotRevision: 'b'.repeat(64) };

    const view = await service.getStatus('event-1', 'QUALIFICATION');

    expect(view.publicationCurrent).toBe(false);
    expect(view.issues).toContain('The current result list no longer matches the official publication');
  });
});
