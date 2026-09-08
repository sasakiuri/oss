import { randomUUID } from 'node:crypto';

import type { SelectedEstBackupRecordFile } from '@/main/modules/est-backup-verification/application/EstBackupRecordFileGateway';
import type { EstBackupRecordParser } from '@/main/modules/est-backup-verification/domain/EstBackupRecordParser';
import type { EstBackupCaptureStatusDto } from '@/shared/ipc/contracts/estBackupVerification.contract';

import type { EstBackupAdapterReference, IEstBackupCapturePersistence } from './EstBackupCapturePersistence';
import {
  EstBackupSnapshotPolicy,
  type EstBackupSnapshotMode,
  type IEstBackupSnapshotPolicy,
} from './EstBackupSnapshotPolicy';

export interface IEstBackupFeed {
  readonly label: string;
  readonly reference?: EstBackupAdapterReference;
  read(): Promise<SelectedEstBackupRecordFile>;
}
export interface IEstBackupFeedSelector {
  choose(extensions: readonly string[]): Promise<IEstBackupFeed | null>;
}
export interface IEstBackupSnapshotCapture {
  captureSource(
    source: SelectedEstBackupRecordFile,
    eventId: string,
    parser?: EstBackupRecordParser,
  ): { sourceId?: string };
}
interface CaptureRun {
  status: EstBackupCaptureStatusDto;
  feed: IEstBackupFeed;
  parser?: EstBackupRecordParser;
  candidate: string | null;
  retained: string | null;
  timer?: ReturnType<typeof setTimeout>;
  pending?: Promise<EstBackupCaptureStatusDto>;
}

/** Captures stable evidence snapshots without access to scores, verification or publication. */
export class EstBackupCaptureService {
  private readonly runs = new Map<string, CaptureRun>();
  private readonly selections = new Map<string, object>();
  private readonly resumeErrors = new Map<string, string>();
  private disposed = false;

  constructor(
    private readonly feeds: IEstBackupFeedSelector,
    private readonly capture: IEstBackupSnapshotCapture,
    private readonly eventExists: (id: string) => boolean,
    private readonly extensions: readonly string[],
    private readonly now: () => Date = () => new Date(),
    private readonly snapshotPolicy: IEstBackupSnapshotPolicy = new EstBackupSnapshotPolicy(),
    private readonly persistence?: IEstBackupCapturePersistence,
  ) {}

  status(eventId: string): EstBackupCaptureStatusDto {
    const plan = this.persistence?.plans.find(eventId);
    return {
      ...(this.runs.get(eventId)?.status ?? {
        eventId,
        runId: null,
        state: this.resumeErrors.has(eventId) ? 'ERROR' : 'STOPPED',
        sourceLabel: plan?.sourceLabel ?? null,
        intervalMilliseconds: plan?.intervalMilliseconds ?? null,
        snapshotMode: plan?.snapshotMode ?? null,
        resumeOnStartup: plan?.resumeOnStartup ?? false,
        checkedAt: null,
        capturedAt: null,
        retainedSourceCheckedAt: null,
        sourceId: null,
        error: this.resumeErrors.get(eventId) ?? null,
      }),
      ...(this.resumeErrors.has(eventId)
        ? { state: 'ERROR' as const, runId: null, error: this.resumeErrors.get(eventId)! }
        : {}),
      canResume: !!plan,
    };
  }

  async start(
    eventId: string,
    intervalMilliseconds: number,
    parser?: EstBackupRecordParser,
    options: { snapshotMode?: EstBackupSnapshotMode; resumeOnStartup?: boolean } = {},
  ): Promise<EstBackupCaptureStatusDto> {
    if (this.disposed) throw new Error('Backup capture is shutting down');
    if (!this.eventExists(eventId)) throw new Error('Select an existing event before starting backup capture');
    if (!Number.isInteger(intervalMilliseconds) || intervalMilliseconds < 1000 || intervalMilliseconds > 300_000)
      throw new Error('Choose a capture interval between 1 and 300 seconds');
    const snapshotMode = options.snapshotMode ?? 'STABLE_READS';
    if (!['STABLE_READS', 'COMPLETE_FILES'].includes(snapshotMode)) throw new Error('Unknown backup snapshot mode');
    const selection = {};
    this.selections.set(eventId, selection);
    const feed = await this.feeds.choose(parser?.extensions ?? this.extensions);
    if (this.disposed || this.selections.get(eventId) !== selection) return this.status(eventId);
    this.selections.delete(eventId);
    if (!feed) return this.status(eventId);
    if (!this.eventExists(eventId)) throw new Error('The selected event no longer exists');
    if (options.resumeOnStartup && (!this.persistence || !feed.reference))
      throw new Error('This backup source cannot be restored after a restart');
    if (this.persistence) {
      if (feed.reference)
        this.persistence.plans.save({
          eventId,
          sourceLabel: feed.label,
          feed: feed.reference,
          parser: parser ? this.persistence.describeParser(parser) : null,
          intervalMilliseconds,
          snapshotMode,
          resumeOnStartup: options.resumeOnStartup ?? false,
          enabled: true,
        });
      else this.persistence.plans.remove(eventId);
    }
    return this.begin(eventId, feed, intervalMilliseconds, snapshotMode, options.resumeOnStartup ?? false, parser);
  }

  async resume(eventId: string): Promise<EstBackupCaptureStatusDto> {
    if (this.disposed) throw new Error('Backup capture is shutting down');
    const persistence = this.persistence;
    const plan = persistence?.plans.find(eventId);
    if (!persistence || !plan) throw new Error('No saved capture source is available');
    if (!this.eventExists(eventId)) throw new Error('The selected event no longer exists');
    if (this.runs.get(eventId)?.status.state !== 'STOPPED' && this.runs.has(eventId))
      throw new Error('Stop the current capture before resuming the saved source');
    const selection = {};
    this.selections.set(eventId, selection);
    try {
      const parser = plan.parser ? persistence.restoreParser(plan.parser) : undefined;
      const feed = await persistence.restoreFeed(plan.feed);
      if (this.disposed || this.selections.get(eventId) !== selection) return this.status(eventId);
      if (!this.eventExists(eventId)) throw new Error('The selected event no longer exists');
      persistence.plans.save({ ...plan, enabled: true });
      this.selections.delete(eventId);
      return this.begin(eventId, feed, plan.intervalMilliseconds, plan.snapshotMode, plan.resumeOnStartup, parser);
    } catch (error) {
      if (!this.disposed && this.selections.get(eventId) === selection) {
        this.selections.delete(eventId);
        this.resumeErrors.set(eventId, error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  async restoreSavedRuns(): Promise<void> {
    for (const plan of this.persistence?.plans.list() ?? []) {
      if (this.disposed) return;
      if (!this.eventExists(plan.eventId)) {
        this.persistence!.plans.remove(plan.eventId);
        continue;
      }
      if (plan.enabled && plan.resumeOnStartup) {
        // A slow source must not delay application startup or restoration of other events.
        // resume() records adapter failures; read failures remain visible on the running capture.
        void this.resume(plan.eventId).catch(() => {});
      }
    }
  }

  forgetSaved(eventId: string): EstBackupCaptureStatusDto {
    const run = this.runs.get(eventId);
    if (run && run.status.state !== 'STOPPED') throw new Error('Stop capture before forgetting the saved source');
    this.persistence?.plans.remove(eventId);
    this.selections.delete(eventId);
    this.resumeErrors.delete(eventId);
    this.runs.delete(eventId);
    return this.status(eventId);
  }

  private async begin(
    eventId: string,
    feed: IEstBackupFeed,
    intervalMilliseconds: number,
    snapshotMode: EstBackupSnapshotMode,
    resumeOnStartup: boolean,
    parser?: EstBackupRecordParser,
  ): Promise<EstBackupCaptureStatusDto> {
    this.cancel(this.runs.get(eventId));
    this.resumeErrors.delete(eventId);
    const run: CaptureRun = {
      feed,
      parser,
      candidate: null,
      retained: null,
      status: {
        eventId,
        runId: randomUUID(),
        state: 'WAITING',
        sourceLabel: feed.label,
        intervalMilliseconds,
        snapshotMode,
        resumeOnStartup,
        canResume: !!this.persistence?.plans.find(eventId),
        checkedAt: null,
        capturedAt: null,
        retainedSourceCheckedAt: null,
        sourceId: null,
        error: null,
      },
    };
    this.runs.set(eventId, run);
    await this.pollRun(run);
    this.schedule(run);
    return this.status(eventId);
  }

  stop(eventId: string, runId: string): EstBackupCaptureStatusDto {
    const run = this.requireRun(eventId, runId);
    const plan = this.persistence?.plans.find(eventId);
    if (plan) this.persistence!.plans.save({ ...plan, enabled: false });
    this.selections.delete(eventId);
    this.cancel(run);
    run.status.state = 'STOPPED';
    return this.status(eventId);
  }

  check(eventId: string, runId: string): Promise<EstBackupCaptureStatusDto> {
    return this.pollRun(this.requireRun(eventId, runId));
  }

  dispose(): void {
    this.disposed = true;
    this.selections.clear();
    for (const run of this.runs.values()) {
      this.cancel(run);
      run.status.state = 'STOPPED';
    }
  }

  private requireRun(eventId: string, runId: string): CaptureRun {
    const run = this.runs.get(eventId);
    if (!run || run.status.runId !== runId) throw new Error('The backup capture changed; refresh before continuing');
    return run;
  }
  private current(run: CaptureRun): boolean {
    return !this.disposed && this.runs.get(run.status.eventId) === run && run.status.state !== 'STOPPED';
  }
  private cancel(run?: CaptureRun): void {
    if (run?.timer) clearTimeout(run.timer);
  }
  private schedule(run: CaptureRun): void {
    if (!this.current(run)) return;
    run.timer = setTimeout(() => {
      void this.pollRun(run).finally(() => this.schedule(run));
    }, run.status.intervalMilliseconds!);
    run.timer.unref?.();
  }
  private pollRun(run: CaptureRun): Promise<EstBackupCaptureStatusDto> {
    if (run.pending) return run.pending;
    if (!this.current(run)) return Promise.resolve(this.status(run.status.eventId));
    run.pending = this.read(run).finally(() => {
      run.pending = undefined;
    });
    return run.pending;
  }
  private async read(run: CaptureRun): Promise<EstBackupCaptureStatusDto> {
    run.status.state = 'READING';
    try {
      const source = await run.feed.read();
      if (!this.current(run)) return this.status(run.status.eventId);
      if (!this.eventExists(run.status.eventId)) {
        this.cancel(run);
        run.status.state = 'STOPPED';
        run.status.error = 'The event no longer exists';
        return this.status(run.status.eventId);
      }
      run.status.checkedAt = this.now().toISOString();
      run.status.error = null;
      if (source.sha256 === run.retained) {
        run.candidate = source.sha256;
        run.status.retainedSourceCheckedAt = this.now().toISOString();
        run.status.state = 'READY';
      } else if (!this.snapshotPolicy.accepts(run.status.snapshotMode!, source.sha256, run.candidate)) {
        run.candidate = source.sha256;
        run.status.state = 'WAITING';
      } else {
        const receipt = this.capture.captureSource(source, run.status.eventId, run.parser);
        if (!receipt.sourceId) throw new Error('Backup capture did not retain an evidence source');
        run.retained = source.sha256;
        run.status.sourceId = receipt.sourceId;
        run.status.capturedAt = this.now().toISOString();
        run.status.retainedSourceCheckedAt = run.status.capturedAt;
        run.status.state = 'READY';
      }
    } catch (error) {
      if (this.current(run)) {
        run.candidate = null;
        run.status.checkedAt = this.now().toISOString();
        run.status.state = 'ERROR';
        run.status.error = error instanceof Error ? error.message : String(error);
      }
    }
    return this.status(run.status.eventId);
  }
}
