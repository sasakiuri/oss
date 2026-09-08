import { beforeEach, describe, expect, it } from 'vitest';

import type {
  IResultPublicationPolicyResolver,
  IResultPublicationReadiness,
  PublicationClock,
  ResultPublicationReadiness,
} from '@/main/modules/result-publication/application/ResultPublicationPorts';
import { ResultPublicationService } from '@/main/modules/result-publication/application/ResultPublicationService';
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

  it('starts the deadline at an earlier actual posting while retaining the later recording time', async () => {
    const view = await service.publishPreliminary({
      eventId: 'event-1',
      resultScope: 'QUALIFICATION',
      officialName: 'RTS Officer',
      posting: {
        snapshotRevision: REVISION,
        postedAt: '2026-08-29T00:55:00.000Z',
        location: 'Range scoreboard',
        reference: 'Printed list 17',
      },
    });
    expect(view.protestEndsAt).toEqual(new Date('2026-08-29T01:05:00.000Z'));
    expect(repository.entries[0]).toMatchObject({
      recordedAt: now,
      postingLocation: 'Range scoreboard',
      postingReference: 'Printed list 17',
      postedAt: new Date('2026-08-29T00:55:00.000Z'),
    });
  });

  it.each([
    { snapshotRevision: 'b'.repeat(64), location: 'Board' },
    { snapshotRevision: REVISION, location: 'Board', postedAt: '2026-08-29T01:01:00.000Z' },
    { snapshotRevision: REVISION, location: '  ' },
    { snapshotRevision: REVISION, location: 'Board', postedAt: 'invalid' },
  ])('rejects invalid posting facts without changing the journal: %j', async (posting) => {
    await expect(
      service.publishPreliminary({
        eventId: 'event-1',
        resultScope: 'QUALIFICATION',
        officialName: 'RTS Officer',
        posting,
      }),
    ).rejects.toThrow();
    expect(repository.entries).toEqual([]);
  });

  it('rejects a revision change during asynchronous policy resolution', async () => {
    service = new ResultPublicationService(
      repository,
      { getCurrent: async () => readiness },
      {
        resolve: async () => {
          readiness = { ...readiness, snapshotRevision: 'b'.repeat(64) };
          return { scoreProtestWindowMs: 600_000 };
        },
      },
      { now: () => now },
    );
    await expect(
      service.publishPreliminary({ eventId: 'event-1', resultScope: 'QUALIFICATION', officialName: 'RTS Officer' }),
    ).rejects.toThrow('result list changed');
    expect(repository.entries).toEqual([]);
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

  it('rejects official publication while an independent verification blocker remains', async () => {
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
      verificationIssues: ['Irregular shot case is unresolved'],
    };

    await expect(
      service.publishOfficial({
        eventId: 'event-1',
        resultScope: 'QUALIFICATION',
        officialName: 'RTS Jury Member',
      }),
    ).rejects.toThrow('Irregular shot case is unresolved');
    expect(repository.entries.map((entry) => entry.type)).toEqual(['PRELIMINARY_PUBLISHED']);
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

  it('reports a blocker that is raised after Official publication', async () => {
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
    readiness = { ...readiness, verificationIssues: ['Irregular shot case is unresolved'] };

    const view = await service.getStatus('event-1', 'QUALIFICATION');

    expect(view.publicationCurrent).toBe(false);
    expect(view.issues).toContain('Irregular shot case is unresolved');
  });

  it('reports an Official publication whose RTS approval was replaced for the same revision', async () => {
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
    readiness = { ...readiness, approvalId: 'approval-2' };

    const view = await service.getStatus('event-1', 'QUALIFICATION');

    expect(view.publicationCurrent).toBe(false);
    expect(view.issues).toContain('The current RTS approval no longer matches the official publication');
  });
});
