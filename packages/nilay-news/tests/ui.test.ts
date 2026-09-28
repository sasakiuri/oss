// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

/** Just enough of an element for the list helpers under test. */
interface FakeNode {
  className: string;
  textContent: string;
  dataset: Record<string, string>;
  children: FakeNode[];
  append(...nodes: FakeNode[]): void;
  addEventListener(): void;
}

function node(): FakeNode {
  const created: FakeNode = {
    className: "",
    textContent: "",
    dataset: {},
    children: [],
    append: (...nodes) => created.children.push(...nodes),
    addEventListener: () => undefined,
  };
  return created;
}

interface Ui {
  buckets: { id: string; match: (article: object) => boolean }[];
  articleTags: (article: object) => FakeNode[];
  visibleArticles: () => { id: string }[];
  model: { state: unknown; view: string };
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
      "exports.visibleArticles = visibleArticles; exports.model = model;",
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
