const $ = (id) => document.getElementById(id);
const PAGE_SIZE = 50;
const model = {
  state: null,
  view: "inbox",
  selectedId: null,
  checkedIds: new Set(),
  query: "",
  topic: "",
  analysis: "",
  relation: "",
  bulkStatus: "dismissed",
  sort: "newest",
  visibleCount: PAGE_SIZE,
  loading: true,
  requestPending: false,
  pollTimer: null,
  refreshPromise: null,
  stateEtag: null,
  receivedStateEtag: null,
  loadError: null,
  lastJobError: null,
  lastPostError: null,
  settingsRendered: false,
  preflight: null,
  expandedBodies: new Set(),
};

const buckets = [
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
const SOURCE_CANDIDATE_LABEL = "投稿対象（情報源指定）";
const SOURCE_CANDIDATE_REASON =
  "日本ライフル射撃協会・日本クレー射撃協会・日本ジビエ振興協会の記事は、公開時刻がある記事は24時間以内、日付だけの記事は日本時間の今日・昨日なら Jev の仕分けを待たずに投稿対象になります。公開日時が不明・不正・未来の記事、手動で見送った記事や投稿済みの記事は除きます。Jev の仕分け結果はこの指定を取り消しません。";
const freshnessLabels = {
  stale: "期間外・自動対象外",
  unknown: "公開日時不明・自動対象外",
  invalid: "公開日時不正・自動対象外",
  future: "公開日時が未来・自動対象外",
};
const decisionLabels = {
  candidate: "候補",
  review: "要確認",
  irrelevant: "対象外",
};
const statusLabels = {
  unread: "未読",
  saved: "保存済み",
  approved: "投稿承認済み",
  dismissed: "見送り",
  posted: "投稿済み",
};
const relationLabels = {
  duplicate: "重複の可能性",
  followup: "続報の可能性",
  uncertain: "関連性を確認",
  different: "別の出来事",
};
const phaseLabels = {
  collecting: "新着記事を収集中",
  collect: "新着記事を収集中",
  analyzing: "Jev が記事を仕分け中",
  analyze: "Jev が記事を仕分け中",
  fetching: "収集元を確認中",
  idle: "待機中",
  done: "完了",
};
const postSelectionLabels = {
  saved: "手動で保存した記事",
  candidates: "Jev の候補と情報源指定の記事",
  both: "手動保存、Jev の候補、情報源指定の記事",
};
const sourceKindLabels = {
  rss: "RSS",
  html: "ページ更新",
  kanpo: "官報",
  egov: "e-Gov パブリックコメント",
  bills: "法案・税制改正",
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function button(text, className, action, focusKey) {
  const node = el("button", className, text);
  node.type = "button";
  if (action) node.addEventListener("click", action);
  if (focusKey) node.dataset.focus = focusKey;
  return node;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function externalLink(text, url, className) {
  const href = safeUrl(url);
  const node = el(href ? "a" : "span", className, text);
  if (href) {
    node.href = href;
    node.target = "_blank";
    node.rel = "noopener noreferrer";
  }
  return node;
}

const JST_OFFSET_MS = 9 * 3600 * 1000;

function pad2(value) {
  return String(value).padStart(2, "0");
}

/** Japan Standard Time (no DST) wall clock in 24-hour form, independent of the browser zone. */
function jstClock(epochMs, includeTime, includeSeconds = false) {
  const jst = new Date(epochMs + JST_OFFSET_MS);
  const day = `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`;
  if (!includeTime) return day;
  const seconds = includeSeconds ? `:${pad2(jst.getUTCSeconds())}` : "";
  return `${day} ${pad2(jst.getUTCHours())}:${pad2(jst.getUTCMinutes())}${seconds} JST`;
}

function dateText(value, includeTime = false) {
  if (!value) return "日時不明";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "日時不明";
  return jstClock(time, includeTime);
}

// A URL is kept verbatim; otherwise an ISO date-time with an explicit zone,
// not glued to other date, URL or identifier characters.
const MESSAGE_TIME =
  /(https?:\/\/\S+)|(?<![\w/.:+-])(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})(?![\w:+-]|\.\d)/g;

/** Server text with stored UTC ISO timestamps rewritten as JST; anything invalid stays as is. */
function messageText(text) {
  if (typeof text !== "string") return text;
  return text.replace(
    MESSAGE_TIME,
    (match, url, y, mo, d, h, mi, s, fraction, zone) => {
      if (url) return match;
      const [year, month, day, hour, minute, second] = [
        y,
        mo,
        d,
        h,
        mi,
        s || "0",
      ].map(Number);
      const [zoneHour, zoneMinute] =
        zone === "Z" ? [0, 0] : zone.slice(1).split(":").map(Number);
      if (
        hour > 23 ||
        minute > 59 ||
        second > 59 ||
        zoneHour > 23 ||
        zoneMinute > 59
      )
        return match;
      const local = Date.UTC(year, month - 1, day, hour, minute, second);
      const check = new Date(local);
      if (
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
      )
        return match;
      const offset =
        (zoneHour * 60 + zoneMinute) * 60000 * (zone.startsWith("-") ? -1 : 1);
      const fractionMs = fraction
        ? Math.floor(Number(`0${fraction}`) * 1000)
        : 0;
      return jstClock(local - offset + fractionMs, true, s !== undefined);
    },
  );
}

function shortDate(article) {
  return article.publishedAt
    ? dateText(article.publishedAt)
    : `${dateText(article.discoveredAt)} 収集`;
}

function showNotice(message, error = false) {
  $("notice-text").textContent = messageText(message);
  $("notice").classList.toggle("error", error);
  $("notice").setAttribute("role", error ? "alert" : "status");
  $("notice").hidden = false;
}

function hideNotice() {
  $("notice").hidden = true;
}

async function api(path, body) {
  const options = { credentials: "same-origin", cache: "no-store" };
  if (path === "/api/state" && body === undefined && model.stateEtag) {
    options.headers = { "If-None-Match": model.stateEtag };
  }
  if (body !== undefined) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  if (path === "/api/state" && response.status === 304 && model.state) {
    model.receivedStateEtag = model.stateEtag;
    return model.state;
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("サーバーからの応答を読み取れませんでした。");
  }
  if (!response.ok) {
    const error = new Error(
      data.error || `処理に失敗しました（${response.status}）。`,
    );
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  if (path === "/api/state") {
    model.receivedStateEtag = response.headers.get("ETag");
  }
  return data;
}

async function refresh(force = false) {
  if (model.refreshPromise) {
    await model.refreshPromise;
    if (!force) return;
  }
  model.refreshPromise = loadState();
  try {
    await model.refreshPromise;
  } finally {
    model.refreshPromise = null;
  }
}

async function loadState() {
  clearTimeout(model.pollTimer);
  try {
    const state = await api("/api/state");
    if (
      !Array.isArray(state.articles) ||
      !Array.isArray(state.sources) ||
      !state.settings ||
      !state.job
    ) {
      throw new Error("受信箱のデータ形式を確認できませんでした。");
    }
    const changed = JSON.stringify(state) !== JSON.stringify(model.state);
    model.state = state;
    model.stateEtag = model.receivedStateEtag;
    model.loading = false;
    model.loadError = null;
    if (state.job.error && state.job.error !== model.lastJobError)
      showNotice(state.job.error, true);
    model.lastJobError = state.job.error || null;
    const postError =
      state.publication.error ||
      state.publication.posts.find((post) => post.error)?.error;
    if (postError && postError !== model.lastPostError)
      showNotice(postError, true);
    model.lastPostError = postError || null;
    if (changed) render();
  } catch (error) {
    model.loading = false;
    const firstFailure = !model.loadError;
    model.loadError = error.message;
    if (!model.state) render();
    else if (firstFailure)
      showNotice(`受信箱を更新できませんでした。${error.message}`, true);
    $("last-updated").textContent = "サーバーとの接続を確認してください";
  } finally {
    model.pollTimer = setTimeout(
      refresh,
      model.state?.job.running ? 2000 : 30000,
    );
  }
}

async function mutate(path, body, message) {
  if (model.requestPending) {
    showNotice("保存中です。完了してから操作してください。");
    return false;
  }
  model.requestPending = true;
  renderHeader();
  renderBulkActions();
  try {
    await api(path, body);
    if (message) showNotice(message);
    await refresh(true);
    return true;
  } catch (error) {
    showNotice(error.message, true);
    if (error.code === "settings_conflict") {
      const conflict = $("settings-conflict");
      if (conflict) conflict.hidden = false;
      // Refresh status, but never replace the form's inputs or edit token.
      await refresh(true);
    }
    return false;
  } finally {
    model.requestPending = false;
    renderHeader();
    renderBulkActions();
  }
}

/** Only deliberate field edits are sent; an unchanged enabled toggle is not new intent. */
function settingsChanges(baseline, values) {
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => value !== baseline[key]),
  );
}

async function saveSettings(baseline, values, message) {
  const changes = settingsChanges(baseline, values);
  if (!Object.keys(changes).length) {
    showNotice("変更はありません。最新の状態は設定の読み直しで確認できます。");
    return false;
  }
  return mutate(
    "/api/settings",
    { ...changes, revision: baseline.revision },
    message,
  );
}

function collect() {
  return mutate(
    "/api/collect",
    {},
    "記事の収集を受け付けました。順次処理します。",
  );
}

function analyze(articleId) {
  return mutate(
    "/api/analyze",
    articleId ? { articleIds: [articleId] } : {},
    "Jev による仕分けを受け付けました。順次処理します。",
  );
}

async function review(article, status) {
  const success = await mutate(
    `/api/articles/${encodeURIComponent(article.id)}/review`,
    { status },
    status === "posted"
      ? "投稿済みとして記録しました。"
      : status === "approved"
        ? "投稿を承認しました。自動投稿が有効なら配信対象になります。"
        : status === "saved"
          ? "保存しました。"
          : status === "dismissed"
            ? "この記事を見送りました。"
            : "未読に戻しました。",
  );
  if (success) render();
}

function canDismiss(article) {
  return (
    article.reviewStatus !== "dismissed" && canReview(article, "dismissed")
  );
}

function canReview(article, status) {
  if (article.reviewStatus === "posted") return false;
  const post = model.state.publication.posts.find(
    (item) => item.articleId === article.id,
  );
  return (
    post?.status !== "posted" &&
    ((post?.failedBeforeSend === true &&
      ["dismissed", "approved"].includes(status)) ||
      !["publishing", "submitted", "unknown", "failed"].includes(post?.status))
  );
}

const bulkLabels = {
  dismissed: "選択した記事を見送る",
  approved: "選択した記事の投稿を承認",
  saved: "選択した記事を保存",
  unread: "選択した記事を未読に戻す",
};
const bulkMessages = {
  dismissed: "記事を見送りました。",
  approved: "記事の投稿を承認しました。自動投稿が有効なら配信対象になります。",
  saved: "記事を保存しました。",
  unread: "記事を未読に戻し、投稿承認を解除しました。",
};

async function reviewSelected() {
  renderBulkActions();
  const articleIds = [...model.checkedIds];
  if (!articleIds.length) return;
  const status = model.bulkStatus;
  if (
    model.state.articles.some(
      (article) =>
        model.checkedIds.has(article.id) && !canReview(article, status),
    )
  )
    return;
  const success = await mutate(
    "/api/articles/review",
    { articleIds, status },
    `${articleIds.length} 件の${bulkMessages[status]}`,
  );
  if (success) {
    for (const id of articleIds) model.checkedIds.delete(id);
    renderBulkActions();
  }
}

function renderBulkActions(
  shown = visibleArticles().slice(0, model.visibleCount),
) {
  const eligible = new Set(
    shown
      .filter((article) => canReview(article, "dismissed"))
      .map((article) => article.id),
  );
  for (const id of model.checkedIds) {
    if (!eligible.has(id)) model.checkedIds.delete(id);
  }
  $("bulk-actions").hidden = !shown.some(
    (article) => article.reviewStatus !== "posted",
  );
  const all = $("select-all-articles");
  all.checked = eligible.size > 0 && model.checkedIds.size === eligible.size;
  all.indeterminate = model.checkedIds.size > 0 && !all.checked;
  all.disabled = model.requestPending || !eligible.size;
  $("selection-count").textContent = `${model.checkedIds.size} 件選択中`;
  const blocked = shown.some(
    (article) =>
      model.checkedIds.has(article.id) && !canReview(article, model.bulkStatus),
  );
  $("bulk-operation").disabled = model.requestPending;
  $("apply-selected").textContent = bulkLabels[model.bulkStatus];
  $("apply-selected").disabled =
    model.requestPending || !model.checkedIds.size || blocked;
  $("bulk-help").textContent = blocked
    ? "送信前エラーの記事は、投稿承認または見送りを選んでください。"
    : model.bulkStatus === "approved"
      ? "内容と重複を確認した記事を承認します。Jev の判定にかかわらず、自動投稿が有効なら配信対象になります。公開日時・送信時間の条件は適用されます。"
      : model.bulkStatus === "unread"
        ? "投稿承認も解除し、元の仕分け結果で投稿対象を判定します。"
        : model.bulkStatus === "saved"
          ? "保存だけでは重複判定は解除されません。投稿承認済みの記事を保存に変更すると、承認は解除されます。"
          : "表示中の記事を対象にします。検索や絞り込みで表示から外れた記事の選択は解除されます。";
  for (const checkbox of $("article-list").querySelectorAll(
    "[data-select-id]",
  )) {
    checkbox.checked = model.checkedIds.has(checkbox.dataset.selectId);
    checkbox.disabled =
      model.requestPending || !eligible.has(checkbox.dataset.selectId);
  }
}

function setView(view) {
  model.view = view;
  model.visibleCount = PAGE_SIZE;
  model.selectedId = null;
  model.checkedIds.clear();
  model.settingsRendered = false;
  render();
}

function visibleArticles() {
  if (!model.state) return [];
  const bucket = buckets.find((item) => item.id === model.view) || buckets[0];
  const query = model.query.toLocaleLowerCase();
  return model.state.articles
    .filter(bucket.match)
    .filter((article) => {
      const searchable = [
        article.title,
        article.sourceName,
        article.excerpt,
        article.topic,
        article.body,
        JSON.stringify(article.metadata || {}),
        ...(article.attachments || []).map((attachment) => attachment.title),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (!model.topic || article.topic === model.topic) &&
        (!model.analysis ||
          (["pending", "error"].includes(model.analysis)
            ? (article.analysisStatus || "pending") === model.analysis
            : article.analysisStatus === "done" &&
              article.decision === model.analysis)) &&
        (!model.relation ||
          (model.relation === "none"
            ? !article.relation
            : article.relation === model.relation))
      );
    })
    .sort((a, b) => {
      if (model.sort === "priority") {
        const decisionScore = { candidate: 3, review: 1, irrelevant: -1 };
        const score = (article) =>
          (article.sourceCandidate
            ? decisionScore.candidate
            : decisionScore[article.decision] || 0) *
            10 +
          (article.priority || 0);
        const difference = score(b) - score(a);
        if (difference) return difference;
      }
      return (
        (Date.parse(b.publishedAt || b.discoveredAt) || 0) -
        (Date.parse(a.publishedAt || a.discoveredAt) || 0)
      );
    });
}

function renderHeader() {
  const state = model.state;
  const busy = !!state?.job.running || model.requestPending || !state;
  $("collect-button").disabled = busy;
  $("analyze-button").disabled =
    busy ||
    !state?.settings.jevConfigured ||
    !state.articles.some(
      (a) => a.freshness === "fresh" && a.analysisStatus !== "done",
    );
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

function renderNavigation() {
  const articles = model.state?.articles || [];
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
        el("span", "nav-count", articles.filter(bucket.match).length),
      );
      if (bucket.id === model.view) node.setAttribute("aria-current", "page");
      return node;
    }),
  );
}

function renderTopics() {
  const topics = [
    ...new Set(
      (model.state?.articles || [])
        .map((article) => article.topic)
        .filter(Boolean),
    ),
  ].sort();
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

function articleTags(article) {
  const result = [];
  if (article.freshness !== "fresh")
    result.push(
      el(
        "span",
        "tag tag-review",
        freshnessLabels[article.freshness] || freshnessLabels.unknown,
      ),
    );
  // The source rule is not a Jev result; its own Jev state stays labeled.
  const jev =
    article.sourceCandidate || article.reviewStatus === "approved"
      ? "Jev: "
      : "";
  if (article.sourceCandidate)
    result.push(
      el(
        "span",
        "tag tag-candidate",
        article.freshness === "fresh"
          ? SOURCE_CANDIDATE_LABEL
          : "情報源指定（鮮度条件外）",
      ),
    );
  if (article.analysisStatus === "error")
    result.push(el("span", "tag tag-error", `${jev}仕分け失敗`));
  else if (article.analysisStatus !== "done" || !article.decision)
    result.push(el("span", "tag", `${jev}未判定`));
  else
    result.push(
      el(
        "span",
        `tag tag-${article.decision}`,
        `${jev}${decisionLabels[article.decision] || "要確認"}`,
      ),
    );
  if (article.topic) result.push(el("span", "tag tag-topic", article.topic));
  if (article.contentError || article.bodyStale)
    result.push(el("span", "tag tag-review", "取得に注意"));
  if (article.relation === "followup")
    result.push(el("span", "tag tag-followup", "続報の可能性"));
  if (article.relation === "duplicate")
    result.push(el("span", "tag", "重複の可能性"));
  if (article.relation === "uncertain")
    result.push(el("span", "tag tag-review", "重複を要確認"));
  if (article.reviewStatus !== "unread")
    result.push(
      el(
        "span",
        "tag tag-status",
        statusLabels[article.reviewStatus] || article.reviewStatus,
      ),
    );
  return result;
}

function renderArticle(article) {
  const card = el(
    "article",
    `article-row${article.id === model.selectedId ? " selected" : ""}`,
  );
  if (article.reviewStatus !== "posted") {
    const label = el("label", "article-check");
    const checkbox = el("input");
    checkbox.type = "checkbox";
    checkbox.dataset.selectId = article.id;
    checkbox.dataset.focus = `check-${article.id}`;
    checkbox.checked = model.checkedIds.has(article.id);
    checkbox.disabled =
      model.requestPending || !canReview(article, "dismissed");
    checkbox.setAttribute(
      "aria-label",
      `${article.title || "見出しなし"} — 一括操作の対象に選択`,
    );
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) model.checkedIds.add(article.id);
      else model.checkedIds.delete(article.id);
      renderBulkActions();
    });
    label.append(checkbox);
    card.append(label);
  }
  const select = button(
    "",
    "article-select",
    () => {
      model.selectedId = article.id;
      renderArticles();
      renderDetail();
      if (window.matchMedia("(max-width: 960px)").matches) {
        $("detail-panel").scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        $("detail-panel").focus({ preventScroll: true });
      } else {
        [...document.querySelectorAll("[data-focus]")]
          .find((node) => node.dataset.focus === `article-${article.id}`)
          ?.focus({ preventScroll: true });
      }
    },
    `article-${article.id}`,
  );
  select.setAttribute("aria-label", `${article.title} — 詳細を読む`);
  select.setAttribute(
    "aria-pressed",
    article.id === model.selectedId ? "true" : "false",
  );
  const tags = el("div", "article-topline");
  tags.append(...articleTags(article));
  const meta = el("div", "article-meta");
  meta.append(
    el("span", "", article.sourceName || "収集元不明"),
    el("span", "meta-dot", "·"),
    el("time", "", shortDate(article)),
  );
  select.append(tags, el("h3", "article-title", article.title || "見出しなし"));
  if (article.excerpt)
    select.append(el("p", "article-excerpt", article.excerpt));
  select.append(meta);
  card.append(select);
  if (article.reviewStatus !== "posted") {
    const saved = article.reviewStatus === "saved";
    const save = button(
      saved ? "保存済み" : "保存",
      `bookmark-button${saved ? " saved" : ""}`,
      () => review(article, saved ? "unread" : "saved"),
      `save-${article.id}`,
    );
    save.setAttribute(
      "aria-label",
      saved ? "保存済み（保存を解除）" : "記事を保存",
    );
    save.setAttribute("aria-pressed", String(saved));
    save.title = saved ? "保存を解除" : "記事を保存";
    card.append(save);
  }
  return card;
}

function renderEmpty() {
  const empty = el("div", "empty-state");
  let title;
  let description;
  if (model.loading) {
    title = "読み込み中…";
    description = "記事と収集元を読み込んでいます。";
  } else if (model.loadError && !model.state) {
    title = "受信箱に接続できません";
    description = model.loadError;
  } else if (model.query || model.topic || model.analysis || model.relation) {
    title = "条件に合う記事はありません";
    description = "検索語やテーマを変更してください。";
  } else if (!model.state?.articles.length) {
    title = "記事はまだありません";
    description = "「記事を集める」で、登録した収集元から記事を取得します。";
  } else {
    const messages = {
      inbox: [
        "未読の記事はありません",
        "新しいニュースは「記事を集める」から確認できます。",
      ],
      saved: [
        "保存した記事はありません",
        "記事の「保存」を押すと、ここに表示されます。",
      ],
      approved: [
        "投稿を承認した記事はありません",
        "内容を確認した記事を選び、「投稿を承認」で自動投稿候補にできます。",
      ],
      review: [
        "確認待ちの記事はありません",
        "内容の関連性や、他の記事との重複を自動で決めきれなかった記事を表示します。日時の確認や仕分け待ちは別の一覧にあります。",
      ],
      pending: [
        "仕分け待ちの記事はありません",
        "未判定の記事と仕分けに失敗した記事を表示します。",
      ],
      dates: [
        "日時の確認が必要な記事はありません",
        "公開日時が不明・不正・未来の記事です。内容の判定とは別に、自動投稿の対象外として保持します。",
      ],
      expired: [
        "期間を過ぎた記事はありません",
        "自動処理の対象期間を過ぎた記事を履歴として表示します。",
      ],
      posted: [
        "投稿済みの記事はありません",
        "X で投稿したあと「投稿済みにする」で記録できます。",
      ],
      dismissed: [
        "見送り・対象外の記事はありません",
        "見送った記事と、仕分けで対象外になった記事を表示します。",
      ],
    };
    [title, description] = messages[model.view] || messages.inbox;
  }
  empty.append(el("h3", "", title), el("p", "", description));
  if (model.loadError && !model.state)
    empty.append(
      button("もう一度読み込む", "button button-secondary", refresh),
    );
  else if (
    (model.query || model.topic || model.analysis || model.relation) &&
    model.state
  )
    empty.append(
      button("絞り込みを解除", "button button-secondary", () => {
        model.query = "";
        model.topic = "";
        model.analysis = "";
        model.relation = "";
        model.visibleCount = PAGE_SIZE;
        $("search").value = "";
        $("topic-filter").value = "";
        $("analysis-filter").value = "";
        $("relation-filter").value = "";
        renderArticles();
      }),
    );
  else if (!model.state?.articles.length && model.state) {
    const collectButton = button(
      "記事を集める",
      "button button-primary",
      collect,
    );
    collectButton.disabled = !!model.state.job.running || model.requestPending;
    empty.append(collectButton);
  }
  return empty;
}

function renderArticles() {
  const articles = visibleArticles();
  const selectedVisible = articles.some(
    (article) => article.id === model.selectedId,
  );
  if (model.selectedId && !selectedVisible) {
    model.selectedId = null;
    renderDetail();
  }
  $("list-count").textContent = `${articles.length} 件`;
  const shown = articles.slice(0, model.visibleCount);
  renderBulkActions(shown);
  $("article-list").replaceChildren(
    ...(shown.length ? shown.map(renderArticle) : [renderEmpty()]),
  );
  $("list-footnote").textContent =
    `${articles.length} 件中 ${shown.length} 件を表示`;
  $("list-footnote").hidden = shown.length >= articles.length;
  $("list-pagination").replaceChildren();
  if (shown.length < articles.length) {
    const more = button(
      `さらに ${Math.min(PAGE_SIZE, articles.length - shown.length)} 件を表示`,
      "button button-subtle button-full",
      () => {
        const firstNewId = articles[shown.length]?.id;
        model.visibleCount += PAGE_SIZE;
        renderArticles();
        [...document.querySelectorAll("[data-focus]")]
          .find((node) => node.dataset.focus === `article-${firstNewId}`)
          ?.focus({ preventScroll: true });
      },
      "load-more",
    );
    more.setAttribute("aria-controls", "article-list");
    $("list-pagination").append(more);
  }
}

function renderDetail() {
  const panel = $("detail-panel");
  panel.tabIndex = -1;
  panel.replaceChildren();
  const article = model.state?.articles.find(
    (item) => item.id === model.selectedId,
  );
  $("reading-workspace").classList.toggle("has-selection", !!article);
  if (!article) {
    const empty = el("div", "detail-empty");
    empty.append(
      el("h3", "", "記事の詳細"),
      el("p", "", "一覧から記事を選ぶと、抜粋や元記事へのリンクを表示します。"),
    );
    panel.append(empty);
    return;
  }
  const header = el("div", "detail-header");
  header.append(
    el("span", "detail-label", "記事の詳細"),
    button(
      "閉じる",
      "detail-close",
      () => {
        const id = model.selectedId;
        model.selectedId = null;
        renderArticles();
        renderDetail();
        [...document.querySelectorAll("[data-focus]")]
          .find((node) => node.dataset.focus === `article-${id}`)
          ?.focus();
      },
      "detail-close",
    ),
  );
  const tags = el("div", "detail-tags");
  tags.append(...articleTags(article));
  const title = el("h2", "detail-title");
  title.append(externalLink(article.title || "見出しなし", article.url));
  const source = el("p", "detail-source");
  source.append(
    el("span", "", article.sourceName || "収集元不明"),
    el("br"),
    el(
      "span",
      "",
      article.publishedAt
        ? article.metadata?.publicationPrecision === "date"
          ? `公開日 ${dateText(article.publishedAt)}（時刻不明）`
          : `公開 ${dateText(article.publishedAt, true)}`
        : "公開日時は取得できていません",
    ),
    el("br"),
    el("span", "", `収集 ${dateText(article.discoveredAt, true)}`),
  );
  panel.append(
    header,
    tags,
    title,
    source,
    el("hr", "detail-divider"),
    el("span", "detail-summary-label", "抜粋"),
    el(
      "p",
      "detail-excerpt",
      article.excerpt || "抜粋はありません。元の記事で確認してください。",
    ),
  );
  appendArticleContent(panel, article);
  if (article.reviewStatus === "approved")
    panel.append(
      el(
        "p",
        "analysis-box",
        `投稿承認済み（${dateText(article.reviewedAt, true)}）。Jev の要確認・重複判定より手動承認を優先します。公開日時・送信時間の条件は適用されます。記事の内容が更新された場合は承認を解除します。`,
      ),
    );
  if (article.freshness !== "fresh")
    panel.append(
      el(
        "p",
        "form-help",
        `${freshnessLabels[article.freshness] || freshnessLabels.unknown}。自動仕分けと自動投稿の対象にはなりません。保存してもこの条件は変わりません。個別の手動仕分けはできます。`,
      ),
    );
  if (article.sourceCandidate) {
    const rule = el("section", "analysis-box source-candidate");
    rule.append(
      el(
        "h3",
        "",
        article.freshness === "fresh"
          ? SOURCE_CANDIDATE_LABEL
          : "情報源指定（鮮度条件外）",
      ),
      el("p", "", SOURCE_CANDIDATE_REASON),
    );
    panel.append(rule);
  }
  const analysis = el("section", "analysis-box");
  analysis.append(
    el(
      "h3",
      "",
      article.analysisStatus === "done" ? "Jev の仕分け" : "仕分けの状態",
    ),
  );
  if (article.analysisStatus === "done") {
    analysis.append(
      el("p", "", article.reason || "判定理由を取得できませんでした。"),
    );
    analysis.append(
      el(
        "p",
        "probability-note",
        "取得した情報による自動判定です。投稿前に原文を確認してください。",
      ),
    );
  } else if (article.analysisStatus === "error") {
    analysis.append(
      el(
        "p",
        "analysis-error",
        messageText(article.analysisError) ||
          "仕分けできませんでした。記事はそのまま確認できます。",
      ),
    );
  } else {
    analysis.append(el("p", "", "未判定"));
  }
  const related = model.state.articles.find(
    (item) => item.id === article.relatedArticleId,
  );
  if (article.relation && article.relation !== "different") {
    analysis.append(
      el("p", "", relationLabels[article.relation] || "関連する記事"),
    );
    if (
      !article.sourceCandidate &&
      article.reviewStatus !== "approved" &&
      article.relation === "uncertain"
    )
      analysis.append(
        el(
          "p",
          "form-help",
          "重複かどうか判断できないため、自動投稿の対象から外しています。関連記事を確認し、投稿してよい場合は「投稿を承認」を選んでください。保存だけでは解除されません。",
        ),
      );
    if (related)
      analysis.append(
        button(`↗ ${related.title}`, "relation-link", () => {
          const targetBucket = buckets.find((bucket) => bucket.match(related));
          model.checkedIds.clear();
          model.view = targetBucket?.id || "inbox";
          model.query = "";
          model.topic = "";
          model.analysis = "";
          model.relation = "";
          $("search").value = "";
          $("topic-filter").value = "";
          $("analysis-filter").value = "";
          $("relation-filter").value = "";
          model.selectedId = related.id;
          const relatedIndex = visibleArticles().findIndex(
            (item) => item.id === related.id,
          );
          model.visibleCount =
            Math.max(1, Math.ceil((relatedIndex + 1) / PAGE_SIZE)) * PAGE_SIZE;
          render();
        }),
      );
  }
  panel.append(analysis);
  const publication = model.state.publication.posts.find(
    (post) => post.articleId === article.id,
  );
  const postingBlocked = [
    "publishing",
    "submitted",
    "unknown",
    "failed",
  ].includes(publication?.status);
  const preview = el("section", "analysis-box");
  preview.append(el("h3", "", "X の投稿文"));
  preview.append(
    el(
      "p",
      "post-preview",
      publication?.text ||
        article.postDraft ||
        "投稿文を作成できません。元記事の URL と見出しを確認してください。",
    ),
  );
  if (publication?.postId) {
    preview.append(
      externalLink(
        "投稿を開く ↗",
        `https://x.com/NilayNews/status/${publication.postId}`,
        "text-button",
      ),
    );
  }
  if (publication?.status === "publishing")
    preview.append(
      el(
        "p",
        "form-help",
        "Buffer に登録中です。アプリ停止後にこの表示が残る場合は再起動して Buffer と X を確認してください。",
      ),
    );
  if (publication?.status === "submitted")
    preview.append(
      el(
        "p",
        "form-help",
        "Buffer が受け付けました。X への投稿完了を確認中です。自動投稿を停止しても、この投稿は取り消されません。",
      ),
    );
  if (publication?.status === "submitted") {
    if (publication.remoteStatus)
      preview.append(
        el(
          "p",
          "form-help",
          `最終確認: ${publication.remoteStatus}・${dateText(publication.lastObservedAt * 1000, true)}`,
        ),
      );
    if (publication.nextCheckAt)
      preview.append(
        el(
          "p",
          "form-help",
          `次の読み取り確認: ${dateText(publication.nextCheckAt * 1000, true)}。新しい投稿は確認完了まで保留します。`,
        ),
      );
    if (publication.error)
      preview.append(el("p", "form-help", messageText(publication.error)));
  }
  if (publication?.bufferId)
    preview.append(
      el("p", "form-help", `Buffer 投稿 ID: ${publication.bufferId}`),
    );
  if (["unknown", "failed"].includes(publication?.status)) {
    preview.append(el("p", "analysis-error", messageText(publication.error)));
    if (publication.failedBeforeSend) {
      preview.append(
        el(
          "p",
          "form-help",
          "Buffer への送信前に停止しました。この記事を見送るか、投稿エラーを解除してから設定で自動投稿を再開してください。",
        ),
        button("投稿エラーを解除", "button button-secondary", () =>
          mutate(
            `/api/articles/${article.id}/publication`,
            { outcome: "retry" },
            "投稿エラーを解除しました。設定の「投稿せずに接続・候補を確認」で確認し、自動投稿を再開してください。",
          ),
        ),
      );
    } else
      preview.append(
        el(
          "p",
          "form-help",
          "未投稿に戻す前に、Buffer の予約・再試行対象を削除し、X にも投稿がないことを確認してください。",
        ),
        externalLink(
          "Buffer を開く ↗",
          "https://publish.buffer.com",
          "text-button",
        ),
        externalLink(
          "@NilayNews で投稿結果を確認 ↗",
          "https://x.com/NilayNews",
          "text-button",
        ),
        button("X で投稿済みを確認した", "button button-secondary", () =>
          mutate(
            `/api/articles/${article.id}/publication`,
            { outcome: "posted" },
            "投稿済みとして記録しました。",
          ),
        ),
        button(
          "Buffer の予約なし・X の未投稿を確認した",
          "button button-secondary",
          () =>
            mutate(
              `/api/articles/${article.id}/publication`,
              { outcome: "not_posted" },
              "確認待ちを解除しました。設定から自動投稿を再開できます。",
            ),
        ),
      );
  }
  panel.append(preview);
  const actions = el("div", "detail-actions");
  const url = safeUrl(article.url);
  if (url) actions.append(externalLink("元の記事を開く ↗", url, "button"));
  const saved = article.reviewStatus === "saved";
  const save = button(
    saved ? "保存を解除" : "保存",
    "button button-secondary",
    () => review(article, saved ? "unread" : "saved"),
    "detail-save",
  );
  save.setAttribute("aria-pressed", String(saved));
  save.disabled = postingBlocked;
  actions.append(save);
  if (article.reviewStatus !== "approved" && canReview(article, "approved"))
    actions.append(
      button(
        "内容・重複を確認して投稿を承認",
        "button button-primary",
        () => review(article, "approved"),
        "detail-approve",
      ),
    );
  if (article.postDraft && !postingBlocked) {
    const intent = new URL("https://x.com/intent/tweet");
    intent.searchParams.set("text", article.postDraft);
    actions.append(
      externalLink(
        "X の投稿画面を開く ↗",
        intent.href,
        "button button-primary",
      ),
    );
  }
  panel.append(actions);
  if (article.reviewStatus !== "posted")
    panel.append(
      el(
        "p",
        "detail-action-note",
        "手動で投稿する場合は自動投稿を停止し、投稿後に「投稿済みにする」を押してください。",
      ),
    );
  const secondary = el("div", "detail-secondary-actions");
  if (article.reviewStatus !== "posted" && !postingBlocked)
    secondary.append(
      button(
        "投稿済みにする",
        "text-button",
        () => review(article, "posted"),
        "detail-posted",
      ),
    );
  if (
    !postingBlocked &&
    ["dismissed", "posted", "approved"].includes(article.reviewStatus)
  )
    secondary.append(
      button(
        article.reviewStatus === "approved"
          ? "投稿承認を解除して未読に戻す"
          : "未読に戻す",
        "text-button",
        () => review(article, "unread"),
        "detail-unread",
      ),
    );
  else if (canDismiss(article))
    secondary.append(
      button(
        "この記事を見送る",
        "text-button",
        () => review(article, "dismissed"),
        "detail-dismiss",
      ),
    );
  if (model.state.settings.jevConfigured) {
    const retry = button(
      article.analysisStatus === "done"
        ? "仕分けをやり直す"
        : "この記事を仕分け",
      "text-button",
      () => analyze(article.id),
      "detail-analyze",
    );
    retry.disabled = !!model.state.job.running || model.requestPending;
    secondary.append(retry);
  }
  panel.append(secondary);
}

function appendArticleContent(panel, article) {
  const metadata = article.metadata || {};
  const attachments = Array.isArray(article.attachments)
    ? article.attachments
    : [];
  const fields = [
    ["所管省庁", metadata.agency],
    ["状態", metadata.status],
    [
      "受付締切",
      metadata.deadline ||
        (metadata.deadlineAt && dateText(metadata.deadlineAt, true)),
    ],
    [
      "受付開始",
      metadata.opening ||
        (metadata.openedAt && dateText(metadata.openedAt, true)),
    ],
    ["案件番号", metadata.caseId],
    ["国会", metadata.session],
    ["年度", metadata.fiscalYear ? `${metadata.fiscalYear}年度` : null],
    ["提出日", metadata.submissionDate],
    ["公布日", metadata.promulgatedDate],
    ["施行日", metadata.effectiveDate],
    ["分野", metadata.category],
    ["案の公示日", metadata.announcementDate],
    ["結果の公示日", metadata.resultDate],
    ["命令等の公布日", metadata.enactmentDate],
    ["提出意見数", metadata.opinionCount],
    ["根拠法令条項", metadata.legalBasis],
    ["官報発行日", metadata.issueDate],
    ["種別", metadata.edition],
    [
      "号数",
      metadata.issueNumber == null ? null : `第 ${metadata.issueNumber} 号`,
    ],
    ["掲載区分", metadata.section],
    ["小区分", metadata.subsection],
    [
      "掲載開始ページ",
      metadata.page == null ? null : `${metadata.page} ページ`,
    ],
  ].filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  if (fields.length) {
    const section = el("section", "article-information");
    section.append(el("h3", "detail-summary-label", "案件・掲載情報"));
    const list = el("dl", "article-metadata");
    for (const [label, value] of fields) {
      const row = el("div");
      row.append(el("dt", "", label), el("dd", "", value));
      list.append(row);
    }
    section.append(list);
    if (metadata.indexUrl)
      section.append(
        externalLink(
          metadata.bodyScope === "starting-page"
            ? "当日の官報目次を見る ↗"
            : "掲載一覧を見る ↗",
          metadata.indexUrl,
          "text-button",
        ),
      );
    panel.append(section);
  }

  const scopeNotes = [];
  if (metadata.bodyScope === "starting-page") {
    scopeNotes.push(
      "掲載開始ページ全体の抽出テキストです。同じページの別項目を含み、続きのページは含みません。",
    );
  } else if (metadata.bodyScopeNote) {
    scopeNotes.push(metadata.bodyScopeNote);
  }
  if (metadata.contentStatus === "listing") {
    scopeNotes.push(
      "一覧の情報のみ取得しています。案件詳細と添付資料の本文は未取得です。",
    );
  } else if (metadata.contentStatus === "detail") {
    scopeNotes.push(
      "案件詳細ページの記載情報を取得しています。添付資料の本文は取得していません。",
    );
  } else if (metadata.contentStatus === "error") {
    scopeNotes.push(
      "案件詳細を取得できなかったため、一覧の情報を表示しています。",
    );
  }
  if (metadata.coverage) scopeNotes.push(metadata.coverage);
  if (scopeNotes.length) {
    const scope = el("section", "content-scope");
    scope.append(el("h3", "", "取得した情報の範囲"));
    for (const note of scopeNotes) scope.append(el("p", "", note));
    panel.append(scope);
  }
  const warnings = [
    article.contentError,
    metadata.textExtractionWarning,
  ].filter(Boolean);
  if (article.bodyStale) {
    warnings.unshift(
      `前回保存した本文（今回は未取得）です。前回の本文取得：${dateText(article.bodyFetchedAt, true)}。今回の記事情報と異なる可能性があるため、原文を確認してください。`,
    );
  }
  if (warnings.length) {
    const warning = el("section", "content-warning");
    warning.append(el("h3", "", "取得・抽出の注意点"));
    for (const message of warnings)
      warning.append(el("p", "", messageText(message)));
    panel.append(warning);
  }
  if (article.body) {
    const body = el("details", "article-body");
    body.open = model.expandedBodies.has(article.id);
    body.addEventListener("toggle", () => {
      if (!body.isConnected) return;
      if (body.open) model.expandedBodies.add(article.id);
      else model.expandedBodies.delete(article.id);
    });
    const label = article.bodyStale
      ? "前回保存した本文（今回は未取得）を読む"
      : metadata.bodyScope === "starting-page"
        ? "掲載開始ページの抽出テキストを読む"
        : metadata.contentStatus === "detail"
          ? "案件詳細のテキストを読む"
          : "収集した本文を読む";
    const summary = el("summary", "", label);
    summary.dataset.focus = "article-body-summary";
    body.append(summary);
    if (article.bodyFetchedAt)
      body.append(
        el(
          "p",
          "body-fetched-at",
          `本文取得：${dateText(article.bodyFetchedAt, true)}`,
        ),
      );
    body.append(el("p", "article-body-text", article.body));
    panel.append(body);
  }
  if (attachments.length) {
    const section = el("section", "article-attachments");
    section.append(el("h3", "detail-summary-label", "添付資料・原文"));
    const list = el("ul");
    attachments.forEach((attachment, index) => {
      const item = el("li");
      item.append(
        externalLink(
          `${attachment.title || `資料 ${index + 1}`} ↗`,
          attachment.url,
        ),
      );
      if (!safeUrl(attachment.url))
        item.append(el("span", "form-help", "（リンクを開けません）"));
      list.append(item);
    });
    section.append(list);
    panel.append(section);
  }
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

function renderSettings() {
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
    meta.append(
      el("span", "tag", sourceKindLabels[source.kind] || source.kind),
    );
    meta.append(
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
  left.append(sources);

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
  right.append(jev);

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
      renderSettings();
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
  right.append(posting);

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
      renderSettings();
    }
  });
  rules.append(form);
  right.append(rules);
  $("settings-view").replaceChildren(left, right);
  refreshPublicationStatus();
}

/** Whether a preflight report still describes the saved posting settings. */
function preflightCurrent(report, settings) {
  return (
    report.autoPost === settings.autoPost &&
    report.postSelection === settings.postSelection
  );
}

function renderPreflight(container, report) {
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

function refreshPublicationStatus() {
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

function refreshSourceStatus() {
  for (const row of $("settings-view").querySelectorAll("[data-source-id]")) {
    const source = model.state.sources.find(
      (item) => item.id === row.dataset.sourceId,
    );
    if (!source) continue;
    const meta = row.querySelector(".source-meta");
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
    renderSourceMessages(row, source);
    const toggle = row.querySelector("input");
    if (!toggle.disabled) toggle.checked = !!source.enabled;
  }
}

function render() {
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
$("search").addEventListener("input", (event) => {
  model.query = event.target.value.trim();
  model.visibleCount = PAGE_SIZE;
  renderArticles();
});
$("topic-filter").addEventListener("change", (event) => {
  model.topic = event.target.value;
  model.visibleCount = PAGE_SIZE;
  renderArticles();
});
for (const key of ["analysis", "relation"]) {
  $(`${key}-filter`).addEventListener("change", (event) => {
    model[key] = event.target.value;
    model.visibleCount = PAGE_SIZE;
    renderArticles();
  });
}
$("sort-filter").addEventListener("change", (event) => {
  model.sort = event.target.value;
  model.visibleCount = PAGE_SIZE;
  renderArticles();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});
render();
refresh();
