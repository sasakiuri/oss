// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { $, el, button, externalLink } from "./dom.js";
import { dateText } from "./time.js";
import { articleTags } from "./article-tags.js";
import { appendArticleContent } from "./article-content.js";
import { appendArticleAnalysis } from "./article-analysis.js";
import { appendArticlePublication } from "./article-publication.js";
import { notifyView } from "./updates.js";

export function renderDetail() {
  const panel = $("detail-panel");
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
    empty.append(
      el("h3", "", "記事の詳細"),
      el("p", "", "一覧から記事を選ぶと、抜粋や元記事へのリンクを表示します。"),
    );
    panel.append(empty);
    return;
  }
  const header = el("div", "detail-header");
  header.append(
    el("span", "detail-label", "記事の詳細"),
    button(
      "閉じる",
      "detail-close",
      () => {
        const id = model.selectedId;
        model.selectedId = null;
        notifyView("articles");
        notifyView("detail");
        [...document.querySelectorAll("[data-focus]")]
          .find((node) => node.dataset.focus === `article-${id}`)
          ?.focus();
      },
      "detail-close",
    ),
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
  panel.append(
    header,
    tags,
    title,
    source,
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
}
