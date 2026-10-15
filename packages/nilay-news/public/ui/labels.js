// SPDX-License-Identifier: MIT

export const buckets = [
  {
    id: "inbox",
    label: "受信箱",
    match: (a) =>
      a.reviewStatus === "unread" &&
      a.freshness === "fresh" &&
      (a.sourceCandidate || a.decision !== "irrelevant"),
  },
  {
    id: "saved",
    label: "保存済み",
    match: (a) => a.reviewStatus === "saved",
  },
  {
    id: "approved",
    label: "投稿承認済み",
    match: (a) => a.reviewStatus === "approved",
  },
  {
    id: "review",
    label: "内容の要確認",
    match: (a) =>
      a.reviewStatus === "unread" &&
      a.freshness === "fresh" &&
      !a.sourceCandidate &&
      a.analysisStatus === "done" &&
      (a.decision === "review" || a.relation === "uncertain"),
  },
  {
    id: "pending",
    label: "未判定・仕分け失敗",
    match: (a) =>
      a.reviewStatus === "unread" &&
      a.freshness === "fresh" &&
      !a.sourceCandidate &&
      a.analysisStatus !== "done",
  },
  {
    id: "dates",
    label: "日時未確認",
    match: (a) =>
      a.reviewStatus === "unread" &&
      a.freshness !== "fresh" &&
      a.freshness !== "stale",
  },
  {
    id: "expired",
    label: "期間を過ぎた記事",
    match: (a) => a.reviewStatus === "unread" && a.freshness === "stale",
  },
  {
    id: "posted",
    label: "投稿済み",
    match: (a) => a.reviewStatus === "posted",
  },
  {
    id: "dismissed",
    label: "見送り・対象外",
    match: (a) =>
      a.reviewStatus === "dismissed" ||
      (a.reviewStatus === "unread" &&
        a.freshness === "fresh" &&
        !a.sourceCandidate &&
        a.decision === "irrelevant"),
  },
];
/** Shown for articles the server made candidates by their source alone. */
export const SOURCE_CANDIDATE_LABEL = "投稿対象（情報源指定）";
export const SOURCE_CANDIDATE_REASON =
  "日本ライフル射撃協会・日本クレー射撃協会・日本ジビエ振興協会の記事は、公開時刻がある記事は24時間以内、日付だけの記事は日本時間の今日・昨日なら Jev の仕分けを待たずに投稿対象になります。公開日時が不明・不正・未来の記事、手動で見送った記事や投稿済みの記事は除きます。Jev の仕分け結果はこの指定を取り消しません。";
export const freshnessLabels = {
  stale: "期間外・自動対象外",
  unknown: "公開日時不明・自動対象外",
  invalid: "公開日時不正・自動対象外",
  future: "公開日時が未来・自動対象外",
};
export const decisionLabels = {
  candidate: "候補",
  review: "要確認",
  irrelevant: "対象外",
};
export const statusLabels = {
  unread: "未読",
  saved: "保存済み",
  approved: "投稿承認済み",
  dismissed: "見送り",
  posted: "投稿済み",
};
export const relationLabels = {
  duplicate: "重複の可能性",
  followup: "続報の可能性",
  uncertain: "関連性を確認",
  different: "別の出来事",
};
export const phaseLabels = {
  collecting: "新着記事を収集中",
  collect: "新着記事を収集中",
  analyzing: "Jev が記事を仕分け中",
  analyze: "Jev が記事を仕分け中",
  fetching: "収集元を確認中",
  idle: "待機中",
  done: "完了",
};
export const postSelectionLabels = {
  saved: "手動で保存した記事",
  candidates: "Jev の候補と情報源指定の記事",
  both: "手動保存、Jev の候補、情報源指定の記事",
};
export const sourceKindLabels = {
  rss: "RSS",
  html: "ページ更新",
  kanpo: "官報",
  egov: "e-Gov パブリックコメント",
  bills: "法案・税制改正",
};
export const bulkLabels = {
  dismissed: "選択した記事を見送る",
  approved: "選択した記事の投稿を承認",
  saved: "選択した記事を保存",
  unread: "選択した記事を未読に戻す",
};
export const bulkMessages = {
  dismissed: "記事を見送りました。",
  approved: "記事の投稿を承認しました。自動投稿が有効なら配信対象になります。",
  saved: "記事を保存しました。",
  unread: "記事を未読に戻し、投稿承認を解除しました。",
};
