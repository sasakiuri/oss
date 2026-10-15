// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { $, el, button, externalLink } from "./dom.js";
import { dateText } from "./time.js";
import { articleTags } from "./article-tags.js";
import { appendArticleContent } from "./article-content.js";
import { appendArticleAnalysis } from "./article-analysis.js";
import {
  appendArticlePublication,
  appendArticleReviewActions,
} from "./article-publication.js";
import { closeArticle, moveArticle } from "./actions.js";

export function renderDetail() {
  const panel = $("detail-panel");
  const sameArticle =
    !!model.selectedId && panel.dataset.articleId === model.selectedId;
  const scrollTop = sameArticle ? panel.scrollTop : 0;
  const focusKey = document.activeElement?.closest("#detail-panel")
    ? document.activeElement.dataset.focus
    : null;
  const openSections = new Set(
    sameArticle
      ? [...panel.querySelectorAll("details[open]")].map(
          (section) => section.className,
        )
      : [],
  );
  panel.dataset.articleId = model.selectedId || "";
  panel.tabIndex = -1;
  panel.replaceChildren();
  if (model.detailFailure?.articleId === model.selectedId)
    panel.append(model.detailFailure.retry);
  const article =
    model.detail?.id === model.selectedId
      ? model.detail
      : model.state?.articles.find((item) => item.id === model.selectedId);
  $("reading-workspace").classList.toggle("has-selection", !!article);
  if (!article) {
    const empty = el("div", "detail-empty");
    empty.append(el("p", "", "記事を選ぶと、ここに詳細を表示します。"));
    panel.append(empty);
    return;
  }
  const header = el("div", "detail-header");
  const articles = model.state.articles;
  const index = articles.findIndex((item) => item.id === article.id);
  const offset = model.articlePage?.offset || 0;
  const total = model.articlePage?.total || articles.length;
  const navigation = el("div", "detail-navigation");
  const previous = button(
    "← 前",
    "detail-nav-button",
    () => moveArticle(-1),
    "detail-previous",
  );
  previous.setAttribute("aria-label", "前の記事");
  previous.title = "前の記事（k）";
  previous.disabled = (offset === 0 && index <= 0) || model.listLoading;
  const next = button(
    "次 →",
    "detail-nav-button",
    () => moveArticle(1),
    "detail-next",
  );
  next.setAttribute("aria-label", "次の記事");
  next.title = "次の記事（j）";
  next.disabled = index < 0 || offset + index + 1 >= total || model.listLoading;
  navigation.append(
    previous,
    el("span", "detail-position", `${offset + index + 1} / ${total}`),
    next,
  );
  header.append(
    button("閉じる", "detail-close", closeArticle, "detail-close"),
    navigation,
  );
  const tags = el("div", "detail-tags");
  tags.append(...articleTags(article));
  const title = el("h2", "detail-title");
  title.append(externalLink(article.title || "見出しなし", article.url));
  const source = el("p", "detail-source");
  source.append(
    el("span", "", article.sourceName || "収集元不明"),
    el("br"),
    el(
      "span",
      "",
      article.publishedAt
        ? article.metadata?.publicationPrecision === "date"
          ? `公開日 ${dateText(article.publishedAt)}（時刻不明）`
          : `公開 ${dateText(article.publishedAt, true)}`
        : "公開日時は取得できていません",
    ),
    el("br"),
    el("span", "", `収集 ${dateText(article.discoveredAt, true)}`),
  );
  panel.append(header, tags, title, source);
  appendArticleReviewActions(panel, article);
  panel.append(
    el("hr", "detail-divider"),
    el("span", "detail-summary-label", "抜粋"),
    el(
      "p",
      "detail-excerpt",
      article.excerpt || "抜粋はありません。元の記事で確認してください。",
    ),
  );
  appendArticleContent(panel, article);
  appendArticleAnalysis(panel, article);
  appendArticlePublication(panel, article);
  for (const section of panel.querySelectorAll("details")) {
    if (openSections.has(section.className)) section.open = true;
  }
  panel.scrollTop = scrollTop;
  if (sameArticle && focusKey)
    [...panel.querySelectorAll("[data-focus]")]
      .find((node) => node.dataset.focus === focusKey)
      ?.focus({ preventScroll: true });
}
