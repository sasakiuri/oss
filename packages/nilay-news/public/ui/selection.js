// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { $ } from "./dom.js";
import { canReview, visibleArticles } from "./articles.js";
import { bulkLabels } from "./labels.js";

export function renderBulkActions(
  shown = visibleArticles().slice(0, model.visibleCount),
) {
  const eligible = new Set(
    shown
      .filter((article) => canReview(article, "dismissed"))
      .map((article) => article.id),
  );
  for (const id of model.checkedIds) {
    if (!eligible.has(id)) model.checkedIds.delete(id);
  }
  $("bulk-actions").hidden = !shown.some(
    (article) => article.reviewStatus !== "posted",
  );
  const all = $("select-all-articles");
  all.checked = eligible.size > 0 && model.checkedIds.size === eligible.size;
  all.indeterminate = model.checkedIds.size > 0 && !all.checked;
  all.disabled = model.requestPending || !eligible.size;
  $("selection-count").textContent = `${model.checkedIds.size} 件選択中`;
  const blocked = shown.some(
    (article) =>
      model.checkedIds.has(article.id) && !canReview(article, model.bulkStatus),
  );
  $("bulk-operation").disabled = model.requestPending;
  $("apply-selected").textContent = bulkLabels[model.bulkStatus];
  $("apply-selected").disabled =
    model.requestPending || !model.checkedIds.size || blocked;
  $("bulk-help").textContent = blocked
    ? "送信前エラーの記事は、投稿承認または見送りを選んでください。"
    : model.bulkStatus === "approved"
      ? "内容と重複を確認した記事を承認します。Jev の判定にかかわらず、自動投稿が有効なら配信対象になります。公開日時・送信時間の条件は適用されます。"
      : model.bulkStatus === "unread"
        ? "投稿承認も解除し、元の仕分け結果で投稿対象を判定します。"
        : model.bulkStatus === "saved"
          ? "保存だけでは重複判定は解除されません。投稿承認済みの記事を保存に変更すると、承認は解除されます。"
          : "表示中の記事を対象にします。検索や絞り込みで表示から外れた記事の選択は解除されます。";
  for (const checkbox of $("article-list").querySelectorAll(
    "[data-select-id]",
  )) {
    checkbox.checked = model.checkedIds.has(checkbox.dataset.selectId);
    checkbox.disabled =
      model.requestPending || !eligible.has(checkbox.dataset.selectId);
  }
}
