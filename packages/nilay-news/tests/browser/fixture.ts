// SPDX-License-Identifier: MIT
/** Test-only controls around the same authenticated Worker used by runtime regressions. */
import { Jev } from "../../src/jev.ts";
import type { SourceConfig } from "../../src/sources/types.ts";
import { createD1Repository } from "../../src/storage/d1.ts";
import { isRecord, utf8 } from "../../src/text.ts";
import type { Env } from "../../src/worker.ts";
import runtime from "../runtime/fixture.ts";

const source: SourceConfig = {
  id: "fixture",
  name: "Fixture",
  description: "Browser fixture",
  kind: "rss",
  enabled: true,
  url: "https://example.org/feed",
};
let now = 1_801_000_000;
async function advance(request: Request, env: Env) {
  now += 3601;
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
      const repo = await createD1Repository(env.DB, [source], () => now);
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
                relation: {
                  type: "choice",
                  choice: "different",
                  probabilities: {
                    duplicate: 0,
                    followup: 0,
                    different: 1,
                    uncertain: 0,
                  },
                },
              },
            }),
          ),
          url,
          contentType: "application/json",
        }),
        () => now,
      );
      const rubric = (await repo.settings()).rubric;
      const result = await jev.relate(article, rubric, [other]);
      const saved = await repo.analyzeResult(
        article.id,
        await repo.evidenceHash(article),
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
      const repo = await createD1Repository(env.DB, [source], () => now);
      await repo.ingest(
        source,
        Array.from({ length: input.count }, (_, index) => ({
          title: `Article ${String(index).padStart(4, "0")} クマの出没と対策`,
          url: `https://example.org/browser-${index}`,
          excerpt: "市が野生動物の被害対策を発表",
          body: `Fixture body ${index}. ${"Detailed evidence. ".repeat(300)}`,
          publishedAt: new Date((now - index) * 1000).toISOString(),
        })),
      );
      return Response.json({ created: input.count });
    }
    if (path === "/fixture/safety-stop") {
      const repo = await createD1Repository(env.DB, [source], () => now);
      const first = (await repo.articles())[0];
      if (!first)
        return Response.json(
          { error: "Seed an article first" },
          { status: 400 },
        );
      await repo.review(first.id, "saved");
      await repo.updateSettings({ autoPost: true });
      await advance(request, env);
      const claim = await repo.claimPost(now);
      if (!claim) throw new Error("Fixture could not claim a post");
      await advance(request, env);
      await repo.recoverPosts(now);
      return Response.json(await repo.settingsSnapshot());
    }
    if (path === "/fixture/pending-post") {
      const repo = await createD1Repository(env.DB, [source], () => now);
      const first = (await repo.articles())[0];
      if (!first)
        return Response.json(
          { error: "Seed an article first" },
          { status: 400 },
        );
      await repo.review(first.id, "saved");
      await repo.updateSettings({ autoPost: true });
      await advance(request, env);
      const claim = await repo.claimPost(now);
      if (!claim) throw new Error("Fixture could not claim a post");
      // A synthetic accepted identity; no remote create or confirmation is sent.
      await repo.submitPost(
        first.id,
        "fixture-buffer-id",
        "fixture-channel",
        now,
        claim.claimToken,
      );
      await repo.deferPostCheck(first.id, claim.claimToken, {
        timestamp: now,
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
