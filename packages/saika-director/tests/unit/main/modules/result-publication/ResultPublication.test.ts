import { describe, expect, it } from 'vitest';
import { ResultPublication } from '@/main/modules/result-publication/domain/ResultPublication';
import {
  createOfficialPublishedEntry,
  createPreliminaryPublishedEntry,
  createProtestRegisteredEntry,
} from '@/main/modules/result-publication/domain/ResultPublicationEntry';

const REVISION_A = 'a'.repeat(64);
const REVISION_B = 'b'.repeat(64);
const POSTED_AT = new Date('2026-08-29T01:00:00.000Z');
const PROTEST_ENDS_AT = new Date('2026-08-29T01:10:00.000Z');

function preliminary(publication = ResultPublication.empty('event-1', 'QUALIFICATION')) {
  const entry = publication.publishPreliminary({
    snapshotRevision: REVISION_A,
    postedAt: POSTED_AT,
    protestWindowMs: 10 * 60 * 1000,
    officialName: 'RTS Officer',
  });
  return ResultPublication.reconstruct('event-1', 'QUALIFICATION', [...publication.entries, entry]);
}

describe('ResultPublication', () => {
  it('moves from draft to preliminary and closes the protest window after ten minutes', () => {
    const publication = preliminary();

    expect(publication.stateAt(POSTED_AT).status).toBe('PRELIMINARY');
    expect(publication.stateAt(PROTEST_ENDS_AT).status).toBe('PROTEST_CLOSED');
    expect(publication.stateAt(POSTED_AT).protestEndsAt).toEqual(PROTEST_ENDS_AT);
  });

  it('keeps a publication pending while a registered protest is unresolved', () => {
    let publication = preliminary();
    const protest = publication.registerProtest({
      protestReference: 'P-001',
      registeredAt: new Date('2026-08-29T01:05:00.000Z'),
    });
    publication = ResultPublication.reconstruct('event-1', 'QUALIFICATION', [...publication.entries, protest]);

    expect(publication.stateAt(PROTEST_ENDS_AT).status).toBe('PROTEST_PENDING');
    expect(publication.stateAt(PROTEST_ENDS_AT).openProtestReferences).toEqual(['P-001']);

    const resolution = publication.resolveProtest({
      protestReference: 'P-001',
      resolution: 'Score confirmed',
      officialName: 'Jury Member',
      resolvedAt: new Date('2026-08-29T01:12:00.000Z'),
    });
    publication = ResultPublication.reconstruct('event-1', 'QUALIFICATION', [...publication.entries, resolution]);

    expect(publication.stateAt(new Date('2026-08-29T01:12:00.000Z')).status).toBe('PROTEST_CLOSED');
  });

  it('rejects score protests submitted at or after the publication deadline', () => {
    const publication = preliminary();

    expect(() =>
      publication.registerProtest({
        protestReference: 'P-001',
        registeredAt: PROTEST_ENDS_AT,
      }),
    ).toThrow('The score protest window has closed');
  });

  it('publishes official results only for the same approved revision after protests close', () => {
    let publication = preliminary();
    const official = publication.publishOfficial({
      currentSnapshotRevision: REVISION_A,
      approvalSnapshotRevision: REVISION_A,
      approvalId: 'approval-1',
      officialName: 'RTS Jury Member',
      publishedAt: PROTEST_ENDS_AT,
    });
    publication = ResultPublication.reconstruct('event-1', 'QUALIFICATION', [...publication.entries, official]);

    expect(publication.stateAt(PROTEST_ENDS_AT)).toEqual(
      expect.objectContaining({ status: 'OFFICIAL', approvalId: 'approval-1' }),
    );
  });

  it('blocks official publication when results changed after preliminary publication', () => {
    const publication = preliminary();

    expect(() =>
      publication.publishOfficial({
        currentSnapshotRevision: REVISION_B,
        approvalSnapshotRevision: REVISION_B,
        approvalId: 'approval-1',
        officialName: 'RTS Jury Member',
        publishedAt: PROTEST_ENDS_AT,
      }),
    ).toThrow('The result list changed after the preliminary publication');
  });

  it('allows a revised preliminary list only after open protests are resolved', () => {
    let publication = preliminary();
    const protest = publication.registerProtest({
      protestReference: 'P-001',
      registeredAt: new Date('2026-08-29T01:05:00.000Z'),
    });
    publication = ResultPublication.reconstruct('event-1', 'QUALIFICATION', [...publication.entries, protest]);

    expect(() =>
      publication.publishPreliminary({
        snapshotRevision: REVISION_B,
        postedAt: new Date('2026-08-29T01:15:00.000Z'),
        protestWindowMs: 10 * 60 * 1000,
        officialName: 'RTS Officer',
      }),
    ).toThrow('Resolve all protests');
  });

  it('validates lifecycle invariants when reconstructing a stored journal', () => {
    const publication = preliminary();
    const lateProtest = createProtestRegisteredEntry({
      eventId: 'event-1',
      resultScope: 'QUALIFICATION',
      preliminaryId: publication.stateAt(POSTED_AT).preliminaryId!,
      protestReference: 'P-LATE',
      registeredAt: PROTEST_ENDS_AT,
    });

    expect(() =>
      ResultPublication.reconstruct('event-1', 'QUALIFICATION', [...publication.entries, lateProtest]),
    ).toThrow('The score protest window has closed');

    const protest = publication.registerProtest({
      protestReference: 'P-OPEN',
      registeredAt: new Date('2026-08-29T01:05:00.000Z'),
    });
    const officialWithOpenProtest = createOfficialPublishedEntry({
      eventId: 'event-1',
      resultScope: 'QUALIFICATION',
      preliminaryId: publication.stateAt(POSTED_AT).preliminaryId!,
      snapshotRevision: REVISION_A,
      approvalId: 'approval-1',
      officialName: 'RTS Jury Member',
      publishedAt: PROTEST_ENDS_AT,
    });

    expect(() =>
      ResultPublication.reconstruct('event-1', 'QUALIFICATION', [
        ...publication.entries,
        protest,
        officialWithOpenProtest,
      ]),
    ).toThrow('Resolve all protests');
  });

  it('does not allow a stored official publication to be silently superseded', () => {
    let publication = preliminary();
    const official = publication.publishOfficial({
      currentSnapshotRevision: REVISION_A,
      approvalSnapshotRevision: REVISION_A,
      approvalId: 'approval-1',
      officialName: 'RTS Jury Member',
      publishedAt: PROTEST_ENDS_AT,
    });
    publication = ResultPublication.reconstruct('event-1', 'QUALIFICATION', [...publication.entries, official]);
    const revised = createPreliminaryPublishedEntry({
      eventId: 'event-1',
      resultScope: 'QUALIFICATION',
      snapshotRevision: REVISION_B,
      postedAt: new Date('2026-08-29T01:20:00.000Z'),
      protestEndsAt: new Date('2026-08-29T01:30:00.000Z'),
      officialName: 'RTS Officer',
    });

    expect(() => ResultPublication.reconstruct('event-1', 'QUALIFICATION', [...publication.entries, revised])).toThrow(
      'Official results cannot be replaced',
    );
  });
});
