// SPDX-License-Identifier: MIT
import { describe, expect, test } from "vitest";

import { UserError } from "../src/errors.ts";
import { ACCOUNT, draft, textWeight } from "../src/posts.ts";

const ITEM = {
  title: "北海道でクマを捕獲",
  url: "https://example.org/article/1",
  excerpt: "北海道の町でクマを捕獲した。",
  publishedAt: "2026-09-27T00:00:00+00:00",
};

test("the account stays the publishing identity", () => {
  expect(ACCOUNT).toBe("NilayNews");
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
    expect(tags).toMatch(/^#\S+(?: #\S+)*$/);
  });

  test("the headline is shortened for the most and longest tags", () => {
    const article = {
      title: `茨城・かすみがうら市でイノシシ捕獲、獣皮を有効活用 ${"あ".repeat(300)} (${"長".repeat(16)}新聞)`,
      url: `https://example.org/${"a".repeat(500)}`,
      excerpt: "",
      sourceName: "CEEK｜狩猟",
    };
    const [headline = "", url, tags = "", ...rest] = draft(article).split("\n");
    expect(rest).toEqual([]);
    expect(url).toBe(article.url);
    expect(tags).toBe(
      `#${"長".repeat(16)}新聞 #茨城県 #かすみがうら市 #イノシシ #野生鳥獣活用`,
    );
    expect(
      textWeight(headline) + 23 + 2 + textWeight(tags),
    ).toBeLessThanOrEqual(280);
    expect(headline.endsWith("…")).toBe(true);
  });

  test("a short headline is unchanged", () => {
    expect(draft(ITEM)).toBe(
      "北海道でクマを捕獲\nhttps://example.org/article/1\n#北海道 #クマ #鳥獣被害対策",
    );
  });

  test("the new tags replace the fixed account and filler tags", () => {
    expect(
      draft({
        title:
          "ビニールハウスの近くで60代男性がクマに襲われケガ 和歌山・有田川町 (日本テレビ)",
        url: "https://news.ntv.co.jp/category/society/1",
        excerpt: "... クマに襲われました。",
        sourceName: "CEEK｜狩猟・銃・射撃・ジビエ",
        topic: "鳥獣被害・管理",
        analysisStatus: "done",
      }),
    ).toBe(
      "ビニールハウスの近くで60代男性がクマに襲われケガ 和歌山・有田川町 (日本テレビ)\nhttps://news.ntv.co.jp/category/society/1\n#日本テレビ #和歌山県 #有田川町 #事件事故 #クマ",
    );
  });

  test("an article without known tags has no tag line", () => {
    const text = draft({ ...ITEM, title: "お知らせ", excerpt: "" });
    expect(text).toBe("お知らせ\nhttps://example.org/article/1");
    const long = draft({ ...ITEM, title: "お".repeat(300), excerpt: "" });
    const [headline = "", url, ...rest] = long.split("\n");
    expect([url, rest]).toEqual([ITEM.url, []]);
    expect(textWeight(headline) + 1 + 23).toBeLessThanOrEqual(280);
    expect(textWeight(headline) + 1 + 23).toBeGreaterThan(276);
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
