// SPDX-License-Identifier: MIT
import type { ResultPublicationStatusDto } from '@/shared/ipc/contracts';

import type { ResultPublicationEntry } from '../domain/ResultPublicationEntry';
import type { ResultPublicationView } from './ResultPublicationService';

export function toResultPublicationStatusDto(view: ResultPublicationView): ResultPublicationStatusDto {
  return {
    eventId: view.eventId,
    resultScope: view.resultScope,
    status: view.status,
    preliminaryId: view.preliminaryId,
    publicationSnapshotRevision: view.publicationSnapshotRevision,
    currentSnapshotRevision: view.currentSnapshotRevision,
    publicationCurrent: view.publicationCurrent,
    postedAt: view.postedAt?.toISOString() ?? null,
    protestEndsAt: view.protestEndsAt?.toISOString() ?? null,
    openProtestReferences: [...view.openProtestReferences],
    officialPublishedAt: view.officialPublishedAt?.toISOString() ?? null,
    approvalId: view.approvalId,
    canRegisterProtest: view.canRegisterProtest,
    canPublishOfficial: view.canPublishOfficial,
    issues: [...view.issues],
    history: view.history.map(toEntryDto),
  };
}

function toEntryDto(entry: ResultPublicationEntry): ResultPublicationStatusDto['history'][number] {
  const base = {
    id: entry.id,
    eventId: entry.eventId,
    resultScope: entry.resultScope,
    preliminaryId: entry.preliminaryId,
    recordedAt: entry.recordedAt.toISOString(),
  };
  switch (entry.type) {
    case 'PRELIMINARY_PUBLISHED':
      return {
        ...base,
        type: entry.type,
        snapshotRevision: entry.snapshotRevision,
        postingLocation: entry.postingLocation,
        postingReference: entry.postingReference,
        postedAt: entry.postedAt.toISOString(),
        protestEndsAt: entry.protestEndsAt.toISOString(),
        officialName: entry.officialName,
      };
    case 'PROTEST_REGISTERED':
      return { ...base, type: entry.type, protestReference: entry.protestReference };
    case 'PROTEST_RESOLVED':
      return {
        ...base,
        type: entry.type,
        protestReference: entry.protestReference,
        resolution: entry.resolution,
        officialName: entry.officialName,
      };
    case 'OFFICIAL_PUBLISHED':
      return {
        ...base,
        type: entry.type,
        snapshotRevision: entry.snapshotRevision,
        approvalId: entry.approvalId,
        officialName: entry.officialName,
      };
  }
}
