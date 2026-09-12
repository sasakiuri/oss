// SPDX-License-Identifier: MIT
import { z } from 'zod';

import {
  ScreenConfigSchema,
  SelectionSchema,
  SnapshotEntrySchema,
  type AudienceState,
  type Monitor,
  type SnapshotEntry,
} from '../shared/model';

import { AtomicStore, type StoreWriteResult } from './AtomicStore';
import { type Document, messageOf, snapshotKey } from './document';

export const OwnerSchema = z.object({
  controllerId: z.string().min(1),
  controllerGeneration: z.number().int().nonnegative().safe(),
});
export const FrameSchema = OwnerSchema.extend({
  sequence: z.number().int().nonnegative().safe(),
  configs: z.array(z.object({ id: z.string(), revision: z.number().int().positive() })),
  entries: z.array(z.unknown()),
});

const EntryIdentitySchema = z.object({ snapshot: SelectionSchema.pick({ sourceId: true, subjectId: true }) });
type InvalidSnapshot = { raw: unknown; key: string | null; error: string };
function invalidSnapshot(raw: unknown, index: number, error: z.ZodError): InvalidSnapshot {
  const identity = EntryIdentitySchema.safeParse(raw);
  const subject = identity.success ? identity.data.snapshot : null;
  const issue = error.issues[0];
  return {
    raw,
    key: subject ? snapshotKey(subject.sourceId, subject.subjectId) : null,
    error: `Snapshot ${subject ? `${subject.sourceId} / ${subject.subjectId}` : `entry ${index + 1} (identity unavailable)`} is invalid: ${issue?.path.join('.') || 'entry'}: ${issue?.message || 'Validation failed'}`,
  };
}

/** Memory follows the current file. Storage confirmation and audience rendering remain separate. */
export class DisplayState {
  private pending: Promise<unknown> = Promise.resolve();
  private writeFailure: Error | null = null;
  private storageError: string | null = null;
  private frameSequence = -1;
  private identify = new Map<string, number>();
  private entries = new Map<string, SnapshotEntry>();
  private invalidSnapshots: InvalidSnapshot[] = [];
  private frameErrors: InvalidSnapshot[] = [];
  private updates: Array<{
    entry: SnapshotEntry;
    isCurrent: () => boolean;
    resolve: (result: StoreWriteResult) => void;
    reject: (error: unknown) => void;
  }> = [];
  private updateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public document: Document,
    private readonly store: AtomicStore<Document>,
    private readonly changed: () => void,
  ) {
    for (const [index, raw] of document.snapshots.entries()) {
      const parsed = SnapshotEntrySchema.safeParse(raw);
      if (!parsed.success) {
        this.invalidSnapshots.push(invalidSnapshot(raw, index, parsed.error));
        continue;
      }
      const entry = parsed.data;
      const saved = { ...entry, state: 'saved' as const };
      this.entries.set(snapshotKey(entry.snapshot.sourceId, entry.snapshot.subjectId), saved);
    }
  }

  get persistenceError(): string | null {
    return this.storageError;
  }

  /** A resolved result means the file is current; callers must complete its effects even when sync is unconfirmed. */
  transact(update: (current: Document) => Document, afterReplace?: () => void): Promise<StoreWriteResult> {
    const operation = this.pending
      .catch(() => undefined)
      .then(async (): Promise<StoreWriteResult> => {
        const next = update(this.document);
        if (next === this.document && !afterReplace && !this.storageError) return { durable: true };
        let result: StoreWriteResult = { durable: true };
        if (next !== this.document || this.storageError) {
          try {
            result = await this.store.write(next);
          } catch (error) {
            this.writeFailure = error instanceof Error ? error : new Error(messageOf(error));
            throw error;
          }
          this.writeFailure = null;
          this.storageError = result.durable ? null : result.error.message;
        }
        if (
          next.controller?.id !== this.document.controller?.id ||
          next.controller?.generation !== this.document.controller?.generation
        )
          this.frameErrors = [];
        this.document = next;
        afterReplace?.();
        this.changed();
        return result;
      });
    // The queue tracks completion; only actual failed writes prevent a successful flush.
    this.pending = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async flush(): Promise<void> {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
      await this.flushEntries();
    }
    await this.pending;
    if (this.writeFailure) throw this.writeFailure;
  }

  assertOwner(owner: z.infer<typeof OwnerSchema>): void {
    if (this.document.releasing) throw new Error('Display control is being released');
    const current = this.document.controller;
    if (!current || current.id !== owner.controllerId || current.generation !== owner.controllerGeneration)
      throw new Error('Display control is not registered for this controller session');
  }

  private assertSecret(secret?: string): void {
    if (secret !== undefined && secret !== this.document.secret)
      throw new Error('The display pairing authority was revoked');
  }

  async register(input: unknown, secret?: string): Promise<StoreWriteResult> {
    const owner = OwnerSchema.parse(input);
    let reset = false;
    return this.transact(
      (document) => {
        if (document.releasing) throw new Error('Display control is being released');
        this.assertSecret(secret);
        if (document.peers.length)
          throw new Error(
            'This PC manages other displays. Disconnect those display PCs before registering a controller.',
          );
        const current = document.controller;
        if (current && (current.id !== owner.controllerId || current.generation > owner.controllerGeneration))
          throw new Error('Another controller owns this display. Revoke control on this PC before pairing again.');
        if (current?.id === owner.controllerId && current.generation === owner.controllerGeneration) return document;
        reset = !current || current.generation !== owner.controllerGeneration;
        return { ...document, controller: { id: owner.controllerId, generation: owner.controllerGeneration } };
      },
      () => {
        if (reset) this.frameSequence = -1;
      },
    );
  }

  async apply(
    configInput: unknown,
    monitors: Monitor[],
    owner?: z.infer<typeof OwnerSchema>,
    secret?: string,
  ): Promise<StoreWriteResult> {
    const config = ScreenConfigSchema.parse(configInput);
    return this.transact((document) => {
      if (document.releasing) throw new Error('Display control is being released');
      this.assertSecret(secret);
      if (owner) this.assertOwner(owner);
      else if (document.controller)
        throw new Error('This PC is managed remotely. Revoke control before editing locally.');
      const previous = document.screens.find((screen) => screen.id === config.id);
      if (previous && config.revision <= previous.revision) {
        if (JSON.stringify(config) === JSON.stringify(previous)) return document;
        throw new Error('An older or conflicting screen configuration was rejected');
      }
      if (!monitors.some((monitor) => monitor.id === config.monitorId))
        throw new Error('The selected monitor is not connected');
      if (document.screens.some((screen) => screen.id !== config.id && screen.monitorId === config.monitorId))
        throw new Error('This monitor is already assigned to another audience screen');
      const screens = [...document.screens.filter((screen) => screen.id !== config.id), config];
      return { ...document, screens };
    });
  }

  async remove(screenId: string, owner?: z.infer<typeof OwnerSchema>, secret?: string): Promise<StoreWriteResult> {
    return this.transact((document) => {
      this.assertSecret(secret);
      if (owner) this.assertOwner(owner);
      else if (document.controller) throw new Error('Revoke remote control before editing locally');
      return { ...document, screens: document.screens.filter((screen) => screen.id !== screenId) };
    });
  }

  async receiveFrame(input: unknown, secret?: string): Promise<StoreWriteResult> {
    const frame = FrameSchema.parse(input);
    // Peer wall clocks need not agree. Preserve source timestamps for clock
    // synchronization checks, but measure delivery freshness on this PC.
    const receivedAt = Date.now();
    let next: Map<string, SnapshotEntry>;
    const errors: InvalidSnapshot[] = [];
    return this.transact(
      (document) => {
        this.assertSecret(secret);
        this.assertOwner(frame);
        if (frame.sequence <= this.frameSequence) throw new Error('An older display frame was rejected');
        for (const config of frame.configs) {
          if (!document.screens.some((screen) => screen.id === config.id && screen.revision === config.revision))
            throw new Error('The display frame does not match the applied configuration');
        }
        const expected = new Set(
          document.screens.flatMap((screen) =>
            screen.selections.map((selection) => snapshotKey(selection.sourceId, selection.subjectId)),
          ),
        );
        for (const raw of frame.entries) {
          const identity = EntryIdentitySchema.safeParse(raw);
          if (
            identity.success &&
            !expected.has(snapshotKey(identity.data.snapshot.sourceId, identity.data.snapshot.subjectId))
          )
            throw new Error('The frame contains an unselected subject');
        }
        next = new Map(this.entries);
        for (const [index, raw] of frame.entries.entries()) {
          const parsed = SnapshotEntrySchema.safeParse(raw);
          if (!parsed.success) {
            const failure = invalidSnapshot(raw, index, parsed.error);
            errors.push(failure);
            const previous = failure.key ? next.get(failure.key) : undefined;
            if (previous) next.set(failure.key!, { ...previous, state: 'stale', error: failure.error });
            continue;
          }
          const entry = { ...parsed.data, receivedAt };
          const key = snapshotKey(entry.snapshot.sourceId, entry.snapshot.subjectId);
          const previous = next.get(key);
          try {
            this.checkRevision(previous, entry);
            next.set(key, entry);
          } catch (error) {
            // A replacement controller can have an older cache for just one source.
            // Retain that subject's coherent version while accepting unrelated updates.
            if (previous) next.set(key, { ...previous, state: 'stale', error: messageOf(error) });
          }
        }
        return { ...document, snapshots: [...next.values(), ...this.invalidSnapshots.map((failure) => failure.raw)] };
      },
      () => {
        // Keep the cache and frame sequence consistent with the replaced file, even if its sync failed.
        this.frameSequence = frame.sequence;
        this.entries = next;
        this.frameErrors = errors;
      },
    );
  }

  private checkRevision(previous: SnapshotEntry | undefined, next: SnapshotEntry): void {
    if (!previous) return;
    if (previous.snapshot.generation !== next.snapshot.generation)
      throw new Error('The selected subject changed generation; select the new subject explicitly');
    if (previous.snapshot.revision > next.snapshot.revision) throw new Error('An older source snapshot was rejected');
    if (previous.snapshot.definition.fingerprint !== next.snapshot.definition.fingerprint)
      throw new Error('The selected subject changed its display definition');
    if (JSON.stringify(previous.snapshot.definition) !== JSON.stringify(next.snapshot.definition))
      throw new Error('The source changed the contents of a pinned definition');
    if (previous.snapshot.revision === next.snapshot.revision) {
      const before = { ...previous.snapshot, capturedAt: 0 };
      const after = { ...next.snapshot, capturedAt: 0 };
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error('Conflicting data was received for the same snapshot revision');
    }
  }

  updateEntry(entry: SnapshotEntry, isCurrent: () => boolean = () => true): Promise<StoreWriteResult> {
    return new Promise((resolve, reject) => {
      this.updates.push({ entry, isCurrent, resolve, reject });
      if (!this.updateTimer)
        this.updateTimer = setTimeout(() => {
          this.updateTimer = null;
          void this.flushEntries();
        }, 20);
    });
  }

  /** Coalesce simultaneous lane arrivals into one durable write without coupling validation failures. */
  private async flushEntries(): Promise<void> {
    const batch = this.updates.splice(0);
    const accepted: typeof batch = [];
    const acceptedKeys = new Set<string>();
    let next: Map<string, SnapshotEntry>;
    try {
      const result = await this.transact(
        (document) => {
          next = new Map(this.entries);
          let dirty = false;
          for (const update of batch) {
            if (!update.isCurrent()) {
              update.resolve({ durable: true });
              continue;
            }
            const parsed = SnapshotEntrySchema.safeParse(update.entry);
            if (!parsed.success) {
              update.reject(new Error(invalidSnapshot(update.entry, batch.indexOf(update), parsed.error).error));
              continue;
            }
            const entry = parsed.data;
            const key = snapshotKey(entry.snapshot.sourceId, entry.snapshot.subjectId);
            const previous = next.get(key);
            try {
              this.checkRevision(previous, entry);
            } catch (error) {
              update.reject(error);
              continue;
            }
            dirty ||=
              !previous || previous.snapshot.revision !== entry.snapshot.revision || previous.state !== entry.state;
            next.set(key, entry);
            acceptedKeys.add(key);
            accepted.push(update);
          }
          return dirty
            ? { ...document, snapshots: [...next.values(), ...this.invalidSnapshots.map((failure) => failure.raw)] }
            : document;
        },
        () => {
          this.entries = next;
          this.frameErrors = this.frameErrors.filter(
            (failure) => failure.key === null || !acceptedKeys.has(failure.key),
          );
        },
      );
      for (const update of accepted) update.resolve(result);
    } catch (error) {
      for (const update of batch) update.reject(error);
    }
  }

  getEntries(): SnapshotEntry[] {
    return [...this.entries.values()].map((entry) =>
      entry.state === 'live' && Date.now() - entry.receivedAt > 4000
        ? { ...entry, state: 'stale', error: 'Updates have stopped' }
        : entry,
    );
  }

  snapshotErrors(selections?: Array<{ sourceId: string; subjectId: string }>): string | null {
    const keys =
      selections && new Set(selections.map((selection) => snapshotKey(selection.sourceId, selection.subjectId)));
    // Retain damaged/unsupported originals even after a validated version recovers
    // the subject. Unidentifiable values stay visible for operator diagnosis.
    const unresolved = this.invalidSnapshots.filter((failure) => !failure.key || !this.entries.has(failure.key));
    return (
      [...unresolved, ...this.frameErrors]
        .filter((failure) => !keys || failure.key === null || keys.has(failure.key))
        .map((failure) => failure.error)
        .join(' ') || null
    );
  }

  identifyScreen(screenId: string): void {
    if (!this.document.screens.some((screen) => screen.id === screenId)) throw new Error('Screen not found');
    this.identify.set(screenId, Date.now() + 10_000);
    this.changed();
  }

  audience(screenId: string): AudienceState {
    const config = this.document.screens.find((screen) => screen.id === screenId);
    if (!config) throw new Error('Screen not configured');
    const selected = new Set(
      config.selections.map((selection) => snapshotKey(selection.sourceId, selection.subjectId)),
    );
    const entries = this.getEntries().filter((entry) =>
      selected.has(snapshotKey(entry.snapshot.sourceId, entry.snapshot.subjectId)),
    );
    return {
      config,
      entries,
      identifyUntil: this.identify.get(screenId) ?? 0,
      saved: entries.some((entry) => entry.state !== 'live'),
    };
  }
}
