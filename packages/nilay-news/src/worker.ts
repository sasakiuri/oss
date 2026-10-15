// SPDX-License-Identifier: MIT
import type { D1Database } from "@cloudflare/workers-types";

import sourceConfig from "../sources.json" with { type: "json" };

import { Access, CONFIG_NAMES } from "./access.ts";
import { Application } from "./application.ts";
import { apiResponse } from "./http/api.ts";
import { STATIC_ASSET_PATHS } from "./http/assets.ts";
import {
  errorResponse,
  jsonResponse,
  SECURITY_HEADERS,
} from "./http/response.ts";
import { Jev } from "./jev/client.ts";
import { createFeedTransport, type FeedService } from "./net/feed-transport.ts";
import { Notifier } from "./notifications.ts";
import { BufferClient } from "./publishing/buffer-client.ts";
import { loadSources } from "./sources/config.ts";
import { createD1Repository } from "./storage/d1.ts";

export interface Env {
  DB: D1Database;
  FEED_FETCHER?: FeedService;
  ASSETS: { fetch(request: Request): Promise<Response> };
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

interface RequestAccess {
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

async function application(env: Env): Promise<Application> {
  const repository = await createD1Repository(
    env.DB,
    loadSources(sourceConfig),
  );
  return new Application(
    repository,
    new Jev(env.TYPESAFE_API_KEY ?? "", env.TYPESAFE_MODEL ?? "jev-latest"),
    new BufferClient(
      env.BUFFER_API_KEY ?? "",
      env.BUFFER_CHANNEL_ID ?? "",
      undefined,
      {
        observeQuota: (quota) => repository.recordBufferQuota(quota),
        readQuota: () => repository.getRecord("buffer", "quota"),
        nextRequestOrder: () => repository.reserveBufferRequest(),
      },
    ),
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
        if (["GET", "HEAD"].includes(method) && STATIC_ASSET_PATHS.has(path)) {
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
        return await apiResponse(request, app);
      } catch (error) {
        return errorResponse(error);
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
