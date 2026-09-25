import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

import { RequestError } from './http';

/**
 * Cross-site request forgery: a browser always sends `Origin` on a POST, PUT or DELETE made with
 * fetch, and a page on another site cannot set it. Requests without it are refused too; the Labs
 * pages are the only intended callers.
 */
export function assertSameOrigin(request: Request, siteUrl: string): void {
  const origin = request.headers.get('origin');
  if (origin === null || origin !== new URL(siteUrl).origin) {
    throw new RequestError(403, 'このサイトのページから操作してください。');
  }
}

/** Reads a JSON body no larger than `maxBytes`, whatever `Content-Length` claims. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const text = await readTextBody(request, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError(400, 'リクエストの形式が不正です。');
  }
}

export async function readTextBody(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestError(413, 'リクエストが大きすぎます。');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new RequestError(413, 'リクエストが大きすぎます。');
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
}

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Compares secrets in constant time; hashing first makes the lengths equal. */
export function secretsEqual(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` with each scheduled call. Without a
 * configured secret every call is refused, so an unset variable cannot open the job to anyone.
 */
export function assertCronRequest(request: Request, cronSecret: string | undefined): void {
  const header = request.headers.get('authorization');
  if (!cronSecret || cronSecret.length < 16 || header === null || !secretsEqual(header, `Bearer ${cronSecret}`)) {
    throw new RequestError(401, 'Unauthorized');
  }
}

/** Bearer credentials sent by the Labs pages (room members and similar). */
export function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(header);
  if (!match?.[1]) throw new RequestError(401, '認証情報がありません。');
  return match[1];
}
