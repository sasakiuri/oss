// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { $, el, button } from "./dom.js";
import { refresh } from "./inbox.js";
import { createSources, refreshSourceStatus } from "./sources.js";
import {
  createClassificationStatus,
  createClassificationSettings,
} from "./classification-settings.js";
import {
  createPublicationSettings,
  refreshPublicationStatus,
} from "./publication-settings.js";

export function renderSettings() {
  if (!model.state) return;
  if (model.settingsRendered) {
    refreshSourceStatus();
    refreshPublicationStatus();
    return;
  }
  model.settingsRendered = true;
  const state = model.state;
  const left = el("div");
  const right = el("div");
  const conflict = el("section", "settings-card");
  conflict.id = "settings-conflict";
  conflict.hidden = true;
  conflict.setAttribute("role", "alert");
  conflict.append(
    el("h2", "", "設定が更新されています"),
    el(
      "p",
      "form-help",
      "入力内容はまだ保存されていません。入力を確認・控えたうえで最新の設定を読み直してください。自動投稿の再開は、最新の停止状態を確認してから改めて選択してください。",
    ),
    button("最新の設定を読み直す（未保存の変更を破棄）", "button", async () => {
      await refresh(true);
      if (model.loadError) return;
      model.settingsRendered = false;
      renderSettings();
      $("post-selection")?.focus();
    }),
  );
  left.append(conflict);
  left.append(createSources(state));
  right.append(
    createClassificationStatus(state),
    createPublicationSettings(state),
  );
  const notifications = el("section", "settings-card");
  notifications.append(
    el("h2", "", "Slack 通知"),
    el(
      "p",
      "form-help",
      state.settings.slackConfigured
        ? "設定済みです。クロール・仕分け・投稿・定期処理の異常と復旧を通知します。同じ障害の通知は原則1時間に1回までです。"
        : "未設定です。利用する場合は運用担当者が通知先を設定してください。",
    ),
  );
  right.append(notifications);
  right.append(createClassificationSettings(state));
  $("settings-view").replaceChildren(left, right);
  refreshPublicationStatus();
}
