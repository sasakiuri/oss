// cspell:ignore turbopack
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

const contentTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.md': 'text/markdown; charset=utf-8',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

function isWithin(directory: string, filename: string): boolean {
  const relative = path.relative(directory, filename);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Unsupported/malformed ranges are ignored; unsatisfiable single byte ranges return 416. */
function byteRange(value: string | null, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  const match = value && /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) {
    return 'unsatisfiable';
  }
  const start = first ?? Math.max(0, size - last!);
  const end = first === null || last === null ? size - 1 : Math.min(last, size - 1);
  return start >= size || start > end ? 'unsatisfiable' : { start, end };
}

/** Serve the sole authored tree at its existing /content URLs, including PDF range requests. */
export async function serveContentAsset(request: Request, segments: readonly string[], contentDirectory: string) {
  // Next already decodes route parameters. Reject separators rather than decoding a second time.
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment.startsWith('.') || /[/\\\0]/.test(segment))
  ) {
    return new Response(null, { status: 404 });
  }

  let file;
  try {
    const directory = await realpath(contentDirectory);
    // Explicit route tracing in next.config includes this tree without bundling each asset as a module.
    const filename = await realpath(/* turbopackIgnore: true */ path.join(directory, ...segments));
    if (!isWithin(directory, filename)) return new Response(null, { status: 404 });
    file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      ['ENOENT', 'ENOTDIR', 'ELOOP'].includes(String(error.code))
    ) {
      return new Response(null, { status: 404 });
    }
    throw error;
  }

  let streaming = false;
  try {
    const stats = await file.stat();
    if (!stats.isFile()) return new Response(null, { status: 404 });
    const extension = path.extname(segments.at(-1)!).toLowerCase();
    const etag = `W/"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`;
    const modified = stats.mtime.toUTCString();
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
      ETag: etag,
      'Last-Modified': modified,
      'X-Content-Type-Options': 'nosniff',
    });
    if (extension === '.md') headers.set('X-Robots-Tag', 'noindex');

    const ifNoneMatch = request.headers.get('if-none-match');
    const unmodified = ifNoneMatch
      ? ifNoneMatch
          .split(',')
          .some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.slice(2))
      : Date.parse(request.headers.get('if-modified-since') ?? '') >= Date.parse(modified);
    if (unmodified) return new Response(null, { status: 304, headers });

    // HEAD ignores Range. A weak ETag cannot satisfy If-Range's strong comparison.
    const ifRange = request.headers.get('if-range');
    const range =
      request.method === 'GET' && (!ifRange || Date.parse(ifRange) >= Date.parse(modified))
        ? byteRange(request.headers.get('range'), stats.size)
        : null;
    if (range === 'unsatisfiable') {
      headers.set('Content-Range', `bytes */${stats.size}`);
      headers.set('Content-Length', '0');
      return new Response(null, { status: 416, headers });
    }

    const length = range ? range.end - range.start + 1 : stats.size;
    headers.set('Content-Length', String(length));
    if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stats.size}`);
    if (request.method === 'HEAD' || length === 0) return new Response(null, { status: 200, headers });

    // A client can disconnect before Next begins consuming/cancelling the body.
    if (request.signal.aborted) return new Response(null, { status: 499 });
    const stream = Readable.toWeb(
      file.createReadStream({ ...range, signal: request.signal }),
    ) as ReadableStream<Uint8Array>;
    streaming = true; // The stream closes the descriptor on completion, cancellation, or request abort.
    return new Response(stream, { status: range ? 206 : 200, headers });
  } finally {
    if (!streaming) await file.close();
  }
}
