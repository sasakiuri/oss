// SPDX-License-Identifier: MIT
/** Location retrieval and conservative relation adoption use the real Jev protocol. */
import { describe, expect, it } from "vitest";

import { Jev } from "../src/jev/client.ts";
import { RELATIONS } from "../src/jev/questions.ts";
import { lexicalOverlap, relatedCandidates } from "../src/jev/related.ts";
import type { FetchBytes } from "../src/net/types.ts";
import { utf8 } from "../src/text.ts";

import { articleFixture } from "./helpers/fixtures.ts";
import { selected } from "./helpers/jev.ts";

const target = articleFixture({ id: "new", title: "八戸市の実証事業が始動" });
const local = articleFixture({
  id: "local",
  title: "市街地にクマが近づく前に検知 八戸市の山林でセンサーカメラ検証",
  publishedAt: "2026-11-12T00:00:00Z",
  reviewStatus: "posted",
});

function jev(answers: [string, number][]) {
  let calls = 0;
  const transport: FetchBytes = async (url) => {
    const [answer, probability] = answers[calls++]!;
    return {
      url,
      contentType: "application/json",
      data: utf8(
        JSON.stringify({
          answers: {
            relation: selected(answer, Object.keys(RELATIONS), probability),
          },
        }),
      ),
    };
  };
  return new Jev("test", "jev-latest", transport);
}

describe("location comparisons", () => {
  it("adds the same municipality below lexical overlap", () => {
    expect(relatedCandidates(target, [local])).toEqual([local]);
    expect(
      relatedCandidates(target, [
        { ...local, title: local.title.replace("八戸市", "盛岡市") },
      ]),
    ).toEqual([]);
    expect(
      relatedCandidates(target, [
        { ...local, title: "八戸市 abcdefghijklmnopqrstuvwxyz0123456789" },
      ]),
    ).toEqual([]);
    expect(
      relatedCandidates({ ...target, title: "独自の実証事業が始動" }, [local]),
    ).toEqual([]);
  });

  it("does not select a place supplied only by an attribution label", () => {
    const attributed = {
      ...target,
      title: "学校周辺の安全対策を発表 (北海道文化放送)",
    };
    const other = { ...local, title: "北海道でカメラ検証" };
    expect(lexicalOverlap(attributed, other)).toBeCloseTo(0.154, 3);
    expect(relatedCandidates(attributed, [other])).toEqual([]);
  });

  it("does not call Jev for a match supplied only by the publisher", async () => {
    const attributed = {
      ...target,
      title: "学校周辺の安全対策を発表 (北海道文化放送)",
    };
    const other = { ...local, title: "北海道でカメラ検証" };
    expect(await jev([]).relate(attributed, "基準", [other])).toMatchObject({
      relation: null,
      relatedArticleId: null,
      relationProvenance: [],
    });
  });

  it("keeps attribution and the full lead in lexical comparisons and model input", async () => {
    const article = {
      ...target,
      title: "学校周辺の安全対策を発表 (北海道文化放送)",
      sourceName: "CEEK｜地域",
      excerpt: "八戸市で新たな調査を開始。二つ目の文も照合に使う。",
    };
    const other = { ...article, id: "lexical" };
    const original = structuredClone(article);
    const requests: unknown[] = [];
    const transport: FetchBytes = async (url, options) => {
      requests.push(JSON.parse(new TextDecoder().decode(options?.body)));
      return {
        url,
        contentType: "application/json",
        data: utf8(
          JSON.stringify({
            answers: {
              relation: selected("different", Object.keys(RELATIONS)),
            },
          }),
        ),
      };
    };
    expect(lexicalOverlap(article, other)).toBe(1);
    await new Jev("test", "jev-latest", transport).relate(article, "基準", [
      other,
    ]);
    const expected = {
      title: original.title,
      excerpt: original.excerpt,
      sourceName: "CEEK",
    };
    expect(requests).toEqual([
      expect.objectContaining({
        state: expect.objectContaining({
          new_article: expect.objectContaining(expected),
          previous_article: expect.objectContaining(expected),
        }),
      }),
    ]);
    expect(article).toEqual(original);
  });

  it("includes the exact 0.1 floor and excludes a score just below it", () => {
    const boundary = { ...local, title: "八戸市 abcdefghijklmnopqrstuvwxyz01" };
    const below = { ...local, title: "八戸市 abcdefghijklmnopqrstuvwxyz012" };
    expect(lexicalOverlap(target, boundary)).toBe(0.1);
    expect(lexicalOverlap(target, below)).toBeLessThan(0.1);
    expect(relatedCandidates(target, [boundary])).toEqual([boundary]);
    expect(relatedCandidates(target, [below])).toEqual([]);
  });

  it.each([0, 1, 2, 3])(
    "fills only the remaining slots for %i lexical matches, with at most one extra",
    (count) => {
      const lexical = Array.from({ length: count }, (_, i) => ({
        ...target,
        id: `lexical-${i}`,
      }));
      const locations = Array.from({ length: 5 }, (_, i) => ({
        ...local,
        id: `local-${i}`,
      }));
      const result = relatedCandidates(target, [...lexical, ...locations]);
      expect(result.slice(0, count)).toEqual(lexical);
      expect(result.slice(count)).toHaveLength(Math.max(3 - count, 1));
      expect(result).toHaveLength(count === 3 ? 4 : 3);
    },
  );

  it("keeps all lexical slots and their posted reservation before one extra location slot", () => {
    const lexical = Array.from({ length: 4 }, (_, i) =>
      articleFixture({
        id: `lexical-${i}`,
        title: `${target.title}${"の続報".repeat(i)}`,
        reviewStatus: i === 3 ? "posted" : "unread",
      }),
    );
    const before = relatedCandidates(target, lexical);
    expect(before).toHaveLength(3);
    expect(before).toContain(lexical[3]);
    expect(
      relatedCandidates(target, [
        ...lexical,
        local,
        { ...local, id: "older", publishedAt: "2026-11-11T00:00:00Z" },
      ]),
    ).toEqual([...before, local]);
  });

  it("prefers a municipality match, then newer publication, within remaining slots", () => {
    const prefecture = {
      ...local,
      id: "prefecture",
      title: "青森県の実証実験 山林でセンサーカメラによる検証計画",
      publishedAt: "2026-11-13T00:00:00Z",
    };
    const older = {
      ...local,
      id: "older",
      publishedAt: "2026-11-10T00:00:00Z",
    };
    expect(relatedCandidates(target, [prefecture, older, local])).toEqual([
      local,
      older,
      prefecture,
    ]);
  });

  it.each([
    ["duplicate", 0.95, "duplicate"],
    ["duplicate", 0.9, "duplicate"],
    ["duplicate", 0.899, "uncertain"],
    ["duplicate", 0.6, "uncertain"],
    ["duplicate", 0.599, null],
    ["duplicate", 0.5, null],
    ["different", 0.5, null],
    ["different", 0.95, null],
    ["followup", 0.95, null],
    ["uncertain", 0.95, null],
  ])(
    "adopts location %s at %s as %s and records every comparison",
    async (answer, probability, relation) => {
      const result = await jev([[answer, probability]]).relate(target, "基準", [
        local,
      ]);
      expect(result).toMatchObject({
        relation,
        relatedArticleId: relation ? local.id : null,
        relationProvenance: [
          expect.objectContaining({ comparisonArticleId: local.id }),
        ],
      });
    },
  );

  it.each([
    ["different", 0.95],
    ["different", 0.5],
    ["followup", 0.95],
    ["followup", 0.5],
    ["uncertain", 0.95],
    ["uncertain", 0.5],
    ["duplicate", 0.5],
  ])(
    "keeps an existing followup after a rejected location %s at %s",
    async (answer, probability) => {
      const lexical = { ...target, id: "lexical" };
      const result = await jev([
        ["followup", 0.95],
        [answer, probability],
      ]).relate(target, "基準", [lexical, local]);
      expect(result).toMatchObject({
        relation: "followup",
        relatedArticleId: lexical.id,
        relationRoute: null,
      });
      expect(result.relationProvenance).toHaveLength(2);
    },
  );

  it("adopts a duplicate after a lexical followup and records the location route", async () => {
    const lexical = { ...target, id: "lexical" };
    const result = await jev([
      ["followup", 0.95],
      ["duplicate", 0.6],
    ]).relate(target, "基準", [lexical, local]);
    expect(result).toMatchObject({
      relation: "uncertain",
      relatedArticleId: local.id,
      relationRoute: "location",
    });
    expect(result.relationProvenance).toHaveLength(2);
  });

  it("keeps the location adoption rule after resolving its comparison reference", async () => {
    const reference = { ...target, id: "reference" };
    const result = await jev([["followup", 0.95]]).relate(
      target,
      "基準",
      [local],
      undefined,
      async () => reference,
    );
    expect(result).toMatchObject({
      relation: null,
      relatedArticleId: null,
      relationRoute: null,
    });
    expect(result.relationProvenance?.[0]?.comparisonArticleId).toBe(
      reference.id,
    );
  });

  it("skips extra requests once a lexical uncertain reference blocks posting", async () => {
    const lexical = { ...target, id: "lexical" };
    const result = await jev([["uncertain", 0.95]]).relate(target, "基準", [
      lexical,
      local,
    ]);
    expect(result).toMatchObject({
      relation: "uncertain",
      relatedArticleId: lexical.id,
    });
    expect(result.relationProvenance).toHaveLength(1);
  });
});
