// SPDX-License-Identifier: MIT
// This entrypoint is only referenced by wrangler.local.jsonc.
import { createHandlers, type Env } from "./worker.ts";

export const localAccess = {
  async allowed(
    url: string,
    method: string,
    headers: Headers,
  ): Promise<boolean> {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(parsed.hostname)
    )
      return false;
    const origin = headers.get("origin");
    if (origin !== null && origin !== parsed.origin) return false;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      origin !== parsed.origin
    )
      return false;
    return [null, "none", "same-origin", "same-site"].includes(
      headers.get("sec-fetch-site"),
    );
  },
};

const handlers = createHandlers(() => localAccess);
export default {
  ...handlers,
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/__scheduled") {
      if (
        request.method !== "POST" ||
        !(await localAccess.allowed(
          request.url,
          request.method,
          request.headers,
        ))
      )
        return new Response(null, { status: 403 });
      await handlers.scheduled(undefined, env);
      return new Response(null, { status: 204 });
    }
    return handlers.fetch(request, env);
  },
};
