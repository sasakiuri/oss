// SPDX-License-Identifier: MIT
/** Private HTTP service, placed near Tokyo. It never follows redirects. */
import { withDeadline } from "./deadline.ts";
import { isRegionalFeedUrl } from "./net/feed-transport.ts";
import { readBody, USER_AGENT, type Fetcher } from "./net/http.ts";

const RESPONSE_HEADERS = [
  "content-type",
  "location",
  "retry-after",
  "ratelimit",
];

export function createFeedHandler(
  fetcher: Fetcher = (url, init) => fetch(url, init),
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET") return new Response(null, { status: 405 });
    if (!isRegionalFeedUrl(request.url))
      return new Response(null, { status: 403 });
    try {
      return await withDeadline(async (signal) => {
        const upstream = await fetcher(request.url, {
          method: "GET",
          headers: { "User-Agent": USER_AGENT },
          redirect: "manual",
          signal,
        });
        const headers = new Headers({ "Cache-Control": "no-store" });
        for (const name of RESPONSE_HEADERS) {
          const value = upstream.headers.get(name);
          if (value !== null) headers.set(name, value);
        }
        // Refusal/redirect metadata must survive oversized or stalled bodies.
        // In particular, never turn a 403 or a Retry-After into a generic 502.
        if (!upstream.ok) {
          void upstream.body?.cancel().catch(() => undefined);
          return new Response(null, { status: upstream.status, headers });
        }
        const data = await readBody(upstream, 4_000_000, signal);
        return new Response(
          [204, 205].includes(upstream.status) ? null : data,
          {
            status: upstream.status,
            headers,
          },
        );
      }, 18000);
    } catch {
      return new Response("RSS取得用Workerで通信を完了できませんでした", {
        status: 502,
      });
    }
  };
}

export default { fetch: createFeedHandler() };
