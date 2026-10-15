// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { $, el, externalLink } from "./dom.js";
import { dateText, messageText } from "./time.js";
import { sourceKindLabels } from "./labels.js";
import { mutate } from "./actions.js";

export function createSources(state) {
  const sources = el("section", "settings-card");
  const sourceHeading = el("h2", "", "収集元");
  sourceHeading.append(
    el("span", "source-status-count", `${state.sources.length} 件`),
  );
  sources.append(
    sourceHeading,
    el("p", "settings-intro", "有効にした収集元から記事を取得します。"),
  );
  for (const source of state.sources) {
    const row = el("div", "source-row");
    row.dataset.sourceId = source.id;
    const top = el("div", "source-topline");
    const heading = el("div");
    heading.append(externalLink(source.name, source.url, "source-name"));
    if (source.description)
      heading.append(el("p", "source-description", source.description));
    const toggle = el("label", "switch");
    const input = el("input");
    input.type = "checkbox";
    input.checked = !!source.enabled;
    input.disabled = !!source.collectionBlocked;
    input.setAttribute("aria-label", `${source.name}の収集を有効にする`);
    input.addEventListener("change", async () => {
      input.disabled = true;
      const enabled = input.checked;
      const success = await mutate(
        `/api/sources/${encodeURIComponent(source.id)}`,
        { enabled },
      );
      if (!success) input.checked = !enabled;
      input.disabled = false;
    });
    toggle.append(input);
    top.append(heading, toggle);
    const meta = el("div", "source-meta");
    renderSourceMeta(meta, source);
    row.append(top, meta);
    renderSourceMessages(row, source);
    sources.append(row);
  }
  if (!state.sources.length)
    sources.append(
      el(
        "p",
        "form-help",
        "収集元が登録されていません。収集元の設定を確認してください。",
      ),
    );
  return sources;
}

function renderSourceMeta(meta, source) {
  meta.replaceChildren(
    el("span", "tag", sourceKindLabels[source.kind] || source.kind),
    el(
      "span",
      "",
      source.lastFetchedAt
        ? `最終確認 ${dateText(source.lastFetchedAt, true)}`
        : "まだ収集していません",
    ),
  );
  if (source.lastCount !== null && source.lastCount !== undefined)
    meta.append(el("span", "", `${source.lastCount} 件取得`));
}

function renderSourceMessages(row, source) {
  row.querySelector(".source-policy")?.remove();
  if (source.collectionBlocked)
    row.append(
      el("p", "source-policy source-description", source.collectionBlocked),
    );
  else if (source.robotsExceptionReason)
    row.append(
      el("p", "source-policy source-description", source.robotsExceptionReason),
    );
  row.querySelector(".source-timing")?.remove();
  if (source.minCollectionMinutes) {
    const interval =
      source.minCollectionMinutes < 60
        ? `${source.minCollectionMinutes}分`
        : `${source.minCollectionMinutes / 60}時間`;
    const text =
      `取得は${interval}以上空けます。` +
      (source.minRequestIntervalSeconds
        ? `同じサイトへの通信は${source.minRequestIntervalSeconds / 60}分以上空けます。`
        : "");
    row.append(
      el(
        "p",
        "source-timing source-description",
        text +
          (source.autoCollectAt
            ? ` 次回の自動収集予定：${dateText(source.autoCollectAt, true)}。`
            : "") +
          (source.nextFetchAt
            ? ` 次回取得可能：${dateText(source.nextFetchAt, true)}`
            : ""),
      ),
    );
  }
  row.querySelector(".source-deferred")?.remove();
  if (source.lastDeferred)
    row.append(
      el(
        "p",
        "source-deferred source-description",
        `前回の待機：${messageText(source.lastDeferred)}`,
      ),
    );
  row.querySelector(".source-error")?.remove();
  row.querySelector(".source-warnings")?.remove();
  if (source.lastError)
    row.append(
      el(
        "p",
        "source-error",
        `取得できませんでした：${messageText(source.lastError)}`,
      ),
    );
  if (Array.isArray(source.lastWarnings) && source.lastWarnings.length) {
    const warnings = el("ul", "source-warnings");
    warnings.setAttribute("aria-label", "取得範囲と注意点");
    for (const message of source.lastWarnings)
      warnings.append(el("li", "", messageText(message)));
    row.append(warnings);
  }
}

export function refreshSourceStatus() {
  for (const row of $("settings-view").querySelectorAll("[data-source-id]")) {
    const source = model.state.sources.find(
      (item) => item.id === row.dataset.sourceId,
    );
    if (!source) continue;
    const meta = row.querySelector(".source-meta");
    renderSourceMeta(meta, source);
    renderSourceMessages(row, source);
    const toggle = row.querySelector("input");
    if (!toggle.disabled) toggle.checked = !!source.enabled;
  }
}
