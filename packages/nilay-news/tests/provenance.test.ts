// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { Application } from "../src/application.ts";
import {
  budgetedEvaluationTransport,
  evaluate,
  evaluationDiff,
  mockedEvaluationTransport,
  validateFixtures,
} from "../src/evaluation.ts";
import { Jev } from "../src/jev.ts";
import { BufferClient } from "../src/publishing.ts";
import { sha256 } from "../src/text.ts";

import { testRepository } from "./helpers/storage.ts";

const fixtures = validateFixtures(
  JSON.parse(
    readFileSync(
      new URL("../evaluation/fixtures-v1.json", import.meta.url),
      "utf8",
    ),
  ),
);
describe("decision provenance", () => {
  it("hashes the exact request and captures the requested/provider model without guessing", async () => {
    const fixture = fixtures.cases[0]!;
    let exact = "";
    const mock = mockedEvaluationTransport(fixture);
    const jev = new Jev(
      "test-key",
      "jev-requested",
      async (url, options) => {
        exact = new TextDecoder().decode(options?.body);
        return mock(url, options);
      },
      () => 1000,
    );
    const result = await jev.analyze(fixture.article, fixtures.rubric, []);
    expect(result.provenance).toMatchObject({
      requestedModel: "jev-requested",
      resolvedModel: "jev-fixture-v1",
      promptVersion: "1",
      criteriaVersion: "1",
      routingPolicyVersion: "1",
      modelInputHash: await sha256(exact),
      rubricHash: await sha256(fixtures.rubric),
      analyzedAt: "1970-01-01T00:16:40+00:00",
    });
    const unknown = await new Jev(
      "key",
      "jev-requested",
      async (url, options) => {
        const response = await mock(url, options);
        const raw = JSON.parse(new TextDecoder().decode(response.data));
        delete raw.model;
        return {
          ...response,
          data: new TextEncoder().encode(JSON.stringify(raw)),
        };
      },
    ).analyze(fixture.article, fixtures.rubric, []);
    expect(unknown.provenance?.resolvedModel).toBeNull();
  });
  it("records every relationship comparison ID/input and detects changed rubric, model and evidence", async () => {
    const fixture = fixtures.cases.find((row) => row.id === "duplicate")!;
    const jev = new Jev(
      "key",
      "jev-requested",
      mockedEvaluationTransport(fixture),
      () => 1000,
    );
    const original = await jev.analyze(
      fixture.article,
      fixtures.rubric,
      fixture.others,
    );
    expect(original.relationProvenance).toHaveLength(1);
    expect(original.relationProvenance![0]).toMatchObject({
      comparisonArticleId: "original",
      modelInputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      comparisonInputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const changedRubric = await jev.analyze(
      fixture.article,
      fixtures.rubric + "changed",
      fixture.others,
    );
    expect(changedRubric.provenance?.rubricHash).not.toBe(
      original.provenance?.rubricHash,
    );
    expect(changedRubric.provenance?.modelInputHash).not.toBe(
      original.provenance?.modelInputHash,
    );
    const changedArticle = await jev.analyze(
      { ...fixture.article, title: fixture.article.title + "changed" },
      fixtures.rubric,
      fixture.others,
    );
    expect(changedArticle.provenance?.modelInputHash).not.toBe(
      original.provenance?.modelInputHash,
    );
    const changedModel = await new Jev(
      "key",
      "jev-other",
      mockedEvaluationTransport(fixture),
      () => 1000,
    ).analyze(fixture.article, fixtures.rubric, fixture.others);
    expect(changedModel.provenance?.modelInputHash).not.toBe(
      original.provenance?.modelInputHash,
    );
  });
  it("persists new provenance and presents absent legacy provenance explicitly in details", async () => {
    const fixture = fixtures.cases[0]!;
    const source = {
      id: "fixture",
      name: "Fixture",
      description: "Fixture",
      enabled: true,
      kind: "rss" as const,
      url: "https://example.org/feed",
    };
    const storage = testRepository(
      [source],
      () => Date.UTC(2026, 8, 30) / 1000,
    );
    try {
      await storage.repo.initialize();
      await storage.repo.ingest(source, [fixture.article]);
      const article = (await storage.repo.articles())[0]!;
      const app = new Application(storage.repo, new Jev(), new BufferClient());
      expect(await app.article(article.id)).toMatchObject({
        provenance: null,
        relationProvenance: null,
      });
      const result = await new Jev(
        "key",
        "jev-test",
        mockedEvaluationTransport(fixture),
        () => 1000,
      ).analyze(article, fixtures.rubric, []);
      const settings = await storage.repo.settings();
      const actual = await new Jev(
        "key",
        "jev-test",
        mockedEvaluationTransport(fixture),
        () => 1000,
      ).analyze(article, settings.rubric, []);
      expect(
        await storage.repo.analyzeResult(
          article.id,
          await storage.repo.evidenceHash(article),
          settings.rubric,
          actual,
        ),
      ).toBe(true);
      expect((await app.article(article.id)).provenance).toEqual(
        actual.provenance,
      );
      expect(result.provenance?.rubricHash).not.toBe(
        actual.provenance?.rubricHash,
      );
      await storage.repo.ingest(source, [
        { ...fixture.article, title: "Updated evidence" },
      ]);
      expect((await app.article(article.id)).provenance).toBeNull();
    } finally {
      storage.close();
    }
  });
  it("rejects a result when a compared article changes, including a non-blocking comparison", async () => {
    const fixture = fixtures.cases.find((row) => row.id === "duplicate")!;
    const source = {
      id: "fixture",
      name: "Fixture",
      description: "Fixture",
      enabled: true,
      kind: "rss" as const,
      url: "https://example.org/feed",
    };
    const storage = testRepository(
      [source],
      () => Date.UTC(2026, 8, 30) / 1000,
    );
    try {
      await storage.repo.initialize();
      await storage.repo.ingest(source, [fixture.article, ...fixture.others]);
      const articles = await storage.repo.articles();
      const article = articles.find((row) => row.url === fixture.article.url)!;
      const other = articles.find((row) => row.url === fixture.others[0]!.url)!;
      const current = {
        ...fixture,
        others: [other],
        mock: { ...fixture.mock, relations: { [other.id]: "different" } },
      };
      const rubric = (await storage.repo.settings()).rubric;
      const result = await new Jev(
        "key",
        "jev-test",
        mockedEvaluationTransport(current),
      ).analyze(article, rubric, [other]);
      expect(result.relatedArticleId).toBeNull();
      expect(result.relationProvenance![0]!.comparisonArticleId).toBe(other.id);
      expect(
        await storage.repo.analyzeResult(
          article.id,
          await storage.repo.evidenceHash(article),
          rubric,
          result,
        ),
      ).toBe(true);
      expect(
        (await storage.repo.article(article.id)).relationProvenance,
      ).toEqual(result.relationProvenance);
      await storage.driver.batch([
        [
          "UPDATE news_articles SET data=json_set(data,'$.body',?) WHERE id=?",
          ["A changed account of the event", other.id],
        ],
      ]);
      expect(
        await storage.repo.analyzeResult(
          article.id,
          await storage.repo.evidenceHash(article),
          rubric,
          result,
        ),
      ).toBe(false);
    } finally {
      storage.close();
    }
  });
});
describe("isolated versioned evaluation", () => {
  it("runs deterministically with mocked responses and separates retrieval misses from relationship failure", async () => {
    const first = await evaluate(fixtures),
      second = await evaluate(fixtures);
    expect(first).toEqual(second);
    expect(first.mode).toBe("mocked-regression");
    expect(first.humanReviewedCases).toBe(0);
    expect(first.metrics.candidatePrecision).toBeNull();
    expect(first.provisionalMetrics.retrievalFailures).toContain(
      "retrieval-miss",
    );
    expect(
      first.provisionalMetrics.relationshipFailuresAfterRetrieval,
    ).not.toContain("retrieval-miss");
    expect(first.cases.find((row) => row.id === "source-rule")).toMatchObject({
      sourceCandidate: true,
      decision: { decision: "irrelevant" },
    });
    expect(evaluationDiff(first, second)).toMatchObject({
      configurationChanged: false,
      changed: [],
    });
    const baseline = JSON.parse(
      readFileSync(
        new URL("../evaluation/baseline-v1.json", import.meta.url),
        "utf8",
      ),
    );
    expect(evaluationDiff(baseline, first)).toMatchObject({
      configurationChanged: false,
      changed: [],
      deleted: [],
    });
  });
  it("diffs each changed case and flags prompt, routing, model and input provenance changes", async () => {
    const before = await evaluate(fixtures);
    for (const property of [
      "promptVersion",
      "criteriaHash",
      "routingPolicyHash",
      "requestedModel",
      "modelInputHash",
    ] as const) {
      const after = structuredClone(before);
      after.cases[0]!.decision.provenance![property] += "changed";
      expect(evaluationDiff(before, after)).toMatchObject({
        configurationChanged: true,
        changed: [{ id: before.cases[0]!.id }],
      });
    }
    const later = structuredClone(before);
    later.cases[0]!.decision.provenance!.analyzedAt = "2026-10-01T00:00:00Z";
    expect(evaluationDiff(before, later)).toMatchObject({
      configurationChanged: false,
      changed: [],
    });
    const relation = later.cases.find(
      (row) => row.decision.relationProvenance?.length,
    )!.decision.relationProvenance![0]!;
    relation.comparisonInputHash += "changed";
    expect(evaluationDiff(before, later).configurationChanged).toBe(true);
  });
  it("bounds paid request attempts and input bytes before calling the transport", async () => {
    let calls = 0;
    const budget = budgetedEvaluationTransport(
      async (url) => {
        calls++;
        return { data: new Uint8Array(), url, contentType: "application/json" };
      },
      1,
      1000,
    );
    await expect(
      budget.transport("https://example.org", { body: new Uint8Array(1001) }),
    ).rejects.toThrow("input budget");
    expect(calls).toBe(0);
    await budget.transport("https://example.org", {
      body: new Uint8Array(1000),
    });
    await expect(
      budget.transport("https://example.org", undefined),
    ).rejects.toThrow("request budget");
    expect(calls).toBe(1);
    expect(budget.calls()).toBe(1);
    expect(() =>
      budgetedEvaluationTransport(budget.transport, 21, 1000),
    ).toThrow("1..20");
  });
  it("rejects fake review metadata and makes no live calls for pending cases", async () => {
    const fake = structuredClone(fixtures);
    fake.cases[0]!.humanReview = {
      status: "reviewed",
      reviewer: null,
      reviewedAt: null,
    };
    expect(() => validateFixtures(fake)).toThrow("named human reviewer");
    let calls = 0;
    await expect(
      evaluate(fixtures, {
        mode: "live-model",
        key: "isolated-key",
        transport: async () => {
          calls++;
          throw new Error("Unexpected live call");
        },
      }),
    ).rejects.toThrow("No human-reviewed");
    expect(calls).toBe(0);
  });
});
