// SPDX-License-Identifier: MIT
/** Real classification, SQLite persistence and publication with redirected comparisons. */
import { describe, expect, it, vi } from "vitest";

import { Application } from "../src/application.ts";
import type { Article } from "../src/domain.ts";
import { Jev } from "../src/jev/client.ts";
import { evidenceHash } from "../src/jev/evidence.ts";
import { REASONS, TOPICS, PRIORITY, RELATIONS } from "../src/jev/questions.ts";
import { relatedCandidates } from "../src/jev/related.ts";
import type { FetchBytes } from "../src/net/types.ts";
import { BufferClient } from "../src/publishing/buffer-client.ts";
import { Publisher } from "../src/publishing/publisher.ts";
import { utf8 } from "../src/text.ts";

import { fakePublishingClient } from "./helpers/buffer.ts";
import { fakeClock } from "./helpers/clock.ts";
import { articleFixture } from "./helpers/fixtures.ts";
import { selected } from "./helpers/jev.ts";
import { seedArticles, testRepository } from "./helpers/storage.ts";

const NEAR = "市街地にクマが近づく前に検知 山林のセンサーカメラ検証";
const FAR = "八戸の実証事業が始動";
async function setup(answer = "duplicate", probability = 1) {
  const clock = fakeClock(Date.UTC(2026, 10, 12, 2) / 1000);
  const { repo, driver } = testRepository([], clock.now);
  await repo.initialize();
  const calls: { title: string; previous: string | null }[] = [];
  const transport: FetchBytes = async (url, options) => {
    const request = JSON.parse(new TextDecoder().decode(options?.body));
    const comparing = !!request.questions.relation;
    calls.push({
      title: (request.state.new_article ?? request.state.article).title,
      previous: request.state.previous_article?.title ?? null,
    });
    return {
      url,
      contentType: "application/json",
      data: utf8(
        JSON.stringify({
          answers: comparing
            ? {
                relation: selected(answer, Object.keys(RELATIONS), probability),
              }
            : {
                classification: selected("relevant", Object.keys(REASONS)),
                topic: selected("鳥獣被害・管理", Object.keys(TOPICS)),
                priority: selected("1", Object.keys(PRIORITY)),
              },
        }),
      ),
    };
  };
  const jev = new Jev("test", "jev-latest", transport, clock.now);
  const app = new Application(repo, jev, new BufferClient(), {
    clock: clock.now,
  });
  const at = (offset: number) =>
    new Date((clock.now() + offset) * 1000).toISOString();
  function article(id: string, changes: Partial<Article> = {}) {
    return articleFixture({
      id,
      title: FAR,
      url: `https://example.org/${id}`,
      publishedAt: at(-7200),
      discoveredAt: at(-7200),
      analysisStatus: "done",
      decision: "candidate",
      relation: null,
      ...changes,
    });
  }
  const target = article("new", {
    title: NEAR,
    publishedAt: at(-3600),
    discoveredAt: at(-3600),
    analysisStatus: "pending",
    decision: null,
  });
  const reads: string[] = [];
  const original = repo.article.bind(repo);
  vi.spyOn(repo, "article").mockImplementation(async (id) => {
    reads.push(id);
    return original(id);
  });
  async function run(others: Article[], failure = false) {
    await seedArticles(
      repo,
      [...others, target].map((value) => ({ ...value })),
    );
    await app.start("analyze", [target.id]);
    reads.length = 0;
    await app.scheduled();
    const analysisReads = [...reads];
    const result = await original(target.id);
    expect((await repo.getJob()).error).toEqual(
      failure ? expect.any(String) : null,
    );
    await repo.updateSettings({ autoPost: true });
    clock.advance(3601);
    const client = fakePublishingClient(vi.fn);
    const publisher = new Publisher(repo, client, clock.now, jev);
    await publisher.tick();
    await publisher.tick();
    const posts = (await repo.publicationState()).posts;
    return { result, analysisReads, client, posts };
  }
  return { repo, driver, article, target, at, run, calls };
}

describe("analysis comparison redirection", () => {
  it.each([
    { viaCopy: false, probability: 0.9, blocked: false },
    { viaCopy: false, probability: 0.89, blocked: true },
    { viaCopy: true, probability: 0.9, blocked: false },
    { viaCopy: true, probability: 0.89, blocked: true },
  ])(
    "compares the uncertain reference directly (copy=$viaCopy, confidence=$probability)",
    async ({ viaCopy, probability, blocked }) => {
      const { article, target, run, calls } = await setup(
        "different",
        probability,
      );
      const posted = article("posted", { reviewStatus: "posted" });
      const uncertain = article("uncertain", {
        title: viaCopy ? "初報による検証計画の紹介" : NEAR,
        relation: "uncertain",
        relatedArticleId: posted.id,
      });
      const copy = article("copy", {
        title: NEAR,
        relation: "duplicate",
        relatedArticleId: uncertain.id,
      });
      expect(relatedCandidates(target, [posted])).toEqual([]);
      const { result, posts } = await run([
        posted,
        uncertain,
        ...(viaCopy ? [copy] : []),
      ]);
      expect(
        calls
          .filter((call) => call.previous !== null)
          .map((call) => call.previous),
      ).toEqual([FAR]);
      expect(result).toMatchObject({
        decision: "candidate",
        relation: blocked ? "uncertain" : null,
        relatedArticleId: blocked ? posted.id : null,
        relationProvenance: [
          expect.objectContaining({ comparisonArticleId: posted.id }),
        ],
      });
      expect(posts.some((post) => post.articleId === target.id)).toBe(!blocked);
    },
  );

  it.each(["duplicate", "uncertain"])(
    "stops the production-shaped %s bridge",
    async (relation) => {
      const { article, target, run, calls } = await setup();
      const posted = article("posted", { reviewStatus: "posted" });
      const bridge = article("bridge", {
        title: NEAR,
        relation,
        relatedArticleId: posted.id,
      });
      const { result, client } = await run([posted, bridge]);
      const expected = relation === "duplicate" ? bridge : posted;
      expect(calls.map((call) => call.previous)).toEqual([
        null,
        expected.title,
      ]);
      expect(result).toMatchObject({
        relation: "duplicate",
        relatedArticleId: expected.id,
        relationProvenance: [
          expect.objectContaining({ comparisonArticleId: expected.id }),
        ],
      });
      expect(client.post).not.toHaveBeenCalled();
      expect(target.id).not.toBe(expected.id);
    },
  );

  it.each(["pending", "expired", "dismissed"])(
    "keeps %s coverage as a comparison",
    async (kind) => {
      const { article, at, run, calls } = await setup();
      const root = article("root", {
        publishedAt: at(-2 * 86400),
        reviewStatus: kind === "dismissed" ? "dismissed" : "unread",
      });
      const bridge = article("bridge", {
        title: NEAR,
        analysisStatus: kind === "pending" ? "pending" : "done",
        relation: kind === "pending" ? null : "duplicate",
        relatedArticleId: kind === "pending" ? null : root.id,
      });
      const { result, client } = await run([root, bridge]);
      expect(calls.map((call) => call.previous)).toEqual([null, NEAR]);
      expect(result).toMatchObject({
        relation: "duplicate",
        relatedArticleId: bridge.id,
      });
      expect(client.post).not.toHaveBeenCalled();
    },
  );

  it("loads a reference outside the pool by ID and records its evidence", async () => {
    const { article, at, run, calls } = await setup();
    const posted = article("posted", {
      reviewStatus: "posted",
      publishedAt: at(-8 * 86400),
    });
    const bridge = article("bridge", {
      title: NEAR,
      relation: "uncertain",
      relatedArticleId: posted.id,
    });
    const { result, analysisReads, client } = await run([posted, bridge]);
    expect(analysisReads).toEqual(["new", "posted"]);
    expect(calls.map((call) => call.previous)).toEqual([null, FAR]);
    expect(result).toMatchObject({
      relation: "duplicate",
      relatedArticleId: "posted",
      relationProvenance: [
        expect.objectContaining({ comparisonArticleId: "posted" }),
      ],
    });
    expect(client.post).not.toHaveBeenCalled();
  });

  describe.each(["duplicate", "uncertain"])(
    "failed %s resolution",
    (relation) => {
      it.each(["missing", "cycle", "hops", "reads", "no-link", "self"])(
        "compares the original article after %s failure and prevents a duplicate post",
        async (kind) => {
          const { article, at, target, run, calls } = await setup();
          const posted = article("posted", { reviewStatus: "posted" });
          const count =
            kind === "hops"
              ? 33
              : kind === "reads"
                ? 7
                : kind === "cycle"
                  ? 3
                  : 2;
          const chain = Array.from({ length: count }, (_, i) =>
            article(`link-${i}`, {
              title: i === 0 ? NEAR : FAR,
              relation,
              relatedArticleId:
                i < count - 1
                  ? `link-${i + 1}`
                  : kind === "cycle"
                    ? "link-1"
                    : kind === "no-link"
                      ? null
                      : kind === "self"
                        ? target.id
                        : `link-${i + 1}`,
              publishedAt:
                kind === "reads" && i > 0 ? at(-8 * 86400) : at(-7200),
            }),
          );
          if (kind === "hops" || kind === "reads")
            chain.push(
              article(`link-${count}`, {
                reviewStatus: "posted",
                publishedAt: at(-8 * 86400),
              }),
            );
          // As in the incident, the posted article misses lexical retrieval, while H matches N.
          expect(relatedCandidates(target, [posted])).toEqual([]);
          expect(relatedCandidates(target, chain).map(({ id }) => id)).toEqual([
            "link-0",
          ]);
          const { result, analysisReads, posts, client } = await run([
            posted,
            ...chain,
          ]);
          expect(calls.map((call) => call.previous)).toEqual([null, NEAR]);
          expect(result).toMatchObject({
            decision: "candidate",
            relation: "duplicate",
            relatedArticleId: "link-0",
            relationProvenance: [
              expect.objectContaining({ comparisonArticleId: "link-0" }),
            ],
          });
          expect(posts.some((post) => post.articleId === target.id)).toBe(
            false,
          );
          expect(client.post).not.toHaveBeenCalled();
          expect(analysisReads.length - 1).toBe(
            kind === "reads" ? 6 : kind === "missing" ? 1 : 0,
          );
        },
      );
    },
  );

  it.each(["approved", "posted"] as const)(
    "preserves the uncertain link on %s coverage",
    async (reviewStatus) => {
      const { article, run, calls } = await setup();
      const posted = article("posted", { reviewStatus: "posted" });
      const bridge = article("bridge", {
        title: NEAR,
        reviewStatus,
        relation: "uncertain",
        relatedArticleId: posted.id,
      });
      const { result } = await run([posted, bridge]);
      expect(calls[1]?.previous).toBe(NEAR);
      expect(result).toMatchObject({
        relation: "duplicate",
        relatedArticleId: "bridge",
      });
    },
  );

  it.each(["approved", "posted"] as const)(
    "does not follow further uncertainty beyond %s coverage",
    async (reviewStatus) => {
      const { article, run, calls } = await setup();
      const end = article("end", { reviewStatus: "posted" });
      const middle = article("middle", {
        relation: "uncertain",
        relatedArticleId: end.id,
      });
      const selected = article("selected", {
        title: NEAR,
        reviewStatus,
        relation: "uncertain",
        relatedArticleId: middle.id,
      });
      const { result } = await run([selected, middle, end]);
      expect(calls[1]?.previous).toBe(NEAR);
      expect(result.relatedArticleId).toBe(selected.id);
    },
  );

  it.each([6, 32])(
    "allows exactly %i reference steps within the corresponding budget",
    async (count) => {
      const { article, at, run, calls } = await setup();
      const chain = Array.from({ length: count }, (_, i) =>
        article(`link-${i}`, {
          title: i === 0 ? NEAR : FAR,
          relation: "uncertain",
          relatedArticleId: `link-${i + 1}`,
          publishedAt: count === 6 && i > 0 ? at(-8 * 86400) : at(-7200),
        }),
      );
      const end = article(`link-${count}`, {
        reviewStatus: "posted",
        publishedAt: at(-8 * 86400),
      });
      const { result, analysisReads, client } = await run([...chain, end]);
      expect(calls.map((call) => call.previous)).toEqual([null, FAR]);
      expect(result.relatedArticleId).toBe(end.id);
      expect(analysisReads.length - 1).toBe(count === 6 ? 6 : 1);
      expect(client.post).not.toHaveBeenCalled();
    },
  );

  it("shares six extra reads across all three lexical comparisons", async () => {
    const { article, at, run, calls } = await setup("different");
    const others = Array.from({ length: 3 }, (_, slot) => [
      article(`bridge-${slot}`, {
        title: NEAR,
        relation: "uncertain",
        relatedArticleId: `outside-${slot}-0`,
      }),
      ...Array.from({ length: 3 }, (_, i) =>
        article(`outside-${slot}-${i}`, {
          reviewStatus: i === 2 ? "posted" : "unread",
          relation: i === 2 ? null : "uncertain",
          relatedArticleId: `outside-${slot}-${i + 1}`,
          publishedAt: at(-8 * 86400),
        }),
      ),
    ]).flat();
    const { result, analysisReads } = await run(others);
    expect(analysisReads.slice(1)).toHaveLength(6);
    expect(new Set(analysisReads.slice(1)).size).toBe(6);
    expect(calls.map((call) => call.previous)).toEqual([null, FAR, FAR, NEAR]);
    expect(
      result.relationProvenance?.map(
        ({ comparisonArticleId }) => comparisonArticleId,
      ),
    ).toEqual(["outside-0-2", "outside-1-2", "bridge-2"]);
  });

  it("caches a missing reference across selected comparisons", async () => {
    const { article, run, calls } = await setup("different");
    const { analysisReads } = await run(
      ["a", "b", "c"].map((id) =>
        article(id, {
          title: NEAR,
          relation: "uncertain",
          relatedArticleId: "absent",
        }),
      ),
    );
    expect(analysisReads).toEqual(["new", "absent"]);
    expect(calls.map((call) => call.previous)).toEqual([
      null,
      NEAR,
      NEAR,
      NEAR,
    ]);
  });

  it("rejects a redirected comparison whose evidence changes before saving", async () => {
    const { repo, driver, article, at, run } = await setup();
    const posted = article("posted", {
      reviewStatus: "posted",
      publishedAt: at(-8 * 86400),
    });
    const bridge = article("bridge", {
      title: NEAR,
      relation: "uncertain",
      relatedArticleId: posted.id,
    });
    const original = repo.analyzeResult.bind(repo);
    const save = vi
      .spyOn(repo, "analyzeResult")
      .mockImplementation(async (...args) => {
        driver.db
          .prepare(
            "UPDATE news_articles SET data=json_set(data,'$.title','Changed evidence') WHERE id=?",
          )
          .run(posted.id);
        return original(...args);
      });
    const { result, client } = await run([posted, bridge], true);
    expect(save.mock.calls[0]![4]).toBe(await evidenceHash(posted));
    expect(result.analysisStatus).toBe("pending");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("reports a failed reference read instead of silently skipping it", async () => {
    const { driver, article, at, run, calls } = await setup();
    const posted = article("posted", {
      reviewStatus: "posted",
      publishedAt: at(-8 * 86400),
    });
    const bridge = article("bridge", {
      title: NEAR,
      relation: "uncertain",
      relatedArticleId: posted.id,
    });
    const original = driver.batch.bind(driver);
    driver.batch = async (statements) => {
      if (
        statements.some(
          ([sql, args]) =>
            sql === "SELECT data FROM news_articles WHERE id=?" &&
            args[0] === posted.id,
        )
      )
        throw new Error("Reference read failed");
      return original(statements);
    };
    const { result, client } = await run([posted, bridge], true);
    expect(result.analysisStatus).toBe("error");
    expect(calls).toHaveLength(1);
    expect(client.post).not.toHaveBeenCalled();
  });

  it("deduplicates replacements without selecting more lexical candidates", async () => {
    const { article, run, calls } = await setup("different");
    const posted = article("posted", { reviewStatus: "posted" });
    const bridges = Array.from({ length: 4 }, (_, i) =>
      article(`bridge-${i}`, {
        title: NEAR,
        relation: "uncertain",
        relatedArticleId: posted.id,
      }),
    );
    const { result } = await run([posted, ...bridges]);
    expect(calls.map((call) => call.previous)).toEqual([null, FAR]);
    expect(result.relationProvenance).toHaveLength(1);
  });
});
