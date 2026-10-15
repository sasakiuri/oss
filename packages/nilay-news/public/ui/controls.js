// SPDX-License-Identifier: MIT
import { model, PAGE_SIZE } from "./model.js";
import { $, hideNotice } from "./dom.js";
import { collect, analyze, reviewSelected, setView } from "./actions.js";
import { canReview, visibleArticles } from "./articles.js";
import { renderBulkActions } from "./selection.js";
import { refresh, loadArticles } from "./inbox.js";

export function bindControls() {
  $("collect-button").addEventListener("click", collect);
  $("apply-selected").addEventListener("click", reviewSelected);
  $("bulk-operation").addEventListener("change", (event) => {
    model.bulkStatus = event.target.value;
    renderBulkActions();
  });
  $("select-all-articles").addEventListener("change", (event) => {
    const articles = visibleArticles()
      .slice(0, model.visibleCount)
      .filter((article) => canReview(article, "dismissed"));
    for (const article of articles) {
      if (event.target.checked) model.checkedIds.add(article.id);
      else model.checkedIds.delete(article.id);
    }
    renderBulkActions();
  });
  $("analyze-button").addEventListener("click", () => analyze());
  $("notice-close").addEventListener("click", hideNotice);
  $("settings-nav").addEventListener("click", () => setView("settings"));
  $("collection-warning-details").addEventListener("click", () =>
    setView("settings"),
  );
  for (const key of ["query", "topic", "analysis", "relation", "sort"]) {
    const search = key === "query";
    const input = $(search ? "search" : `${key}-filter`);
    input.addEventListener(search ? "input" : "change", (event) => {
      model[key] = search ? event.target.value.trim() : event.target.value;
      model.visibleCount = PAGE_SIZE;
      model.checkedIds.clear();
      loadArticles();
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
}
