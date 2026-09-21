// @vitest-environment node
import * as fs from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, HEAD } from '@/app/content/[...path]/route';
import { serveContentAsset } from '@/lib/content/assets';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
}));

let directory: string;
let contentDirectory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'knowledge-assets-'));
  contentDirectory = path.join(directory, 'content');
  await mkdir(path.join(contentDirectory, 'articles/example'), { recursive: true });
  await writeFile(path.join(contentDirectory, 'articles/example/document.pdf'), '0123456789');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

function get(segments = ['articles', 'example', 'document.pdf'], init?: RequestInit) {
  return serveContentAsset(new Request('https://knowledge.nilay.jp/content/test', init), segments, contentDirectory);
}

describe('content asset route', () => {
  it('serves exact file bytes, MIME, validators and HEAD without a public copy', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(await response.text()).toBe('0123456789');

    const head = await get(undefined, { method: 'HEAD', headers: { Range: 'bytes=0-2' } });
    expect(head.status).toBe(200);
    expect([...head.headers]).toEqual([...response.headers]);
    expect(await head.text()).toBe('');
  });

  it.each([
    ['index.md', 'text/markdown; charset=utf-8'],
    ['archive.html', 'text/html; charset=utf-8'],
    ['image.jpg', 'image/jpeg'],
    ['image.png', 'image/png'],
    ['image.gif', 'image/gif'],
    ['form.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['form.odt', 'application/vnd.oasis.opendocument.text'],
    ['other.bin', 'application/octet-stream'],
  ])('preserves downloadable content types for %s', async (filename, mime) => {
    const bytes = Buffer.from([0, 127, 128, 255]);
    await writeFile(path.join(contentDirectory, 'articles/example', filename), bytes);
    const response = await get(['articles', 'example', filename]);
    expect(response.headers.get('content-type')).toBe(mime);
    expect(response.headers.get('x-robots-tag')).toBe(filename.endsWith('.md') ? 'noindex' : null);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it('serves decoded Unicode paths and literal percent characters without decoding twice', async () => {
    for (const filename of ['添付 資料.pdf', '%2e%2e.pdf']) {
      await writeFile(path.join(contentDirectory, 'articles/example', filename), 'attachment');
      expect(await (await get(['articles', 'example', filename])).text()).toBe('attachment');
    }
  });

  it.each([
    ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=7-20', '789', 'bytes 7-9/10'],
    ['bytes=-20', '0123456789', 'bytes 0-9/10'],
  ])('supports PDF byte ranges: %s', async (range, body, contentRange) => {
    const response = await get(undefined, { headers: { Range: range } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(contentRange);
    expect(response.headers.get('content-length')).toBe(String(body.length));
    expect(await response.text()).toBe(body);
  });

  it.each(['bytes=10-', 'bytes=8-2', 'bytes=-0', 'bytes=999999999999999999999-'])(
    'rejects unsatisfiable ranges: %s',
    async (range) => {
      const response = await get(undefined, { headers: { Range: range } });
      expect(response.status).toBe(416);
      expect(response.headers.get('content-range')).toBe('bytes */10');
      expect(await response.text()).toBe('');
    },
  );

  it.each(['bytes=0-1,4-5', 'items=1-2', 'bytes=invalid', 'bytes=-'])(
    'ignores unsupported range syntax: %s',
    async (range) => {
      const response = await get(undefined, { headers: { Range: range } });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('0123456789');
    },
  );

  it('revalidates cached files and gives If-None-Match precedence over modification dates', async () => {
    const response = await get();
    await response.text();
    for (const headers of [
      { 'If-None-Match': response.headers.get('etag')! },
      { 'If-None-Match': `"other", ${response.headers.get('etag')!.slice(2)}` },
      { 'If-None-Match': '*' },
      { 'If-Modified-Since': response.headers.get('last-modified')! },
    ]) {
      const cached = await get(undefined, { headers });
      expect(cached.status).toBe(304);
      expect(await cached.text()).toBe('');
    }
    const changed = await get(undefined, {
      headers: { 'If-None-Match': '"other"', 'If-Modified-Since': response.headers.get('last-modified')! },
    });
    expect(changed.status).toBe(200);
    await changed.text();
  });

  it('honors If-Range dates and sends the whole file for stale or weak validators', async () => {
    const response = await get();
    await response.text();
    for (const [validator, expected] of [
      [response.headers.get('last-modified')!, 206],
      ['Thu, 01 Jan 1970 00:00:00 GMT', 200],
      [response.headers.get('etag')!, 200],
    ] as const) {
      const ranged = await get(undefined, { headers: { Range: 'bytes=0-1', 'If-Range': validator } });
      expect(ranged.status).toBe(expected);
      expect(await ranged.text()).toBe(expected === 206 ? '01' : '0123456789');
    }
  });

  it.each([
    [],
    ['..', 'private.txt'],
    ['articles', '..', 'private.txt'],
    ['articles/example/document.pdf'],
    ['articles\\example\\document.pdf'],
    ['articles', 'example', '\0.pdf'],
    ['.env'],
    ['articles', '', 'document.pdf'],
    ['articles', 'example'],
    ['missing.pdf'],
  ])('returns 404 for nonfiles and invalid paths: %j', async (...segments) => {
    const response = await get(segments);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('rejects file and directory symlinks escaping the content tree', async () => {
    await writeFile(path.join(directory, 'private.txt'), 'private');
    await symlink(path.join(directory, 'private.txt'), path.join(contentDirectory, 'file.txt'));
    await symlink(directory, path.join(contentDirectory, 'escape'));
    for (const segments of [['file.txt'], ['escape', 'private.txt']]) {
      const response = await get(segments);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('private');
    }
  });

  it('serves empty files', async () => {
    await writeFile(path.join(contentDirectory, 'empty.txt'), '');
    const empty = await get(['empty.txt']);
    expect(empty.headers.get('content-length')).toBe('0');
    expect(await empty.text()).toBe('');
  });

  it.each(['consume', 'cancel', 'abort'] as const)('closes the actual file descriptor after %s', async (action) => {
    await writeFile(path.join(contentDirectory, 'large.pdf'), Buffer.alloc(1024 * 1024));
    const openFile = vi.spyOn(fs, 'open');
    const controller = new AbortController();
    const response = await get(['large.pdf'], { signal: controller.signal });
    const file = await openFile.mock.results[0]!.value;
    expect(file.fd).toBeGreaterThanOrEqual(0);
    try {
      if (action === 'consume') await response.arrayBuffer();
      if (action === 'cancel') await response.body!.cancel();
      // An HTTP disconnect can happen before Next starts reading the response body.
      if (action === 'abort') controller.abort();
      await vi.waitFor(() => expect(file.fd).toBe(-1));
    } finally {
      // Keep a failing regression from leaking its descriptor into the rest of the suite.
      if (!response.bodyUsed) await response.body!.cancel().catch(() => {});
      await file.close();
    }
  });

  it('closes the file if the request was aborted before the response body was created', async () => {
    const openFile = vi.spyOn(fs, 'open');
    const controller = new AbortController();
    controller.abort();
    const response = await get(undefined, { signal: controller.signal });
    expect(response.status).toBe(499);
    expect(await response.text()).toBe('');
    const file = await openFile.mock.results[0]!.value;
    expect(file.fd).toBe(-1);
  });

  it('wires GET and HEAD to the authored repository and retains raw Markdown noindex', async () => {
    const segments = ['articles', '1379112442', 'index.md'];
    const context = { params: Promise.resolve({ path: segments }) };
    const response = await GET(new Request('https://knowledge.nilay.jp/content/articles/1379112442/index.md'), context);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(await readFile(path.join(process.cwd(), 'content', ...segments), 'utf8'));
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    const head = await HEAD(
      new Request('https://knowledge.nilay.jp/content/articles/1379112442/index.md', { method: 'HEAD' }),
      context,
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });
});
