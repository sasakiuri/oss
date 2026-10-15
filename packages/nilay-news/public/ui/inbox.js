// SPDX-License-Identifier: MIT
import { model, PAGE_SIZE } from "./model.js";
import { $, button, showNotice, hideNotice } from "./dom.js";
import { api } from "./api.js";
import { notifyView } from "./updates.js";

export async function refresh(force = false) {
  if (model.refreshPromise) {
    await model.refreshPromise;
    if (!force) return;
  }
  model.refreshPromise = loadState();
  try {
    await model.refreshPromise;
  } finally {
    model.refreshPromise = null;
  }
}

async function loadState() {
  clearTimeout(model.pollTimer);
  try {
    const state = await api("/api/state");
    if (!Array.isArray(state.sources) || !state.settings || !state.job) {
      throw new Error("受信箱のデータ形式を確認できませんでした。");
    }
    const changed = JSON.stringify(state) !== JSON.stringify(model.serverState);
    model.serverState = state;
    model.state = { ...state, articles: model.state?.articles || [] };
    const articlesChanged = await loadArticles(
      model.articlePage?.offset || 0,
      false,
      true,
    );
    model.stateEtag = model.receivedStateEtag;
    model.loading = false;
    model.loadError = null;
    if (state.job.error && state.job.error !== model.lastJobError)
      showNotice(state.job.error, true);
    model.lastJobError = state.job.error || null;
    const postError =
      state.publication.error ||
      state.publication.posts.find((post) => post.error)?.error;
    if (postError && postError !== model.lastPostError)
      showNotice(postError, true);
    model.lastPostError = postError || null;
    if (changed || articlesChanged) notifyView("all");
  } catch (error) {
    model.loading = false;
    const firstFailure = !model.loadError;
    model.loadError = error.message;
    if (!model.state) notifyView("all");
    else if (firstFailure)
      showNotice(`受信箱を更新できませんでした。${error.message}`, true);
    $("last-updated").textContent = "サーバーとの接続を確認してください";
  } finally {
    model.pollTimer = setTimeout(
      refresh,
      model.state?.job.running ? 2000 : 30000,
    );
  }
}

export async function loadArticles(
  offset = 0,
  shouldRender = true,
  renewSnapshot = false,
) {
  if (!model.state || model.view === "settings") return;
  const request = ++model.listRequest;
  const parameters = new URLSearchParams({
    bucket: model.view,
    query: model.query,
    topic: model.topic,
    analysis: model.analysis,
    relation: model.relation,
    sort: model.sort,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (offset && model.articlePage?.snapshot && !renewSnapshot)
    parameters.set("snapshot", model.articlePage.snapshot);
  try {
    const page = await api(`/api/articles?${parameters}`);
    if (request !== model.listRequest) return;
    if (offset && offset >= page.total)
      return loadArticles(
        Math.floor(Math.max(0, page.total - 1) / PAGE_SIZE) * PAGE_SIZE,
        shouldRender,
        true,
      );
    const changed =
      JSON.stringify({ ...page, snapshot: undefined }) !==
      JSON.stringify({ ...model.articlePage, snapshot: undefined });
    model.articlePage = page;
    model.state.articles = page.articles;
    model.state.publication = {
      ...model.state.publication,
      ...page.publication,
    };
    if (
      model.selectedId &&
      !page.articles.some((article) => article.id === model.selectedId)
    ) {
      model.selectedId = null;
      model.detail = null;
    }
    const detailChanged = model.selectedId
      ? await loadDetail(model.selectedId, false)
      : false;
    if (request !== model.listRequest) return;
    if (shouldRender) notifyView("all");
    return changed || detailChanged;
  } catch (error) {
    if (request !== model.listRequest) return;
    if (error.code === "article_page_conflict" && offset) {
      model.checkedIds.clear();
      showNotice(error.message);
      return loadArticles(0, shouldRender);
    }
    showNotice(`一覧を読み込めませんでした。${error.message}`, true);
  }
}

export async function loadDetail(id, shouldRender = true) {
  const request = ++model.detailRequest;
  try {
    const article = await api(`/api/articles/${encodeURIComponent(id)}`);
    if (request !== model.detailRequest || model.selectedId !== id) return;
    if (model.detailFailure) {
      const { retry, notice } = model.detailFailure;
      if (document.activeElement === retry)
        $("detail-panel").focus({ preventScroll: true });
      retry.remove();
      if ($("notice-text").textContent === notice) hideNotice();
      model.detailFailure = null;
    }
    const changed = JSON.stringify(article) !== JSON.stringify(model.detail);
    model.detail = article;
    model.state.publication = {
      ...model.state.publication,
      ...article.publication,
    };
    if (shouldRender && changed) notifyView("detail");
    return changed;
  } catch (error) {
    if (request !== model.detailRequest || model.selectedId !== id) return;
    showNotice(`記事を読み込めませんでした。${error.message}`, true);
    const retry =
      model.detailFailure?.articleId === id
        ? model.detailFailure.retry
        : button(
            "記事の読み込みを再試行",
            "button",
            () => loadDetail(id),
            "detail-retry",
          );
    if (retry !== model.detailFailure?.retry)
      model.detailFailure?.retry.remove();
    model.detailFailure = {
      articleId: id,
      retry,
      notice: $("notice-text").textContent,
    };
    if (retry.parentElement !== $("detail-panel"))
      $("detail-panel").append(retry);
  }
}
