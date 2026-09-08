import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EstBackupCaptureService,
  type IEstBackupFeed,
} from '@/main/modules/est-backup-capture/EstBackupCaptureService';
import type { SelectedEstBackupRecordFile } from '@/main/modules/est-backup-verification/application/EstBackupRecordFileGateway';

function snapshot(content = '[{"key":"101","totalScore":600}]'): SelectedEstBackupRecordFile {
  return {
    fileName: 'backup.json',
    content,
    sizeBytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const services: EstBackupCaptureService[] = [];
function setup() {
  let current = snapshot();
  let exists = true;
  const read = vi.fn(async () => current);
  const choose = vi.fn<() => Promise<IEstBackupFeed | null>>(async () => ({ label: 'backup.json', read }));
  const captureSource = vi.fn(() => ({ sourceId: 'saved-source' }));
  const service = new EstBackupCaptureService({ choose }, { captureSource }, () => exists, ['.json']);
  services.push(service);
  return {
    service,
    choose,
    read,
    captureSource,
    setSource: (source: SelectedEstBackupRecordFile) => {
      current = source;
    },
    deleteEvent: () => {
      exists = false;
    },
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  services.splice(0).forEach((s) => s.dispose());
  vi.useRealTimers();
});

describe('continuous backup capture', () => {
  it('refreshes retained-source check time only when current source content has been retained', async () => {
    const f = setup();
    const run = await f.service.start('event', 1000);
    expect(run.retainedSourceCheckedAt).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    const retainedAt = f.service.status('event').retainedSourceCheckedAt;
    await vi.advanceTimersByTimeAsync(1000);
    const checkedAt = f.service.status('event').retainedSourceCheckedAt;
    expect(checkedAt).not.toBe(retainedAt);
    expect(f.captureSource).toHaveBeenCalledTimes(1);
    f.setSource(snapshot('[{"key":"101","totalScore":601}]'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.service.status('event').retainedSourceCheckedAt).toBe(checkedAt);
    f.read.mockRejectedValueOnce(new Error('Offline'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.service.status('event').retainedSourceCheckedAt).toBe(checkedAt);
    expect(f.service.status('event').checkedAt).not.toBe(checkedAt);
  });
  it('captures each complete file even when the source changes between every poll', async () => {
    const f = setup();
    const run = await f.service.start('event', 1000, undefined, { snapshotMode: 'COMPLETE_FILES' });
    expect(run).toMatchObject({ state: 'READY', snapshotMode: 'COMPLETE_FILES' });
    f.setSource(snapshot('[{"key":"101","totalScore":601}]'));
    await vi.advanceTimersByTimeAsync(1000);
    f.setSource(snapshot('[{"key":"101","totalScore":602}]'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.captureSource).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.captureSource).toHaveBeenCalledTimes(3);
  });

  it('keeps the last retained source if a complete-file import fails validation', async () => {
    const f = setup();
    const run = await f.service.start('event', 1000, undefined, { snapshotMode: 'COMPLETE_FILES' });
    f.setSource(snapshot('invalid'));
    f.captureSource.mockImplementationOnce(() => {
      throw new Error('Invalid JSON');
    });
    await f.service.check('event', run.runId!);
    expect(f.service.status('event')).toMatchObject({
      state: 'ERROR',
      sourceId: 'saved-source',
      error: 'Invalid JSON',
    });
    f.setSource(snapshot('[{"key":"101","totalScore":602}]'));
    await f.service.check('event', run.runId!);
    expect(f.service.status('event').state).toBe('READY');
  });

  it('retains only stable changed snapshots and never invokes scoring or approval workflows', async () => {
    const f = setup();
    expect((await f.service.start('event', 1000)).state).toBe('WAITING');
    expect(f.captureSource).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.captureSource).toHaveBeenCalledTimes(1);
    expect(f.service.status('event')).toMatchObject({ state: 'READY', sourceId: 'saved-source' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.captureSource).toHaveBeenCalledTimes(1);
    f.setSource(snapshot('[{"key":"101","totalScore":601}]'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.service.status('event').state).toBe('WAITING');
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.captureSource).toHaveBeenCalledTimes(2);
  });

  it('keeps retained evidence on read and parse failures and recovers without duplicating it', async () => {
    const f = setup();
    const started = await f.service.start('event', 1000);
    await f.service.check('event', started.runId!);
    f.read.mockRejectedValueOnce(new Error('Source offline'));
    await f.service.check('event', started.runId!);
    expect(f.service.status('event')).toMatchObject({
      state: 'ERROR',
      sourceId: 'saved-source',
      error: 'Source offline',
    });
    f.setSource(snapshot('incomplete'));
    await f.service.check('event', started.runId!);
    f.captureSource.mockImplementationOnce(() => {
      throw new Error('Invalid JSON');
    });
    await f.service.check('event', started.runId!);
    expect(f.service.status('event')).toMatchObject({
      state: 'ERROR',
      sourceId: 'saved-source',
      error: 'Invalid JSON',
    });
    f.setSource(snapshot());
    await f.service.check('event', started.runId!);
    expect(f.service.status('event')).toMatchObject({ state: 'READY', error: null });
    expect(f.captureSource).toHaveBeenCalledTimes(2);
  });

  it('discards an in-flight read after stop and rejects stale run controls', async () => {
    const f = setup();
    const started = await f.service.start('event', 1000);
    const pending = deferred<SelectedEstBackupRecordFile>();
    f.read.mockReturnValueOnce(pending.promise);
    const check = f.service.check('event', started.runId!);
    expect(() => f.service.stop('event', 'old-run')).toThrow('changed');
    f.service.stop('event', started.runId!);
    pending.resolve(snapshot());
    await check;
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.captureSource).not.toHaveBeenCalled();
    expect(f.service.status('event').state).toBe('STOPPED');
  });

  it('keeps the running source when selection is cancelled and ignores superseded chooser responses', async () => {
    const f = setup();
    const first = await f.service.start('event', 1000);
    f.choose.mockResolvedValueOnce(null);
    expect((await f.service.start('event', 1000)).runId).toBe(first.runId);
    const pending = deferred<IEstBackupFeed | null>();
    f.choose.mockReturnValueOnce(pending.promise);
    const oldSelection = f.service.start('event', 1000);
    const second = await f.service.start('event', 1000);
    pending.resolve({ label: 'obsolete', read: f.read });
    await oldSelection;
    expect(f.service.status('event').runId).toBe(second.runId);
    expect(() => f.service.stop('event', first.runId!)).toThrow('changed');
  });

  it('serializes reads and does not capture after an event is deleted', async () => {
    const f = setup();
    const run = await f.service.start('event', 1000);
    const pending = deferred<SelectedEstBackupRecordFile>();
    f.read.mockReturnValueOnce(pending.promise);
    const first = f.service.check('event', run.runId!);
    const second = f.service.check('event', run.runId!);
    expect(first).toBe(second);
    f.deleteEvent();
    pending.resolve(snapshot());
    await first;
    expect(f.captureSource).not.toHaveBeenCalled();
    expect(f.service.status('event').state).toBe('STOPPED');
    await expect(f.service.start('event', 1000)).rejects.toThrow('existing event');
  });

  it('requires consecutive samples even if a changed source briefly reverts to the retained version', async () => {
    const f = setup();
    const run = await f.service.start('event', 1000);
    await f.service.check('event', run.runId!);
    const different = snapshot('[{"key":"101","totalScore":601}]');
    f.setSource(different);
    await f.service.check('event', run.runId!);
    f.setSource(snapshot());
    await f.service.check('event', run.runId!);
    f.setSource(different);
    await f.service.check('event', run.runId!);
    expect(f.captureSource).toHaveBeenCalledTimes(1);
  });

  it('does not start or retain snapshots after shutdown', async () => {
    const f = setup();
    const pending = deferred<IEstBackupFeed | null>();
    f.choose.mockReturnValueOnce(pending.promise);
    const start = f.service.start('event', 1000);
    f.service.dispose();
    pending.resolve({ label: 'late', read: f.read });
    expect((await start).state).toBe('STOPPED');
    await expect(f.service.start('event', 1000)).rejects.toThrow('shutting down');
    expect(f.captureSource).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
