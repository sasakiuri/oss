// SPDX-License-Identifier: MIT
import { model, PAGE_SIZE } from "./model.js";
import { $, hideNotice } from "./dom.js";
import {
  collect,
  analyze,
  reviewSelected,
  setView,
  closeArticle,
  moveArticle,
} from "./actions.js";
import { canReview, visibleArticles } from "./articles.js";
import { renderBulkActions } from "./selection.js";
import { refresh, loadArticles } from "./inbox.js";
import { renderFilters } from "./header.js";

export function bindControls() {
  $("filter-toggle").addEventListener("click", () => {
    model.filtersOpen = !model.filtersOpen;
    renderFilters();
  });
  $("clear-selection").addEventListener("click", () => {
    model.checkedIds.clear();
    renderBulkActions();
    $("select-all-articles").focus();
  });
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
    const updateFilter = (event) => {
      if (event.isComposing) return;
      model[key] = search ? event.target.value.trim() : event.target.value;
      model.visibleCount = PAGE_SIZE;
      model.checkedIds.clear();
      clearTimeout(model.searchTimer);
      ++model.listRequest;
      renderBulkActions();
      renderFilters();
      if (search) model.searchTimer = setTimeout(() => loadArticles(), 250);
      else loadArticles();
    };
    input.addEventListener(search ? "input" : "change", updateFilter);
    if (search) input.addEventListener("compositionend", updateFilter);
  }
  document.addEventListener("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.isComposing
    )
      return;
    const editing = event.target.closest(
      "input, textarea, select, [contenteditable]",
    );
    if (event.key === "/" && !editing && model.view !== "settings") {
      event.preventDefault();
      if (model.selectedId && window.matchMedia("(max-width: 960px)").matches)
        closeArticle();
      $("search").focus();
    }
    if (event.key === "Escape" && !editing && model.selectedId) {
      event.preventDefault();
      closeArticle();
    }
    if (!editing && model.selectedId && ["j", "k"].includes(event.key)) {
      event.preventDefault();
      moveArticle(event.key === "j" ? 1 : -1);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
}
