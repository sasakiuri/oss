// SPDX-License-Identifier: MIT
import { model, PAGE_SIZE } from "./model.js";
import { $, showNotice } from "./dom.js";
import { api } from "./api.js";
import { refresh, loadArticles } from "./inbox.js";
import { canReview } from "./articles.js";
import { bulkMessages } from "./labels.js";
import { notifyView } from "./updates.js";

export async function mutate(path, body, message) {
  if (model.requestPending) {
    showNotice("保存中です。完了してから操作してください。");
    return false;
  }
  model.requestPending = true;
  notifyView("header");
  notifyView("selection");
  try {
    await api(path, body);
    if (message) showNotice(message);
    await refresh(true);
    return true;
  } catch (error) {
    showNotice(error.message, true);
    if (error.code === "settings_conflict") {
      const conflict = $("settings-conflict");
      if (conflict) conflict.hidden = false;
      // Refresh status, but never replace the form's inputs or edit token.
      await refresh(true);
    }
    return false;
  } finally {
    model.requestPending = false;
    notifyView("header");
    notifyView("selection");
  }
}

/** Only deliberate field edits are sent; an unchanged enabled toggle is not new intent. */
function settingsChanges(baseline, values) {
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => value !== baseline[key]),
  );
}

export async function saveSettings(baseline, values, message) {
  const changes = settingsChanges(baseline, values);
  if (!Object.keys(changes).length) {
    showNotice("変更はありません。最新の状態は設定の読み直しで確認できます。");
    return false;
  }
  return mutate(
    "/api/settings",
    { ...changes, revision: baseline.revision },
    message,
  );
}

export function collect() {
  return mutate(
    "/api/collect",
    {},
    "記事の収集を受け付けました。順次処理します。",
  );
}

export function analyze(articleId) {
  return mutate(
    "/api/analyze",
    articleId ? { articleIds: [articleId] } : {},
    "Jev による仕分けを受け付けました。順次処理します。",
  );
}

export async function review(article, status) {
  const success = await mutate(
    `/api/articles/${encodeURIComponent(article.id)}/review`,
    { status },
    status === "posted"
      ? "投稿済みとして記録しました。"
      : status === "approved"
        ? "投稿を承認しました。自動投稿が有効なら配信対象になります。"
        : status === "saved"
          ? "保存しました。"
          : status === "dismissed"
            ? "この記事を見送りました。"
            : "未読に戻しました。",
  );
  if (success) notifyView("all");
}

export async function reviewSelected() {
  notifyView("selection");
  const articleIds = [...model.checkedIds];
  if (!articleIds.length) return;
  const status = model.bulkStatus;
  if (
    model.state.articles.some(
      (article) =>
        model.checkedIds.has(article.id) && !canReview(article, status),
    )
  )
    return;
  const success = await mutate(
    "/api/articles/review",
    { articleIds, status },
    `${articleIds.length} 件の${bulkMessages[status]}`,
  );
  if (success) {
    for (const id of articleIds) model.checkedIds.delete(id);
    notifyView("selection");
  }
}

export function setView(view) {
  model.view = view;
  model.visibleCount = PAGE_SIZE;
  model.selectedId = null;
  model.checkedIds.clear();
  model.settingsRendered = false;
  notifyView("all");
  loadArticles();
}
