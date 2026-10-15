// SPDX-License-Identifier: MIT
import { model } from "./model.js";
import { el, externalLink } from "./dom.js";
import { dateText } from "./time.js";
import { saveSettings } from "./actions.js";
import { notifyView } from "./updates.js";

export function createClassificationStatus(state) {
  const jev = el("section", "settings-card");
  jev.append(
    el("h2", "", "Jev による仕分け"),
    el(
      "p",
      "settings-intro",
      "記事の関連性と優先度を自動判定します。利用には API キーが必要です。",
    ),
  );
  jev.append(
    el(
      "span",
      `key-status${state.settings.jevConfigured ? "" : " missing"}`,
      state.settings.jevConfigured ? "API キー設定済み" : "API キー未設定",
    ),
  );
  if (!state.settings.jevConfigured) {
    jev.append(
      el(
        "p",
        "form-help",
        "利用する場合は運用担当者が Jev の API キーを設定してください。",
      ),
      el("code", "setup-code", "TYPESAFE_API_KEY=取得したキー"),
    );
    jev.append(
      externalLink(
        "TypeSafe の案内を開く ↗",
        "https://docs.typesafe.ai/",
        "text-button",
      ),
    );
  }
  jev.append(
    el(
      "p",
      "form-help",
      "「未判定を仕分け」で公開時刻がある記事は24時間以内、日付だけの記事は今日・昨日の新着を最大 100 件、TypeSafe に送信します。利用料金がかかります。",
    ),
  );
  if (state.settings.autoAnalyze) {
    const pausedUntil = state.settings.autoAnalyzePausedUntil;
    jev.append(
      el(
        "p",
        "form-help",
        !state.settings.jevConfigured
          ? "自動仕分けは有効ですが、API キーが未設定のため実行されません。"
          : pausedUntil && pausedUntil * 1000 > Date.now()
            ? `仕分けに失敗したため、自動仕分けは ${dateText(pausedUntil * 1000, true)} まで休止しています。失敗した記事は自動では再送しません。`
            : "自動仕分けは有効です。",
      ),
    );
  }
  return jev;
}

export function createClassificationSettings(state) {
  const rules = el("section", "settings-card");
  rules.append(el("h2", "", "選定基準と収集間隔"));
  const form = el("form", "settings-form");
  const rubricLabel = el("label", "", "仕分けの基準");
  rubricLabel.htmlFor = "rubric-input";
  const rubric = el("textarea");
  rubric.id = "rubric-input";
  rubric.name = "rubric";
  rubric.rows = 9;
  rubric.required = true;
  rubric.maxLength = 8000;
  rubric.value = state.settings.rubric || "";
  rubric.setAttribute("aria-describedby", "rubric-help");
  const rubricHelp = el(
    "p",
    "form-help",
    "基準を変更して保存すると、以前の仕分け結果は未判定に戻ります。保存・見送り・投稿済みの記録は残ります。",
  );
  rubricHelp.id = "rubric-help";
  const check = el("label", "check-label");
  const autoCollect = el("input");
  autoCollect.type = "checkbox";
  autoCollect.name = "autoCollect";
  autoCollect.checked = !!state.settings.autoCollect;
  check.append(autoCollect, el("span", "", "一定間隔で記事を自動収集する"));
  const analyzeCheck = el("label", "check-label");
  const autoAnalyze = el("input");
  autoAnalyze.type = "checkbox";
  autoAnalyze.name = "autoAnalyze";
  autoAnalyze.checked = !!state.settings.autoAnalyze;
  // A missing key cannot be enabled, but an enabled setting can be turned off.
  autoAnalyze.disabled =
    !state.settings.jevConfigured && !state.settings.autoAnalyze;
  autoAnalyze.setAttribute("aria-describedby", "analyze-help");
  analyzeCheck.append(
    autoAnalyze,
    el("span", "", "未判定の記事を Jev で自動仕分けする"),
  );
  const analyzeHelp = el(
    "p",
    "form-help",
    "待機中に、公開時刻がある記事は24時間以内、日付だけの記事は日本時間の今日・昨日の未判定記事を新しい順に、最大 100 件かつ収集間隔の分数までずつ TypeSafe に送信します。日時不明・不正・未来の記事は要確認として残し、自動では送りません。利用料金がかかります。仕分けに失敗した記事は自動では再送せず、失敗後は収集間隔の分だけ休止します。無効にしても、開始済みの仕分けは最後まで続きます。",
  );
  analyzeHelp.id = "analyze-help";
  const intervalLabel = el("label", "", "収集間隔（分）");
  intervalLabel.htmlFor = "poll-input";
  const interval = el("input");
  interval.type = "number";
  interval.id = "poll-input";
  interval.name = "pollMinutes";
  interval.min = "15";
  interval.max = "1440";
  interval.step = "1";
  interval.required = true;
  interval.value =
    state.settings.pollMinutes >= 15 ? state.settings.pollMinutes : 60;
  interval.setAttribute("aria-describedby", "poll-help");
  const intervalHelp = el(
    "p",
    "form-help",
    "15〜1,440 分。処理は順番に進みます。期限が来た収集を優先しますが、収集が終わるたびに自動仕分けを 1 回分実行できます。自動収集と自動仕分けは個別に有効にできます。",
  );
  intervalHelp.id = "poll-help";
  const submit = el("button", "button button-primary", "設定を保存");
  submit.type = "submit";
  form.append(
    rubricLabel,
    rubric,
    rubricHelp,
    check,
    analyzeCheck,
    analyzeHelp,
    intervalLabel,
    interval,
    intervalHelp,
    submit,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    const success = await saveSettings(
      state.settings,
      {
        rubric: rubric.value.trim(),
        autoCollect: autoCollect.checked,
        autoAnalyze: autoAnalyze.checked,
        pollMinutes: Number(interval.value),
      },
      "設定を保存しました。",
    );
    submit.disabled = false;
    if (success) {
      model.settingsRendered = false;
      notifyView("settings");
    }
  });
  rules.append(form);
  return rules;
}
