// SPDX-License-Identifier: MIT
import { model, PAGE_SIZE } from "./model.js";
import { $, showNotice } from "./dom.js";
import { api } from "./api.js";
import { refresh, loadArticles, loadDetail } from "./inbox.js";
import { canReview } from "./articles.js";
import { bulkMessages } from "./labels.js";
import { notifyView } from "./updates.js";

export async function mutate(path, body, message) {
  if (model.requestPending) {
    showNotice("保存中です。完了してから操作してください。");
    return false;
  }
  const focusKey = document.activeElement?.dataset?.focus;
  const readingSession = model.readingSession;
  model.requestPending = true;
  notifyView("header");
  notifyView("selection");
  if (model.selectedId) notifyView("detail");
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
    if (model.selectedId) notifyView("detail");
    if (
      focusKey &&
      readingSession === model.readingSession &&
      (document.activeElement === document.body ||
        document.activeElement === $("detail-panel"))
    )
      [...document.querySelectorAll("[data-focus]")]
        .find((node) => node.dataset.focus === focusKey)
        ?.focus({ preventScroll: true });
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
  const readingSession = model.readingSession;
  const wasReading = model.selectedId === article.id;
  const index = model.state.articles.findIndex(
    (item) => item.id === article.id,
  );
  const position = (model.articlePage?.offset || 0) + index;
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
  if (success) {
    if (
      wasReading &&
      readingSession === model.readingSession &&
      !model.selectedId
    ) {
      const relativePosition = position - (model.articlePage?.offset || 0);
      const next =
        model.state.articles[
          Math.min(
            Math.max(0, relativePosition),
            model.state.articles.length - 1,
          )
        ];
      if (next) selectArticle(next.id, { keepListPosition: true });
      else closeArticle();
    }
    notifyView("all");
  }
}

export function selectArticle(id, { keepListPosition = false } = {}) {
  if (!model.state?.articles.some((article) => article.id === id)) return;
  if (!model.selectedId && !keepListPosition)
    model.listScrollY = window.scrollY;
  ++model.readingSession;
  model.selectedId = id;
  model.detail = null;
  loadDetail(id);
  notifyView("articles");
  notifyView("detail");
  if (window.matchMedia("(max-width: 960px)").matches) {
    window.scrollTo({ top: 0, behavior: "instant" });
    $("detail-panel").focus({ preventScroll: true });
  } else {
    [...document.querySelectorAll("[data-focus]")]
      .find((node) => node.dataset.focus === `article-${id}`)
      ?.focus({ preventScroll: true });
  }
}

export function closeArticle() {
  const id = model.selectedId;
  ++model.readingSession;
  ++model.detailRequest;
  model.selectedId = null;
  model.detail = null;
  notifyView("articles");
  notifyView("detail");
  if (window.matchMedia("(max-width: 960px)").matches)
    window.scrollTo({ top: model.listScrollY, behavior: "instant" });
  const article = [...document.querySelectorAll("[data-focus]")].find(
    (node) => node.dataset.focus === `article-${id}`,
  );
  (
    article ||
    $("article-list").querySelector(".article-select") ||
    $("page-title")
  ).focus({ preventScroll: true });
  if (article) {
    const bounds = article.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight)
      article.scrollIntoView({ block: "nearest", behavior: "instant" });
  }
}

export async function moveArticle(direction) {
  if (model.listLoading) return;
  const articles = model.state?.articles || [];
  const index = articles.findIndex(
    (article) => article.id === model.selectedId,
  );
  if (index < 0) return;
  const next = articles[index + direction];
  if (next) {
    selectArticle(next.id);
    return;
  }
  const offset = model.articlePage?.offset || 0;
  const nextOffset = offset + direction * PAGE_SIZE;
  if (nextOffset < 0 || nextOffset >= (model.articlePage?.total || 0)) return;
  const readingSession = model.readingSession;
  await loadArticles(nextOffset);
  if (
    model.readingSession !== readingSession ||
    model.listError ||
    model.articlePage?.offset !== nextOffset
  )
    return;
  const target =
    direction > 0 ? model.state.articles[0] : model.state.articles.at(-1);
  if (target) {
    model.listScrollY = 0;
    selectArticle(target.id, { keepListPosition: true });
  }
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
  ++model.readingSession;
  clearTimeout(model.searchTimer);
  ++model.listRequest;
  ++model.detailRequest;
  model.view = view;
  model.visibleCount = PAGE_SIZE;
  model.selectedId = null;
  model.detail = null;
  model.listError = null;
  model.listLoading = view !== "settings" && !!model.state;
  model.articlePage = null;
  if (model.state) model.state.articles = [];
  model.checkedIds.clear();
  model.settingsRendered = false;
  notifyView("all");
  loadArticles();
}

export function clearFilters(key) {
  clearTimeout(model.searchTimer);
  for (const filter of key
    ? [key]
    : ["query", "topic", "analysis", "relation"]) {
    model[filter] = "";
    $(filter === "query" ? "search" : `${filter}-filter`).value = "";
  }
  model.checkedIds.clear();
  loadArticles(0);
  $("search").focus({ preventScroll: true });
}
