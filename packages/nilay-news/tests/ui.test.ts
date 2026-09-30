// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

/** Just enough of an element for the list helpers under test. */
interface FakeNode {
  classList: { toggle(name: string, force: boolean): void };
  className: string;
  textContent: string;
  hidden: boolean;
  checked: boolean;
  disabled: boolean;
  indeterminate: boolean;
  dataset: Record<string, string>;
  attributes: Record<string, string>;
  listeners: Record<string, (event: { target: FakeNode }) => void>;
  children: FakeNode[];
  append(...nodes: FakeNode[]): void;
  replaceChildren(...nodes: FakeNode[]): void;
  addEventListener(
    type: string,
    listener: (event: { target: FakeNode }) => void,
  ): void;
  setAttribute(name: string, value: string): void;
  querySelectorAll(selector: string): FakeNode[];
}

function node(): FakeNode {
  const created: FakeNode = {
    classList: { toggle: () => undefined },
    className: "",
    textContent: "",
    hidden: false,
    checked: false,
    disabled: false,
    indeterminate: false,
    dataset: {},
    attributes: {},
    listeners: {},
    children: [],
    append: (...nodes) => created.children.push(...nodes),
    replaceChildren: (...nodes) => {
      created.children = nodes;
    },
    addEventListener: (type, listener) => {
      created.listeners[type] = listener;
    },
    setAttribute: (name, value) => {
      created.attributes[name] = value;
    },
    querySelectorAll: (selector) =>
      created.children.flatMap((child) => [
        ...(selector === "[data-select-id]" && child.dataset.selectId
          ? [child]
          : []),
        ...child.querySelectorAll(selector),
      ]),
  };
  return created;
}

function texts(root: FakeNode): string[] {
  return [
    ...(root.textContent ? [root.textContent] : []),
    ...root.children.flatMap(texts),
  ];
}

interface Ui {
  buckets: { id: string; match: (article: object) => boolean }[];
  articleTags: (article: object) => FakeNode[];
  visibleArticles: () => { id: string }[];
  renderPreflight: (container: FakeNode, report: object) => void;
  preflightCurrent: (report: object, settings: object) => boolean;
  dateText: (value: unknown, includeTime?: boolean) => string;
  messageText: (text: unknown) => unknown;
  renderArticle: (article: object) => FakeNode;
  renderDetail: () => void;
  loadDetail: (
    id: string,
    shouldRender?: boolean,
  ) => Promise<boolean | undefined>;
  renderBulkActions: () => void;
  element: (id: string) => FakeNode;
  model: {
    state: unknown;
    detail: unknown;
    view: string;
    sort: string;
    query: string;
    topic: string;
    analysis: string;
    relation: string;
    bulkStatus: string;
    visibleCount: number;
    selectedId: string | null;
    checkedIds: Set<string>;
    requestPending: boolean;
  };
}

/** Evaluate the page script without its startup render and network refresh. */
function load(fetcher?: typeof fetch): Ui {
  const source = readFileSync(
    new URL("../public/app.js", import.meta.url),
    "utf8",
  );
  const script = source.replace(/render\(\);\s*refresh\(\);\s*$/, "");
  if (script === source) throw new Error("app.js startup changed");
  const elements = new Map<string, FakeNode>();
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, node());
    return elements.get(id)!;
  };
  const context = {
    URL,
    fetch: fetcher,
    document: {
      getElementById: element,
      createElement: node,
      addEventListener: () => undefined,
    },
    exports: {} as Partial<Ui>,
  };
  runInNewContext(
    `${script}\nexports.buckets = buckets; exports.articleTags = articleTags;` +
      "exports.visibleArticles = visibleArticles; exports.model = model;" +
      "exports.renderPreflight = renderPreflight;" +
      "exports.preflightCurrent = preflightCurrent;" +
      "exports.dateText = dateText; exports.messageText = messageText;" +
      "exports.renderArticle = renderArticle; exports.renderBulkActions = renderBulkActions;" +
      "exports.renderDetail = renderDetail; exports.loadDetail = loadDetail;",
    context,
  );
  return { ...context.exports, element } as Ui;
}

const BASE = {
  title: "",
  sourceName: "",
  excerpt: "",
  reviewStatus: "unread",
  discoveredAt: "2026-09-01T00:00:00Z",
  publishedAt: "2026-09-01T00:00:00Z",
  freshness: "fresh",
};

describe("bulk dismissal selection", () => {
  it.each([true, false, undefined])(
    "only offers direct recovery for a proven unsent failure (%s)",
    (failedBeforeSend) => {
      const ui = load();
      const article = {
        ...BASE,
        id: "failed",
        title: "旧記事",
        url: "https://news.google.com/rss/articles/old",
      };
      ui.model.state = {
        articles: [article],
        settings: { jevConfigured: false },
        publication: {
          posts: [
            {
              articleId: article.id,
              status: "failed",
              text: "",
              error: "投稿失敗",
              failedBeforeSend,
            },
          ],
        },
      };
      const [checkbox] = ui
        .renderArticle(article)
        .querySelectorAll("[data-select-id]");
      expect(checkbox!.disabled).toBe(failedBeforeSend !== true);
      ui.model.selectedId = article.id;
      ui.renderDetail();
      const labels = texts(ui.element("detail-panel"));
      expect(labels.includes("この記事を見送る")).toBe(
        failedBeforeSend === true,
      );
      expect(labels.includes("投稿エラーを解除")).toBe(
        failedBeforeSend === true,
      );
      expect(labels.includes("Buffer の予約なし・X の未投稿を確認した")).toBe(
        failedBeforeSend !== true,
      );
      expect(labels.includes("X で投稿済みを確認した")).toBe(
        failedBeforeSend !== true,
      );
    },
  );

  it("selects individual articles independently from reading their details", () => {
    const ui = load();
    const articles = ["a", "b"].map((id) => ({
      ...BASE,
      id,
      title: `記事 ${id}`,
    }));
    ui.model.state = { articles, publication: { posts: [] } };
    ui.model.selectedId = "b";
    ui.element("article-list").append(...articles.map(ui.renderArticle));
    const [checkbox] = ui
      .element("article-list")
      .querySelectorAll("[data-select-id]");
    expect(checkbox!.attributes["aria-label"]).toContain("記事 a");
    checkbox!.checked = true;
    checkbox!.listeners.change!({ target: checkbox! });
    expect([...ui.model.checkedIds]).toEqual(["a"]);
    expect(ui.model.selectedId).toBe("b");
    expect(ui.element("select-all-articles").indeterminate).toBe(true);
    expect(ui.element("selection-count").textContent).toBe("1 件選択中");
    expect(ui.element("apply-selected").disabled).toBe(false);
    checkbox!.checked = false;
    checkbox!.listeners.change!({ target: checkbox! });
    expect(ui.model.checkedIds.size).toBe(0);
    expect(ui.element("apply-selected").disabled).toBe(true);
  });

  it("selects only displayed and eligible results, and supports clearing all", () => {
    const ui = load();
    ui.model.query = "対象";
    ui.model.visibleCount = 2;
    const articles = ["a", "blocked", "later"].map((id) => ({
      ...BASE,
      id,
      title: "対象",
    }));
    ui.model.state = {
      // The server page already applies the requested search and inbox bucket.
      articles,
      publication: { posts: [{ articleId: "blocked", status: "publishing" }] },
    };
    const all = ui.element("select-all-articles");
    all.checked = true;
    all.listeners.change!({ target: all });
    expect([...ui.model.checkedIds]).toEqual(["a"]);
    expect(all.checked).toBe(true);
    ui.model.visibleCount = 50;
    ui.renderBulkActions();
    expect(all.indeterminate).toBe(true);
    all.checked = true;
    all.listeners.change!({ target: all });
    expect([...ui.model.checkedIds]).toEqual(["a", "later"]);
    all.checked = false;
    all.listeners.change!({ target: all });
    expect(ui.model.checkedIds.size).toBe(0);
    expect(all.indeterminate).toBe(false);
  });

  it("retains visible selection across refreshes and drops hidden or blocked articles", () => {
    const ui = load();
    const articles = ["a", "b"].map((id) => ({
      ...BASE,
      id,
      title: id,
      topic: id,
    }));
    ui.model.state = { articles, publication: { posts: [] } };
    ui.model.checkedIds = new Set(["a", "b"]);
    ui.renderBulkActions();
    expect([...ui.model.checkedIds]).toEqual(["a", "b"]);
    ui.model.topic = "a";
    ui.model.state = { articles: [articles[0]], publication: { posts: [] } };
    ui.renderBulkActions();
    expect([...ui.model.checkedIds]).toEqual(["a"]);
    ui.model.topic = "";
    ui.model.state = { articles, publication: { posts: [] } };
    ui.renderBulkActions();
    expect([...ui.model.checkedIds]).toEqual(["a"]);
    ui.model.state = {
      articles,
      publication: { posts: [{ articleId: "a", status: "submitted" }] },
    };
    ui.renderBulkActions();
    expect(ui.model.checkedIds.size).toBe(0);
  });

  it("disables selection while saving and allows restoring dismissed articles but protects posted lists", () => {
    const ui = load();
    const articles = [
      { ...BASE, id: "a" },
      { ...BASE, id: "posted", reviewStatus: "posted" },
      { ...BASE, id: "dismissed", reviewStatus: "dismissed" },
    ];
    ui.model.state = { articles, publication: { posts: [] } };
    ui.element("article-list").append(...articles.map(ui.renderArticle));
    const checkboxes = ui
      .element("article-list")
      .querySelectorAll("[data-select-id]");
    expect(checkboxes).toHaveLength(2);
    ui.model.checkedIds.add("a");
    ui.model.requestPending = true;
    ui.renderBulkActions();
    expect(checkboxes[0]!.disabled).toBe(true);
    expect(ui.element("select-all-articles").disabled).toBe(true);
    expect(ui.element("apply-selected").disabled).toBe(true);
    ui.model.requestPending = false;
    ui.renderBulkActions();
    expect(ui.element("apply-selected").disabled).toBe(false);
    for (const view of ["posted", "dismissed"]) {
      ui.model.view = view;
      ui.model.state = {
        articles: articles.filter((article) => article.reviewStatus === view),
        publication: { posts: [] },
      };
      ui.renderBulkActions();
      expect(ui.element("bulk-actions").hidden).toBe(view === "posted");
      expect(ui.model.checkedIds.size).toBe(0);
    }
  });
});

describe("classification filters and bulk operations", () => {
  it("combines topic, text, classification and relation filters without selecting hidden articles", () => {
    const ui = load();
    const articles = [
      {
        ...BASE,
        id: "match",
        title: "北海道のクマ",
        topic: "鳥獣",
        analysisStatus: "done",
        decision: "review",
        relation: "duplicate",
      },
      {
        ...BASE,
        id: "uncertain",
        title: "北海道のクマ",
        topic: "鳥獣",
        analysisStatus: "done",
        decision: "review",
        relation: "uncertain",
      },
      {
        ...BASE,
        id: "candidate",
        title: "北海道のクマ",
        topic: "鳥獣",
        analysisStatus: "done",
        decision: "candidate",
        relation: "duplicate",
      },
      {
        ...BASE,
        id: "other",
        title: "射撃大会",
        topic: "射撃",
        analysisStatus: "done",
        decision: "review",
        relation: "duplicate",
      },
    ];
    ui.model.state = { articles: [articles[0]], publication: { posts: [] } };
    ui.model.checkedIds = new Set(articles.map((article) => article.id));
    ui.model.query = "クマ";
    ui.model.topic = "鳥獣";
    ui.model.analysis = "review";
    ui.model.relation = "duplicate";
    ui.renderBulkActions();
    expect(ui.visibleArticles().map((article) => article.id)).toEqual([
      "match",
    ]);
    expect([...ui.model.checkedIds]).toEqual(["match"]);
    ui.model.relation = "uncertain";
    ui.model.state = { articles: [articles[1]], publication: { posts: [] } };
    ui.renderBulkActions();
    expect(ui.model.checkedIds.size).toBe(0);
    const all = ui.element("select-all-articles");
    all.checked = true;
    all.listeners.change!({ target: all });
    expect([...ui.model.checkedIds]).toEqual(["uncertain"]);
  });

  it("keeps selection when changing actions and disables incompatible actions for failed drafts", () => {
    const ui = load();
    const articles = [{ ...BASE, id: "failed" }];
    ui.model.state = {
      articles,
      publication: {
        posts: [
          { articleId: "failed", status: "failed", failedBeforeSend: true },
        ],
      },
    };
    ui.model.checkedIds.add("failed");
    ui.model.bulkStatus = "saved";
    ui.renderBulkActions();
    expect(ui.element("apply-selected").disabled).toBe(true);
    expect(ui.element("bulk-help").textContent).toContain("送信前エラー");
    ui.model.bulkStatus = "approved";
    ui.renderBulkActions();
    expect([...ui.model.checkedIds]).toEqual(["failed"]);
    expect(ui.element("apply-selected").disabled).toBe(false);
    expect(ui.element("apply-selected").textContent).toContain("投稿を承認");
    expect(ui.element("bulk-help").textContent).toContain("内容と重複を確認");
  });

  it("shows manual approval separately from the retained Jev judgment and offers revocation", () => {
    const ui = load();
    const article = {
      ...BASE,
      id: "approved",
      reviewStatus: "approved",
      reviewedAt: BASE.discoveredAt,
      analysisStatus: "done",
      decision: "review",
      relation: "duplicate",
      url: "https://example.org/news",
    };
    ui.model.state = {
      articles: [article],
      publication: { posts: [] },
      settings: { jevConfigured: false },
    };
    expect(
      ui.buckets
        .filter((bucket) => bucket.match(article))
        .map((bucket) => bucket.id),
    ).toEqual(["approved"]);
    expect(ui.articleTags(article).map((tag) => tag.textContent)).toEqual([
      "Jev: 要確認",
      "重複の可能性",
      "投稿承認済み",
    ]);
    ui.model.selectedId = article.id;
    ui.renderDetail();
    expect(texts(ui.element("detail-panel"))).toContain(
      "投稿承認を解除して未読に戻す",
    );
  });
});

describe("source-rule candidates in the inbox", () => {
  it("shows them in the inbox with a distinct badge and the Jev result apart", () => {
    const ui = load();
    const ruled = {
      ...BASE,
      id: "ruled",
      sourceCandidate: true,
      analysisStatus: "done",
      decision: "irrelevant",
    };
    const pending = { ...BASE, id: "pending", sourceCandidate: true };
    const ordinary = {
      ...BASE,
      id: "ordinary",
      sourceCandidate: false,
      analysisStatus: "done",
      decision: "irrelevant",
    };
    const bucket = (article: object) =>
      ui.buckets.filter((item) => item.match(article)).map((item) => item.id);
    expect(bucket(ruled)).toEqual(["inbox"]);
    expect(bucket({ ...pending, analysisStatus: "pending" })).toEqual([
      "inbox",
    ]);
    expect(bucket(ordinary)).toEqual(["dismissed"]);
    expect(bucket({ ...ruled, reviewStatus: "dismissed" })).toEqual([
      "dismissed",
    ]);
    expect(ui.articleTags(ruled).map((tag) => tag.textContent)).toEqual([
      "投稿対象（情報源指定）",
      "Jev: 対象外",
    ]);
    expect(ui.articleTags(ordinary).map((tag) => tag.textContent)).toEqual([
      "対象外",
    ]);
  });
});

describe("fresh news and retained history", () => {
  it("keeps stale source candidates out of the inbox and marks date uncertainty", () => {
    const ui = load();
    const bucketsFor = (freshness: string, reviewStatus = "unread") =>
      ui.buckets
        .filter((bucket) =>
          bucket.match({
            ...BASE,
            sourceCandidate: true,
            freshness,
            reviewStatus,
          }),
        )
        .map((bucket) => bucket.id);
    expect(bucketsFor("stale")).toEqual(["expired"]);
    for (const freshness of ["unknown", "invalid", "future"]) {
      expect(bucketsFor(freshness)).toEqual(["dates"]);
      expect(
        ui
          .articleTags({ ...BASE, sourceCandidate: true, freshness })
          .map((tag) => tag.textContent)
          .join(" "),
      ).toContain("自動対象外");
    }
    expect(bucketsFor("stale", "saved")).toEqual(["saved"]);
    expect(bucketsFor("stale", "posted")).toEqual(["posted"]);
  });
});

describe("actionable content review", () => {
  it("shows uncertain duplicates in content review while retaining the topic decision", () => {
    const ui = load();
    const article = {
      ...BASE,
      decision: "candidate",
      analysisStatus: "done",
      relation: "uncertain",
    };
    expect(
      ui.buckets.filter((bucket) => bucket.match(article)).map(({ id }) => id),
    ).toEqual(["inbox", "review"]);
    expect(ui.articleTags(article).map((tag) => tag.textContent)).toEqual([
      "候補",
      "重複を要確認",
    ]);
    expect(
      ui.buckets
        .find((bucket) => bucket.id === "review")!
        .match({ ...article, sourceCandidate: true }),
    ).toBe(false);
  });

  it("separates editorial decisions from pending work and missing dates", () => {
    const ui = load();
    const groups = (patch: object) =>
      ui.buckets.filter((b) => b.match({ ...BASE, ...patch })).map((b) => b.id);
    expect(groups({ decision: "review", analysisStatus: "done" })).toEqual([
      "inbox",
      "review",
    ]);
    expect(groups({ analysisStatus: "pending" })).toEqual(["inbox", "pending"]);
    expect(groups({ analysisStatus: "error" })).toEqual(["inbox", "pending"]);
    expect(
      groups({
        decision: "review",
        analysisStatus: "done",
        freshness: "unknown",
      }),
    ).toEqual(["dates"]);
    expect(
      groups({
        decision: "review",
        analysisStatus: "done",
        sourceCandidate: true,
      }),
    ).toEqual(["inbox"]);
    expect(
      groups({
        decision: "review",
        analysisStatus: "done",
        freshness: "stale",
      }),
    ).toEqual(["expired"]);
  });
});

describe("publication preflight in settings", () => {
  it("renders a snapshot as text and knows when it is stale", () => {
    const ui = load();
    const report = {
      checkedAt: "2026-09-28T01:02:03Z",
      account: "NilayNews",
      configured: true,
      connectionVerified: true,
      autoPost: false,
      postSelection: "both",
      candidates: 2,
      firstCandidate: {
        articleId: "a",
        text: '<img src=x onerror="alert(1)">\nhttps://example.org/a',
      },
      blockers: ["<b>確認</b>が必要です"],
      ready: false,
      notes: [
        "最初の投稿は有効にしてから60分以上後です。",
        "前回の確認 2026-09-27T15:00:00+00:00 の結果です。",
      ],
    };
    const container = node();
    container.hidden = true;
    ui.renderPreflight(container, report);
    expect(container.hidden).toBe(false);
    const shown = texts(container);
    expect(shown[0]).toBe(
      "確認結果（2026/9/28 10:02 JST 時点のスナップショット）",
    );
    expect(shown).toContain("前回の確認 2026/9/28 00:00:00 JST の結果です。");
    expect(shown).toContain("<b>確認</b>が必要です");
    expect(shown).toContain(report.firstCandidate.text);
    expect(shown).toContain(
      "投稿する記事：手動保存、Jev の候補、情報源指定の記事・投稿待ち 2 件",
    );
    expect(
      readFileSync(new URL("../public/app.js", import.meta.url), "utf8"),
    ).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
    expect(
      ui.preflightCurrent(report, { autoPost: false, postSelection: "both" }),
    ).toBe(true);
    expect(
      ui.preflightCurrent(report, { autoPost: false, postSelection: "saved" }),
    ).toBe(false);
    expect(
      ui.preflightCurrent(report, { autoPost: true, postSelection: "both" }),
    ).toBe(false);
  });
});

describe("times shown in Japan Standard Time", () => {
  function inZone<T>(zone: string, run: () => T): T {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
      return run();
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  }

  it("formats stored UTC and offset instants as 24-hour JST in any browser zone", () => {
    for (const zone of ["America/Los_Angeles", "UTC", "Asia/Tokyo"]) {
      const ui = inZone(zone, load);
      inZone(zone, () => {
        expect(ui.dateText("2026-09-28T14:59:59Z", true)).toBe(
          "2026/9/28 23:59 JST",
        );
        expect(ui.dateText("2026-09-28T15:00:00+00:00", true)).toBe(
          "2026/9/29 00:00 JST",
        );
        expect(ui.dateText("2026-09-29T00:00:00+09:00", true)).toBe(
          "2026/9/29 00:00 JST",
        );
        // Date-only publications stay dates: JST midnight is the same JST day.
        expect(ui.dateText("2026-09-27T15:00:00Z")).toBe("2026/9/28");
        expect(ui.dateText("not a date", true)).toBe("日時不明");
      });
    }
  });

  it("rewrites ISO instants in saved server messages and leaves the rest", () => {
    const ui = load();
    const url = "https://example.org/a?t=2026-09-28T00:00:00Z&x=1";
    const cases: [string, string][] = [
      [
        "取得間隔を守るため 2026-09-28T14:59:59+00:00 まで待機し、次の収集で再確認します",
        "取得間隔を守るため 2026/9/28 23:59:59 JST まで待機し、次の収集で再確認します",
      ],
      [
        "再取得は 2026-09-28T15:00:00.5Z 以降",
        "再取得は 2026/9/29 00:00:00 JST 以降",
      ],
      ["締切 2026-09-29T09:30+09:00。", "締切 2026/9/29 09:30 JST。"],
      [`取得失敗 ${url}`, `取得失敗 ${url}`],
      ["公開日 2026-09-28 のみ", "公開日 2026-09-28 のみ"],
      [
        "時刻の記載なし 2026-09-28T10:00:00",
        "時刻の記載なし 2026-09-28T10:00:00",
      ],
      ["不正 2026-02-30T00:00:00Z", "不正 2026-02-30T00:00:00Z"],
      ["不正 2026-09-28T24:00:00Z", "不正 2026-09-28T24:00:00Z"],
      ["id-2026-09-28T00:00:00Z", "id-2026-09-28T00:00:00Z"],
      ["<b>2026-09-28T00:00:00Z</b>", "<b>2026/9/28 09:00:00 JST</b>"],
    ];
    for (const [saved, shown] of cases)
      expect(ui.messageText(saved)).toBe(shown);
    expect(ui.messageText(null)).toBe(null);
  });
});

describe("detail request lifetime", () => {
  function requests() {
    const pending: {
      resolve: (response: Response) => void;
      reject: (error: Error) => void;
    }[] = [];
    const ui = load(
      () =>
        new Promise<Response>((resolve, reject) =>
          pending.push({ resolve, reject }),
        ),
    );
    ui.model.state = { publication: { posts: [] } };
    const respond = (index: number, id: string, status: string) =>
      pending[index]!.resolve(
        Response.json({
          id,
          reviewStatus: status,
          publication: { posts: [{ articleId: id, status }] },
        }),
      );
    return { ui, pending, respond };
  }

  it.each([false, true])(
    "keeps the newest same-article response after returning to another article: %s",
    async (navigateAway) => {
      const { ui, respond } = requests();
      ui.model.selectedId = "a";
      const older = ui.loadDetail("a", false);
      let away: Promise<boolean | undefined> | undefined;
      if (navigateAway) {
        ui.model.selectedId = "b";
        away = ui.loadDetail("b", false);
        ui.model.selectedId = "a";
      }
      const newer = ui.loadDetail("a", false);
      respond(navigateAway ? 2 : 1, "a", "approved");
      await newer;
      respond(0, "a", "unread");
      await older;
      if (away) {
        respond(1, "b", "saved");
        await away;
      }
      expect(ui.model.detail).toMatchObject({
        id: "a",
        reviewStatus: "approved",
      });
      expect(ui.model.state).toMatchObject({
        publication: { posts: [{ articleId: "a", status: "approved" }] },
      });
    },
  );

  it("ignores an obsolete failure after the replacement request succeeds", async () => {
    const { ui, pending, respond } = requests();
    ui.model.selectedId = "a";
    const older = ui.loadDetail("a", false);
    const newer = ui.loadDetail("a", false);
    respond(1, "a", "approved");
    await newer;
    pending[0]!.reject(new Error("Outdated failure"));
    await older;
    expect(ui.model.detail).toMatchObject({ reviewStatus: "approved" });
    expect(ui.element("notice-text").textContent).toBe("");
    expect(ui.element("detail-panel").children).toHaveLength(0);
  });
});

it("shows publication screening separately from the original classification record", () => {
  const ui = load();
  const provenance = {
    requestedModel: "classification-model",
    resolvedModel: null,
    promptVersion: "1",
    criteriaVersion: "1",
    routingPolicyVersion: "1",
    criteriaHash: "class-criteria",
    routingPolicyHash: "routing",
    rubricHash: "rubric",
    modelInputHash: "classification-input",
    analyzedAt: BASE.discoveredAt,
  };
  const article = {
    ...BASE,
    id: "record",
    analysisStatus: "done",
    decision: "candidate",
    url: "https://example.org/news",
    provenance,
    postScreening: {
      relation: null,
      relatedArticleId: null,
      checkedAt: BASE.discoveredAt,
      relationProvenance: [
        {
          ...provenance,
          requestedModel: "screening-model",
          comparisonArticleId: "posted",
          comparisonInputHash: "comparison-input",
          modelInputHash: "screening-input",
        },
      ],
    },
  };
  ui.model.state = {
    articles: [article],
    settings: { jevConfigured: false },
    publication: { posts: [] },
  };
  ui.model.selectedId = article.id;
  ui.renderDetail();
  const labels = texts(ui.element("detail-panel"));
  expect(labels).toContain("判定の構成と記録");
  expect(labels).toContain("投稿前の照合記録");
  expect(labels).toContain("送信入力 SHA-256: classification-input");
  expect(labels).toContain("送信入力 SHA-256: screening-input");
  expect(labels).toContain(
    "比較記事 posted / 比較入力 SHA-256: comparison-input",
  );
});
