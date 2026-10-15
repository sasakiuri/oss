// SPDX-License-Identifier: MIT
import { model, PAGE_SIZE } from "./model.js";
import { $, el, button } from "./dom.js";
import { shortDate } from "./time.js";
import { canReview, visibleArticles } from "./articles.js";
import { articleTags } from "./article-tags.js";
import { renderBulkActions } from "./selection.js";
import { review, collect } from "./actions.js";
import { refresh, loadArticles, loadDetail } from "./inbox.js";
import { notifyView } from "./updates.js";

export function renderArticle(article) {
  const card = el(
    "article",
    `article-row${article.id === model.selectedId ? " selected" : ""}`,
  );
  if (article.reviewStatus !== "posted") {
    const label = el("label", "article-check");
    const checkbox = el("input");
    checkbox.type = "checkbox";
    checkbox.dataset.selectId = article.id;
    checkbox.dataset.focus = `check-${article.id}`;
    checkbox.checked = model.checkedIds.has(article.id);
    checkbox.disabled =
      model.requestPending || !canReview(article, "dismissed");
    checkbox.setAttribute(
      "aria-label",
      `${article.title || "見出しなし"} — 一括操作の対象に選択`,
    );
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) model.checkedIds.add(article.id);
      else model.checkedIds.delete(article.id);
      renderBulkActions();
    });
    label.append(checkbox);
    card.append(label);
  }
  const select = button(
    "",
    "article-select",
    () => {
      model.selectedId = article.id;
      model.detail = null;
      loadDetail(article.id);
      renderArticles();
      notifyView("detail");
      if (window.matchMedia("(max-width: 960px)").matches) {
        $("detail-panel").scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        $("detail-panel").focus({ preventScroll: true });
      } else {
        [...document.querySelectorAll("[data-focus]")]
          .find((node) => node.dataset.focus === `article-${article.id}`)
          ?.focus({ preventScroll: true });
      }
    },
    `article-${article.id}`,
  );
  select.setAttribute("aria-label", `${article.title} — 詳細を読む`);
  select.setAttribute(
    "aria-pressed",
    article.id === model.selectedId ? "true" : "false",
  );
  const tags = el("div", "article-topline");
  tags.append(...articleTags(article));
  const meta = el("div", "article-meta");
  meta.append(
    el("span", "", article.sourceName || "収集元不明"),
    el("span", "meta-dot", "·"),
    el("time", "", shortDate(article)),
  );
  select.append(tags, el("h3", "article-title", article.title || "見出しなし"));
  if (article.excerpt)
    select.append(el("p", "article-excerpt", article.excerpt));
  select.append(meta);
  card.append(select);
  if (article.reviewStatus !== "posted") {
    const saved = article.reviewStatus === "saved";
    const save = button(
      saved ? "保存済み" : "保存",
      `bookmark-button${saved ? " saved" : ""}`,
      () => review(article, saved ? "unread" : "saved"),
      `save-${article.id}`,
    );
    save.setAttribute(
      "aria-label",
      saved ? "保存済み（保存を解除）" : "記事を保存",
    );
    save.setAttribute("aria-pressed", String(saved));
    save.title = saved ? "保存を解除" : "記事を保存";
    card.append(save);
  }
  return card;
}

function renderEmpty() {
  const empty = el("div", "empty-state");
  let title;
  let description;
  if (model.loading) {
    title = "読み込み中…";
    description = "記事と収集元を読み込んでいます。";
  } else if (model.loadError && !model.state) {
    title = "受信箱に接続できません";
    description = model.loadError;
  } else if (model.query || model.topic || model.analysis || model.relation) {
    title = "条件に合う記事はありません";
    description = "検索語やテーマを変更してください。";
  } else if (!model.state?.articles.length) {
    title = "記事はまだありません";
    description = "「記事を集める」で、登録した収集元から記事を取得します。";
  } else {
    const messages = {
      inbox: [
        "未読の記事はありません",
        "新しいニュースは「記事を集める」から確認できます。",
      ],
      saved: [
        "保存した記事はありません",
        "記事の「保存」を押すと、ここに表示されます。",
      ],
      approved: [
        "投稿を承認した記事はありません",
        "内容を確認した記事を選び、「投稿を承認」で自動投稿候補にできます。",
      ],
      review: [
        "確認待ちの記事はありません",
        "内容の関連性や、他の記事との重複を自動で決めきれなかった記事を表示します。日時の確認や仕分け待ちは別の一覧にあります。",
      ],
      pending: [
        "仕分け待ちの記事はありません",
        "未判定の記事と仕分けに失敗した記事を表示します。",
      ],
      dates: [
        "日時の確認が必要な記事はありません",
        "公開日時が不明・不正・未来の記事です。内容の判定とは別に、自動投稿の対象外として保持します。",
      ],
      expired: [
        "期間を過ぎた記事はありません",
        "自動処理の対象期間を過ぎた記事を表示します。掲載から 10 日を過ぎた記事は削除します。",
      ],
      posted: [
        "投稿済みの記事はありません",
        "X で投稿したあと「投稿済みにする」で記録できます。",
      ],
      dismissed: [
        "見送り・対象外の記事はありません",
        "見送った記事と、仕分けで対象外になった記事を表示します。",
      ],
    };
    [title, description] = messages[model.view] || messages.inbox;
  }
  empty.append(el("h3", "", title), el("p", "", description));
  if (model.loadError && !model.state)
    empty.append(
      button("もう一度読み込む", "button button-secondary", refresh),
    );
  else if (
    (model.query || model.topic || model.analysis || model.relation) &&
    model.state
  )
    empty.append(
      button("絞り込みを解除", "button button-secondary", () => {
        model.query = "";
        model.topic = "";
        model.analysis = "";
        model.relation = "";
        model.checkedIds.clear();
        $("search").value = "";
        $("topic-filter").value = "";
        $("analysis-filter").value = "";
        $("relation-filter").value = "";
        loadArticles(0);
      }),
    );
  else if (!model.state?.articles.length && model.state) {
    const collectButton = button(
      "記事を集める",
      "button button-primary",
      collect,
    );
    collectButton.disabled = !!model.state.job.running || model.requestPending;
    empty.append(collectButton);
  }
  return empty;
}

export function renderArticles() {
  const articles = visibleArticles();
  const selectedVisible = articles.some(
    (article) => article.id === model.selectedId,
  );
  if (model.selectedId && !selectedVisible) {
    model.selectedId = null;
    notifyView("detail");
  }
  const total = model.articlePage?.total || 0;
  const offset = model.articlePage?.offset || 0;
  $("list-count").textContent = `${total} 件`;
  renderBulkActions(articles);
  $("article-list").replaceChildren(
    ...(articles.length ? articles.map(renderArticle) : [renderEmpty()]),
  );
  $("list-footnote").textContent =
    `${total} 件中 ${total ? offset + 1 : 0}–${offset + articles.length} 件を表示`;
  $("list-footnote").hidden = total <= PAGE_SIZE;
  $("list-pagination").replaceChildren();
  if (offset)
    $("list-pagination").append(
      button(
        "前のページ",
        "button button-subtle button-full",
        async () => {
          model.checkedIds.clear();
          await loadArticles(Math.max(0, offset - PAGE_SIZE));
          $("article-list").querySelector("button")?.focus();
        },
        "previous-page",
      ),
    );
  if (offset + articles.length < total)
    $("list-pagination").append(
      button(
        "次のページ",
        "button button-subtle button-full",
        async () => {
          model.checkedIds.clear();
          await loadArticles(offset + PAGE_SIZE);
          $("article-list").querySelector("button")?.focus();
        },
        "next-page",
      ),
    );
}
