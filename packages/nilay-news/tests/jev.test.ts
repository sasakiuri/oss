// SPDX-License-Identifier: MIT
import { describe, expect, test } from "vitest";

import type { Article } from "../src/domain.ts";
import { UserError } from "../src/errors.ts";
import {
  choice,
  ENDPOINT,
  evidence,
  Jev,
  REASONS,
  relatedCandidates,
  TOPICS,
} from "../src/jev.ts";
import { FetchError } from "../src/net/http.ts";
import type { FetchBytes, FetchOptions } from "../src/net/types.ts";
import { utf8 } from "../src/text.ts";

const ARTICLE: Article = {
  id: "new",
  title: "北海道でクマを捕獲",
  url: "https://example.org/article/1",
  excerpt: "北海道の町でクマを捕獲した。",
  publishedAt: "2026-09-27T00:00:00+00:00",
  sourceName: "新聞",
  sourceIds: ["test"],
  discoveredAt: "2026-09-27T00:00:00+00:00",
  reviewStatus: "unread",
  analysisStatus: "pending",
};

function selected(value: string, options: Iterable<string>, probability = 1) {
  const names = [...options];
  return {
    type: "choice",
    choice: value,
    probabilities: Object.fromEntries(
      names.map((name) => [
        name,
        name === value ? probability : (1 - probability) / (names.length - 1),
      ]),
    ),
    confidence: 0.5,
  };
}

function response(
  decision = "candidate",
  probability = 0.95,
  reason = "relevant",
) {
  return {
    answers: {
      relevance: selected(
        decision,
        ["candidate", "review", "irrelevant"],
        probability,
      ),
      topic: selected("鳥獣被害・管理", Object.keys(TOPICS)),
      reason: selected(reason, Object.keys(REASONS)),
      priority: selected("1", ["0", "1", "2", "3"]),
    },
  };
}

interface Request {
  url: string;
  options: FetchOptions | undefined;
  body: {
    model: string;
    state: Record<string, unknown>;
    questions: Record<string, { criteria: Record<string, string> }>;
  };
}

/** A FetchBytes answering Jev requests with `answer(request)` as JSON. */
function transport(answer: (request: Request) => unknown) {
  const requests: Request[] = [];
  const fetch: FetchBytes = async (url, options) => {
    const request: Request = {
      url,
      options,
      body: JSON.parse(new TextDecoder().decode(options?.body)),
    };
    requests.push(request);
    const value = answer(request);
    return {
      data:
        typeof value === "string" ? utf8(value) : utf8(JSON.stringify(value)),
      url,
      contentType: "application/json",
    };
  };
  return { fetch, requests };
}

/** Answer the first request with `first` and relation requests with `relation`. */
function withRelation(
  relation: string,
  probability = 1,
  first: unknown = response(),
) {
  return transport(({ body }) => {
    const criteria = body.questions.relation?.criteria;
    return criteria
      ? {
          answers: {
            relation: selected(relation, Object.keys(criteria), probability),
          },
        }
      : first;
  });
}

const previous = {
  ...ARTICLE,
  id: "previous",
  excerpt: "北海道の町でクマが目撃された。",
};

describe("Jev decisions", () => {
  test("an expired job makes no request", async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetch, requests } = transport(() => response());
    await expect(
      new Jev("test", "jev-latest", fetch).analyze(
        ARTICLE,
        "基準",
        [previous],
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(requests).toHaveLength(0);
  });

  test("expiration after classification prevents further paid relation requests", async () => {
    const controller = new AbortController();
    const { fetch, requests } = transport(() => {
      controller.abort();
      return response();
    });
    await expect(
      new Jev("test", "jev-latest", fetch).analyze(
        ARTICLE,
        "基準",
        [previous],
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.options?.signal).toBe(controller.signal);
  });

  test("a missing key never calls the network", async () => {
    const jev = new Jev("", "jev-latest", () => {
      throw new Error("network called");
    });
    await expect(jev.analyze(ARTICLE, "基準", [])).rejects.toThrow("未設定");
    expect([jev.key, jev.model]).toEqual(["", "jev-latest"]);
  });

  test("typed classification and low-probability review", async () => {
    expect(
      await new Jev(
        "test",
        "jev-latest",
        transport(() => response()).fetch,
      ).analyze(ARTICLE, "基準", []),
    ).toEqual({
      decision: "candidate",
      probability: 0.95,
      topic: "鳥獣被害・管理",
      reason: REASONS.relevant,
      priority: 1,
      analysisStatus: "done",
      analysisError: null,
      relatedArticleId: null,
      relation: null,
    });
    const low = await new Jev(
      "test",
      "jev-latest",
      transport(() => response("candidate", 0.6)).fetch,
    ).analyze(ARTICLE, "基準", []);
    expect([low.decision, low.probability]).toEqual(["review", null]);
    const boundary = await new Jev(
      "test",
      "jev-latest",
      transport(() => response("candidate", 0.85)).fetch,
    ).analyze(ARTICLE, "基準", []);
    expect([boundary.decision, boundary.probability]).toEqual([
      "candidate",
      0.85,
    ]);
  });

  test("insufficient evidence requires review", async () => {
    const result = await new Jev(
      "test",
      "jev-latest",
      transport(() => response("candidate", 0.95, "insufficient")).fetch,
    ).analyze(ARTICLE, "基準", []);
    expect(result.decision).toBe("review");
  });

  test.each([
    [
      "a non-finite probability",
      {
        ...response(),
        answers: {
          ...response().answers,
          relevance: {
            ...selected("candidate", ["candidate", "review", "irrelevant"]),
            probabilities: { candidate: 1e400, review: 0, irrelevant: 0 },
          },
        },
      },
    ],
    ["a missing answer", { answers: { topic: response().answers.topic } }],
    ["no answers", { result: "ok" }],
    ["an array", []],
    ["invalid JSON", '{"answers":'],
    ["a JSON NaN literal", '{"answers": NaN}'],
  ])("%s is an error, not a fallback", async (_name, body) => {
    await expect(
      new Jev("test", "jev-latest", transport(() => body).fetch).analyze(
        ARTICLE,
        "基準",
        [],
      ),
    ).rejects.toThrow(UserError);
  });

  test("a follow-up is recorded against the previous article", async () => {
    const { fetch, requests } = withRelation("followup");
    const result = await new Jev("test", "jev-latest", fetch).analyze(
      ARTICLE,
      "基準",
      [previous],
    );
    expect(requests).toHaveLength(2);
    expect(result).toMatchObject({
      decision: "candidate",
      relation: "followup",
      relatedArticleId: "previous",
    });
    expect(Object.keys(requests[1]?.body.state ?? {})).toEqual([
      "selection_criteria",
      "new_article",
      "previous_article",
    ]);
  });

  test("a duplicate is an annotation, not an automatic dismissal", async () => {
    const result = await new Jev(
      "test",
      "jev-latest",
      withRelation("duplicate").fetch,
    ).analyze(ARTICLE, "基準", [
      { ...ARTICLE, id: "previous", reviewStatus: "saved" },
    ]);
    expect(result).toMatchObject({
      decision: "candidate",
      relation: "duplicate",
      relatedArticleId: "previous",
    });
    expect(result).not.toHaveProperty("reviewStatus");
  });

  test("a low-confidence relation is uncertain and a later match still wins", async () => {
    const uncertain = await new Jev(
      "test",
      "jev-latest",
      withRelation("duplicate", 0.89).fetch,
    ).analyze(ARTICLE, "基準", [previous]);
    expect(uncertain).toMatchObject({
      relation: "uncertain",
      relatedArticleId: "previous",
    });
    let call = 0;
    const { fetch } = transport(({ body }) => {
      const criteria = body.questions.relation?.criteria;
      if (!criteria) return response();
      call += 1;
      return {
        answers: {
          relation: selected(
            call === 1 ? "uncertain" : "followup",
            Object.keys(criteria),
          ),
        },
      };
    });
    const others = [
      previous,
      { ...previous, id: "older", title: "北海道でクマを捕獲した" },
    ];
    expect(
      await new Jev("test", "jev-latest", fetch).analyze(
        ARTICLE,
        "基準",
        others,
      ),
    ).toMatchObject({ relation: "followup" });
  });

  test("a different event leaves no relation and irrelevant articles skip matching", async () => {
    expect(
      await new Jev(
        "test",
        "jev-latest",
        withRelation("different").fetch,
      ).analyze(ARTICLE, "基準", [previous]),
    ).toMatchObject({ relation: null, relatedArticleId: null });
    const { fetch, requests } = withRelation(
      "duplicate",
      1,
      response("irrelevant"),
    );
    expect(
      (
        await new Jev("test", "jev-latest", fetch).analyze(ARTICLE, "基準", [
          previous,
        ])
      ).decision,
    ).toBe("irrelevant");
    expect(requests).toHaveLength(1);
  });

  test("the API contract keeps the key out of the body", async () => {
    const { fetch, requests } = transport(() => response());
    await new Jev("fake-test-key", "model-x", fetch).analyze(
      ARTICLE,
      "基準",
      [],
    );
    const [request] = requests;
    expect(request?.url).toBe(ENDPOINT);
    expect(request?.options).toMatchObject({
      headers: {
        Authorization: "Bearer fake-test-key",
        "Content-Type": "application/json",
      },
      timeout: 25,
      maxBytes: 1_000_000,
    });
    expect(new TextDecoder().decode(request?.options?.body)).not.toContain(
      "fake-test-key",
    );
    expect(Object.keys(request?.body ?? {})).toEqual([
      "model",
      "state",
      "questions",
    ]);
    expect(request?.body.model).toBe("model-x");
  });

  test.each([
    [401, "Jev の API キーを確認してください"],
    [403, "Jev API の利用権限を確認してください"],
    [429, "Jev の利用上限です。時間をおいて再実行してください"],
    [500, "Jev API: remote failure"],
    [undefined, "Jev API: remote failure"],
  ])("HTTP status %s maps to a safe message", async (status, message) => {
    const jev = new Jev("test", "jev-latest", () =>
      Promise.reject(new FetchError("remote failure", status)),
    );
    await expect(jev.analyze(ARTICLE, "基準", [])).rejects.toThrow(
      new UserError(message),
    );
  });

  test("unexpected transport errors propagate unchanged", async () => {
    const error = new TypeError("bug");
    await expect(
      new Jev("test", "jev-latest", () => Promise.reject(error)).analyze(
        ARTICLE,
        "基準",
        [],
      ),
    ).rejects.toBe(error);
  });
});

describe("choice", () => {
  const options = ["a", "b"];
  test.each([
    [{}, "判定形式"],
    [{ x: [] }, "判定形式"],
    [
      { x: { type: "text", choice: "a", probabilities: { a: 1, b: 0 } } },
      "判定形式",
    ],
    [
      { x: { type: "choice", choice: "c", probabilities: { a: 1, b: 0 } } },
      "判定形式",
    ],
    [{ x: { type: "choice", choice: "a", probabilities: null } }, "判定形式"],
    [{ x: { type: "choice", choice: "a", probabilities: { a: 1 } } }, "選択肢"],
    [
      {
        x: { type: "choice", choice: "a", probabilities: { a: 1, b: 0, c: 0 } },
      },
      "選択肢",
    ],
    [
      { x: { type: "choice", choice: "a", probabilities: { a: true, b: 0 } } },
      "確率が不正",
    ],
    [
      { x: { type: "choice", choice: "a", probabilities: { a: NaN, b: 0 } } },
      "確率が不正",
    ],
    [
      {
        x: { type: "choice", choice: "a", probabilities: { a: 1.1, b: -0.1 } },
      },
      "確率が不正",
    ],
    [
      { x: { type: "choice", choice: "a", probabilities: { a: 0.5, b: 0.4 } } },
      "確率分布",
    ],
  ])("invalid answer %j", (answers, message) => {
    expect(() => choice(answers, "x", options)).toThrow(message);
  });

  test("a valid answer returns the choice and its probability", () => {
    expect(
      choice(
        {
          x: {
            type: "choice",
            choice: "b",
            probabilities: { a: 0.01, b: 0.98 },
          },
        },
        "x",
        options,
      ),
    ).toEqual(["b", 0.98]);
  });
});

describe("evidence", () => {
  test("bounded body with the reading note", () => {
    const result = evidence({
      ...ARTICLE,
      body: "本".repeat(13000),
      metadata: { agency: "環境省" },
      contentError: "",
    });
    expect(result.body).toHaveLength(12000);
    expect(result).toMatchObject({
      title: ARTICLE.title,
      sourceName: "新聞",
      metadata: { agency: "環境省" },
      contentError: "",
    });
    expect(Object.keys(result)).toEqual([
      "title",
      "excerpt",
      "sourceName",
      "publishedAt",
      "metadata",
      "contentError",
      "body",
      "bodyNote",
    ]);
  });

  test("a stale retained body is withheld from Jev", () => {
    expect(
      evidence({
        ...ARTICLE,
        body: "取得した本文",
        bodyStale: true,
        contentError: "本文未取得",
      }).body,
    ).toBe("");
  });

  test("missing fields are null", () => {
    expect(evidence({ title: "x" })).toMatchObject({
      excerpt: null,
      metadata: null,
      contentError: null,
      body: "",
    });
  });
});

describe("related candidates", () => {
  test("a lexical shortlist of at most three, excluding the article itself", () => {
    const others = [
      { id: "new", title: "北海道でクマを捕獲" },
      { id: "far", title: "東京で会議" },
      { id: "a", title: "北海道でクマを捕獲した" },
      { id: "b", title: "北海道でクマ捕獲" },
      { id: "c", title: "北海道でクマ" },
      { id: "d", title: "北海道" },
    ];
    expect(relatedCandidates(ARTICLE, others).map((other) => other.id)).toEqual(
      ["a", "b", "c"],
    );
  });

  test("case and punctuation are ignored", () => {
    expect(
      relatedCandidates({ id: "x", title: "Bear, spotted!" }, [
        { id: "y", title: "BEAR SPOTTED" },
      ]),
    ).toHaveLength(1);
  });
});
