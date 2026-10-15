// SPDX-License-Identifier: MIT
import { GoogleNewsResolver } from "../collection/google-news-resolver.ts";
import type { Clock, Settings } from "../domain.ts";
import { UserError } from "../errors.ts";
import { isFreshPublication } from "../freshness.ts";
import { isGoogleNewsUrl } from "../net/google-news.ts";
import type { FetchBytes } from "../net/types.ts";
import type { NewsRepository } from "../repository.ts";
import { truncate } from "../text.ts";
import { isoSeconds } from "../time.ts";

import type { BufferClient } from "./buffer-client.ts";
import { ACCOUNT, draft } from "./draft.ts";
import {
  UNRESOLVED_POST_STATUSES,
  POST_INTERVAL_SECONDS,
  POST_WINDOW_LABEL,
} from "./policy.ts";

/** A check without business-state changes; URL caches and rate limits may advance. */
export interface PublicationPreflight {
  checkedAt: string;
  account: string;
  provider: "Buffer";
  configured: boolean;
  connectionVerified: boolean;
  autoPost: boolean;
  postSelection: Settings["postSelection"];
  candidates: number;
  /** The article the first automatic post would use, with its exact text. */
  firstCandidate: { articleId: string; text: string } | null;
  blockers: string[];
  ready: boolean;
  notes: string[];
}

/** Verifies the account and previews a candidate, fencing asynchronous URL resolution. */
export async function publicationPreflight(
  repository: NewsRepository,
  buffer: BufferClient,
  clock: Clock,
  crawlTransport?: FetchBytes,
): Promise<PublicationPreflight> {
  const blockers: string[] = [];
  let connectionVerified = false;
  try {
    await buffer.verifyAccount();
    connectionVerified = true;
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
    blockers.push(error.message);
  }
  const revision = await repository.stateVersion();
  const settings = await repository.settings();
  const { posts } = await repository.publicationState();
  const candidates = await repository.postCandidates();
  const unresolved = posts.filter((post) =>
    UNRESOLVED_POST_STATUSES.has(post.status),
  ).length;
  if (unresolved)
    blockers.push(
      `投稿結果の確認待ち・送信中の記事が ${unresolved} 件あります。Buffer と X を確認し、投稿結果を確定してください`,
    );
  let firstCandidate: PublicationPreflight["firstCandidate"] = null;
  const first = candidates[0];
  if (!first) {
    blockers.push(
      "投稿できる記事がありません。投稿する記事の設定と記事の状態を確認してください",
    );
  } else {
    try {
      let prepared = first;
      if (isGoogleNewsUrl(first.url)) {
        const resolver = new GoogleNewsResolver(repository, {
          clock: clock,
          transport: crawlTransport,
        });
        const url = await resolver.resolve(first.url);
        prepared = {
          ...first,
          url,
          metadata: { ...first.metadata, googleNewsUrl: first.url },
        };
        if (!first.sourceKey && (await repository.postedUrl(first.id, url)))
          throw new UserError(
            "同じ元記事URLに投稿済みまたは投稿結果の確認待ちの記事があります",
          );
      }
      if (
        !isFreshPublication(
          prepared.publishedAt,
          clock(),
          prepared.metadata?.publicationPrecision,
        )
      )
        throw new UserError("確認中に記事の投稿対象期間が過ぎました");
      firstCandidate = { articleId: first.id, text: draft(prepared) };
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      blockers.push(
        `次に投稿する記事「${truncate(first.title, 80)}」の投稿文を作成できません（${error.message}）。記事を見送りにするか元記事を確認してください`,
      );
    }
  }
  if ((await repository.stateVersion()) !== revision)
    throw new UserError(
      "確認中に記事や設定が更新されました。もう一度、投稿前の確認を実行してください",
    );
  if (settings.autoPost)
    blockers.push(
      "自動投稿はすでに有効です。開始前の確認ではないため、投稿状況と Buffer・X の投稿結果を確認してください",
    );
  return {
    checkedAt: isoSeconds(clock()),
    account: ACCOUNT,
    provider: "Buffer",
    configured: buffer.configured,
    connectionVerified,
    autoPost: settings.autoPost,
    postSelection: settings.postSelection,
    candidates: candidates.length,
    firstCandidate,
    blockers,
    ready: connectionVerified && !blockers.length,
    notes: [
      "確認時点の結果です。有効にするまでに記事や Buffer の状態が変わる場合があります。",
      "有効にする時と投稿する時にも Buffer の接続を照合します。",
      `最初の投稿は有効にしてから${POST_INTERVAL_SECONDS / 60}分以上後で、その時点で鮮度条件を満たす最も新しい記事から順に、対象となる全記事を1件ずつ個別に投稿します。次の配信回は前回の開始から1時間以上後です。公開時刻がある記事は24時間以内、日付だけの記事は日本時間の今日・昨日が対象です。`,
      `自動投稿の送信は毎日 ${POST_WINDOW_LABEL} です。時間外に投稿対象になった記事は翌朝 06:00 以降に、その時点でも鮮度条件を満たせば送信します。Buffer に送信済みの投稿結果の確認は時間外にも行い、X への実際の配信は送信より遅れる場合があります。`,
    ],
  };
}
