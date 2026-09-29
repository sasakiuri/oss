// SPDX-License-Identifier: MIT
import type { D1Database } from "@cloudflare/workers-types";

import sourceConfig from "../sources.json" with { type: "json" };

import { Access, CONFIG_NAMES } from "./access.ts";
import { Application } from "./application.ts";
import { withDeadline } from "./deadline.ts";
import {
  DeadlineError,
  NotFoundError,
  SettingsConflictError,
  UserError,
} from "./errors.ts";
import { Jev } from "./jev.ts";
import { createFeedTransport, type FeedService } from "./net/feed-transport.ts";
import { FetchError, readBody } from "./net/http.ts";
import { Notifier } from "./notifications.ts";
import { BufferClient } from "./publishing.ts";
import { loadSources } from "./sources/config.ts";
import { createD1Repository } from "./storage/d1.ts";
import { isRecord, sha256, truncate } from "./text.ts";

export interface Env {
  DB: D1Database;
  FEED_FETCHER?: FeedService;
  ASSETS: { fetch(request: Request): Promise<Response> };
  STORAGE_BACKEND: string;
  NILAY_PUBLIC_ORIGIN: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  CF_ACCESS_ALLOWED_EMAILS: string;
  TYPESAFE_API_KEY?: string;
  TYPESAFE_MODEL?: string;
  BUFFER_API_KEY?: string;
  BUFFER_CHANNEL_ID?: string;
  SLACK_WEBHOOK_URL?: string;
}

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

function jsonResponse(
  status: number,
  data: unknown,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      ...extra,
    },
  });
}

export interface RequestAccess {
  allowed(url: string, method: string, headers: Headers): Promise<boolean>;
}

let cachedAccess: { config: string; control: Access } | undefined;
function access(env: Env): Access {
  const values = Object.fromEntries(
    CONFIG_NAMES.map((name) => [name, env[name]]),
  );
  const config = JSON.stringify(values);
  if (cachedAccess?.config !== config)
    cachedAccess = { config, control: new Access(values) };
  return cachedAccess.control;
}

export async function application(env: Env): Promise<Application> {
  if (env.STORAGE_BACKEND !== "d1")
    throw new UserError("STORAGE_BACKEND に対応する保存アダプターがありません");
  const repository = await createD1Repository(
    env.DB,
    loadSources(sourceConfig),
  );
  return new Application(
    repository,
    new Jev(env.TYPESAFE_API_KEY ?? "", env.TYPESAFE_MODEL ?? "jev-latest"),
    new BufferClient(env.BUFFER_API_KEY ?? "", env.BUFFER_CHANNEL_ID ?? ""),
    {
      notifier: new Notifier(repository, env.SLACK_WEBHOOK_URL ?? ""),
      crawlTransport: createFeedTransport(env.FEED_FETCHER),
    },
  );
}

export function createHandlers(
  controlFor: (env: Env) => RequestAccess = access,
  appFor: (env: Env) => Promise<Application> = application,
) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      let control: RequestAccess;
      try {
        control = controlFor(env);
      } catch {
        return jsonResponse(503, {
          error: "管理画面の認証設定が完了していません",
        });
      }
      if (
        !(await control.allowed(request.url, request.method, request.headers))
      ) {
        return jsonResponse(403, {
          error: "この画面へのアクセスは許可されていません",
        });
      }
      try {
        const { pathname: path } = new URL(request.url);
        const method = request.method;
        if (
          ["GET", "HEAD"].includes(method) &&
          ["/", "/app.js", "/styles.css"].includes(path)
        ) {
          const response = await env.ASSETS.fetch(request);
          const headers = new Headers(response.headers);
          for (const [name, value] of Object.entries(SECURITY_HEADERS))
            headers.set(name, value);
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        }
        const app = await appFor(env);
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
        if (method !== "POST")
          return jsonResponse(404, { error: "見つかりません" });
        if (
          request.headers
            .get("content-type")
            ?.split(";")[0]
            ?.trim()
            .toLowerCase() !== "application/json"
        ) {
          return jsonResponse(415, { error: "JSON 形式で送信してください" });
        }
        const raw = await withDeadline(
          (signal) => readBody(request, 65536, signal),
          5000,
        );
        let body: unknown;
        try {
          body = JSON.parse(
            new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
              raw,
            ),
          );
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
          return jsonResponse(
            200,
            await app.repository.dismiss(body.articleIds),
          );
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
        const publication =
          /^\/api\/articles\/([a-f0-9]{24})\/publication$/.exec(path);
        if (publication?.[1])
          return jsonResponse(
            200,
            await app.repository.resolvePost(publication[1], body.outcome),
          );
        const source = /^\/api\/sources\/([a-zA-Z0-9_-]+)\/?$/.exec(path);
        if (source?.[1]) {
          if (
            Object.keys(body).length !== 1 ||
            typeof body.enabled !== "boolean"
          )
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
            throw new UserError(
              "確認には空の JSON オブジェクトを送信してください",
            );
          return jsonResponse(200, await app.publicationPreflight());
        }
        if (path === "/api/settings") {
          const { revision, ...changes } = body;
          if (
            typeof revision !== "string" ||
            !revision ||
            revision.length > 256
          )
            throw new SettingsConflictError();
          return jsonResponse(200, await app.settings(changes, revision));
        }
        return jsonResponse(404, { error: "見つかりません" });
      } catch (error) {
        if (error instanceof SettingsConflictError)
          return jsonResponse(409, {
            code: "settings_conflict",
            error: error.message,
          });
        if (error instanceof NotFoundError)
          return jsonResponse(404, {
            error: "対象の記事・情報源が見つかりません",
          });
        if (error instanceof FetchError)
          return jsonResponse(413, {
            error: "リクエストサイズの上限を超えました",
          });
        if (error instanceof DeadlineError)
          return jsonResponse(408, {
            error: "リクエストの受信がタイムアウトしました",
          });
        if (error instanceof UserError)
          return jsonResponse(400, { error: truncate(error.message, 1000) });
        return jsonResponse(503, {
          error: "処理を完了できませんでした。時間をおいて再実行してください",
        });
      }
    },
    async scheduled(_controller: unknown, env: Env): Promise<void> {
      let notifier = new Notifier(null, env.SLACK_WEBHOOK_URL ?? "");
      try {
        controlFor(env);
        const app = await appFor(env);
        notifier = app.notifier;
        await app.scheduled();
      } catch {
        await notifier.report(
          "scheduled",
          "定期処理が異常終了しました",
          "認証設定・データベース・実行状況を確認してください。投稿作成を自動で再送することはありません。",
        );
        throw new Error(
          "NilayNews scheduled execution failed; inspect application status",
        );
      }
      await notifier.recover("scheduled", "定期処理が復旧しました");
    },
  };
}

export default createHandlers();
