// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import dictionary from "../src/municipalities.json" with { type: "json" };
import { hashtags } from "../src/publishing/hashtags.ts";
import { tagEvidence } from "../src/tag-evidence.ts";

const placeNames = new Set([
  ...Object.keys(dictionary.prefectures),
  ...Object.values(dictionary.prefectures).flat(),
]);
const placeTags = (article: Parameters<typeof hashtags>[0]) =>
  hashtags(article)
    .map((tag) => tag.slice(1))
    .filter((tag) => placeNames.has(tag));

const examples = [
  {
    article: { title: "学校周辺の安全対策を発表 (北海道文化放送)" },
    expected: [],
  },
  {
    article: {
      title: "学校周辺の安全対策を発表 (北海道文化放送)",
      excerpt: "八戸市で新たな調査を開始。",
    },
    expected: ["青森県", "八戸市"],
  },
  {
    article: {
      title: "新たな調査を開始",
      sourceName: "地元紙",
      excerpt: "地元紙 ... 八戸市で新たな調査を開始。",
    },
    expected: ["青森県", "八戸市"],
  },
  {
    article: {
      title: "学校周辺の安全対策を発表 - 北海道文化放送",
      sourceName: "CEEK｜地域",
      excerpt: "八戸市で新たな調査を開始。",
    },
    expected: ["青森県", "八戸市"],
  },
  {
    article: {
      title: "北海道文化放送が新たな調査を開始",
      sourceName: "北海道文化放送",
      excerpt: "北海道文化放送 ... 八戸市で調査。",
    },
    expected: ["青森県", "八戸市"],
  },
  {
    article: { title: "調査結果 (北海道)" },
    expected: ["北海道"],
  },
  {
    article: { title: "新たな調査を開始", excerpt: "... 八戸市で調査。" },
    expected: [],
  },
  {
    article: {
      title: "新たな調査を開始",
      sourceName: "鳥獣ニュース",
      excerpt: "八戸市で新たな調査を開始。",
      metadata: { roundupUrl: "https://example.org/roundup" },
    },
    expected: [],
  },
];

describe("shared tag and comparison evidence", () => {
  it.each(examples)(
    "extracts the same places from $article",
    ({ article, expected }) => {
      const original = structuredClone(article);
      expect(tagEvidence(article).places.map(({ name }) => name)).toEqual(
        expected,
      );
      expect(placeTags(article)).toEqual(expected);
      expect(article).toEqual(original);
    },
  );

  it.each(Object.entries(dictionary.prefectures))(
    "agrees with place hashtags for every municipality in %s",
    (prefecture, municipalities) => {
      for (const municipality of municipalities) {
        const variants = [
          { title: `${prefecture}${municipality}で新たな調査を開始` },
          {
            title: `${prefecture}で新たな調査を開始`,
            excerpt: `${municipality}で調査。`,
          },
          {
            title: "新たな調査を開始 (北海道文化放送)",
            sourceName: "CEEK｜地域",
            excerpt: `${prefecture}${municipality}で調査。`,
          },
          {
            title: "新たな調査を開始",
            sourceName: "地元紙",
            excerpt: `地元紙 ... ${prefecture}${municipality}で調査。`,
          },
        ];
        for (const article of variants)
          expect(tagEvidence(article).places.map(({ name }) => name)).toEqual(
            placeTags(article),
          );
      }
    },
  );
});
