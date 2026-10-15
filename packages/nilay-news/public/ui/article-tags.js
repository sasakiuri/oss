// SPDX-License-Identifier: MIT
import { el } from "./dom.js";
import {
  freshnessLabels,
  SOURCE_CANDIDATE_LABEL,
  decisionLabels,
  statusLabels,
} from "./labels.js";

export function articleTags(article) {
  const result = [];
  if (article.freshness !== "fresh")
    result.push(
      el(
        "span",
        "tag tag-review",
        freshnessLabels[article.freshness] || freshnessLabels.unknown,
      ),
    );
  // The source rule is not a Jev result; its own Jev state stays labeled.
  const jev =
    article.sourceCandidate || article.reviewStatus === "approved"
      ? "Jev: "
      : "";
  if (article.sourceCandidate)
    result.push(
      el(
        "span",
        "tag tag-candidate",
        article.freshness === "fresh"
          ? SOURCE_CANDIDATE_LABEL
          : "情報源指定（鮮度条件外）",
      ),
    );
  if (article.analysisStatus === "error")
    result.push(el("span", "tag tag-error", `${jev}仕分け失敗`));
  else if (article.analysisStatus !== "done" || !article.decision)
    result.push(el("span", "tag", `${jev}未判定`));
  else
    result.push(
      el(
        "span",
        `tag tag-${article.decision}`,
        `${jev}${decisionLabels[article.decision] || "要確認"}`,
      ),
    );
  if (article.topic) result.push(el("span", "tag tag-topic", article.topic));
  if (article.contentError || article.bodyStale)
    result.push(el("span", "tag tag-review", "取得に注意"));
  if (article.relation === "followup")
    result.push(el("span", "tag tag-followup", "続報の可能性"));
  if (article.relation === "duplicate")
    result.push(el("span", "tag", "重複の可能性"));
  if (article.relation === "uncertain")
    result.push(el("span", "tag tag-review", "重複を要確認"));
  if (article.reviewStatus !== "unread")
    result.push(
      el(
        "span",
        "tag tag-status",
        statusLabels[article.reviewStatus] || article.reviewStatus,
      ),
    );
  return result;
}
