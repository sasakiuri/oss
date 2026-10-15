// SPDX-License-Identifier: MIT
import type { Application } from "../application.ts";
import { withDeadline } from "../deadline.ts";
import { SettingsConflictError, UserError } from "../errors.ts";
import { readBody } from "../net/http.ts";
import { parseUtf8Json, isRecord, sha256 } from "../text.ts";

import { jsonResponse, SECURITY_HEADERS } from "./response.ts";

/** Dispatches authenticated API requests; the Worker owns access and error handling. */
export async function apiResponse(
  request: Request,
  app: Application,
): Promise<Response> {
  const { pathname: path } = new URL(request.url);
  const method = request.method;
  if (method === "GET" && path === "/api/state") {
    // Read the revision first so a concurrent update invalidates the next request.
    const version = await app.stateCacheKey();
    const configTag = (
      await sha256(
        JSON.stringify([
          Boolean(app.jev.key),
          app.jev.model,
          app.buffer.configured,
          app.notifier.configured,
        ]),
      )
    ).slice(0, 12);
    const tag = `"news-${version}-${configTag}"`;
    if (request.headers.get("if-none-match") === tag)
      return new Response(null, {
        status: 304,
        headers: { ...SECURITY_HEADERS, ETag: tag },
      });
    return jsonResponse(200, await app.state(), { ETag: tag });
  }
  if (method === "GET" && path === "/api/articles") {
    const parameters = new URL(request.url).searchParams;
    return jsonResponse(
      200,
      await app.articles({
        bucket: parameters.get("bucket") ?? undefined,
        query: parameters.get("query") ?? undefined,
        topic: parameters.get("topic") ?? undefined,
        analysis: parameters.get("analysis") ?? undefined,
        relation: parameters.get("relation") ?? undefined,
        sort: parameters.get("sort") ?? undefined,
        limit: parameters.has("limit")
          ? Number(parameters.get("limit"))
          : undefined,
        offset: parameters.has("offset")
          ? Number(parameters.get("offset"))
          : undefined,
        snapshot: parameters.get("snapshot") ?? undefined,
      }),
    );
  }
  const detail = /^\/api\/articles\/([a-f0-9]{24})$/.exec(path);
  if (method === "GET" && detail)
    return jsonResponse(200, await app.article(detail[1]!));
  if (method !== "POST") return jsonResponse(404, { error: "見つかりません" });
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    return jsonResponse(415, { error: "JSON 形式で送信してください" });
  }
  const raw = await withDeadline(
    (signal) => readBody(request, 65536, signal),
    5000,
  );
  let body: unknown;
  try {
    body = parseUtf8Json(raw);
  } catch {
    return jsonResponse(400, {
      error: "JSON オブジェクトを送信してください",
    });
  }
  if (!isRecord(body))
    throw new UserError("JSON オブジェクトを送信してください");
  if (path === "/api/collect" || path === "/api/analyze") {
    try {
      return jsonResponse(
        202,
        await app.start(
          path === "/api/collect" ? "collect" : "analyze",
          body.articleIds,
        ),
      );
    } catch (error) {
      if (error instanceof UserError)
        return jsonResponse(409, { error: error.message });
      throw error;
    }
  }
  if (path === "/api/articles/dismiss")
    return jsonResponse(200, await app.repository.dismiss(body.articleIds));
  if (path === "/api/articles/review")
    return jsonResponse(
      200,
      await app.repository.reviewMany(body.articleIds, body.status),
    );
  const review = /^\/api\/articles\/([a-f0-9]{24})\/review$/.exec(path);
  if (review?.[1])
    return jsonResponse(
      200,
      await app.repository.review(review[1], body.status),
    );
  const publication = /^\/api\/articles\/([a-f0-9]{24})\/publication$/.exec(
    path,
  );
  if (publication?.[1])
    return jsonResponse(
      200,
      await app.repository.resolvePost(publication[1], body.outcome),
    );
  const source = /^\/api\/sources\/([a-zA-Z0-9_-]+)\/?$/.exec(path);
  if (source?.[1]) {
    if (Object.keys(body).length !== 1 || typeof body.enabled !== "boolean")
      throw new UserError("情報源の有効・無効を指定してください");
    return jsonResponse(
      200,
      await app.repository.updateSource(source[1], {
        enabled: body.enabled,
      }),
    );
  }
  if (path === "/api/publication/preflight") {
    // A read-only check accepts no options, so it cannot enable anything.
    if (Object.keys(body).length)
      throw new UserError("確認には空の JSON オブジェクトを送信してください");
    return jsonResponse(200, await app.publicationPreflight());
  }
  if (path === "/api/settings") {
    const { revision, ...changes } = body;
    if (typeof revision !== "string" || !revision || revision.length > 256)
      throw new SettingsConflictError();
    return jsonResponse(200, await app.settings(changes, revision));
  }
  return jsonResponse(404, { error: "見つかりません" });
}
