// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { $, el, button } from "./dom.js";
import { dateText, messageText } from "./time.js";
import {
  buckets,
  freshnessLabels,
  SOURCE_CANDIDATE_LABEL,
  SOURCE_CANDIDATE_REASON,
  relationLabels,
} from "./labels.js";
import { loadArticles, loadDetail } from "./inbox.js";
import { notifyView } from "./updates.js";

export function appendArticleAnalysis(panel, article) {
  if (article.reviewStatus === "approved")
    panel.append(
      el(
        "p",
        "analysis-box",
        `投稿承認済み（${dateText(article.reviewedAt, true)}）。Jev の要確認・重複判定より手動承認を優先します。公開日時・送信時間の条件は適用されます。記事の内容が更新された場合は承認を解除します。`,
      ),
    );
  if (article.freshness !== "fresh")
    panel.append(
      el(
        "p",
        "form-help",
        `${freshnessLabels[article.freshness] || freshnessLabels.unknown}。自動仕分けと自動投稿の対象にはなりません。保存してもこの条件は変わりません。個別の手動仕分けはできます。`,
      ),
    );
  if (article.sourceCandidate) {
    const rule = el("section", "analysis-box source-candidate");
    rule.append(
      el(
        "h3",
        "",
        article.freshness === "fresh"
          ? SOURCE_CANDIDATE_LABEL
          : "情報源指定（鮮度条件外）",
      ),
      el("p", "", SOURCE_CANDIDATE_REASON),
    );
    panel.append(rule);
  }
  const analysis = el("section", "analysis-box");
  analysis.append(
    el(
      "h3",
      "",
      article.analysisStatus === "done" ? "Jev の仕分け" : "仕分けの状態",
    ),
  );
  if (article.analysisStatus === "done") {
    analysis.append(
      el("p", "", article.reason || "判定理由を取得できませんでした。"),
    );
    analysis.append(
      el(
        "p",
        "probability-note",
        "取得した情報による自動判定です。投稿前に原文を確認してください。",
      ),
    );
  } else if (article.analysisStatus === "error") {
    analysis.append(
      el(
        "p",
        "analysis-error",
        messageText(article.analysisError) ||
          "仕分けできませんでした。記事はそのまま確認できます。",
      ),
    );
  } else {
    analysis.append(el("p", "", "未判定"));
  }
  const describe = (record, provenance) => {
    record.append(
      el(
        "p",
        "",
        `要求モデル: ${provenance.requestedModel} / 応答モデル: ${provenance.resolvedModel || "不明（応答に記録なし）"}`,
      ),
    );
    record.append(
      el(
        "p",
        "",
        `判定時刻: ${dateText(provenance.analyzedAt, true)} / 質問版: ${provenance.promptVersion} / 分類基準版: ${provenance.criteriaVersion} / 振り分け方針版: ${provenance.routingPolicyVersion}`,
      ),
    );
    for (const [label, value] of [
      ["質問と分類基準", provenance.criteriaHash],
      ["振り分け方針", provenance.routingPolicyHash],
      ["選定基準", provenance.rubricHash],
      ["送信入力", provenance.modelInputHash],
    ])
      record.append(el("p", "", `${label} SHA-256: ${value}`));
  };
  if (article.analysisStatus === "done" || article.relationProvenance?.length) {
    const record = el("details", "analysis-provenance");
    record.append(el("summary", "", "判定の構成と記録"));
    if (article.provenance) describe(record, article.provenance);
    else
      record.append(
        el(
          "p",
          "",
          "話題の分類の構成記録は不明です。旧データや手動記録からモデルや質問の版は推測しません。",
        ),
      );
    for (const provenance of article.relationProvenance || []) {
      record.append(
        el(
          "p",
          "",
          `比較記事 ${provenance.comparisonArticleId} / 比較入力 SHA-256: ${provenance.comparisonInputHash}`,
        ),
      );
      describe(record, provenance);
    }
    analysis.append(record);
  }
  if (article.postScreening) {
    const screening = article.postScreening;
    const record = el("details", "post-screening-provenance");
    record.append(el("summary", "", "投稿前の照合記録"));
    record.append(
      el(
        "p",
        "",
        `照合時刻: ${dateText(screening.checkedAt, true)} / 結果: ${relationLabels[screening.relation] || "一致する記事なし"}`,
      ),
    );
    for (const provenance of screening.relationProvenance) {
      record.append(
        el(
          "p",
          "",
          `比較記事 ${provenance.comparisonArticleId} / 比較入力 SHA-256: ${provenance.comparisonInputHash}`,
        ),
      );
      describe(record, provenance);
    }
    analysis.append(record);
  }
  const related =
    article.related ||
    model.state.articles.find((item) => item.id === article.relatedArticleId);
  if (article.relation && article.relation !== "different") {
    analysis.append(
      el("p", "", relationLabels[article.relation] || "関連する記事"),
    );
    if (
      !article.sourceCandidate &&
      article.reviewStatus !== "approved" &&
      article.relation === "uncertain"
    )
      analysis.append(
        el(
          "p",
          "form-help",
          "重複かどうか判断できないため、自動投稿の対象から外しています。関連記事を確認し、投稿してよい場合は「投稿を承認」を選んでください。保存だけでは解除されません。",
        ),
      );
    if (related)
      analysis.append(
        button(`↗ ${related.title}`, "relation-link", () => {
          const targetBucket = buckets.find((bucket) => bucket.match(related));
          model.checkedIds.clear();
          model.view = targetBucket?.id || "inbox";
          model.query = "";
          model.topic = "";
          model.analysis = "";
          model.relation = "";
          $("search").value = "";
          $("topic-filter").value = "";
          $("analysis-filter").value = "";
          $("relation-filter").value = "";
          model.selectedId = related.id;
          model.detail = null;
          model.query = related.title;
          $("search").value = related.title;
          loadArticles().then(() => {
            model.selectedId = related.id;
            return loadDetail(related.id);
          });
          notifyView("all");
        }),
      );
  }
  panel.append(analysis);
}
