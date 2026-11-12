// SPDX-License-Identifier: MIT
import type { Analysis } from "../../src/domain.ts";
import { Jev } from "../../src/jev/client.ts";
import { choiceAnswer } from "../../src/jev/evaluation.ts";
import { evidenceHash } from "../../src/jev/evidence.ts";
/** Test-only controls around the same authenticated Worker used by runtime regressions. */
import type { SourceConfig } from "../../src/sources/types.ts";
import { createD1Repository } from "../../src/storage/d1.ts";
import { isRecord, utf8 } from "../../src/text.ts";
import type { Env } from "../../src/worker.ts";
import { fakeClock } from "../helpers/clock.ts";
import { rssSource } from "../helpers/fixtures.ts";
import runtime from "../runtime/fixture.ts";

const source: SourceConfig = rssSource({
  id: "fixture",
  name: "Fixture",
  description: "Browser fixture",
});
const testClock = fakeClock(1_801_000_000);
async function advance(request: Request, env: Env) {
  testClock.advance(3601);
  return runtime.fetch(
    new Request(new URL("/fixture/advance", request.url)),
    env,
  );
}
export default {
  ...runtime,
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/fixture/advance") return advance(request, env);
    if (path === "/fixture/post-screening" && request.method === "POST") {
      const input: unknown = await request.json();
      if (!isRecord(input) || typeof input.articleId !== "string")
        return Response.json(
          { error: "Invalid screening article" },
          { status: 400 },
        );
      const repo = await createD1Repository(env.DB, [source], () =>
        testClock.now(),
      );
      const article = await repo.article(input.articleId);
      const other = (await repo.articles()).find(
        (item) => item.id !== article.id,
      );
      if (!other) throw new Error("Seed a comparison article first");
      await repo.review(other.id, "posted");
      const jev = new Jev(
        "fixture-key",
        "fixture-screening-model",
        async (url) => ({
          data: utf8(
            JSON.stringify({
              answers: {
                relation: choiceAnswer(
                  "different",
                  ["duplicate", "followup", "different", "uncertain"],
                  1,
                ),
              },
            }),
          ),
          url,
          contentType: "application/json",
        }),
        () => testClock.now(),
      );
      const rubric = (await repo.settings()).rubric;
      const result = await jev.relate(article, rubric, [other]);
      const saved = await repo.analyzeResult(
        article.id,
        await evidenceHash(article),
        rubric,
        {
          ...result,
          analysisStatus: article.analysisStatus,
        },
        undefined,
        "post-screening",
      );
      if (!saved || !result.relationProvenance?.length)
        throw new Error(
          "Fixture screening did not produce a saved model decision",
        );
      return Response.json({ saved });
    }
    if (path === "/fixture/autopilot" && request.method === "POST") {
      const repo = await createD1Repository(env.DB, [source], testClock.now);
      const articles = (
        await repo.articlePage({ bucket: "all", limit: 12 }, testClock.now())
      ).articles;
      if (articles.length !== 12) throw new Error("Seed twelve articles first");
      const results: (Analysis | null)[] = [
        { analysisStatus: "done", decision: "candidate" },
        {
          analysisStatus: "done",
          decision: "candidate",
          relation: "duplicate",
          relatedArticleId: articles[9]!.id,
        },
        {
          analysisStatus: "done",
          decision: "candidate",
          relation: "uncertain",
          relatedArticleId: articles[0]!.id,
        },
        { analysisStatus: "done", decision: "review" },
        {
          analysisStatus: "done",
          decision: "irrelevant",
          reason:
            "対象外の可能性が高い（確度低）：選定基準で対象外とされる話題",
        },
        {
          analysisStatus: "done",
          decision: "candidate",
          relation: "duplicate",
          relatedArticleId: "removed-comparison",
        },
        { analysisStatus: "done", decision: "irrelevant" },
        {
          analysisStatus: "done",
          decision: "candidate",
          relation: "duplicate",
        },
        null,
        null,
        null,
        {
          analysisStatus: "done",
          decision: "candidate",
          relation: "duplicate",
          relatedArticleId: articles[10]!.id,
        },
      ];
      for (const [index, result] of results.entries()) {
        const article = await repo.article(articles[index]!.id);
        if (result)
          await repo.analyzeResult(
            article.id,
            await evidenceHash(article),
            (await repo.settings()).rubric,
            result,
          );
      }
      for (const [index, status] of [
        [6, "saved"],
        [7, "approved"],
        [8, "dismissed"],
        [9, "posted"],
      ] as const)
        await repo.review(articles[index]!.id, status);
      return Response.json({ ids: articles.map((article) => article.id) });
    }
    if (path === "/fixture/seed") {
      const input: unknown = await request.json();
      if (
        !isRecord(input) ||
        !Number.isInteger(input.count) ||
        typeof input.count !== "number" ||
        input.count < 1 ||
        input.count > 500
      )
        return Response.json(
          { error: "Invalid fixture count" },
          { status: 400 },
        );
      const repo = await createD1Repository(env.DB, [source], () =>
        testClock.now(),
      );
      await repo.ingest(
        source,
        Array.from({ length: input.count }, (_, index) => ({
          title: `Article ${String(index).padStart(4, "0")} クマの出没と対策`,
          url: `https://example.org/browser-${index}`,
          excerpt: "市が野生動物の被害対策を発表",
          body: `Fixture body ${index}. ${"Detailed evidence. ".repeat(300)}`,
          publishedAt: new Date((testClock.now() - index) * 1000).toISOString(),
        })),
      );
      return Response.json({ created: input.count });
    }
    if (path === "/fixture/safety-stop") {
      const repo = await createD1Repository(env.DB, [source], () =>
        testClock.now(),
      );
      const first = (await repo.articles())[0];
      if (!first)
        return Response.json(
          { error: "Seed an article first" },
          { status: 400 },
        );
      await repo.review(first.id, "saved");
      await repo.updateSettings({ autoPost: true });
      await advance(request, env);
      const claim = await repo.claimPost(testClock.now());
      if (!claim) throw new Error("Fixture could not claim a post");
      await advance(request, env);
      await repo.recoverPosts(testClock.now());
      return Response.json(await repo.settingsSnapshot());
    }
    if (path === "/fixture/pending-post") {
      const repo = await createD1Repository(env.DB, [source], () =>
        testClock.now(),
      );
      const first = (await repo.articles())[0];
      if (!first)
        return Response.json(
          { error: "Seed an article first" },
          { status: 400 },
        );
      await repo.review(first.id, "saved");
      await repo.updateSettings({ autoPost: true });
      await advance(request, env);
      const claim = await repo.claimPost(testClock.now());
      if (!claim) throw new Error("Fixture could not claim a post");
      // A synthetic accepted identity; no remote create or confirmation is sent.
      await repo.submitPost(
        first.id,
        "fixture-buffer-id",
        "fixture-channel",
        testClock.now(),
        claim.claimToken,
      );
      await repo.deferPostCheck(first.id, claim.claimToken, {
        timestamp: testClock.now(),
        remoteStatus: "sending",
      });
      await repo.updateSettings({ autoPost: false });
      const observedAt = Date.now() / 1000 - 600;
      await repo.recordBufferQuota({
        observedAt,
        api: {
          state: "known",
          windows: [
            {
              name: "window-1",
              seconds: 900,
              limit: 100,
              remaining: 25,
              resetAt: observedAt + 900,
            },
          ],
        },
        channel: {
          observedAt,
          channelId: "fixture-channel",
          limit: 100,
          scheduled: 10,
          sent: 3,
          atLimit: false,
        },
      });
      return Response.json({ articleId: first.id });
    }
    return runtime.fetch(request, env);
  },
};
