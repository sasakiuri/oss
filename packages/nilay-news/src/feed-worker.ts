// SPDX-License-Identifier: MIT
/** Private HTTP service, placed near Tokyo. It never follows redirects. */
import { withDeadline } from "./deadline.ts";
import { isRegionalFeedUrl } from "./net/feed-transport.ts";
import {
  GOOGLE_NEWS_RPC,
  isGoogleNewsPage,
  validGoogleNewsRequest,
} from "./net/google-news.ts";
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
    const rpc = request.url === GOOGLE_NEWS_RPC;
    if (request.method !== "GET" && !(rpc && request.method === "POST"))
      return new Response(null, { status: 405 });
    if (
      request.method === "GET" &&
      !isRegionalFeedUrl(request.url) &&
      !isGoogleNewsPage(request.url)
    )
      return new Response(null, { status: 403 });
    try {
      return await withDeadline(async (signal) => {
        const init: RequestInit = {
          method: request.method,
          headers: { "User-Agent": USER_AGENT },
          redirect: "manual",
          signal,
        };
        if (rpc) {
          const body = await readBody(request, 16_384, signal);
          if (!validGoogleNewsRequest(body))
            return new Response(null, { status: 400 });
          init.body = body;
          init.headers = {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          };
        }
        const upstream = await fetcher(request.url, init);
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
        const maxBytes = rpc ? 100_000 : isGoogleNewsPage(request.url) ? 1_000_000 : 4_000_000;
        const data = await readBody(upstream, maxBytes, signal);
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
