// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { renderHeader, renderNavigation, renderTopics } from "./header.js";
import { renderArticles } from "./list.js";
import { renderBulkActions } from "./selection.js";
import { renderDetail } from "./detail.js";
import { renderSettings } from "./settings.js";
import { onViewChange } from "./updates.js";

export function render() {
  const focusKey = document.activeElement?.dataset?.focus;
  renderHeader();
  renderNavigation();
  renderTopics();
  if (model.view === "settings") renderSettings();
  else {
    renderArticles();
    renderDetail();
  }
  if (focusKey)
    [...document.querySelectorAll("[data-focus]")]
      .find((node) => node.dataset.focus === focusKey)
      ?.focus({ preventScroll: true });
}

/** Rendering is connected once by the entry point, after all modules load. */
export function connectViews() {
  const renderers = {
    all: render,
    header: renderHeader,
    selection: renderBulkActions,
    detail: renderDetail,
    articles: renderArticles,
    settings: renderSettings,
  };
  return onViewChange((scope) => renderers[scope]());
}
