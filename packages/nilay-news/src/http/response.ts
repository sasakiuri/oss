// SPDX-License-Identifier: MIT
import {
  DeadlineError,
  NotFoundError,
  ArticlePageConflictError,
  SettingsConflictError,
  UserError,
} from "../errors.ts";
import { FetchError } from "../net/http.ts";
import { truncate } from "../text.ts";

export const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

export function jsonResponse(
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

/** Public error messages never expose upstream payloads or unexpected exceptions. */
export function errorResponse(error: unknown): Response {
  if (error instanceof ArticlePageConflictError)
    return jsonResponse(409, {
      code: "article_page_conflict",
      error: error.message,
    });
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
