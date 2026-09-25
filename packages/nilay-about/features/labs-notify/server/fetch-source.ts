import 'server-only';

/** Identifies the fetcher to the sites it reads, with a page that explains what it does. */
export const FETCH_USER_AGENT = 'NilayLabs/1.0 (+https://about.nilay.jp/labs)';

export interface ConditionalState {
  etag?: string;
  lastModified?: string;
}

export type FetchResult = { status: 'unchanged' } | { status: 'changed'; text: string; state: ConditionalState };

/**
 * One polite GET of a public page or file: a conditional request when validators are known, an
 * expected media type, a timeout, no redirects, and a size cap enforced while reading. The body is
 * read chunk by chunk and abandoned at the cap, so a missing or false Content-Length, or a
 * compressed body that expands, cannot fill the function's memory.
 */
export async function fetchPublicText(
  url: string,
  previous: ConditionalState,
  options: { fetch?: typeof fetch; maxBytes: number; mediaTypes: readonly string[]; timeoutMs?: number },
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    const headers: Record<string, string> = { 'User-Agent': FETCH_USER_AGENT };
    if (previous.etag) headers['If-None-Match'] = previous.etag;
    if (previous.lastModified) headers['If-Modified-Since'] = previous.lastModified;
    const response = await (options.fetch ?? fetch)(url, { headers, redirect: 'manual', signal: controller.signal });
    if (response.status === 304) return { status: 'unchanged' };
    if (!response.ok) throw new Error(`Fetch failed with ${response.status}`);
    const mediaType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!options.mediaTypes.includes(mediaType)) throw new Error(`Unexpected media type ${mediaType || '(none)'}`);
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > options.maxBytes) throw new Error('Response too large');
    if (!response.body) throw new Error('Empty response');

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > options.maxBytes) {
        await reader.cancel();
        throw new Error('Response too large');
      }
      chunks.push(value);
    }
    return {
      status: 'changed',
      text: new TextDecoder('utf-8').decode(Buffer.concat(chunks)),
      state: {
        etag: response.headers.get('etag') ?? undefined,
        lastModified: response.headers.get('last-modified') ?? undefined,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
