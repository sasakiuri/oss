import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelIntegrityError, deleteCachedModel, downloadModel, sha256Hex, type ModelFile } from '@/lib/model-download';

const bytes = new Uint8Array([1, 2, 3, 4]);

const serve = (body: Uint8Array<ArrayBuffer>) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status: 200 }));

const recorded = async (size: number): Promise<ModelFile> => ({
  url: 'https://example.test/model.onnx',
  sha256: await sha256Hex(bytes.buffer),
  bytes: size,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** One exclusive lock name at a time, in request order, as Web Locks grant it. */
const fakeLocks = () => {
  let queue = Promise.resolve();
  return {
    request: (_name: string, _options: object, work: () => Promise<unknown>) => {
      const turn = queue.then(work);
      queue = turn.then(
        () => undefined,
        () => undefined,
      );
      return turn;
    },
  };
};

describe('downloading a model file', () => {
  it('returns the file when its size and hash match the record', async () => {
    serve(bytes);
    const downloaded = await downloadModel(await recorded(4), () => undefined);
    expect(new Uint8Array(downloaded.data)).toEqual(bytes);
  });

  it('stops reading a response larger than the recorded file', async () => {
    serve(new Uint8Array(64));
    await expect(downloadModel(await recorded(4), () => undefined)).rejects.toBeInstanceOf(ModelIntegrityError);
  });

  it('does not keep a file whose download was aborted after the last byte arrived', async () => {
    serve(bytes);
    const deleted = new AbortController();
    const download = downloadModel(
      await recorded(4),
      (fraction) => {
        if (fraction === 1) deleted.abort();
      },
      deleted.signal,
    );
    await expect(download).rejects.toThrow();
  });

  it('refuses a response shorter than the recorded file', async () => {
    serve(bytes.slice(0, 3));
    await expect(downloadModel(await recorded(4), () => undefined)).rejects.toBeInstanceOf(ModelIntegrityError);
  });

  it('finishes a cache write before a delete from another tab removes the file', async () => {
    serve(bytes);
    const events: string[] = [];
    let finishPut!: () => void;
    const cache = {
      put: () =>
        new Promise<void>((resolve) => {
          events.push('put started');
          finishPut = () => {
            events.push('put done');
            resolve();
          };
        }),
      delete: async () => {
        events.push('deleted');
        return true;
      },
    };
    vi.stubGlobal('caches', { open: async () => cache });
    vi.stubGlobal('navigator', { ...navigator, locks: fakeLocks() });
    const download = downloadModel(await recorded(4), () => undefined);
    await vi.waitFor(() => expect(events).toEqual(['put started']));
    const deletion = deleteCachedModel(await recorded(4));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual(['put started']);
    finishPut();
    await download;
    await deletion;
    expect(events).toEqual(['put started', 'put done', 'deleted']);
  });
});
