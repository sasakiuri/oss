// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { $, el, button, externalLink, showNotice } from "./dom.js";
import { dateText, messageText } from "./time.js";
import { postSelectionLabels } from "./labels.js";
import { api } from "./api.js";
import { saveSettings } from "./actions.js";
import { notifyView } from "./updates.js";

export function createPublicationSettings(state) {
  const posting = el("section", "settings-card");
  posting.append(el("h2", "", "X への自動投稿"));
  posting.append(
    externalLink(
      "投稿先 @NilayNews ↗",
      "https://x.com/NilayNews",
      "text-button",
    ),
  );
  posting.append(
    el(
      "p",
      "form-help",
      "公開時刻がある記事は24時間以内、日付だけの記事は日本時間の今日・昨日を対象に、1時間ごとに、その時点の対象記事をすべて、新しい順で1記事につき1投稿ずつ連続投稿します。10件あれば10投稿です。配信開始後に対象になった記事は次回に送信します。送信は毎日 06:00〜23:00 JST（23:00以降送信なし）で、時間外に対象になった記事は翌朝 06:00 以降に、その時点でも鮮度条件を満たせば送信します。初回は有効化から60分以上後です。Bufferの利用上限が近い場合は自動投稿を停止します。表示された待機時間の後に再確認して再開してください。公開日時が不明・不正・未来の記事は、保存済み・手動承認・情報源指定でも対象外です。見送り・投稿済みの記事と、手動承認・情報源指定以外で重複と判定された記事や、重複かどうか要確認の記事も除外します。Jev が設定されている場合は、手動承認・情報源指定以外の記事を投稿直前にも投稿済み記事と照合します。追加の Jev 利用料がかかり、確認に失敗した場合は自動投稿を停止します。",
    ),
  );
  const postingStatus = el("p", "form-help");
  postingStatus.id = "posting-status";
  posting.append(postingStatus);
  posting.append(
    el(
      "p",
      "form-help",
      state.publication.configured
        ? "Buffer は設定済みです。登録前に X の @NilayNews との接続を照合します。"
        : "Buffer が未設定です。運用担当者が API キーとチャンネル ID を設定してください。",
    ),
  );
  posting.append(
    el(
      "p",
      "form-help",
      "Buffer 経由で投稿します。停止すると新しい記事の登録を止めます。すでに Buffer が受け付けた投稿を取り消す場合は、Buffer で削除してください。",
    ),
  );
  const postForm = el("form", "settings-form");
  const postCheck = el("label", "check-label");
  const autoPost = el("input");
  autoPost.type = "checkbox";
  autoPost.checked = state.settings.autoPost;
  autoPost.disabled = !state.publication.configured && !state.settings.autoPost;
  postCheck.append(autoPost, el("span", "", "自動投稿を有効にする"));
  const selectionLabel = el("label", "", "投稿する記事");
  selectionLabel.htmlFor = "post-selection";
  const selection = el("select");
  selection.id = "post-selection";
  for (const [value, label] of Object.entries(postSelectionLabels)) {
    const option = el("option", "", label);
    option.value = value;
    selection.append(option);
  }
  selection.value = state.settings.postSelection;
  const postSubmit = el("button", "button button-primary", "投稿設定を保存");
  postSubmit.type = "submit";
  postForm.append(
    postCheck,
    selectionLabel,
    selection,
    el(
      "p",
      "form-help",
      "手動で投稿を承認した記事は、上の選択にかかわらず投稿候補に含まれます。承認だけでは自動投稿は有効になりません。",
    ),
    postSubmit,
  );
  postForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    postSubmit.disabled = true;
    const success = await saveSettings(
      state.settings,
      { autoPost: autoPost.checked, postSelection: selection.value },
      "投稿設定を保存しました。",
    );
    postSubmit.disabled = false;
    if (success) {
      model.settingsRendered = false;
      notifyView("settings");
    }
  });
  posting.append(postForm);
  // The check never saves or enables anything; its result is a snapshot of
  // the saved settings and is hidden once they or the form change.
  model.preflight = null;
  const preflight = el("section", "analysis-box");
  preflight.id = "preflight-result";
  preflight.setAttribute("aria-live", "polite");
  preflight.hidden = true;
  const clearPreflight = () => {
    model.preflight = null;
    preflight.hidden = true;
    preflight.replaceChildren();
  };
  autoPost.addEventListener("change", clearPreflight);
  selection.addEventListener("change", clearPreflight);
  const preflightButton = button(
    "投稿せずに接続・候補を確認",
    "button button-secondary",
    async () => {
      clearPreflight();
      const saved = model.state.settings;
      if (
        autoPost.checked !== saved.autoPost ||
        selection.value !== saved.postSelection
      ) {
        showNotice(
          "保存していない投稿設定があります。保存するか元に戻してから確認してください。",
          true,
        );
        return;
      }
      preflightButton.disabled = true;
      try {
        const report = await api("/api/publication/preflight", {});
        // A change made while waiting makes this result stale.
        if (
          preflight.isConnected &&
          autoPost.checked === report.autoPost &&
          selection.value === report.postSelection
        ) {
          model.preflight = report;
          renderPreflight(preflight, report);
          refreshPublicationStatus();
        }
      } catch (error) {
        showNotice(error.message, true);
      } finally {
        preflightButton.disabled = false;
      }
    },
  );
  posting.append(preflightButton, preflight);
  return posting;
}

/** Whether a preflight report still describes the saved posting settings. */
export function preflightCurrent(report, settings) {
  return (
    report.autoPost === settings.autoPost &&
    report.postSelection === settings.postSelection
  );
}

export function renderPreflight(container, report) {
  const checks = el("ul", "form-help");
  checks.append(
    el(
      "li",
      "",
      `Buffer と X の @${report.account}：${report.connectionVerified ? "接続を確認しました" : report.configured ? "確認できません" : "未設定"}`,
    ),
    el("li", "", `自動投稿：${report.autoPost ? "すでに有効" : "停止中"}`),
    el(
      "li",
      "",
      `投稿する記事：${postSelectionLabels[report.postSelection] || report.postSelection}・投稿待ち ${report.candidates} 件`,
    ),
  );
  container.replaceChildren(
    el(
      "h3",
      "",
      `確認結果（${dateText(report.checkedAt, true)} 時点のスナップショット）`,
    ),
    el(
      "p",
      report.ready ? "" : "analysis-error",
      report.ready
        ? "開始前の確認項目に問題はありません。投稿はまだ始まっていません。"
        : "開始する前に次の項目を確認してください。",
    ),
    checks,
  );
  if (report.blockers.length) {
    const blockers = el("ul", "analysis-error");
    for (const blocker of report.blockers)
      blockers.append(el("li", "", messageText(blocker)));
    container.append(blockers);
  }
  if (report.firstCandidate)
    container.append(
      el("h3", "", "次に投稿する予定の文面"),
      el("p", "post-preview", report.firstCandidate.text),
    );
  for (const note of report.notes)
    container.append(el("p", "form-help", messageText(note)));
  container.hidden = false;
}

export function refreshPublicationStatus() {
  const node = $("posting-status");
  if (!node) return;
  const { publication, settings } = model.state;
  const preflight = $("preflight-result");
  if (
    preflight &&
    model.preflight &&
    !preflightCurrent(model.preflight, settings)
  ) {
    model.preflight = null;
    preflight.hidden = true;
    preflight.replaceChildren();
  }
  const unsent = publication.posts.filter(
    (post) => post.failedBeforeSend,
  ).length;
  const held = publication.posts.filter(
    (post) =>
      !post.failedBeforeSend &&
      ["unknown", "failed", "publishing", "submitted"].includes(post.status),
  ).length;
  node.textContent = `${publication.error ? "エラーにより停止中" : settings.autoPost ? "有効" : "停止中"}・投稿待ち ${publication.queued} 件・結果確認待ち／送信中 ${held} 件`;
  if (unsent) node.textContent += `・送信前エラー ${unsent} 件`;
  if (publication.error)
    node.textContent += `。${messageText(publication.error)}`;
  if (settings.autoPost && publication.nextAt)
    node.textContent += `・次回 ${dateText(publication.nextAt * 1000, true)}`;
  const pending = publication.posts.filter(
    (post) => post.status === "submitted",
  );
  if (pending.length) {
    const next = Math.min(
      ...pending.map((post) => post.nextCheckAt ?? Infinity),
    );
    node.textContent += `・受け付け済み投稿を読み取り確認中${Number.isFinite(next) ? `（次回 ${dateText(next * 1000, true)}）` : ""}。確認完了まで新しい投稿を保留します。`;
  }
  if (held > pending.length)
    node.textContent += "。対象記事の詳細で投稿結果を確認してください。";
  if (unsent)
    node.textContent +=
      "。対象記事の詳細で見送りまたは投稿エラーの解除を行い、設定から自動投稿を再開してください。";
  const quota = publication.quota;
  if (!quota) {
    node.textContent += "・Buffer API 利用回数は未観測";
  } else {
    const now = Date.now() / 1000;
    const age = now - quota.observedAt;
    node.textContent += `・API 最終観測 ${dateText(quota.observedAt * 1000, true)}${age > 300 ? "（古い観測）" : ""}`;
    if (quota.api.state === "missing")
      node.textContent += "・API 利用回数は不明（応答に情報なし）";
    if (quota.api.state === "malformed")
      node.textContent += "・API 利用回数は不明（情報を検証できません）";
    if (quota.api.state === "limited")
      node.textContent += "・API 利用制限を観測";
    for (const window of quota.api.windows) {
      const label =
        { 900: "15分", 86400: "24時間", 2592000: "30日" }[window.seconds] ??
        "期間不明の枠";
      node.textContent += `・${label}: 観測時の残り ${window.remaining}${window.limit === undefined ? "" : `/${window.limit}`} 回、リセット見込み ${dateText(window.resetAt * 1000, true)}${window.resetAt <= now ? "（経過・再確認が必要）" : ""}`;
    }
    if (quota.api.retryAt)
      node.textContent += `・API 再確認は ${dateText(quota.api.retryAt * 1000, true)} 以降`;
    if (quota.channel)
      node.textContent += `・チャンネル投稿枠（API 回数とは別）: 予約 ${quota.channel.scheduled} 件${quota.channel.sent === undefined ? "" : `、送信 ${quota.channel.sent} 件`}、上限 ${quota.channel.limit === null ? "なし" : quota.channel.limit}（${dateText(quota.channel.observedAt * 1000, true)} の観測${now - quota.channel.observedAt > 300 ? "・古い観測" : ""}）`;
    node.textContent +=
      "。リセット見込みは投稿再開の保証ではありません。停止した自動投稿は接続と投稿結果を確認してから手動で有効にしてください。";
  }
}
