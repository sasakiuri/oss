// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { $, el, button } from "./dom.js";
import { dateText, messageText } from "./time.js";
import { buckets, phaseLabels } from "./labels.js";
import { setView, clearFilters } from "./actions.js";

export function renderHeader() {
  const state = model.state;
  const busy = !!state?.job.running || model.requestPending || !state;
  $("collect-button").disabled = busy;
  $("collect-label").textContent = state?.job.running
    ? "処理中…"
    : "記事を集める";
  $("analyze-button").disabled =
    busy || !state?.settings.jevConfigured || !state.stats.pending;
  $("analyze-button").title = !state?.settings.jevConfigured
    ? "収集元と設定で Jev の API キーを設定してください。"
    : "鮮度条件を満たす未判定・仕分け失敗の記事を、新しい順に Jev で判定します。";
  $("inbox-view").hidden = model.view === "settings";
  $("settings-view").hidden = model.view !== "settings";
  if (model.view === "settings")
    $("reading-workspace").classList.toggle("has-selection", false);
  const pageTitle =
    model.view === "settings"
      ? "収集元と設定"
      : buckets.find((bucket) => bucket.id === model.view)?.label || "受信箱";
  $("page-title").textContent = pageTitle;
  const descriptions = {
    inbox: "",
    saved: "",
    approved: "内容と重複を確認し、投稿を承認した記事です。",
    review: "内容・関連性の確認待ちです。",
    pending: "Jev の仕分けを待っている記事と、仕分けに失敗した記事です。",
    dates: "公開日時を確認できない記事は、自動投稿の対象外です。",
    expired: "自動処理の対象期間を過ぎた記事です。",
    posted: "",
    dismissed: "見送った記事と、仕分けで対象外になった記事です。",
    settings: "",
  };
  $("page-description").textContent = descriptions[model.view] || "";
  $("page-description").hidden = !descriptions[model.view];
  $("sidebar-posting-status").textContent = !state
    ? "確認中"
    : state.settings.autoPost
      ? "有効"
      : "停止中";
  $("sidebar-posting-status").parentElement?.classList.toggle(
    "enabled",
    !!state?.settings.autoPost,
  );
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
    ...buckets.flatMap((bucket, index) => {
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
      const label = {
        0: "記事",
        3: "確認が必要な記事",
        6: "アーカイブ",
      }[index];
      return label ? [el("span", "nav-section-label", label), node] : [node];
    }),
  );
}

export function renderFilters() {
  $("filter-panel").hidden = !model.filtersOpen;
  $("filter-toggle").setAttribute("aria-expanded", String(model.filtersOpen));
  const labels = {
    query: model.query ? `検索: ${model.query}` : "",
    topic: model.topic,
    analysis: model.analysis
      ? $("analysis-filter").selectedOptions[0]?.textContent
      : "",
    relation: model.relation
      ? $("relation-filter").selectedOptions[0]?.textContent
      : "",
  };
  const active = Object.entries(labels).filter(([, label]) => label);
  const count = [model.topic, model.analysis, model.relation].filter(
    Boolean,
  ).length;
  $("filter-count").hidden = !count;
  $("filter-count").textContent = count;
  $("active-filters").hidden = !active.length;
  $("active-filters").replaceChildren(
    ...active.map(([key, label]) => {
      const chip = button(
        "",
        "filter-chip",
        () => clearFilters(key),
        `filter-${key}`,
      );
      chip.setAttribute("aria-label", `${label}を解除`);
      const close = el("span", "", "×");
      close.setAttribute("aria-hidden", "true");
      chip.append(el("span", "", label), close);
      return chip;
    }),
  );
  if (active.length)
    $("active-filters").append(
      button(
        "すべて解除",
        "text-button",
        () => clearFilters(),
        "clear-filters",
      ),
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
