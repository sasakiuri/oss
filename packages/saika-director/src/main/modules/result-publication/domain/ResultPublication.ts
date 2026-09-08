import {
  createOfficialPublishedEntry,
  createPreliminaryPublishedEntry,
  createProtestRegisteredEntry,
  createProtestResolvedEntry,
  type OfficialPublishedEntry,
  type PreliminaryPublishedEntry,
  type ProtestRegisteredEntry,
  type ResultPublicationEntry,
  type ResultPublicationScope,
} from './ResultPublicationEntry';

export type ResultPublicationStatus = 'DRAFT' | 'PRELIMINARY' | 'PROTEST_PENDING' | 'PROTEST_CLOSED' | 'OFFICIAL';

interface PublicationCycle {
  readonly preliminary: PreliminaryPublishedEntry;
  readonly registeredProtests: ReadonlyMap<string, ProtestRegisteredEntry>;
  readonly resolvedProtests: ReadonlySet<string>;
  readonly official: OfficialPublishedEntry | null;
}

export interface ResultPublicationState {
  readonly eventId: string;
  readonly resultScope: ResultPublicationScope;
  readonly status: ResultPublicationStatus;
  readonly preliminaryId: string | null;
  readonly snapshotRevision: string | null;
  readonly postedAt: Date | null;
  readonly protestEndsAt: Date | null;
  readonly openProtestReferences: readonly string[];
  readonly officialPublishedAt: Date | null;
  readonly approvalId: string | null;
}

/** Pure state machine for one event/result-scope publication journal. */
export class ResultPublication {
  private constructor(
    readonly eventId: string,
    readonly resultScope: ResultPublicationScope,
    readonly entries: readonly ResultPublicationEntry[],
    private readonly currentCycle: PublicationCycle | null,
  ) {}

  static empty(eventId: string, resultScope: ResultPublicationScope): ResultPublication {
    validateText(eventId, 'eventId');
    return new ResultPublication(eventId, resultScope, Object.freeze([]), null);
  }

  static reconstruct(
    eventId: string,
    resultScope: ResultPublicationScope,
    entries: readonly ResultPublicationEntry[],
  ): ResultPublication {
    const publication = ResultPublication.empty(eventId, resultScope);
    if (entries.some((entry) => entry.eventId !== eventId || entry.resultScope !== resultScope)) {
      throw new Error('Publication journal contains an entry for another event or result scope');
    }

    const cycles = new Map<string, PublicationCycle>();
    let currentCycle: PublicationCycle | null = null;
    for (const entry of entries) {
      if (entry.type === 'PRELIMINARY_PUBLISHED') {
        if (cycles.has(entry.id)) throw new Error(`Duplicate preliminary entry ${entry.id}`);
        if (currentCycle?.official) {
          throw new Error('Official results cannot be replaced by a preliminary publication');
        }
        if (currentCycle && openProtestReferences(currentCycle).length > 0) {
          throw new Error('Resolve all protests before publishing a revised preliminary result list');
        }
        if (currentCycle?.preliminary.snapshotRevision === entry.snapshotRevision) {
          throw new Error('This result-list revision is already published as preliminary');
        }
        currentCycle = {
          preliminary: entry,
          registeredProtests: new Map(),
          resolvedProtests: new Set(),
          official: null,
        };
        cycles.set(entry.id, currentCycle);
        continue;
      }

      const cycle = cycles.get(entry.preliminaryId);
      if (!cycle) throw new Error(`Entry ${entry.id} references an unknown preliminary publication`);
      if (currentCycle?.preliminary.id !== entry.preliminaryId) {
        throw new Error(`Entry ${entry.id} does not reference the current preliminary publication`);
      }
      if (entry.type === 'PROTEST_REGISTERED') {
        if (cycle.official) throw new Error('Official results no longer accept score protests');
        if (entry.recordedAt.getTime() < cycle.preliminary.postedAt.getTime()) {
          throw new Error('A score protest cannot be registered before preliminary results are posted');
        }
        if (entry.recordedAt.getTime() >= cycle.preliminary.protestEndsAt.getTime()) {
          throw new Error('The score protest window has closed');
        }
        if (cycle.registeredProtests.has(entry.protestReference)) {
          throw new Error(`Duplicate protest reference ${entry.protestReference}`);
        }
        const updated = {
          ...cycle,
          registeredProtests: new Map(cycle.registeredProtests).set(entry.protestReference, entry),
        };
        cycles.set(entry.preliminaryId, updated);
        if (currentCycle?.preliminary.id === entry.preliminaryId) currentCycle = updated;
        continue;
      }
      if (entry.type === 'PROTEST_RESOLVED') {
        if (cycle.official) throw new Error('Official results cannot have an unresolved protest');
        if (!cycle.registeredProtests.has(entry.protestReference)) {
          throw new Error(`Cannot resolve unknown protest ${entry.protestReference}`);
        }
        if (cycle.resolvedProtests.has(entry.protestReference)) {
          throw new Error(`Protest ${entry.protestReference} is already resolved`);
        }
        const updated = {
          ...cycle,
          resolvedProtests: new Set(cycle.resolvedProtests).add(entry.protestReference),
        };
        cycles.set(entry.preliminaryId, updated);
        if (currentCycle?.preliminary.id === entry.preliminaryId) currentCycle = updated;
        continue;
      }
      if (cycle.official) throw new Error(`Preliminary publication ${entry.preliminaryId} is already official`);
      if (entry.snapshotRevision !== cycle.preliminary.snapshotRevision) {
        throw new Error('Official publication revision does not match its preliminary publication');
      }
      if (entry.recordedAt.getTime() < cycle.preliminary.protestEndsAt.getTime()) {
        throw new Error('The score protest window is still open');
      }
      if (openProtestReferences(cycle).length > 0) {
        throw new Error('Resolve all protests before publishing official results');
      }
      const updated = { ...cycle, official: entry };
      cycles.set(entry.preliminaryId, updated);
      if (currentCycle?.preliminary.id === entry.preliminaryId) currentCycle = updated;
    }

    return new ResultPublication(
      publication.eventId,
      publication.resultScope,
      Object.freeze([...entries]),
      currentCycle,
    );
  }

  stateAt(now: Date): ResultPublicationState {
    validateDate(now, 'now');
    const cycle = this.currentCycle;
    if (!cycle) {
      return {
        eventId: this.eventId,
        resultScope: this.resultScope,
        status: 'DRAFT',
        preliminaryId: null,
        snapshotRevision: null,
        postedAt: null,
        protestEndsAt: null,
        openProtestReferences: Object.freeze([]),
        officialPublishedAt: null,
        approvalId: null,
      };
    }

    const openProtests = [...cycle.registeredProtests.keys()].filter(
      (reference) => !cycle.resolvedProtests.has(reference),
    );
    const status: ResultPublicationStatus = cycle.official
      ? 'OFFICIAL'
      : openProtests.length > 0
        ? 'PROTEST_PENDING'
        : now.getTime() >= cycle.preliminary.protestEndsAt.getTime()
          ? 'PROTEST_CLOSED'
          : 'PRELIMINARY';
    return {
      eventId: this.eventId,
      resultScope: this.resultScope,
      status,
      preliminaryId: cycle.preliminary.id,
      snapshotRevision: cycle.preliminary.snapshotRevision,
      postedAt: new Date(cycle.preliminary.postedAt.getTime()),
      protestEndsAt: new Date(cycle.preliminary.protestEndsAt.getTime()),
      openProtestReferences: Object.freeze(openProtests),
      officialPublishedAt: cycle.official ? new Date(cycle.official.recordedAt.getTime()) : null,
      approvalId: cycle.official?.approvalId ?? null,
    };
  }

  publishPreliminary(props: {
    snapshotRevision: string;
    postedAt: Date;
    protestWindowMs: number;
    officialName: string;
    recordedAt?: Date;
    postingLocation?: string;
    postingReference?: string;
  }): PreliminaryPublishedEntry {
    validateDate(props.postedAt, 'postedAt');
    if (!Number.isInteger(props.protestWindowMs) || props.protestWindowMs <= 0) {
      throw new Error('protestWindowMs must be a positive integer');
    }
    if (this.currentCycle?.official)
      throw new Error('Official results cannot be replaced by a preliminary publication');
    if (this.openProtestReferences().length > 0) {
      throw new Error('Resolve all protests before publishing a revised preliminary result list');
    }
    if (this.currentCycle?.preliminary.snapshotRevision === props.snapshotRevision) {
      throw new Error('This result-list revision is already published as preliminary');
    }
    if (this.currentCycle && props.postedAt.getTime() < this.currentCycle.preliminary.postedAt.getTime()) {
      throw new Error('A revised result list cannot be posted before the previous publication');
    }
    return createPreliminaryPublishedEntry({
      eventId: this.eventId,
      resultScope: this.resultScope,
      snapshotRevision: props.snapshotRevision,
      postedAt: props.postedAt,
      protestEndsAt: new Date(props.postedAt.getTime() + props.protestWindowMs),
      officialName: props.officialName,
      recordedAt: props.recordedAt,
      postingLocation: props.postingLocation,
      postingReference: props.postingReference,
    });
  }

  registerProtest(props: { protestReference: string; registeredAt: Date }): ProtestRegisteredEntry {
    const cycle = this.requireCurrentCycle();
    validateDate(props.registeredAt, 'registeredAt');
    if (cycle.official) throw new Error('Official results no longer accept score protests');
    if (props.registeredAt.getTime() >= cycle.preliminary.protestEndsAt.getTime()) {
      throw new Error('The score protest window has closed');
    }
    if (cycle.registeredProtests.has(props.protestReference.trim())) {
      throw new Error(`Protest ${props.protestReference.trim()} is already registered`);
    }
    return createProtestRegisteredEntry({
      eventId: this.eventId,
      resultScope: this.resultScope,
      preliminaryId: cycle.preliminary.id,
      protestReference: props.protestReference,
      registeredAt: props.registeredAt,
    });
  }

  resolveProtest(props: {
    protestReference: string;
    resolution: string;
    officialName: string;
    resolvedAt: Date;
  }): ResultPublicationEntry {
    const cycle = this.requireCurrentCycle();
    const reference = props.protestReference.trim();
    if (!cycle.registeredProtests.has(reference)) throw new Error(`Protest ${reference} is not registered`);
    if (cycle.resolvedProtests.has(reference)) throw new Error(`Protest ${reference} is already resolved`);
    if (cycle.official) throw new Error('Official results cannot have an unresolved protest');
    return createProtestResolvedEntry({
      eventId: this.eventId,
      resultScope: this.resultScope,
      preliminaryId: cycle.preliminary.id,
      protestReference: reference,
      resolution: props.resolution,
      officialName: props.officialName,
      resolvedAt: props.resolvedAt,
    });
  }

  publishOfficial(props: {
    currentSnapshotRevision: string;
    approvalSnapshotRevision: string;
    approvalId: string;
    officialName: string;
    publishedAt: Date;
  }): OfficialPublishedEntry {
    const cycle = this.requireCurrentCycle();
    validateDate(props.publishedAt, 'publishedAt');
    if (cycle.official) throw new Error('Results are already official');
    if (props.publishedAt.getTime() < cycle.preliminary.protestEndsAt.getTime()) {
      throw new Error('The score protest window is still open');
    }
    if (this.openProtestReferences().length > 0)
      throw new Error('Resolve all protests before publishing official results');
    if (props.currentSnapshotRevision !== cycle.preliminary.snapshotRevision) {
      throw new Error('The result list changed after the preliminary publication');
    }
    if (props.approvalSnapshotRevision !== cycle.preliminary.snapshotRevision) {
      throw new Error('The current RTS approval does not cover the preliminary result-list revision');
    }
    return createOfficialPublishedEntry({
      eventId: this.eventId,
      resultScope: this.resultScope,
      preliminaryId: cycle.preliminary.id,
      snapshotRevision: cycle.preliminary.snapshotRevision,
      approvalId: props.approvalId,
      officialName: props.officialName,
      publishedAt: props.publishedAt,
    });
  }

  private openProtestReferences(): string[] {
    const cycle = this.currentCycle;
    if (!cycle) return [];
    return openProtestReferences(cycle);
  }

  private requireCurrentCycle(): PublicationCycle {
    if (!this.currentCycle) throw new Error('Publish preliminary results first');
    return this.currentCycle;
  }
}

function openProtestReferences(cycle: PublicationCycle): string[] {
  return [...cycle.registeredProtests.keys()].filter((reference) => !cycle.resolvedProtests.has(reference));
}

function validateText(value: string, name: string): void {
  if (value.trim().length === 0) throw new Error(`${name} is required`);
}

function validateDate(value: Date, name: string): void {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
}
