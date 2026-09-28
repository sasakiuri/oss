// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

/** Just enough of an element for the list helpers under test. */
interface FakeNode {
  className: string;
  textContent: string;
  hidden: boolean;
  dataset: Record<string, string>;
  children: FakeNode[];
  append(...nodes: FakeNode[]): void;
  replaceChildren(...nodes: FakeNode[]): void;
  addEventListener(): void;
}

function node(): FakeNode {
  const created: FakeNode = {
    className: "",
    textContent: "",
    hidden: false,
    dataset: {},
    children: [],
    append: (...nodes) => created.children.push(...nodes),
    replaceChildren: (...nodes) => {
      created.children = nodes;
    },
    addEventListener: () => undefined,
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
  model: { state: unknown; view: string; sort: string };
}

/** Evaluate the page script without its startup render and network refresh. */
function load(): Ui {
  const source = readFileSync(
    new URL("../public/app.js", import.meta.url),
    "utf8",
  );
  const script = source.replace(/render\(\);\s*refresh\(\);\s*$/, "");
  if (script === source) throw new Error("app.js startup changed");
  const context = {
    document: {
      getElementById: node,
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
      "exports.dateText = dateText; exports.messageText = messageText;",
    context,
  );
  return context.exports as Ui;
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

  it("sorts them with Jev candidates by priority", () => {
    const ui = load();
    ui.model.sort = "priority";
    ui.model.view = "inbox";
    ui.model.state = {
      articles: [
        { ...BASE, id: "review", analysisStatus: "done", decision: "review" },
        { ...BASE, id: "ruled", sourceCandidate: true, priority: 2 },
        {
          ...BASE,
          id: "jev",
          analysisStatus: "done",
          decision: "candidate",
          priority: 1,
        },
      ],
    };
    expect(ui.visibleArticles().map((article) => article.id)).toEqual([
      "ruled",
      "jev",
      "review",
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

  it("defaults to publication date descending even across different priorities", () => {
    const ui = load();
    ui.model.state = {
      articles: [
        { ...BASE, id: "older", decision: "candidate", priority: 3 },
        {
          ...BASE,
          id: "newer",
          publishedAt: "2026-09-01T00:01:00Z",
          priority: 0,
        },
      ],
    };
    expect(ui.visibleArticles().map((article) => article.id)).toEqual([
      "newer",
      "older",
    ]);
  });
});

describe("actionable content review", () => {
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
