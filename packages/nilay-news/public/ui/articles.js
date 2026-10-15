// SPDX-License-Identifier: MIT
import { model } from "./model.js";

export function canDismiss(article) {
  return (
    article.reviewStatus !== "dismissed" && canReview(article, "dismissed")
  );
}

export function canReview(article, status) {
  if (article.reviewStatus === "posted") return false;
  const post = model.state.publication.posts.find(
    (item) => item.articleId === article.id,
  );
  return (
    post?.status !== "posted" &&
    ((post?.failedBeforeSend === true &&
      ["dismissed", "approved"].includes(status)) ||
      !["publishing", "submitted", "unknown", "failed"].includes(post?.status))
  );
}

export function visibleArticles() {
  return model.state?.articles || [];
}
