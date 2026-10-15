// SPDX-License-Identifier: MIT
import type { Clock } from "../domain.ts";
import type { Notifier } from "../notifications.ts";
import { UNRESOLVED_POST_STATUSES } from "../publishing/policy.ts";
import type { Publisher } from "../publishing/publisher.ts";
import type { NewsRepository } from "../repository.ts";

import { REPEATED_FAILURES } from "./types.ts";

/** Runs once per invocation, before collection and classification claim their work. */
export async function maintainNews(
  repository: NewsRepository,
  publisher: Publisher,
  notifier: Notifier,
  publishingConfigured: boolean,
  clock: Clock,
): Promise<void> {
  await repository.recoverPosts(clock());
  // Deleting old articles can wait, so a failure never holds up other work.
  const pruned = await repository.pruneArticles(clock()).then(
    () => true,
    () => false,
  );
  if (pruned)
    await notifier.recover("retention", "古い記事の削除を再開しました");
  else {
    // Like notices, the log never includes the exception.
    console.error("NilayNews could not delete old articles");
    await notifier.report(
      "retention",
      "古い記事を削除できませんでした",
      "収集・仕分け・投稿は続けています。データベースの状態を確認してください。",
      "warning",
      REPEATED_FAILURES,
    );
  }
  if (publishingConfigured) {
    try {
      await publisher.tick();
    } catch {
      await notifier.report(
        "publication-runtime",
        "投稿処理の状態を更新できませんでした",
        "自動再送は行いません。管理画面と Buffer・X の投稿結果を確認してください。",
      );
    }
  }
  if (notifier.configured) {
    const { posts } = await repository.publicationState();
    if (
      posts.some(
        (post) => post.status === "unknown" || post.status === "failed",
      )
    ) {
      await notifier.report(
        "publication",
        "X 投稿が停止しています",
        "投稿の失敗、または結果不明の記事があります。管理画面と Buffer・X を確認し、投稿結果を確定してください。",
      );
    }
    if (!posts.some((post) => UNRESOLVED_POST_STATUSES.has(post.status))) {
      await notifier.recover("publication", "投稿結果の確認が完了しました");
      await notifier.recover(
        "publication-runtime",
        "投稿処理の状態更新を再開しました",
      );
    }
  }
}
