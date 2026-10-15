// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { el, externalLink, safeUrl } from "./dom.js";
import { dateText, messageText } from "./time.js";

export function appendArticleContent(panel, article) {
  const metadata = article.metadata || {};
  const attachments = Array.isArray(article.attachments)
    ? article.attachments
    : [];
  const fields = [
    ["所管省庁", metadata.agency],
    ["状態", metadata.status],
    [
      "受付締切",
      metadata.deadline ||
        (metadata.deadlineAt && dateText(metadata.deadlineAt, true)),
    ],
    [
      "受付開始",
      metadata.opening ||
        (metadata.openedAt && dateText(metadata.openedAt, true)),
    ],
    ["案件番号", metadata.caseId],
    ["国会", metadata.session],
    ["年度", metadata.fiscalYear ? `${metadata.fiscalYear}年度` : null],
    ["提出日", metadata.submissionDate],
    ["公布日", metadata.promulgatedDate],
    ["施行日", metadata.effectiveDate],
    ["分野", metadata.category],
    ["案の公示日", metadata.announcementDate],
    ["結果の公示日", metadata.resultDate],
    ["命令等の公布日", metadata.enactmentDate],
    ["提出意見数", metadata.opinionCount],
    ["根拠法令条項", metadata.legalBasis],
    ["官報発行日", metadata.issueDate],
    ["種別", metadata.edition],
    [
      "号数",
      metadata.issueNumber == null ? null : `第 ${metadata.issueNumber} 号`,
    ],
    ["掲載区分", metadata.section],
    ["小区分", metadata.subsection],
    [
      "掲載開始ページ",
      metadata.page == null ? null : `${metadata.page} ページ`,
    ],
  ].filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  if (fields.length) {
    const section = el("section", "article-information");
    section.append(el("h3", "detail-summary-label", "案件・掲載情報"));
    const list = el("dl", "article-metadata");
    for (const [label, value] of fields) {
      const row = el("div");
      row.append(el("dt", "", label), el("dd", "", value));
      list.append(row);
    }
    section.append(list);
    if (metadata.indexUrl)
      section.append(
        externalLink(
          metadata.bodyScope === "starting-page"
            ? "当日の官報目次を見る ↗"
            : "掲載一覧を見る ↗",
          metadata.indexUrl,
          "text-button",
        ),
      );
    panel.append(section);
  }

  const scopeNotes = [];
  if (metadata.bodyScope === "starting-page") {
    scopeNotes.push(
      "掲載開始ページ全体の抽出テキストです。同じページの別項目を含み、続きのページは含みません。",
    );
  } else if (metadata.bodyScopeNote) {
    scopeNotes.push(metadata.bodyScopeNote);
  }
  if (metadata.contentStatus === "listing") {
    scopeNotes.push(
      "一覧の情報のみ取得しています。案件詳細と添付資料の本文は未取得です。",
    );
  } else if (metadata.contentStatus === "detail") {
    scopeNotes.push(
      "案件詳細ページの記載情報を取得しています。添付資料の本文は取得していません。",
    );
  } else if (metadata.contentStatus === "error") {
    scopeNotes.push(
      "案件詳細を取得できなかったため、一覧の情報を表示しています。",
    );
  }
  if (metadata.coverage) scopeNotes.push(metadata.coverage);
  if (scopeNotes.length) {
    const scope = el("section", "content-scope");
    scope.append(el("h3", "", "取得した情報の範囲"));
    for (const note of scopeNotes) scope.append(el("p", "", note));
    panel.append(scope);
  }
  const warnings = [
    article.contentError,
    metadata.textExtractionWarning,
  ].filter(Boolean);
  if (article.bodyStale) {
    warnings.unshift(
      `前回保存した本文（今回は未取得）です。前回の本文取得：${dateText(article.bodyFetchedAt, true)}。今回の記事情報と異なる可能性があるため、原文を確認してください。`,
    );
  }
  if (warnings.length) {
    const warning = el("section", "content-warning");
    warning.append(el("h3", "", "取得・抽出の注意点"));
    for (const message of warnings)
      warning.append(el("p", "", messageText(message)));
    panel.append(warning);
  }
  if (article.body) {
    const body = el("details", "article-body");
    body.open = model.expandedBodies.has(article.id);
    body.addEventListener("toggle", () => {
      if (!body.isConnected) return;
      if (body.open) model.expandedBodies.add(article.id);
      else model.expandedBodies.delete(article.id);
    });
    const label = article.bodyStale
      ? "前回保存した本文（今回は未取得）を読む"
      : metadata.bodyScope === "starting-page"
        ? "掲載開始ページの抽出テキストを読む"
        : metadata.contentStatus === "detail"
          ? "案件詳細のテキストを読む"
          : "収集した本文を読む";
    const summary = el("summary", "", label);
    summary.dataset.focus = "article-body-summary";
    body.append(summary);
    if (article.bodyFetchedAt)
      body.append(
        el(
          "p",
          "body-fetched-at",
          `本文取得：${dateText(article.bodyFetchedAt, true)}`,
        ),
      );
    body.append(el("p", "article-body-text", article.body));
    panel.append(body);
  }
  if (attachments.length) {
    const section = el("section", "article-attachments");
    section.append(el("h3", "detail-summary-label", "添付資料・原文"));
    const list = el("ul");
    attachments.forEach((attachment, index) => {
      const item = el("li");
      item.append(
        externalLink(
          `${attachment.title || `資料 ${index + 1}`} ↗`,
          attachment.url,
        ),
      );
      if (!safeUrl(attachment.url))
        item.append(el("span", "form-help", "（リンクを開けません）"));
      list.append(item);
    });
    section.append(list);
    panel.append(section);
  }
}
