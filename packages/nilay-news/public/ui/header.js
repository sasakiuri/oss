// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { $, el, button } from "./dom.js";
import { dateText, messageText } from "./time.js";
import { buckets, phaseLabels } from "./labels.js";
import { setView } from "./actions.js";

export function renderHeader() {
  const state = model.state;
  const busy = !!state?.job.running || model.requestPending || !state;
  $("collect-button").disabled = busy;
  $("analyze-button").disabled =
    busy || !state?.settings.jevConfigured || !state.stats.pending;
  $("analyze-button").title = !state?.settings.jevConfigured
    ? "収集元と設定で Jev の API キーを設定してください。"
    : "鮮度条件を満たす未判定・仕分け失敗の記事を、新しい順に Jev で判定します。";
  $("inbox-view").hidden = model.view === "settings";
  $("settings-view").hidden = model.view !== "settings";
  const pageTitle =
    model.view === "settings"
      ? "収集元と設定"
      : buckets.find((bucket) => bucket.id === model.view)?.label || "受信箱";
  $("page-title").textContent = pageTitle;
  document.title = `${pageTitle} — Nilay News`;
  $("list-count").hidden = model.view === "settings";
  $("settings-nav").classList.toggle("active", model.view === "settings");
  $("settings-nav").setAttribute(
    "aria-current",
    model.view === "settings" ? "page" : "false",
  );
  $("job-banner").hidden = !state?.job.running;
  $("collection-warning").hidden = !state?.job.warning;
  $("collection-warning-text").textContent = messageText(
    state?.job.warning || "",
  );
  if (state?.job.running) {
    const job = state.job;
    $("job-label").textContent =
      phaseLabels[job.phase] || job.phase || "処理中";
    $("job-count").textContent =
      job.total > 0 ? `${job.progress || 0} / ${job.total}` : "";
    if (job.total > 0) {
      $("job-progress").max = job.total;
      $("job-progress").value = job.progress || 0;
    } else {
      $("job-progress").removeAttribute("value");
    }
  }
  if (state) {
    const latest = state.sources
      .map((source) => source.lastFetchedAt)
      .filter(Boolean)
      .sort()
      .at(-1);
    $("last-updated").textContent = latest
      ? `最終収集 ${dateText(latest, true)}`
      : "まだ記事を収集していません";
  }
}

export function renderNavigation() {
  $("navigation").replaceChildren(
    ...buckets.map((bucket) => {
      const node = button(
        "",
        `nav-item${bucket.id === model.view ? " active" : ""}`,
        () => setView(bucket.id),
        `nav-${bucket.id}`,
      );
      node.append(
        el("span", "", bucket.label),
        el("span", "nav-count", model.state?.stats.buckets[bucket.id] || 0),
      );
      if (bucket.id === model.view) node.setAttribute("aria-current", "page");
      return node;
    }),
  );
}

export function renderTopics() {
  const topics = model.state?.stats.topics || [];
  const select = $("topic-filter");
  if (JSON.stringify(topics) !== select.dataset.topics) {
    const empty = el("option", "", "すべてのテーマ");
    empty.value = "";
    select.replaceChildren(
      empty,
      ...topics.map((topic) => {
        const option = el("option", "", topic);
        option.value = topic;
        return option;
      }),
    );
    if (model.topic && !topics.includes(model.topic)) model.topic = "";
    select.value = model.topic;
    select.dataset.topics = JSON.stringify(topics);
  }
}
