// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { $, el, button } from "./dom.js";
import { dateText, messageText } from "./time.js";
import { buckets, phaseLabels } from "./labels.js";
import { setView, clearFilters } from "./actions.js";

function postingDescription(state) {
  if (!state) return "自動投稿の状態を確認中です。";
  let description = state.settings.autoPost
    ? "自動投稿は有効です。"
    : "自動投稿は停止中です。設定で有効にするまで送信されません。";
  if (state.settings.autoPost && state.publication.nextAt) {
    const time = dateText(state.publication.nextAt * 1000, true).split(" ")[1];
    description += `次回の送信は ${time} 以降です。`;
  }
  if (
    state.publication.posts.some((post) =>
      ["publishing", "submitted", "unknown", "failed"].includes(post.status),
    )
  )
    description += "未解決の投稿があるため、新しい送信は止まっています。";
  return description;
}

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
      : buckets.find((bucket) => bucket.id === model.view)?.label ||
        "自動投稿の対象";
  $("page-title").textContent = pageTitle;
  const descriptions = {
    queued: postingDescription(state),
    inbox: "",
    saved: "",
    approved: "内容と重複を確認し、投稿を承認した記事です。",
    review:
      "対象かどうか、または重複かどうかの判断を保留し、自動で止めた記事です。",
    pending: "Jev の仕分けを待っている記事と、仕分けに失敗した記事です。",
    dates: "公開日時を確認できない記事は、自動投稿の対象外です。",
    expired: "自動処理の対象期間を過ぎた記事です。",
    posted: "",
    dismissed: "手動で見送った記事です。",
    duplicate: "重複と判定し、自動で止めた記事です。",
    irrelevant: "選定基準で自動的に対象外となった記事です。",
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
        el(
          "span",
          `nav-count${bucket.id === "queued" ? " nav-count-emphasis" : ""}`,
          model.state?.stats.buckets[bucket.id] || 0,
        ),
      );
      if (bucket.id === model.view) node.setAttribute("aria-current", "page");
      const label = {
        0: "記事",
        2: "自動で止めた記事",
        5: "手動で分けた記事",
        8: "その他",
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
