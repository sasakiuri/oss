// SPDX-License-Identifier: MIT
import { describe, expect, test } from "vitest";

import { UserError } from "../src/errors.ts";
import { ACCOUNT, draft, hashtags, textWeight } from "../src/posts.ts";

const ITEM = {
  title: "北海道でクマを捕獲",
  url: "https://example.org/article/1",
  excerpt: "北海道の町でクマを捕獲した。",
  publishedAt: "2026-09-27T00:00:00+00:00",
};

describe("hashtags", () => {
  test("relevant, unique tags", () => {
    expect(ACCOUNT).toBe("NilayNews");
    expect(
      hashtags({ ...ITEM, analysisStatus: "done", topic: "鳥獣被害・管理" }),
    ).toEqual(["#NilayNews", "#鳥獣対策", "#クマ"]);
    for (const [title, expected] of [
      ["狩猟免許試験", "#狩猟"],
      ["ジビエの流通", "#ジビエ"],
      ["クレー射撃大会", "#射撃競技"],
      ["法案の意見募集", "#パブコメ"],
    ] as const) {
      expect(hashtags({ title })).toContain(expected);
    }
    expect(hashtags({ title: "お知らせ" })).toEqual([
      "#NilayNews",
      "#ニュース",
    ]);
  });

  test("place names and firearms are not animal or sport tags", () => {
    for (const title of [
      "熊本県の狩猟免許試験",
      "鹿児島県の射撃大会",
      "猪名川町で鳥獣対策会議",
    ]) {
      expect(hashtags({ title })).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^#(?:クマ|シカ|イノシシ)$/),
        ]),
      );
    }
    expect(hashtags({ title: "ライフル銃を使った事件" })).not.toContain(
      "#射撃競技",
    );
    expect(hashtags({ title: "熊が出没" })).toContain("#クマ");
    expect(hashtags({ title: "鹿の捕獲" })).toContain("#シカ");
  });

  test("a stale analysis and an unrelated body do not supply tags", () => {
    const article = {
      title: "お知らせ",
      body: "クマ",
      topic: "ジビエ",
      analysisStatus: "pending" as const,
    };
    expect(hashtags(article)).toEqual(["#NilayNews", "#ニュース"]);
  });
});

describe("draft", () => {
  test.each([
    "狩猟制度改正".repeat(100),
    "射撃🥇👩\u200d👩\u200d👧\u200d👦".repeat(100),
    "News a.co ".repeat(100),
  ])("a long headline keeps the full link and tags (%#)", (title) => {
    const article = {
      ...ITEM,
      title,
      url: `https://example.org/${"a".repeat(500)}`,
    };
    const [headline = "", url, tags = "", ...rest] = draft(article).split("\n");
    expect(rest).toEqual([]);
    expect(url).toBe(article.url);
    expect(
      textWeight(headline) + 23 + 2 + textWeight(tags),
    ).toBeLessThanOrEqual(280);
    expect(headline.endsWith("…")).toBe(true);
    expect([2, 3]).toContain(tags.split(" ").length);
  });

  test("a short headline is unchanged", () => {
    expect(draft(ITEM)).toBe(
      "北海道でクマを捕獲\nhttps://example.org/article/1\n#NilayNews #クマ",
    );
  });

  test("a title cannot add hashtags, mentions, links or control characters", () => {
    const text = draft({
      ...ITEM,
      title:
        "#射撃 ＃大会 @someone ＠else\nhttps://example.net/ $TEST\u0000\u200e",
    });
    const [headline] = text.split("\n");
    expect(text.split("\n")).toHaveLength(3);
    expect(headline).toBe("射撃 大会 someone else ＄TEST");
    expect(text).not.toContain("https://example.net/");
  });

  test.each([
    "javascript:alert(1)",
    "https://u:secret@example.org/a",
    "https://example.org/a\nb",
    "https://localhost/a",
    "https://example.org/a b",
    "https://[::1/a",
    "ftp://example.org/a",
  ])("invalid URL %j is rejected", (url) => {
    expect(() => draft({ ...ITEM, url })).toThrow(
      new UserError("投稿する元記事の URL が不正です"),
    );
  });

  test("an empty headline is rejected", () => {
    expect(() => draft({ ...ITEM, title: " #@\u0000 " })).toThrow(
      "投稿する見出しがありません",
    );
  });

  test("text weight counts CJK and emoji as two and Latin as one", () => {
    expect(textWeight("abc")).toBe(3);
    expect(textWeight("狩猟")).toBe(4);
    expect(textWeight("“…”")).toBe(4);
    expect(textWeight("🥇")).toBe(2);
    expect(textWeight("e\u0301")).toBe(1);
  });
});
