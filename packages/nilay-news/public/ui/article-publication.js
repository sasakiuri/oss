// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { el, button, externalLink, safeUrl } from "./dom.js";
import { dateText, messageText } from "./time.js";
import { canReview, canDismiss } from "./articles.js";
import { mutate, review, analyze } from "./actions.js";

export function appendArticleReviewActions(panel, article) {
  const actions = el("div", "detail-review-actions");
  const saved = article.reviewStatus === "saved";
  if (article.reviewStatus !== "posted") {
    const save = button(
      saved ? "保存を解除" : "保存",
      "button button-secondary",
      () => review(article, saved ? "unread" : "saved"),
      "detail-save",
    );
    save.setAttribute("aria-pressed", String(saved));
    save.disabled =
      model.requestPending || !canReview(article, saved ? "unread" : "saved");
    actions.append(save);
    if (canDismiss(article)) {
      const dismiss = button(
        "この記事を見送る",
        "button button-subtle",
        () => review(article, "dismissed"),
        "detail-dismiss",
      );
      dismiss.disabled = model.requestPending;
      actions.append(dismiss);
    }
  }
  const url = safeUrl(article.url);
  if (url) actions.append(externalLink("元の記事を開く ↗", url, "text-button"));
  panel.append(actions);
}

export function appendArticlePublication(panel, article) {
  const publication = model.state.publication.posts.find(
    (post) => post.articleId === article.id,
  );
  const postingBlocked = [
    "publishing",
    "submitted",
    "unknown",
    "failed",
  ].includes(publication?.status);
  const preview = el("section", "analysis-box");
  preview.append(el("h3", "", "X の投稿文"));
  preview.append(
    el(
      "p",
      "post-preview",
      publication?.text ||
        article.postDraft ||
        "投稿文を作成できません。元記事の URL と見出しを確認してください。",
    ),
  );
  if (publication?.postId) {
    preview.append(
      externalLink(
        "投稿を開く ↗",
        `https://x.com/NilayNews/status/${publication.postId}`,
        "text-button",
      ),
    );
  }
  if (publication?.status === "publishing")
    preview.append(
      el(
        "p",
        "form-help",
        "Buffer に登録中です。アプリ停止後にこの表示が残る場合は再起動して Buffer と X を確認してください。",
      ),
    );
  if (publication?.status === "submitted")
    preview.append(
      el(
        "p",
        "form-help",
        "Buffer が受け付けました。X への投稿完了を確認中です。自動投稿を停止しても、この投稿は取り消されません。",
      ),
    );
  if (publication?.status === "submitted") {
    if (publication.remoteStatus)
      preview.append(
        el(
          "p",
          "form-help",
          `最終確認: ${publication.remoteStatus}・${dateText(publication.lastObservedAt * 1000, true)}`,
        ),
      );
    if (publication.nextCheckAt)
      preview.append(
        el(
          "p",
          "form-help",
          `次の読み取り確認: ${dateText(publication.nextCheckAt * 1000, true)}。新しい投稿は確認完了まで保留します。`,
        ),
      );
    if (publication.error)
      preview.append(el("p", "form-help", messageText(publication.error)));
  }
  if (publication?.bufferId)
    preview.append(
      el("p", "form-help", `Buffer 投稿 ID: ${publication.bufferId}`),
    );
  if (["unknown", "failed"].includes(publication?.status)) {
    preview.append(el("p", "analysis-error", messageText(publication.error)));
    if (publication.failedBeforeSend) {
      preview.append(
        el(
          "p",
          "form-help",
          "Buffer への送信前に停止しました。この記事を見送るか、投稿エラーを解除してから設定で自動投稿を再開してください。",
        ),
        button("投稿エラーを解除", "button button-secondary", () =>
          mutate(
            `/api/articles/${article.id}/publication`,
            { outcome: "retry" },
            "投稿エラーを解除しました。設定の「投稿せずに接続・候補を確認」で確認し、自動投稿を再開してください。",
          ),
        ),
      );
    } else
      preview.append(
        el(
          "p",
          "form-help",
          "未投稿に戻す前に、Buffer の予約・再試行対象を削除し、X にも投稿がないことを確認してください。",
        ),
        externalLink(
          "Buffer を開く ↗",
          "https://publish.buffer.com",
          "text-button",
        ),
        externalLink(
          "@NilayNews で投稿結果を確認 ↗",
          "https://x.com/NilayNews",
          "text-button",
        ),
        button("X で投稿済みを確認した", "button button-secondary", () =>
          mutate(
            `/api/articles/${article.id}/publication`,
            { outcome: "posted" },
            "投稿済みとして記録しました。",
          ),
        ),
        button(
          "Buffer の予約なし・X の未投稿を確認した",
          "button button-secondary",
          () =>
            mutate(
              `/api/articles/${article.id}/publication`,
              { outcome: "not_posted" },
              "確認待ちを解除しました。設定から自動投稿を再開できます。",
            ),
        ),
      );
  }
  panel.append(preview);
  const actions = el("div", "detail-actions");
  if (article.reviewStatus !== "approved" && canReview(article, "approved")) {
    const approve = button(
      "内容・重複を確認して投稿を承認",
      "button button-primary",
      () => review(article, "approved"),
      "detail-approve",
    );
    approve.disabled = model.requestPending;
    actions.append(approve);
  }
  if (article.postDraft && !postingBlocked) {
    const intent = new URL("https://x.com/intent/tweet");
    intent.searchParams.set("text", article.postDraft);
    actions.append(
      externalLink(
        "X の投稿画面を開く ↗",
        intent.href,
        "button button-secondary",
      ),
    );
  }
  panel.append(actions);
  if (article.reviewStatus !== "posted")
    panel.append(
      el(
        "p",
        "detail-action-note",
        "手動で投稿する場合は自動投稿を停止し、投稿後に「投稿済みにする」を押してください。",
      ),
    );
  const secondary = el("div", "detail-secondary-actions");
  if (article.reviewStatus !== "posted" && !postingBlocked)
    secondary.append(
      button(
        "投稿済みにする",
        "text-button",
        () => review(article, "posted"),
        "detail-posted",
      ),
    );
  if (
    !postingBlocked &&
    ["dismissed", "posted", "approved"].includes(article.reviewStatus)
  )
    secondary.append(
      button(
        article.reviewStatus === "approved"
          ? "投稿承認を解除して未読に戻す"
          : "未読に戻す",
        "text-button",
        () => review(article, "unread"),
        "detail-unread",
      ),
    );
  if (model.state.settings.jevConfigured) {
    const retry = button(
      article.analysisStatus === "done"
        ? "仕分けをやり直す"
        : "この記事を仕分け",
      "text-button",
      () => analyze(article.id),
      "detail-analyze",
    );
    retry.disabled = !!model.state.job.running || model.requestPending;
    secondary.append(retry);
  }
  panel.append(secondary);
}
