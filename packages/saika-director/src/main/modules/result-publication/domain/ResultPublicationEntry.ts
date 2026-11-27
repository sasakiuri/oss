import type { ResultScope } from '@/main/domain/resultScope';
import { validDate, requiredText, sha256Digest } from '@/main/domain/guards';

export type ResultPublicationEntry =
  PreliminaryPublishedEntry | ProtestRegisteredEntry | ProtestResolvedEntry | OfficialPublishedEntry;

interface ResultPublicationEntryBase {
  readonly id: string;
  readonly eventId: string;
  readonly resultScope: ResultScope;
  readonly preliminaryId: string;
  readonly recordedAt: Date;
}

export interface PreliminaryPublishedEntry extends ResultPublicationEntryBase {
  readonly type: 'PRELIMINARY_PUBLISHED';
  readonly snapshotRevision: string;
  readonly postedAt: Date;
  readonly protestEndsAt: Date;
  readonly officialName: string;
  readonly postingLocation?: string;
  readonly postingReference?: string;
}

export interface ProtestRegisteredEntry extends ResultPublicationEntryBase {
  readonly type: 'PROTEST_REGISTERED';
  readonly protestReference: string;
}

export interface ProtestResolvedEntry extends ResultPublicationEntryBase {
  readonly type: 'PROTEST_RESOLVED';
  readonly protestReference: string;
  readonly resolution: string;
  readonly officialName: string;
}

export interface OfficialPublishedEntry extends ResultPublicationEntryBase {
  readonly type: 'OFFICIAL_PUBLISHED';
  readonly snapshotRevision: string;
  readonly approvalId: string;
  readonly officialName: string;
}

export function createPreliminaryPublishedEntry(props: {
  eventId: string;
  resultScope: ResultScope;
  snapshotRevision: string;
  postedAt: Date;
  protestEndsAt: Date;
  officialName: string;
  recordedAt?: Date;
  postingLocation?: string;
  postingReference?: string;
}): PreliminaryPublishedEntry {
  const id = crypto.randomUUID();
  return reconstructResultPublicationEntry({
    id,
    eventId: props.eventId,
    resultScope: props.resultScope,
    type: 'PRELIMINARY_PUBLISHED',
    preliminaryId: id,
    snapshotRevision: props.snapshotRevision,
    postedAt: props.postedAt,
    protestEndsAt: props.protestEndsAt,
    officialName: props.officialName,
    recordedAt: props.recordedAt ?? props.postedAt,
    ...(props.postingLocation !== undefined ? { postingLocation: props.postingLocation } : {}),
    ...(props.postingReference !== undefined ? { postingReference: props.postingReference } : {}),
  });
}

export function createProtestRegisteredEntry(props: {
  eventId: string;
  resultScope: ResultScope;
  preliminaryId: string;
  protestReference: string;
  registeredAt: Date;
}): ProtestRegisteredEntry {
  return reconstructResultPublicationEntry({
    id: crypto.randomUUID(),
    eventId: props.eventId,
    resultScope: props.resultScope,
    type: 'PROTEST_REGISTERED',
    preliminaryId: props.preliminaryId,
    protestReference: props.protestReference,
    recordedAt: props.registeredAt,
  });
}

export function createProtestResolvedEntry(props: {
  eventId: string;
  resultScope: ResultScope;
  preliminaryId: string;
  protestReference: string;
  resolution: string;
  officialName: string;
  resolvedAt: Date;
}): ProtestResolvedEntry {
  return reconstructResultPublicationEntry({
    id: crypto.randomUUID(),
    eventId: props.eventId,
    resultScope: props.resultScope,
    type: 'PROTEST_RESOLVED',
    preliminaryId: props.preliminaryId,
    protestReference: props.protestReference,
    resolution: props.resolution,
    officialName: props.officialName,
    recordedAt: props.resolvedAt,
  });
}

export function createOfficialPublishedEntry(props: {
  eventId: string;
  resultScope: ResultScope;
  preliminaryId: string;
  snapshotRevision: string;
  approvalId: string;
  officialName: string;
  publishedAt: Date;
}): OfficialPublishedEntry {
  return reconstructResultPublicationEntry({
    id: crypto.randomUUID(),
    eventId: props.eventId,
    resultScope: props.resultScope,
    type: 'OFFICIAL_PUBLISHED',
    preliminaryId: props.preliminaryId,
    snapshotRevision: props.snapshotRevision,
    approvalId: props.approvalId,
    officialName: props.officialName,
    recordedAt: props.publishedAt,
  });
}

export function reconstructResultPublicationEntry(entry: PreliminaryPublishedEntry): PreliminaryPublishedEntry;
export function reconstructResultPublicationEntry(entry: ProtestRegisteredEntry): ProtestRegisteredEntry;
export function reconstructResultPublicationEntry(entry: ProtestResolvedEntry): ProtestResolvedEntry;
export function reconstructResultPublicationEntry(entry: OfficialPublishedEntry): OfficialPublishedEntry;
export function reconstructResultPublicationEntry(entry: ResultPublicationEntry): ResultPublicationEntry {
  requiredText(entry.id, 'id');
  requiredText(entry.eventId, 'eventId');
  requiredText(entry.preliminaryId, 'preliminaryId');
  validDate(entry.recordedAt, 'recordedAt');

  switch (entry.type) {
    case 'PRELIMINARY_PUBLISHED': {
      sha256Digest(entry.snapshotRevision, 'snapshotRevision');
      requiredText(entry.officialName, 'officialName');
      const postedAt = validDate(entry.postedAt, 'postedAt');
      const protestEndsAt = validDate(entry.protestEndsAt, 'protestEndsAt');
      if (postedAt.getTime() > entry.recordedAt.getTime()) throw new Error('Posting time cannot be in the future');
      if (entry.postingLocation !== undefined) requiredText(entry.postingLocation, 'postingLocation');
      if (entry.postingReference !== undefined) requiredText(entry.postingReference, 'postingReference');
      if (protestEndsAt.getTime() <= postedAt.getTime()) {
        throw new Error('protestEndsAt must be after postedAt');
      }
      if (entry.preliminaryId !== entry.id) throw new Error('A preliminary entry must reference its own id');
      return Object.freeze({
        ...entry,
        postedAt,
        protestEndsAt,
        recordedAt: validDate(entry.recordedAt, 'recordedAt'),
        officialName: entry.officialName.trim(),
        ...(entry.postingLocation !== undefined ? { postingLocation: entry.postingLocation.trim() } : {}),
        ...(entry.postingReference !== undefined ? { postingReference: entry.postingReference.trim() } : {}),
      });
    }
    case 'PROTEST_REGISTERED':
      requiredText(entry.protestReference, 'protestReference');
      return Object.freeze({
        ...entry,
        protestReference: entry.protestReference.trim(),
        recordedAt: validDate(entry.recordedAt, 'recordedAt'),
      });
    case 'PROTEST_RESOLVED':
      requiredText(entry.protestReference, 'protestReference');
      requiredText(entry.resolution, 'resolution');
      requiredText(entry.officialName, 'officialName');
      return Object.freeze({
        ...entry,
        protestReference: entry.protestReference.trim(),
        resolution: entry.resolution.trim(),
        officialName: entry.officialName.trim(),
        recordedAt: validDate(entry.recordedAt, 'recordedAt'),
      });
    case 'OFFICIAL_PUBLISHED':
      sha256Digest(entry.snapshotRevision, 'snapshotRevision');
      requiredText(entry.approvalId, 'approvalId');
      requiredText(entry.officialName, 'officialName');
      return Object.freeze({
        ...entry,
        approvalId: entry.approvalId.trim(),
        officialName: entry.officialName.trim(),
        recordedAt: validDate(entry.recordedAt, 'recordedAt'),
      });
  }
}
