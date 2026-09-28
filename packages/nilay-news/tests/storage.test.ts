// SPDX-License-Identifier: MIT
/** Repository contract and races run against the same SQL and schema used by D1. */
import { Buffer } from "node:buffer";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Article, Job, Post } from "../src/domain.ts";
import { NotFoundError, UserError } from "../src/errors.ts";
import { POST_INTERVAL_SECONDS } from "../src/publication-policy.ts";
import type { CollectedItem, SourceConfig } from "../src/sources/types.ts";
import { SQLRepository } from "../src/storage/repository.ts";
import type { SQLResult, SQLStatement } from "../src/storage/repository.ts";
import { isRecord } from "../src/text.ts";

import {
  MIGRATION_FILES,
  SQLiteDriver,
  testRepository,
} from "./helpers/storage.ts";

const SOURCE: SourceConfig = {
  id: "one",
  name: "Source",
  description: "テスト",
  url: "https://example.org/feed",
  enabled: true,
  kind: "rss",
};
/** Every test starts at `now = 10000` (epoch seconds). */
const START = 10000;
/** A zoned publication time `seconds` after the start clock. */
function published(seconds: number): string {
  return new Date((START + seconds) * 1000).toISOString();
}
const ITEM: CollectedItem = {
  title: "クマの出没と対策",
  url: "https://example.org/a",
  excerpt: "記事の説明",
  // Fresh for the first 22 hours of a test, well past the post gates.
  publishedAt: published(-7200),
};
const NEW_RUBRIC = "変更された具体的なニュースの選定基準です";
const ARTICLE: Article = {
  id: "x",
  url: "",
  title: "",
  excerpt: "",
  publishedAt: null,
  sourceName: "",
  sourceIds: [],
  discoveredAt: "",
  reviewStatus: "unread",
  analysisStatus: "pending",
};

/** Stored JSON is decoded for assertions only here, at the database boundary. */
function stored(
  db: DatabaseSync,
  table: "articles" | "posts" | "state" | "sources",
): Map<string, Record<string, unknown>> {
  const rows = db.prepare(`SELECT id,data FROM news_${table}`).all();
  return new Map(
    rows.map((row) => [
      String(row.id),
      JSON.parse(String(row.data)) as Record<string, unknown>,
    ]),
  );
}

/** The portable snapshot is JSON-shaped; tests edit it as plain records. */
async function exported(from: SQLRepository): Promise<Record<string, unknown>> {
  return JSON.parse(JSON.stringify(await from.exportSnapshot())) as Record<
    string,
    unknown
  >;
}

function sameBytes(actual: Uint8Array | null, expected: Uint8Array): boolean {
  return actual !== null && Buffer.from(actual).equals(Buffer.from(expected));
}

function signal(): [Promise<void>, () => void] {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return [promise, resolve];
}

function revision(db: DatabaseSync): number {
  return Number(
    db.prepare("SELECT revision FROM news_meta WHERE id=1").get()?.revision,
  );
}

class YieldDriver extends SQLiteDriver {
  override async batch(statements: SQLStatement[]): Promise<SQLResult[]> {
    // Force independently connected repositories to read the same revision
    // before their commits. The loser must retry the entire business decision.
    await new Promise((resolve) => setImmediate(resolve));
    return super.batch(statements);
  }
}

type Batch = SQLiteDriver["batch"];

/** Replace a driver's batch; the returned function calls the original implementation. */
function intercept(
  driver: SQLiteDriver,
  replacement: (
    original: Batch,
    statements: SQLStatement[],
  ) => Promise<SQLResult[]>,
): void {
  const original: Batch = driver.batch.bind(driver);
  driver.batch = (statements) => replacement(original, statements);
}

let directory: string;
let path: string;
let now: number;
let repo: SQLRepository;
let driver: SQLiteDriver;
let drivers: SQLiteDriver[];

function open(sources: SourceConfig[] = [SOURCE], file = path): SQLRepository {
  const opened = testRepository(sources, () => now, file);
  drivers.push(opened.driver);
  return opened.repo;
}

function connect(): [SQLRepository, SQLiteDriver] {
  const connection = new YieldDriver(path);
  drivers.push(connection);
  return [new SQLRepository(connection, [SOURCE], () => now), connection];
}

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "nilay-storage-"));
  path = join(directory, "news.sqlite3");
  now = START;
  drivers = [];
  const opened = testRepository([SOURCE], () => now, path);
  ({ repo, driver } = opened);
  drivers.push(driver);
  await repo.initialize();
  // A new file-backed SQLite database with every migration can exceed the
  // default hook timeout on hosted Windows runners.
}, 30_000);

afterEach(() => {
  for (const item of drivers) item.close();
  rmSync(directory, { recursive: true, force: true });
});

async function find(url: string): Promise<Article> {
  const article = (await repo.articles()).find((item) => item.url === url);
  if (!article) throw new Error(`missing ${url}`);
  return article;
}

async function candidate(
  changes: Partial<CollectedItem> = {},
): Promise<string> {
  const item = { ...ITEM, ...changes };
  await repo.ingest(SOURCE, [item]);
  const article = await find(item.url);
  await repo.review(article.id, "saved");
  return article.id;
}

async function ready(): Promise<string> {
  const articleId = await candidate();
  await repo.updateSettings({ autoPost: true });
  now += 3600;
  return articleId;
}

async function claim(
  at = now,
): Promise<{ articleId: string; text: string; claimToken: string }> {
  const attempt = await repo.claimPost(at);
  if (!attempt) throw new Error("expected a claim");
  return attempt;
}

async function analyze(
  articleId: string,
  result: Partial<Article>,
  relationHash?: string,
): Promise<boolean> {
  const article = await repo.article(articleId);
  const rubric = (await repo.settings()).rubric;
  return repo.analyzeResult(
    articleId,
    await repo.evidenceHash(article),
    rubric,
    { analysisStatus: "done", ...result },
    relationHash,
  );
}

describe("initialization and sources", () => {
  it("is idempotent and keeps a blocked source disabled", async () => {
    const version = await repo.stateVersion();
    await repo.initialize();
    expect(await repo.stateVersion()).toBe(version);
    const blocked: SourceConfig = {
      ...SOURCE,
      id: "blocked",
      collectionBlocked: "停止中",
    };
    const other = open([SOURCE, blocked]);
    await other.initialize();
    expect((await other.sources())[1]?.enabled).toBe(false);
    await expect(
      other.updateSource("blocked", { enabled: true }),
    ).rejects.toThrow(new UserError("停止中"));
    expect((await other.sources())[1]?.enabled).toBe(false);
  });

  it("adds a closed publication round to a database initialized before rounds", async () => {
    driver.db.exec("DELETE FROM news_state WHERE id='publication_batch'");
    const other = open();
    await other.initialize();
    expect(stored(driver.db, "state").get("publication_batch")).toEqual({
      articleIds: [],
      openedAt: 0,
    });
  });

  it("preserves runtime source state and config order across restarts", async () => {
    await repo.updateSource("one", {
      enabled: false,
      lastError: "取得失敗",
      lastWarnings: ["警告"],
    });
    const second: SourceConfig = { ...SOURCE, id: "two", name: "Second" };
    const other = open([second, { ...SOURCE, name: "名称変更" }]);
    await other.initialize();
    const [first, restored] = await other.sources();
    expect(first?.id).toBe("two");
    expect(restored).toMatchObject({
      id: "one",
      name: "名称変更",
      enabled: false,
      lastError: "取得失敗",
      lastWarnings: ["警告"],
    });
    await expect(
      repo.updateSource("missing", { enabled: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // A row left by an old configuration is neither listed nor editable.
    await expect(
      open([second]).updateSource("one", { enabled: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("ingest and evidence", () => {
  it("uses the legacy article id and evidence hash formats", async () => {
    await repo.ingest(SOURCE, [ITEM, { ...ITEM, sourceKey: "notice1" }]);
    const ids = (await repo.articles()).map((article) => article.id).sort();
    expect(ids).toEqual([
      "1e87d04d64a248c348e9f0cf",
      "b5b10dd0429e69ac7cfaf0a2",
    ]);
    const evidence: Article = {
      ...ARTICLE,
      title: "クマの出没と対策",
      excerpt: '記事の説明\n"引用"',
      publishedAt: "2026-09-01T00:00:00Z",
      body: "本文\u2028行",
      bodyStale: false,
      metadata: { b: "2", a: "環境省", "\u{1F600}": "x", "\uFF21": "y" },
      contentError: "",
    };
    // References computed by storage/model.py evidence_hash (json.dumps sort_keys, code point order).
    expect(await repo.evidenceHash(evidence)).toBe(
      "b5ab8216a89dca49a7053b5977804b10baff402aadf7324752c22e114fb914e0",
    );
    expect(await repo.evidenceHash({ ...ARTICLE, title: "t" })).toBe(
      "887bfc69e45d8e255a0c2bf0afc834868afc64fed5c7e0f1a6b15dbd69e82073",
    );
  });

  it("preserves review and rich evidence, and invalidates relations", async () => {
    const articleId = await candidate({
      body: "行政機関の詳細説明",
      metadata: { agency: "環境省" },
    });
    const first = await repo.article(articleId);
    expect(await analyze(articleId, { decision: "candidate" })).toBe(true);
    const secondId = await candidate({
      url: "https://example.org/b",
      title: "続報",
    });
    expect(
      await analyze(
        secondId,
        { relatedArticleId: articleId, relation: "duplicate" },
        await repo.evidenceHash(first),
      ),
    ).toBe(true);
    await repo.ingest({ ...SOURCE, id: "aggregator", name: "Aggregator" }, [
      { ...ITEM, excerpt: "短い" },
    ]);
    const retained = await repo.article(articleId);
    expect(retained).toMatchObject({
      body: "行政機関の詳細説明",
      sourceName: SOURCE.name,
      reviewStatus: "saved",
      analysisStatus: "done",
    });
    await repo.ingest(SOURCE, [
      { ...ITEM, title: "更新された記事", contentError: "取得失敗" },
    ]);
    const changed = await repo.article(articleId);
    expect(changed.bodyStale).toBe(true);
    expect(changed.analysisStatus).toBe("pending");
    expect(await repo.article(secondId)).toMatchObject({
      analysisStatus: "pending",
      relatedArticleId: null,
      reviewStatus: "saved",
    });
    expect(changed).not.toHaveProperty("_identity");
    expect(stored(driver.db, "articles").get(articleId)?._identity).toBe(
      ITEM.url,
    );
  });

  it("rejects an in-flight relation result when its target changed", async () => {
    await repo.ingest(SOURCE, [
      ITEM,
      { ...ITEM, url: "https://example.org/second" },
    ]);
    const first = await find(ITEM.url);
    const second = await find("https://example.org/second");
    const firstHash = await repo.evidenceHash(first);
    const secondHash = await repo.evidenceHash(second);
    const rubric = (await repo.settings()).rubric;
    const relation = {
      analysisStatus: "done",
      relatedArticleId: first.id,
      relation: "duplicate",
    } as const;
    await repo.ingest(SOURCE, [{ ...ITEM, body: "本文が更新された" }]);
    expect(
      await repo.analyzeResult(
        second.id,
        secondHash,
        rubric,
        relation,
        firstHash,
      ),
    ).toBe(false);
    expect((await repo.article(second.id)).relation).toBeNull();
    await expect(
      repo.analyzeResult("0".repeat(24), secondHash, rubric, relation),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps human review when content or rubric changes invalidate analysis", async () => {
    const articleId = await candidate();
    const article = await repo.article(articleId);
    const rubric = (await repo.settings()).rubric;
    expect(await analyze(articleId, { decision: "candidate" })).toBe(true);
    await repo.ingest(SOURCE, [
      { ...ITEM, title: "クマの出没と対策、住民への説明会を実施" },
    ]);
    expect(await repo.article(articleId)).toMatchObject({
      reviewStatus: "saved",
      analysisStatus: "pending",
      decision: null,
    });
    await repo.updateSettings({ rubric: NEW_RUBRIC });
    expect(
      await repo.analyzeResult(
        articleId,
        await repo.evidenceHash(article),
        rubric,
        { analysisStatus: "done", decision: "candidate" },
      ),
    ).toBe(false);
    expect(await repo.article(articleId)).toMatchObject({
      reviewStatus: "saved",
      decision: null,
    });
  });

  it("migrates a Yahoo RSS identity without changing id or review", async () => {
    const url = `https://news.yahoo.co.jp/articles/${"b".repeat(40)}`;
    await repo.ingest(SOURCE, [{ ...ITEM, url: `${url}?source=rss` }]);
    const old = await find(`${url}?source=rss`);
    await repo.review(old.id, "posted");
    const yahoo = { ...SOURCE, id: "yahoo-domestic" };
    expect(await repo.ingest(yahoo, [{ ...ITEM, url }])).toBe(0);
    expect(await repo.ingest(yahoo, [{ ...ITEM, url }])).toBe(0);
    expect(await repo.articles()).toHaveLength(1);
    expect(await repo.article(old.id)).toMatchObject({
      reviewStatus: "posted",
      url,
    });
    expect(stored(driver.db, "articles").get(old.id)?._identity).toBe(url);
  });

  it("lets a detail source own content regardless of arrival order", async () => {
    const richSource: SourceConfig = { ...SOURCE, id: "bills", name: "法案" };
    const rich: CollectedItem = {
      ...ITEM,
      title: "法案の正式名称",
      excerpt: "法案の提出情報",
      body: "法案の概要",
      metadata: { agency: "環境省" },
      attachments: [{ title: "条文", url: "https://example.org/law.pdf" }],
      contentError: "",
    };
    for (const detailFirst of [true, false]) {
      const store = open([SOURCE, richSource], ":memory:");
      await store.initialize();
      await store.ingest(detailFirst ? richSource : SOURCE, [
        detailFirst ? rich : ITEM,
      ]);
      const [article] = await store.articles();
      if (!article) throw new Error("missing article");
      await store.review(article.id, "saved");
      await store.ingest(richSource, [rich]);
      await store.ingest(SOURCE, [{ ...ITEM, excerpt: "" }]);
      expect(await store.articles()).toHaveLength(1);
      const current = await store.article(article.id);
      expect(current).toMatchObject({
        title: rich.title,
        body: rich.body,
        attachments: rich.attachments,
        reviewStatus: "saved",
      });
      expect([...current.sourceIds].sort()).toEqual(["bills", "one"]);
      await store.ingest(richSource, [{ ...rich, body: "変更後の法案概要" }]);
      expect((await store.article(article.id)).body).toBe("変更後の法案概要");
    }
  });

  it("keeps a roundup citation from replacing publisher content", async () => {
    const roundup: SourceConfig = { ...SOURCE, id: "roundup", name: "まとめ" };
    const cited: CollectedItem = {
      ...ITEM,
      title: "まとめ側の見出し",
      excerpt:
        "鳥獣ニュース(2026年 9月28日) で紹介されたリンク（リンク先の本文・公開日は未取得）",
      publishedAt: null,
      metadata: {
        roundupUrl: "https://roundup.example.com/2026/09/1.html",
        roundupTitle: "鳥獣ニュース(2026年 9月28日)",
        roundupPublishedAt: "2026-09-27T15:30:00Z",
      },
    };
    const store = open([SOURCE, roundup], ":memory:");
    await store.initialize();
    await store.ingest(SOURCE, [ITEM]);
    const [article] = await store.articles();
    if (!article) throw new Error("missing article");
    const hash = await store.evidenceHash(article);
    const rubric = (await store.settings()).rubric;
    expect(
      await store.analyzeResult(article.id, hash, rubric, {
        analysisStatus: "done",
        decision: "candidate",
      }),
    ).toBe(true);
    for (let run = 0; run < 2; run += 1)
      expect(await store.ingest(roundup, [cited])).toBe(0);
    const current = await store.article(article.id);
    expect(await store.articles()).toHaveLength(1);
    expect(current).toMatchObject({
      title: ITEM.title,
      excerpt: ITEM.excerpt,
      publishedAt: ITEM.publishedAt,
      sourceName: SOURCE.name,
      sourceIds: ["one", "roundup"],
      analysisStatus: "done",
      decision: "candidate",
    });
    expect(current.metadata).toBeUndefined();
    expect(current.contentSourceId).toBeUndefined();
    expect(await store.evidenceHash(current)).toBe(hash);

    // A cited article is still promoted by a source with real details.
    const rich: SourceConfig = { ...SOURCE, id: "bills", name: "法案" };
    const other = open([roundup, rich], ":memory:");
    await other.initialize();
    await other.ingest(roundup, [cited]);
    const [first] = await other.articles();
    if (!first) throw new Error("missing article");
    expect(first.contentSourceId).toBeUndefined();
    await other.ingest(rich, [
      { ...ITEM, title: "法案の正式名称", metadata: { agency: "環境省" } },
    ]);
    expect(await other.article(first.id)).toMatchObject({
      title: "法案の正式名称",
      excerpt: ITEM.excerpt,
      publishedAt: ITEM.publishedAt,
      sourceName: "法案",
      contentSourceId: "bills",
      metadata: { agency: "環境省" },
      sourceIds: ["roundup", "bills"],
    });
  });

  it("promotes publisher RSS over an earlier citation and retains its ownership", async () => {
    const roundup: SourceConfig = {
      ...SOURCE,
      id: "roundup",
      name: "まとめ",
      feedContent: "links",
    };
    const cited: CollectedItem = {
      ...ITEM,
      title: "まとめの見出し",
      excerpt:
        "まとめ投稿に掲載された記事リンクです。リンク先本文は取得していません。",
      publishedAt: null,
      metadata: { roundupUrl: "https://roundup.example.com/day1" },
    };
    const store = open([roundup, SOURCE], ":memory:");
    await store.initialize();
    await store.ingest(roundup, [cited]);
    await store.ingest(SOURCE, [ITEM]);
    const [article] = await store.articles();
    if (!article) throw new Error("missing article");
    expect(article).toMatchObject({
      title: ITEM.title,
      excerpt: ITEM.excerpt,
      publishedAt: ITEM.publishedAt,
      sourceName: SOURCE.name,
      contentSourceId: SOURCE.id,
      sourceIds: [roundup.id, SOURCE.id],
    });
    await store.review(article.id, "saved");
    const hash = await store.evidenceHash(article);
    const rubric = (await store.settings()).rubric;
    expect(
      await store.analyzeResult(article.id, hash, rubric, {
        analysisStatus: "done",
        decision: "candidate",
      }),
    ).toBe(true);
    await store.ingest(roundup, [
      {
        ...cited,
        metadata: { roundupUrl: "https://roundup.example.com/day2" },
      },
    ]);
    const retained = await store.article(article.id);
    expect(retained).toMatchObject({
      title: ITEM.title,
      excerpt: ITEM.excerpt,
      publishedAt: ITEM.publishedAt,
      sourceName: SOURCE.name,
      contentSourceId: SOURCE.id,
      analysisStatus: "done",
      reviewStatus: "saved",
    });
    expect(await store.evidenceHash(retained)).toBe(hash);
    await store.ingest(SOURCE, [{ ...ITEM, title: "配信元の更新見出し" }]);
    expect((await store.article(article.id)).title).toBe("配信元の更新見出し");
    expect(await store.articles()).toHaveLength(1);
  });

  it("still enriches publisher content after a roundup introduced the article", async () => {
    const roundup: SourceConfig = { ...SOURCE, id: "roundup" };
    const richSource: SourceConfig = { ...SOURCE, id: "details" };
    const citation: CollectedItem = {
      ...ITEM,
      publishedAt: null,
      metadata: { roundupUrl: "https://roundup.example.com/day1" },
    };
    const detail: CollectedItem = {
      ...ITEM,
      title: "詳細を取得した記事",
      body: "法案の内容と適用範囲についての本文",
      metadata: { agency: "環境省" },
    };
    for (const citationFirst of [true, false]) {
      const store = open([roundup, SOURCE, richSource], ":memory:");
      await store.initialize();
      if (citationFirst) await store.ingest(roundup, [citation]);
      await store.ingest(SOURCE, [ITEM]);
      if (!citationFirst) await store.ingest(roundup, [citation]);
      await store.ingest(richSource, [detail]);
      await store.ingest(roundup, [citation]);
      const articles = await store.articles();
      expect(articles).toHaveLength(1);
      expect(articles[0]).toMatchObject({
        title: detail.title,
        body: detail.body,
        metadata: detail.metadata,
        contentSourceId: richSource.id,
      });
    }
  });

  it("keeps separate notices on one page and follows their detail URL", async () => {
    const notices = [
      { ...ITEM, sourceKey: "notice1" },
      { ...ITEM, title: "別の告示", sourceKey: "notice2" },
    ];
    expect(await repo.ingest(SOURCE, notices)).toBe(2);
    const first = (await repo.articles()).find(
      (article) => article.sourceKey === "notice1",
    );
    if (!first) throw new Error("missing notice");
    await repo.review(first.id, "saved");
    expect(await repo.ingest(SOURCE, notices)).toBe(0);
    const detailUrl = "https://example.org/bill-summary.html";
    expect(
      await repo.ingest(SOURCE, [
        { ...ITEM, sourceKey: "notice1", url: detailUrl },
      ]),
    ).toBe(0);
    expect(await repo.articles()).toHaveLength(2);
    expect(await repo.article(first.id)).toMatchObject({
      url: detailUrl,
      reviewStatus: "saved",
    });
  });

  it("labels a retained body stale after a failed refresh and clears it on success", async () => {
    const original: CollectedItem = {
      ...ITEM,
      body: "取得した本文",
      contentError: "",
      metadata: { agency: "環境省" },
      attachments: [{ title: "資料", url: "https://example.org/a.pdf" }],
    };
    await repo.ingest(SOURCE, [original]);
    const article = await find(ITEM.url);
    const oldHash = await repo.evidenceHash(article);
    await repo.review(article.id, "posted");
    expect(await analyze(article.id, {})).toBe(true);
    await repo.ingest(SOURCE, [{ ...ITEM, contentError: "本文未取得" }]);
    expect(await repo.article(article.id)).toMatchObject({
      bodyStale: true,
      body: "取得した本文",
      reviewStatus: "posted",
      analysisStatus: "pending",
    });
    expect(
      await repo.analyzeResult(
        article.id,
        oldHash,
        (await repo.settings()).rubric,
        { analysisStatus: "done" },
      ),
    ).toBe(false);
    await repo.ingest(SOURCE, [original]);
    expect(await repo.article(article.id)).toMatchObject({
      bodyStale: false,
      contentError: "",
    });
  });

  it("records every source of a duplicate URL and keeps review across restarts", async () => {
    expect(await repo.ingest(SOURCE, [ITEM])).toBe(1);
    const article = await find(ITEM.url);
    await repo.review(article.id, "posted");
    expect(await repo.ingest(SOURCE, [ITEM])).toBe(0);
    await repo.ingest({ ...SOURCE, id: "second" }, [ITEM]);
    const other = open();
    expect(await other.articles()).toHaveLength(1);
    expect(await other.article(article.id)).toMatchObject({
      reviewStatus: "posted",
      sourceIds: ["one", "second"],
    });
  });

  it("writes large ingests in bounded chunks of one atomic batch", async () => {
    const writes: SQLStatement[][] = [];
    intercept(driver, (original, statements) => {
      if (statements[0]?.[0].startsWith("UPDATE news_meta"))
        writes.push(statements);
      return original(statements);
    });
    const items = Array.from({ length: 60 }, (_, index) => ({
      ...ITEM,
      url: `https://example.org/${index}`,
    }));
    expect(await repo.ingest(SOURCE, items)).toBe(60);
    expect(writes).toHaveLength(1);
    const inserts = (writes[0] ?? []).filter(([sql]) =>
      sql.startsWith("INSERT INTO news_articles"),
    );
    expect(
      inserts.map(
        ([, [rows]]) => (JSON.parse(String(rows)) as unknown[]).length,
      ),
    ).toEqual([25, 25, 10]);
    expect(
      inserts.every(([sql]) =>
        sql.includes("(SELECT token FROM news_meta WHERE id=1)=?"),
      ),
    ).toBe(true);
  });

  it("rejects an oversized article without writing anything", async () => {
    const before = revision(driver.db);
    await expect(
      repo.ingest(SOURCE, [{ ...ITEM, body: "x".repeat(1_900_000) }]),
    ).rejects.toThrow("保存する記事または処理状態が上限を超えています");
    expect(revision(driver.db)).toBe(before);
    expect(await repo.articles()).toEqual([]);
  });
});

describe("automatic classification setting", () => {
  it("starts disabled and is persisted independently", async () => {
    expect(await repo.settings()).toMatchObject({
      autoCollect: false,
      autoAnalyze: false,
      autoPost: false,
    });
    await repo.updateSettings({ autoAnalyze: true });
    expect(await open().settings()).toMatchObject({
      autoCollect: false,
      autoAnalyze: true,
      autoPost: false,
    });
  });

  it("migrates existing settings to disabled and fails without the migration", async () => {
    const legacy = new SQLiteDriver(join(directory, "legacy.sqlite3"), [
      "0001_news.sql",
    ]);
    drivers.push(legacy);
    const settings = {
      rubric: "既存の運用で使っている選定基準です",
      autoCollect: true,
      pollMinutes: 45,
      autoPost: false,
      postSelection: "saved",
    };
    // A collection started by the old Worker is still running.
    const job = {
      id: "old-job",
      running: true,
      kind: "collect",
      articleIds: null,
      phase: "1/23 件完了・次の処理を待機中",
      progress: 1,
      total: 23,
      cursor: 0,
      error: null,
      warning: null,
      lastFinishedAt: "2026-09-27T00:00:00+00:00",
      token: "old-token",
      leaseUntil: now + 300,
      queuedAt: "2026-09-27T01:00:00+00:00",
      workIds: ["one"],
      rubric: settings.rubric,
      failed: 0,
      created: 2,
      limited: 0,
      deferred: 0,
    };
    const insert = legacy.db.prepare(
      "INSERT INTO news_state(id,data) VALUES (?,?)",
    );
    insert.run("settings", JSON.stringify(settings));
    insert.run("job", JSON.stringify(job));
    const before = revision(legacy.db);
    const upgraded = new SQLRepository(legacy, [SOURCE], () => now);
    await expect(upgraded.initialize()).rejects.toThrow(
      "0002_auto_analyze has not been applied",
    );
    expect(revision(legacy.db)).toBe(before);
    expect(MIGRATION_FILES).toEqual([
      "0001_news.sql",
      "0002_auto_analyze.sql",
      "0003_automatic_jobs.sql",
    ]);
    const partial = new SQLiteDriver(join(directory, "legacy.sqlite3"), [
      "0001_news.sql",
      "0002_auto_analyze.sql",
    ]);
    drivers.push(partial);
    await expect(upgraded.initialize()).rejects.toThrow(
      "0003_automatic_jobs has not been applied",
    );
    // Reopening applies only the pending migrations, as Wrangler does.
    drivers.push(new SQLiteDriver(join(directory, "legacy.sqlite3")));
    expect(revision(legacy.db)).toBe(before + 2);
    const state = stored(legacy.db, "state");
    expect(state.get("settings")).toEqual({ ...settings, autoAnalyze: false });
    expect(state.get("job")).toEqual({ ...job, automatic: false });
    await upgraded.initialize();
    expect(await upgraded.settings()).toEqual({
      ...settings,
      autoAnalyze: false,
    });
    // The old lease still owns the job and keeps its progress.
    expect(await upgraded.claimJob(now)).toBeNull();
    await upgraded.releaseJob("old-token", { progress: 2 });
    expect(await upgraded.getJob()).toMatchObject({
      id: "old-job",
      automatic: false,
      progress: 2,
      created: 2,
    });
  });

  it("creates disabled settings on a fresh migrated database", async () => {
    const fresh = new SQLiteDriver(join(directory, "fresh.sqlite3"));
    drivers.push(fresh);
    expect(stored(fresh.db, "state").size).toBe(0);
    expect(revision(fresh.db)).toBe(0);
    const created = new SQLRepository(fresh, [SOURCE], () => now);
    await created.initialize();
    expect((await created.settings()).autoAnalyze).toBe(false);
    expect((await created.getJob()).automatic).toBe(false);
  });

  it("queues only never-analyzed articles, newest first and bounded", async () => {
    const items = [-2, -4, -1, -3].map((hours, index) => ({
      ...ITEM,
      url: `https://example.org/${index}`,
      publishedAt: published(hours * 3600),
    }));
    await repo.ingest(SOURCE, items);
    const ids = await Promise.all(
      items.map(async (item) => (await find(item.url)).id),
    );
    await analyze(ids[1]!, {});
    await analyze(ids[3]!, { analysisStatus: "error", analysisError: "失敗" });
    await repo.review(ids[0]!, "dismissed");
    expect(await repo.queueAutomaticJob(true)).toBeNull();
    await repo.updateSettings({ autoAnalyze: true });
    expect(await repo.queueAutomaticJob(false)).toBeNull();
    const version = await repo.stateVersion();
    const job = await repo.queueAutomaticJob(true);
    expect(job).toMatchObject({
      running: true,
      automatic: true,
      kind: "analyze",
      articleIds: [ids[2], ids[0]],
    });
    expect(await repo.stateVersion()).toBe(version + 1);
    expect(await repo.queueAutomaticJob(true)).toBeNull();
    expect((await repo.getJob()).id).toBe(job?.id);
    expect((await repo.article(ids[0]!)).reviewStatus).toBe("dismissed");
    const token = (await repo.claimJob(now))!.token!;
    await expect(
      repo.updateJob(token, { automatic: false } as Partial<Job>),
    ).rejects.toThrow("処理の所有権は変更できません");
  });

  it("waits for the analysis pause and needs an enabled source to collect", async () => {
    await repo.ingest(SOURCE, [ITEM]);
    await repo.updateSettings({ autoAnalyze: true, autoCollect: true });
    await repo.putRecord("scheduler", "analysis", { nextAt: now + 60 });
    expect(await repo.queueAutomaticJob(true)).toMatchObject({
      kind: "collect",
      automatic: true,
    });
    const token = (await repo.claimJob(now))!.token!;
    await repo.finishJob(token);
    await repo.updateSource("one", { enabled: false });
    expect(await repo.queueAutomaticJob(true)).toBeNull();
    now += 60;
    expect(await repo.queueAutomaticJob(true)).toMatchObject({
      kind: "analyze",
    });
  });
});

/** Records every statement of a driver with the number of rows it returned. */
interface Traced {
  batch: number;
  sql: string;
  rows: number;
}

function trace(target: SQLiteDriver): Traced[] {
  const seen: Traced[] = [];
  let batches = 0;
  intercept(target, async (original, statements) => {
    const batch = (batches += 1);
    const results = await original(statements);
    statements.forEach(([sql], index) =>
      seen.push({ batch, sql, rows: results[index]?.results.length ?? 0 }),
    );
    return results;
  });
  return seen;
}

const SCOPED = "SELECT id,data FROM news_articles WHERE";

function articleRows(seen: Traced[]): number {
  return seen
    .filter(({ sql }) => /^SELECT [^;]* FROM news_articles/.test(sql))
    .reduce((total, { rows }) => total + rows, 0);
}

describe("database round trips", () => {
  // 2026-09-28 11:00 JST.
  const ELEVEN = Date.UTC(2026, 8, 28, 2) / 1000;
  const dailySource = (index: number): SourceConfig => ({
    ...SOURCE,
    id: `daily-${index}`,
    url: `https://example.org/daily-${index}`,
    dailyAtJst: "11:00",
    minCollectionMinutes: 1440,
  });

  it("reads every fixed daily start in one query without articles", async () => {
    const configs = [
      SOURCE,
      ...Array.from({ length: 20 }, (_, index) => dailySource(index)),
    ];
    const store = open(configs, join(directory, "daily.sqlite3"));
    const storeDriver = drivers.at(-1)!;
    await store.initialize();
    await store.ingest(
      SOURCE,
      Array.from({ length: 40 }, (_, index) => ({
        ...ITEM,
        url: `https://example.org/many/${index}`,
      })),
    );
    await store.updateSettings({ autoCollect: true, autoAnalyze: true });
    await store.updateSource("daily-3", { enabled: false });
    now = ELEVEN + 60;
    // Started today: not due. Expired or started yesterday: due again.
    for (const index of [0, 5, 19])
      await store.putRecord("crawl_source", `daily-${index}`, {
        last_requested: ELEVEN,
      });
    await store.putRecord(
      "crawl_source",
      "daily-7",
      { last_requested: ELEVEN },
      { expiresAt: now + 60 },
    );
    await store.putRecord("crawl_source", "daily-8", {
      last_requested: ELEVEN - 86400,
    });
    now += 60;
    // Keep the expired row on disk so the batched read must filter it out.
    expect(
      storeDriver.db
        .prepare(
          "SELECT COUNT(*) AS count FROM news_records WHERE namespace='crawl_source' AND key='daily-7'",
        )
        .get()?.count,
    ).toBe(1);
    const seen = trace(storeDriver);
    const job = await store.queueAutomaticJob(true);
    const expected = configs
      .map(({ id }) => id)
      .filter(
        (id) =>
          id.startsWith("daily-") &&
          !["daily-0", "daily-3", "daily-5", "daily-19"].includes(id),
      );
    expect(job).toMatchObject({
      kind: "collect",
      automatic: true,
      dailyCollectionAt: ELEVEN,
      workIds: expected,
    });
    const records = seen.filter(({ sql }) => sql.includes("news_records"));
    expect(records).toHaveLength(1);
    // Four unexpired starts of active candidates, not the expired one.
    expect(records[0]?.rows).toBe(4);
    expect(articleRows(seen)).toBe(0);
    // Snapshot, daily starts, and one compare-and-write: previously 20 more.
    expect(new Set(seen.map(({ batch }) => batch)).size).toBe(3);
  });

  it("queries no records without daily candidates and only pending articles", async () => {
    await repo.ingest(
      SOURCE,
      Array.from({ length: 30 }, (_, index) => ({
        ...ITEM,
        url: `https://example.org/many/${index}`,
        publishedAt: published(-(index + 1) * 60),
      })),
    );
    const articles = (await repo.articles()).sort((a, b) =>
      a.publishedAt! < b.publishedAt! ? -1 : 1,
    );
    for (const article of articles.slice(3)) await analyze(article.id, {});
    await repo.updateSettings({ autoCollect: true, autoAnalyze: true });
    await repo.putRecord("scheduler", "collection", { nextAt: now + 60 });
    const seen = trace(driver);
    const job = await repo.queueAutomaticJob(true);
    expect(job?.articleIds).toEqual(
      articles
        .slice(0, 3)
        .reverse()
        .map(({ id }) => id),
    );
    expect(seen.some(({ sql }) => sql.includes("crawl_source"))).toBe(false);
    // Only the regular collection and analysis pause records.
    const records = seen.filter(({ sql }) => sql.includes("news_records"));
    expect(records.map(({ sql }) => sql.includes("key=?"))).toEqual([
      true,
      true,
    ]);
    expect(articleRows(seen)).toBe(3);
  });

  it("does not read articles while a job runs or analysis is paused", async () => {
    await repo.ingest(SOURCE, [ITEM]);
    await repo.updateSettings({ autoAnalyze: true });
    await repo.putRecord("scheduler", "analysis", { nextAt: now + 60 });
    const seen = trace(driver);
    expect(await repo.queueAutomaticJob(true)).toBeNull();
    await repo.queueJob("collect");
    expect(await repo.queueAutomaticJob(true)).toBeNull();
    expect(articleRows(seen)).toBe(0);
    expect(seen.some(({ sql }) => sql.includes("news_articles"))).toBe(false);
  });

  it("retries a decision whose lazy article read saw a concurrent change", async () => {
    await repo.ingest(SOURCE, [
      ITEM,
      { ...ITEM, url: "https://example.org/b", publishedAt: published(-60) },
    ]);
    const [first, second] = await repo.articles();
    await repo.updateSettings({ autoAnalyze: true });
    const other = open();
    let reads = 0;
    intercept(driver, async (original, statements) => {
      if (statements[0]?.[0].includes("analysisStatus") && (reads += 1) === 1) {
        // Between the snapshot and its compare-and-write.
        const rubric = (await other.settings()).rubric;
        const target = await other.article(first!.id);
        await other.analyzeResult(
          target.id,
          await other.evidenceHash(target),
          rubric,
          { analysisStatus: "done" },
        );
      }
      return original(statements);
    });
    const job = await repo.queueAutomaticJob(true);
    expect(reads).toBe(2);
    expect(job?.articleIds).toEqual([second!.id]);
  });

  it("yields to a manual job queued during the lazy article read", async () => {
    await repo.ingest(SOURCE, [ITEM]);
    await repo.updateSettings({ autoAnalyze: true });
    const other = open();
    let manual: Job | null = null;
    intercept(driver, async (original, statements) => {
      if (statements[0]?.[0].includes("analysisStatus") && !manual)
        manual = await other.queueJob("collect");
      return original(statements);
    });
    expect(await repo.queueAutomaticJob(true)).toBeNull();
    expect((await repo.getJob()).id).toBe(manual!.id);
  });

  it("saves a result reading at most the target and its relation", async () => {
    await repo.ingest(
      SOURCE,
      Array.from({ length: 50 }, (_, index) => ({
        ...ITEM,
        url: `https://example.org/many/${index}`,
      })),
    );
    const [target, related] = await repo.articles();
    const others = new Map(
      driver.db
        .prepare("SELECT id,data FROM news_articles WHERE id NOT IN (?,?)")
        .all(target!.id, related!.id)
        .map((row) => [String(row.id), String(row.data)]),
    );
    await repo.review(target!.id, "saved");
    const seen = trace(driver);
    expect(
      await analyze(
        target!.id,
        { relatedArticleId: related!.id, relation: "duplicate" },
        await repo.evidenceHash(related!),
      ),
    ).toBe(true);
    const saves = seen.filter(({ sql }) => sql.startsWith(SCOPED));
    expect(saves.map(({ rows }) => rows)).toEqual([2]);
    expect(
      seen.some(({ sql }) => sql === "SELECT id,data FROM news_articles"),
    ).toBe(false);
    expect(await repo.article(target!.id)).toMatchObject({
      analysisStatus: "done",
      reviewStatus: "saved",
      relatedArticleId: related!.id,
    });
    seen.length = 0;
    expect(await analyze(related!.id, {})).toBe(true);
    expect(
      seen.filter(({ sql }) => sql.startsWith(SCOPED)).map(({ rows }) => rows),
    ).toEqual([1]);
    expect(
      new Map(
        driver.db
          .prepare("SELECT id,data FROM news_articles WHERE id NOT IN (?,?)")
          .all(target!.id, related!.id)
          .map((row) => [String(row.id), String(row.data)]),
      ),
    ).toEqual(others);
    await expect(
      repo.analyzeResult("missing", "hash", NEW_RUBRIC, {
        analysisStatus: "done",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it.each(["rubric", "target", "related", "deleted"])(
    "rejects a result after a concurrent change of %s",
    async (change) => {
      await repo.ingest(SOURCE, [
        ITEM,
        { ...ITEM, url: "https://example.org/b" },
      ]);
      const target = await find(ITEM.url);
      const related = await find("https://example.org/b");
      const rubric = (await repo.settings()).rubric;
      const hash = await repo.evidenceHash(target);
      const relationHash = await repo.evidenceHash(related);
      const other = open();
      let loads = 0;
      intercept(driver, async (original, statements) => {
        const results = await original(statements);
        if (
          statements.some(([sql]) => sql.startsWith(SCOPED)) &&
          (loads += 1) === 1
        ) {
          if (change === "rubric")
            await other.updateSettings({ rubric: NEW_RUBRIC });
          else if (change === "target")
            await other.ingest(SOURCE, [{ ...ITEM, title: "新しい見出し" }]);
          else if (change === "related")
            await other.ingest(SOURCE, [
              { ...ITEM, url: "https://example.org/b", title: "続報" },
            ]);
          else {
            driver.db.exec("UPDATE news_meta SET revision=revision+1");
            driver.db
              .prepare("DELETE FROM news_articles WHERE id=?")
              .run(related.id);
          }
        }
        return results;
      });
      expect(
        await repo.analyzeResult(
          target.id,
          hash,
          rubric,
          {
            analysisStatus: "done",
            relatedArticleId: related.id,
            relation: "duplicate",
          },
          relationHash,
        ),
      ).toBe(false);
      expect(loads).toBe(2);
      expect((await repo.article(target.id)).analysisStatus).toBe("pending");
    },
  );
});

describe("settings, listing and review", () => {
  it("validates settings atomically", async () => {
    const before = await repo.settings();
    const version = await repo.stateVersion();
    await expect(
      repo.updateSettings({ autoCollect: true, pollMinutes: 0 }),
    ).rejects.toBeInstanceOf(UserError);
    await expect(repo.updateSettings({ unknown: true })).rejects.toThrow(
      "未対応の設定項目です",
    );
    await expect(
      repo.updateSettings({ rubric: "　短い基準　" }),
    ).rejects.toThrow("選定基準は10〜8000文字で入力してください");
    await expect(repo.updateSettings({ pollMinutes: 15.5 })).rejects.toThrow(
      "収集間隔は15〜1440分にしてください",
    );
    await expect(repo.updateSettings({ autoPost: 1 })).rejects.toThrow(
      "自動実行の設定が不正です",
    );
    await expect(repo.updateSettings({ autoAnalyze: "true" })).rejects.toThrow(
      "自動実行の設定が不正です",
    );
    await expect(repo.updateSettings({ autoAnalyze: null })).rejects.toThrow(
      "自動実行の設定が不正です",
    );
    await expect(repo.updateSettings({ postSelection: "all" })).rejects.toThrow(
      "自動投稿の対象が不正です",
    );
    expect(await repo.settings()).toEqual(before);
    expect(await repo.stateVersion()).toBe(version);
  });

  it("delays the first automatic post by an hour after enabling", async () => {
    expect(POST_INTERVAL_SECONDS).toBe(3600);
    await repo.updateSettings({ autoPost: true });
    expect((await repo.publicationState()).nextAt).toBe(now + 3600);
    await repo.updateSettings({ autoPost: false });
    now += 100;
    await repo.updateSettings({ autoPost: true });
    expect((await repo.publicationState()).nextAt).toBe(now + 3600);
  });

  it("makes bounded listing explicit", async () => {
    await candidate();
    now += 1;
    await candidate({ url: "https://example.org/b" });
    expect((await repo.articles()).map((article) => article.url)).toEqual([
      "https://example.org/b",
      ITEM.url,
    ]);
    expect(await repo.articles(1, 1)).toHaveLength(1);
    expect(await repo.articles(0)).toEqual([]);
    await expect(repo.articles(-1)).rejects.toThrow("記事の取得範囲が不正です");
    await expect(repo.articles(1, 0.5)).rejects.toThrow(
      "記事の取得範囲が不正です",
    );
  });

  it("rejects unknown review states and articles", async () => {
    const articleId = await candidate();
    await expect(repo.review(articleId, "deleted")).rejects.toThrow(
      "記事の状態が不正です",
    );
    await expect(repo.review("missing", "saved")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(repo.article("missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("bulk dismissal", () => {
  it("dismisses only selected articles together and deduplicates IDs", async () => {
    const first = await candidate();
    const second = await candidate({ url: "https://example.org/b" });
    const other = await candidate({ url: "https://example.org/c" });
    await repo.review(second, "unread");
    const version = await repo.stateVersion();
    const result = await repo.dismiss([first, second, first]);
    expect(result.map((article) => article.id)).toEqual([first, second]);
    for (const id of [first, second]) {
      const article = await repo.article(id);
      expect(article.reviewStatus).toBe("dismissed");
      expect(Date.parse(article.reviewedAt!)).toBe(now * 1000);
    }
    expect((await repo.article(other)).reviewStatus).toBe("saved");
    expect(await repo.stateVersion()).toBe(version + 1);
    expect((await repo.postCandidates()).map((article) => article.id)).toEqual([
      other,
    ]);
  });

  it.each([undefined, null, [], "all", [42], ["invalid"]])(
    "rejects invalid selection %j without writing",
    async (ids) => {
      const version = await repo.stateVersion();
      await expect(repo.dismiss(ids)).rejects.toBeInstanceOf(UserError);
      expect(await repo.stateVersion()).toBe(version);
    },
  );

  it("does not partially dismiss when an article is missing or already posted", async () => {
    const first = await candidate();
    const posted = await candidate({ url: "https://example.org/posted" });
    await repo.review(posted, "posted");
    const before = await repo.articles();
    const version = await repo.stateVersion();
    await expect(repo.dismiss([first, "f".repeat(24)])).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(repo.dismiss([first, posted])).rejects.toThrow("投稿済み");
    expect(await repo.articles()).toEqual(before);
    expect(await repo.stateVersion()).toBe(version);
  });

  it.each(["publishing", "submitted", "unknown", "failed"] as const)(
    "leaves every selected article unchanged when one post is %s",
    async (status) => {
      const blocked = await ready();
      const first = await candidate({
        url: "https://example.org/b",
        publishedAt: published(-7260),
      });
      const attempt = await claim();
      expect(attempt.articleId).toBe(blocked);
      if (status === "submitted")
        await repo.submitPost(
          blocked,
          "buffer",
          "channel",
          now,
          attempt.claimToken,
        );
      else if (status !== "publishing")
        await repo.finishPost(blocked, status, {
          timestamp: now,
          claimToken: attempt.claimToken,
        });
      const before = await repo.articles();
      const version = await repo.stateVersion();
      await expect(repo.dismiss([first, blocked])).rejects.toThrow(
        "投稿結果の確認",
      );
      expect(await repo.articles()).toEqual(before);
      expect(await repo.stateVersion()).toBe(version);
    },
  );

  it("rechecks publication after a concurrent claim wins", async () => {
    const blocked = await ready();
    const first = await candidate({
      url: "https://example.org/b",
      publishedAt: published(-7260),
    });
    const [loser, loserDriver] = connect();
    const [paused, release] = signal();
    const [read, reading] = signal();
    let snapshots = 0;
    intercept(loserDriver, async (original, statements) => {
      const result = await original(statements);
      if (
        statements.some(([sql]) =>
          sql.includes("SELECT id,data FROM news_articles WHERE"),
        ) &&
        ++snapshots === 1
      ) {
        reading();
        await paused;
      }
      return result;
    });
    const pending = loser
      .dismiss([first, blocked])
      .catch((error: unknown) => error);
    await read;
    const attempt = await claim();
    expect(attempt.articleId).toBe(blocked);
    release();
    expect(await pending).toMatchObject({
      message: expect.stringContaining("投稿結果の確認"),
    });
    for (const id of [first, blocked])
      expect((await repo.article(id)).reviewStatus).toBe("saved");
  });
});

describe("publication", () => {
  it("applies the one hour gate to rounds and posts a round one at a time", async () => {
    const articleId = await ready();
    const secondId = await candidate({
      url: "https://example.org/b",
      publishedAt: published(-7260),
    });
    const opened = now;
    const attempt = await claim();
    expect(attempt.articleId).toBe(articleId);
    expect(attempt.text).toContain(ITEM.url);
    // The next post of the round waits for this one to be confirmed.
    expect(await repo.claimPost(now)).toBeNull();
    await expect(repo.review(articleId, "dismissed")).rejects.toBeInstanceOf(
      UserError,
    );
    await expect(repo.resolvePost(articleId, "not_posted")).rejects.toThrow(
      "投稿処理の状態が変わりました",
    );
    await repo.submitPost(
      articleId,
      "buffer",
      "channel",
      now,
      attempt.claimToken,
    );
    expect(await repo.claimPost(now)).toBeNull();
    now += 120;
    await repo.finishPost(articleId, "posted", {
      postId: "123",
      timestamp: now,
      claimToken: attempt.claimToken,
    });
    expect((await repo.article(articleId)).reviewStatus).toBe("posted");
    expect((await repo.publicationState()).posts[0]).toMatchObject({
      status: "posted",
      postId: "123",
      bufferId: "buffer",
    });
    // The rest of the round is due at once, not an hour after each post.
    expect((await repo.publicationState()).nextAt).toBe(now);
    const second = await claim();
    expect(second.articleId).toBe(secondId);
    await repo.finishPost(secondId, "posted", {
      timestamp: now,
      claimToken: second.claimToken,
    });
    // News arriving during the round waits for the next one.
    const thirdId = await candidate({ url: "https://example.org/c" });
    expect((await repo.publicationState()).nextAt).toBe(opened + 3600);
    expect(await repo.claimPost(opened + 3599)).toBeNull();
    expect((await claim(opened + 3600)).articleId).toBe(thirdId);
  });

  it("shrinks an open round to its current candidates", async () => {
    const first = await ready();
    const second = await candidate({
      url: "https://example.org/b",
      publishedAt: published(-7260),
    });
    const third = await candidate({
      url: "https://example.org/c",
      publishedAt: published(-7320),
    });
    const opened = now;
    const attempt = await claim();
    expect(stored(driver.db, "state").get("publication_batch")).toEqual({
      articleIds: [first, second, third],
      openedAt: opened,
    });
    await repo.finishPost(first, "posted", {
      timestamp: now,
      claimToken: attempt.claimToken,
    });
    await repo.review(second, "dismissed");
    now += 60;
    const next = await claim();
    expect(next.articleId).toBe(third);
    expect(stored(driver.db, "state").get("publication_batch")).toEqual({
      articleIds: [third],
      openedAt: opened,
    });
    await repo.finishPost(third, "posted", {
      timestamp: now,
      claimToken: next.claimToken,
    });
    expect(stored(driver.db, "state").get("publication_batch")).toEqual({
      articleIds: [],
      openedAt: 0,
    });
    // An exhausted round still holds the next one back until it is due.
    const fourth = await candidate({ url: "https://example.org/d" });
    expect(await repo.claimPost(now)).toBeNull();
    expect(await repo.claimPost(opened + 3599)).toBeNull();
    expect((await claim(opened + 3600)).articleId).toBe(fourth);
  });

  it("preserves the next hourly start even if every original article is withdrawn", async () => {
    const first = await ready();
    const opened = now;
    const attempt = await claim();
    // Dismissed during the account check, before the send was authorized.
    driver.db
      .prepare(
        "UPDATE news_articles SET data=json_set(data,'$.reviewStatus','dismissed') WHERE id=?",
      )
      .run(first);
    expect(await repo.authorizePostSend(first, attempt.claimToken, now)).toBe(
      false,
    );
    expect((await repo.publicationState()).posts).toEqual([]);
    const second = await candidate({ url: "https://example.org/b" });
    now += 60;
    expect(await repo.claimPost(now)).toBeNull();
    expect(stored(driver.db, "state").get("schedule")).toEqual({
      next_at: opened + POST_INTERVAL_SECONDS,
    });
    now = opened + POST_INTERVAL_SECONDS;
    expect((await claim()).articleId).toBe(second);
  });

  it("anchors the round and its full claim lease to the actual clock of a delayed tick", async () => {
    const articleId = await ready();
    const stale = now;
    now += 601;
    const attempt = await claim(stale);
    const post = stored(driver.db, "posts").get(articleId);
    expect(post?.claim_expires_at).toBe(now + 600);
    expect(Date.parse(String(post?.attempted_at)) / 1000).toBe(now);
    expect(stored(driver.db, "state").get("publication_batch")?.openedAt).toBe(
      now,
    );
    expect(stored(driver.db, "state").get("schedule")?.next_at).toBe(
      now + POST_INTERVAL_SECONDS,
    );
    expect(
      await repo.authorizePostSend(articleId, attempt.claimToken, now),
    ).toBe(true);
  });

  it("holds back the next round after a round that sent from a stale tick", async () => {
    const first = await ready();
    const second = await candidate({
      url: "https://example.org/b",
      publishedAt: published(-7260),
    });
    const third = await candidate({
      url: "https://example.org/c",
      publishedAt: published(-7320),
    });
    const opened = now;
    const dismiss = (articleId: string) =>
      driver.db
        .prepare(
          "UPDATE news_articles SET data=json_set(data,'$.reviewStatus','dismissed') WHERE id=?",
        )
        .run(articleId);
    const withdrawn = await claim();
    dismiss(first);
    expect(await repo.authorizePostSend(first, withdrawn.claimToken, now)).toBe(
      false,
    );
    now += 60;
    // A tick that started before the round opened claims its next article.
    const attempt = await claim(opened - 30);
    expect(attempt.articleId).toBe(second);
    await repo.finishPost(second, "posted", {
      timestamp: now,
      claimToken: attempt.claimToken,
    });
    await repo.review(third, "dismissed");
    await candidate({ url: "https://example.org/d" });
    expect(await repo.claimPost(now)).toBeNull();
    expect(stored(driver.db, "state").get("schedule")).toEqual({
      next_at: opened + POST_INTERVAL_SECONDS,
    });
  });

  it("discards an open round when posting is switched off", async () => {
    const first = await ready();
    await candidate({
      url: "https://example.org/b",
      publishedAt: published(-7260),
    });
    const attempt = await claim();
    await repo.finishPost(first, "posted", {
      timestamp: now,
      claimToken: attempt.claimToken,
    });
    await repo.updateSettings({ autoPost: false });
    expect(stored(driver.db, "state").get("publication_batch")).toEqual({
      articleIds: [],
      openedAt: 0,
    });
    await repo.updateSettings({ autoPost: true });
    expect(await repo.claimPost(now)).toBeNull();
    expect((await repo.publicationState()).nextAt).toBe(
      now + POST_INTERVAL_SECONDS,
    );
  });

  it("expires only stale claims and fences a late sender", async () => {
    const articleId = await ready();
    const attempt = await claim();
    expect(await repo.recoverPosts(now + 599)).toBe(0);
    expect(await repo.recoverPosts(now + 600)).toBe(1);
    expect((await repo.settings()).autoPost).toBe(false);
    await expect(repo.updateSettings({ autoPost: true })).rejects.toThrow(
      "投稿結果を確認し、保留中の記事を解決してから有効にしてください",
    );
    await repo.resolvePost(articleId, "not_posted");
    now += 3600;
    await repo.updateSettings({ autoPost: true });
    now += 3600;
    const newer = await claim();
    expect(newer.claimToken).not.toBe(attempt.claimToken);
    await expect(
      repo.submitPost(articleId, "old", "channel", now, attempt.claimToken),
    ).rejects.toBeInstanceOf(UserError);
    await expect(
      repo.finishPost(articleId, "posted", { claimToken: attempt.claimToken }),
    ).rejects.toBeInstanceOf(UserError);
    expect((await repo.publicationState()).posts[0]?.status).toBe("publishing");
  });

  it("requires confirmation after a crash during send", async () => {
    const articleId = await ready();
    await claim();
    const other = open();
    now += 600;
    expect(await other.recoverPosts()).toBe(1);
    expect((await other.settings()).autoPost).toBe(false);
    expect((await other.publicationState()).posts[0]?.status).toBe("unknown");
    expect((await other.article(articleId)).reviewStatus).toBe("saved");
    expect(await other.claimPost(99999)).toBeNull();
  });

  it("keeps the confirmation budget in a new repository", async () => {
    const articleId = await ready();
    const attempt = await claim();
    await repo.submitPost(
      articleId,
      "buffer",
      "channel",
      now,
      attempt.claimToken,
    );
    // Recovery only expires sending claims; a submitted Buffer post keeps its identity.
    expect(await repo.recoverPosts(now + 100000)).toBe(0);
    expect(await repo.claimPostCheck(now + 119)).toBeNull();
    expect((await repo.claimPostCheck(now + 120))?.check_count).toBe(0);
    const other = open();
    expect(await other.claimPostCheck(now + 121)).toBeNull();
    expect(await other.claimPostCheck(now + 239)).toBeNull();
    expect((await other.claimPostCheck(now + 240))?.check_count).toBe(1);
    await expect(
      other.resolvePost(articleId, "not_posted"),
    ).rejects.toBeInstanceOf(UserError);
    expect(await other.claimPostCheck(now + 359)).toBeNull();
    expect(await other.claimPostCheck(now + 360)).toBeNull();
    expect((await other.publicationState()).posts[0]).toMatchObject({
      status: "unknown",
      error:
        "Buffer の投稿完了を確認できません。Buffer と X を確認してください",
    });
    expect((await other.settings()).autoPost).toBe(false);
    expect(await other.claimPostCheck(now + 100000)).toBeNull();
  });

  it("confirms a submitted post while automation is disabled", async () => {
    const articleId = await ready();
    const attempt = await claim();
    await repo.submitPost(
      articleId,
      "buffer",
      "channel",
      now,
      attempt.claimToken,
    );
    await repo.updateSettings({ autoPost: false });
    const check: Post | null = await repo.claimPostCheck(now + 120);
    expect(check).toMatchObject({
      article_id: articleId,
      buffer_id: "buffer",
      channel_id: "channel",
      claim_token: attempt.claimToken,
    });
    await repo.finishPost(articleId, "posted", {
      postId: "1",
      timestamp: now + 125,
    });
    expect((await repo.article(articleId)).reviewStatus).toBe("posted");
    expect((await repo.settings()).autoPost).toBe(false);
  });

  it("pauses on an uncertain result until explicit reconciliation", async () => {
    const articleId = await ready();
    const attempt = await claim();
    await repo.finishPost(articleId, "unknown", {
      error: "結果不明",
      claimToken: attempt.claimToken,
    });
    expect((await repo.settings()).autoPost).toBe(false);
    expect((await repo.article(articleId)).reviewStatus).toBe("saved");
    await expect(
      repo.updateSettings({ autoPost: true }),
    ).rejects.toBeInstanceOf(UserError);
    await expect(repo.resolvePost(articleId, "maybe")).rejects.toThrow(
      "X で確認した投稿結果を指定してください",
    );
    await repo.resolvePost(articleId, "posted");
    expect((await repo.article(articleId)).reviewStatus).toBe("posted");
    expect(await repo.postCandidates()).toEqual([]);
  });

  it("requeues a failed post after manual confirmation without re-enabling", async () => {
    const articleId = await ready();
    const attempt = await claim();
    await repo.finishPost(articleId, "failed", {
      error: "wrong account",
      claimToken: attempt.claimToken,
    });
    expect((await repo.publicationState()).posts[0]?.status).toBe("failed");
    const state = await repo.resolvePost(articleId, "not_posted");
    expect(state.posts).toEqual([]);
    expect((await repo.settings()).autoPost).toBe(false);
    expect((await repo.postCandidates())[0]?.id).toBe(articleId);
  });

  it("makes an invalid draft visible and pauses", async () => {
    await candidate({ url: "https://localhost/a" });
    await repo.updateSettings({ autoPost: true });
    now += 3600;
    expect(await repo.claimPost(now)).toBeNull();
    expect((await repo.settings()).autoPost).toBe(false);
    const [post] = (await repo.publicationState()).posts;
    expect(post?.status).toBe("failed");
    expect(post?.error).toBeTruthy();
  });

  it("selects candidates by setting and excludes blocked kinds", async () => {
    const add = async (
      index: number,
      status: string,
      analysis?: Partial<Article>,
    ): Promise<string> => {
      const url = `https://example.org/article/${index}`;
      // A later index is published later.
      await repo.ingest(SOURCE, [
        { ...ITEM, url, publishedAt: published((index - 10) * 60) },
      ]);
      const { id } = await find(url);
      await repo.review(id, status);
      if (analysis) await analyze(id, analysis);
      return id;
    };
    const saved = await add(1, "saved");
    const chosen = await add(2, "unread", { decision: "candidate" });
    await add(3, "dismissed", { decision: "candidate" });
    await add(4, "posted", { decision: "candidate" });
    await add(5, "unread", {
      analysisStatus: "pending",
      decision: "candidate",
    });
    await add(6, "unread", { analysisStatus: "error", decision: "candidate" });
    await add(7, "unread", { decision: "review" });
    await add(8, "saved", { decision: "candidate", relation: "duplicate" });
    await add(9, "unread", { decision: "irrelevant" });
    for (const [selection, ids] of [
      ["saved", [saved]],
      ["candidates", [chosen]],
      ["both", [chosen, saved]],
    ] as const) {
      await repo.updateSettings({ postSelection: selection });
      expect(
        (await repo.postCandidates()).map((article) => article.id),
      ).toEqual(ids);
    }
    await repo.updateSettings({
      rubric: NEW_RUBRIC,
      postSelection: "candidates",
    });
    expect(await repo.postCandidates()).toEqual([]);
  });

  it("selects the three associations' articles regardless of Jev", async () => {
    const rifle = { ...SOURCE, id: "riflesports-news" };
    const clay = { ...SOURCE, id: "clay-shooting-news" };
    // A later index is published later.
    const stamp = (index: number) => published((index - 20) * 60);
    const add = async (
      index: number,
      source: SourceConfig,
      status: string,
      analysis?: Partial<Article>,
      changes: Partial<CollectedItem> = {},
    ): Promise<string> => {
      const url = `https://example.org/article/${index}`;
      await repo.ingest(source, [
        { ...ITEM, ...changes, url, publishedAt: stamp(index) },
      ]);
      const { id } = await find(url);
      await repo.review(id, status);
      if (analysis) await analyze(id, analysis);
      return id;
    };
    const pending = await add(1, rifle, "unread");
    const failed = await add(2, clay, "unread", { analysisStatus: "error" });
    const irrelevant = await add(3, rifle, "unread", {
      decision: "irrelevant",
    });
    const duplicate = await add(4, clay, "unread", {
      decision: "candidate",
      relation: "duplicate",
    });
    // Collected first by an ordinary source, then by a federation source.
    const shared = await add(5, SOURCE, "unread", { decision: "irrelevant" });
    await repo.ingest(clay, [
      { ...ITEM, url: "https://example.org/article/5", publishedAt: stamp(5) },
    ]);
    expect((await repo.article(shared)).sourceIds).toEqual([
      "one",
      "clay-shooting-news",
    ]);
    const saved = await add(6, rifle, "saved", {
      decision: "review",
      relation: "duplicate",
    });
    // Neither a similar ID nor a federation name elsewhere qualifies.
    await add(7, { ...SOURCE, id: "riflesports-news-archive" }, "unread", {
      decision: "irrelevant",
    });
    await add(
      8,
      { ...SOURCE, name: "日本クレー射撃協会" },
      "unread",
      { decision: "review" },
      { title: "日本ライフル射撃協会 riflesports-news" },
    );
    await add(9, SOURCE, "saved", {
      decision: "candidate",
      relation: "duplicate",
    });
    await add(10, rifle, "dismissed");
    await add(11, clay, "posted");
    const gibier = await add(12, { ...SOURCE, id: "gibier-news" }, "unread", {
      decision: "irrelevant",
      relation: "duplicate",
    });
    await add(
      13,
      { ...SOURCE, id: "gibier-news-archive", name: "日本ジビエ振興協会" },
      "unread",
    );
    // Newest publication first.
    const ruled = [
      gibier,
      saved,
      shared,
      duplicate,
      irrelevant,
      failed,
      pending,
    ];
    for (const [selection, ids] of [
      ["saved", [saved]],
      ["candidates", ruled],
      ["both", ruled],
    ] as const) {
      await repo.updateSettings({ postSelection: selection });
      expect(
        (await repo.postCandidates()).map((article) => article.id),
      ).toEqual(ids);
    }
    // Jev keeps its own result: the rule neither fakes nor overwrites it.
    expect(await repo.article(pending)).toMatchObject({
      analysisStatus: "pending",
      decision: null,
    });
    expect(await repo.article(irrelevant)).toMatchObject({
      analysisStatus: "done",
      decision: "irrelevant",
    });
    expect((await repo.settings()).autoPost).toBe(false);
  });

  it("does not read articles during an idle posting tick", async () => {
    await ready();
    await repo.updateSettings({ autoPost: false });
    const queries: string[] = [];
    intercept(driver, (original, statements) => {
      queries.push(...statements.map(([sql]) => sql));
      return original(statements);
    });
    expect(await repo.claimPost(now)).toBeNull();
    expect(await repo.claimPostCheck(now)).toBeNull();
    expect(await repo.recoverPosts(now)).toBe(0);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((sql) => sql.includes("news_articles"))).toBe(false);
  });
});

describe("publication freshness", () => {
  const DAY = 86400;

  it("never adds a stale story but keeps undated, invalid and future ones for review", async () => {
    const at = (url: string, publishedAt: string | null): CollectedItem => ({
      ...ITEM,
      url: `https://example.org/${url}`,
      publishedAt,
    });
    expect(
      await repo.ingest(SOURCE, [
        at("edge", published(-DAY)),
        at("stale", published(-DAY - 1)),
        at("unknown", null),
        at("invalid", "2026-02-30T00:00:00Z"),
        at("zoneless", "1970-01-01T02:00:00"),
        at("future", published(1)),
      ]),
    ).toBe(5);
    const urls = (await repo.articles()).map(({ url }) => url).sort();
    expect(urls).toEqual(
      ["edge", "future", "invalid", "unknown", "zoneless"].map(
        (url) => `https://example.org/${url}`,
      ),
    );
    await repo.updateSettings({ autoAnalyze: true });
    const job = await repo.queueAutomaticJob(true);
    expect(job?.articleIds).toEqual([
      (await find("https://example.org/edge")).id,
    ]);
  });

  it("keeps the earliest valid publication time of an existing article", async () => {
    const articleId = await candidate();
    expect(await analyze(articleId, { decision: "candidate" })).toBe(true);
    const aggregator = { ...SOURCE, id: "aggregator", name: "Aggregator" };
    // A later update time from the owner or anyone else never moves it forward.
    for (const source of [SOURCE, aggregator])
      await repo.ingest(source, [{ ...ITEM, publishedAt: published(-60) }]);
    expect(await repo.article(articleId)).toMatchObject({
      publishedAt: ITEM.publishedAt,
      analysisStatus: "done",
    });
    // The same instant in another format is not a change.
    await repo.ingest(SOURCE, [
      { ...ITEM, publishedAt: "1970-01-01T09:46:40+09:00" },
    ]);
    expect((await repo.article(articleId)).publishedAt).toBe(ITEM.publishedAt);
    // An earlier time from any source is kept, and re-evaluated.
    await repo.ingest(aggregator, [{ ...ITEM, publishedAt: published(-9000) }]);
    expect(await repo.article(articleId)).toMatchObject({
      publishedAt: published(-9000),
      analysisStatus: "pending",
    });
  });

  it("corrects missing, invalid and future publication times", async () => {
    const aggregator = { ...SOURCE, id: "aggregator", name: "Aggregator" };
    const url = (name: string) => `https://example.org/${name}`;
    await repo.ingest(SOURCE, [
      { ...ITEM, url: url("unknown"), publishedAt: null },
      { ...ITEM, url: url("invalid"), publishedAt: "not a date" },
      { ...ITEM, url: url("future"), publishedAt: published(DAY) },
    ]);
    // Another invalid text only replaces an invalid one from the owner.
    await repo.ingest(aggregator, [
      { ...ITEM, url: url("invalid"), publishedAt: "still not a date" },
    ]);
    expect((await find(url("invalid"))).publishedAt).toBe("not a date");
    await repo.ingest(aggregator, [
      { ...ITEM, url: url("unknown"), publishedAt: published(-60) },
      { ...ITEM, url: url("invalid"), publishedAt: published(-120) },
      { ...ITEM, url: url("future"), publishedAt: published(-180) },
    ]);
    expect((await find(url("unknown"))).publishedAt).toBe(published(-60));
    expect((await find(url("invalid"))).publishedAt).toBe(published(-120));
    expect((await find(url("future"))).publishedAt).toBe(published(-180));
    // A valid time is never replaced by a missing, invalid or future one.
    await repo.ingest(SOURCE, [
      { ...ITEM, url: url("unknown"), publishedAt: null },
      { ...ITEM, url: url("invalid"), publishedAt: "not a date" },
      { ...ITEM, url: url("future"), publishedAt: published(DAY) },
    ]);
    expect((await find(url("unknown"))).publishedAt).toBe(published(-60));
    expect((await find(url("invalid"))).publishedAt).toBe(published(-120));
    expect((await find(url("future"))).publishedAt).toBe(published(-180));
  });

  it("retains aged-out articles for history but never revives them", async () => {
    const saved = await candidate();
    const rifle = { ...SOURCE, id: "riflesports-news" };
    await repo.ingest(rifle, [{ ...ITEM, url: "https://example.org/rifle" }]);
    const ruled = (await find("https://example.org/rifle")).id;
    await repo.updateSettings({ autoAnalyze: true });
    expect((await repo.postCandidates()).map(({ id }) => id).sort()).toEqual(
      [saved, ruled].sort(),
    );
    now = START + DAY;
    expect(await repo.postCandidates()).toEqual([]);
    expect(await repo.queueAutomaticJob(true)).toBeNull();
    // A re-listing with a new timestamp is neither a new nor a fresh story.
    expect(
      await repo.ingest(SOURCE, [
        { ...ITEM, publishedAt: published(DAY - 60) },
      ]),
    ).toBe(0);
    expect(await repo.article(saved)).toMatchObject({
      publishedAt: ITEM.publishedAt,
      reviewStatus: "saved",
    });
    expect(await repo.articles()).toHaveLength(2);
    expect(await repo.postCandidates()).toEqual([]);
    expect(await repo.queueAutomaticJob(true)).toBeNull();
    // Genuinely recent follow-ups remain automatic.
    await repo.ingest(SOURCE, [
      {
        ...ITEM,
        url: "https://example.org/follow-up",
        publishedAt: published(DAY - 60),
      },
    ]);
    const followUp = (await find("https://example.org/follow-up")).id;
    expect((await repo.queueAutomaticJob(true))?.articleIds).toEqual([
      followUp,
    ]);
  });

  it("excludes undated, invalid and future saved or source-rule articles from posting", async () => {
    const rifle = { ...SOURCE, id: "riflesports-news" };
    for (const [name, publishedAt] of [
      ["unknown", null],
      ["invalid", "2026-13-01T00:00:00Z"],
      ["future", published(DAY)],
    ] as const) {
      await candidate({
        url: `https://example.org/saved-${name}`,
        publishedAt,
      });
      await repo.ingest(rifle, [
        { ...ITEM, url: `https://example.org/rifle-${name}`, publishedAt },
      ]);
    }
    expect(await repo.articles()).toHaveLength(6);
    expect(await repo.postCandidates()).toEqual([]);
    await repo.updateSettings({ autoPost: true });
    now += POST_INTERVAL_SECONDS;
    expect(await repo.claimPost(now)).toBeNull();
  });

  it("reserves no cadence while idle and posts arriving news when due", async () => {
    await repo.updateSettings({ autoPost: true });
    now += 3600;
    const due = (await repo.publicationState()).nextAt;
    expect(await repo.claimPost(now)).toBeNull();
    expect((await repo.publicationState()).nextAt).toBe(due);
    const articleId = await candidate({ publishedAt: published(3000) });
    expect((await claim()).articleId).toBe(articleId);
    // The claim opened a round: its own article is due now, the next round
    // an hour later.
    expect((await repo.publicationState()).nextAt).toBe(now);
    expect(stored(driver.db, "state").get("schedule")).toEqual({
      next_at: now + POST_INTERVAL_SECONDS,
    });
  });

  it("does not claim an article that aged out since it was listed", async () => {
    const articleId = await ready();
    expect((await repo.postCandidates())[0]?.id).toBe(articleId);
    now = START + DAY;
    expect(await repo.claimPost(now)).toBeNull();
    // A stale tick timestamp does not bring it back either.
    expect(await repo.claimPost(START + 3600)).toBeNull();
    expect((await repo.publicationState()).posts).toEqual([]);
  });

  it("authorizes a send only for its own live, enabled and fresh claim", async () => {
    const articleId = await ready();
    const attempt = await claim();
    const version = await repo.stateVersion();
    expect(
      await repo.authorizePostSend(articleId, attempt.claimToken, now),
    ).toBe(true);
    expect(await repo.stateVersion()).toBe(version);
    expect(await repo.authorizePostSend(articleId, "other", now)).toBe(false);
    expect(await repo.authorizePostSend("missing", "", now)).toBe(false);
    expect((await repo.publicationState()).posts[0]).toMatchObject({
      status: "publishing",
      text: attempt.text,
    });
  });

  it("withdraws its own unsent claim when the article ages out before sending", async () => {
    // A previous post stays in the history.
    const first = await ready();
    const sent = await claim();
    await repo.submitPost(first, "buffer-1", "channel", now, sent.claimToken);
    await repo.finishPost(first, "posted", {
      postId: "1",
      timestamp: now,
      claimToken: sent.claimToken,
    });
    const second = await candidate({
      url: "https://example.org/b",
      publishedAt: published(3600 + POST_INTERVAL_SECONDS - DAY + 300),
    });
    now += POST_INTERVAL_SECONDS;
    const attempt = await claim();
    expect(attempt.articleId).toBe(second);
    now += 301;
    expect(await repo.authorizePostSend(second, attempt.claimToken, now)).toBe(
      false,
    );
    const publication = await repo.publicationState();
    expect(publication.posts.map(({ articleId }) => articleId)).toEqual([
      first,
    ]);
    expect(publication.posts[0]?.status).toBe("posted");
    expect(publication.nextAt).toBeLessThanOrEqual(now);
    expect(await repo.article(second)).toMatchObject({ reviewStatus: "saved" });
    expect((await repo.settings()).autoPost).toBe(true);
  });

  it("withdraws its own unsent claim when posting is switched off", async () => {
    const articleId = await ready();
    const attempt = await claim();
    await repo.updateSettings({ autoPost: false });
    expect(
      await repo.authorizePostSend(articleId, attempt.claimToken, now),
    ).toBe(false);
    expect((await repo.publicationState()).posts).toEqual([]);
    expect((await repo.article(articleId)).reviewStatus).toBe("saved");
  });

  describe("withdraws its own unsent claim that is no longer a candidate", () => {
    /** Change a stored article directly, as a concurrent writer would. */
    function edit(articleId: string, field: string, value: string): void {
      driver.db
        .prepare("UPDATE news_articles SET data=json_set(data,?,?) WHERE id=?")
        .run(`$.${field}`, value, articleId);
    }

    async function expectWithdrawn(
      articleId: string,
      claimToken: string,
    ): Promise<void> {
      expect(await repo.authorizePostSend(articleId, claimToken, now)).toBe(
        false,
      );
      const publication = await repo.publicationState();
      expect(publication.posts).toEqual([]);
      expect(publication.nextAt).toBeLessThanOrEqual(now);
      expect((await repo.settings()).autoPost).toBe(true);
    }

    it("after a dismissal", async () => {
      const articleId = await ready();
      const attempt = await claim();
      // The review API refuses while the claim is live; storage still guards it.
      await expect(repo.review(articleId, "dismissed")).rejects.toThrow(
        UserError,
      );
      edit(articleId, "reviewStatus", "dismissed");
      await expectWithdrawn(articleId, attempt.claimToken);
    });

    it("after a saved article returns to unread in saved mode", async () => {
      await repo.updateSettings({ postSelection: "saved" });
      const articleId = await ready();
      const attempt = await claim();
      edit(articleId, "reviewStatus", "unread");
      await expectWithdrawn(articleId, attempt.claimToken);
      expect((await repo.article(articleId)).reviewStatus).toBe("unread");
    });

    it("after the selection switches away from saved articles", async () => {
      const articleId = await ready();
      const attempt = await claim();
      await repo.updateSettings({ postSelection: "candidates" });
      await expectWithdrawn(articleId, attempt.claimToken);
      expect((await repo.article(articleId)).reviewStatus).toBe("saved");
    });

    it("after a rubric change invalidates the candidate decision", async () => {
      await repo.updateSettings({ postSelection: "candidates" });
      await repo.ingest(SOURCE, [ITEM]);
      const articleId = (await find(ITEM.url)).id;
      expect(await analyze(articleId, { decision: "candidate" })).toBe(true);
      await repo.updateSettings({ autoPost: true });
      now += POST_INTERVAL_SECONDS;
      const attempt = await claim();
      expect(attempt.articleId).toBe(articleId);
      await repo.updateSettings({ rubric: NEW_RUBRIC });
      await expectWithdrawn(articleId, attempt.claimToken);
      expect((await repo.article(articleId)).analysisStatus).toBe("pending");
    });

    it("after its draft text changes", async () => {
      const articleId = await ready();
      const attempt = await claim();
      edit(articleId, "title", "シカの出没と対策");
      await expectWithdrawn(articleId, attempt.claimToken);
      // The next claim drafts the current text, never the stale one.
      const next = await claim();
      expect(next.text).toContain("シカの出没と対策");
      expect(next.text).not.toBe(attempt.text);
      expect(
        await repo.authorizePostSend(articleId, next.claimToken, now),
      ).toBe(true);
    });

    it("after it becomes a duplicate", async () => {
      await repo.updateSettings({ postSelection: "candidates" });
      await repo.ingest(SOURCE, [ITEM]);
      const articleId = (await find(ITEM.url)).id;
      expect(await analyze(articleId, { decision: "candidate" })).toBe(true);
      await repo.updateSettings({ autoPost: true });
      now += POST_INTERVAL_SECONDS;
      const attempt = await claim();
      edit(articleId, "relation", "duplicate");
      await expectWithdrawn(articleId, attempt.claimToken);
    });

    it("while another post blocks, keeping that record unchanged", async () => {
      const articleId = await ready();
      const attempt = await claim();
      const otherId = await candidate({ url: "https://example.org/b" });
      const other = {
        article_id: otherId,
        status: "unknown",
        text: "other",
        attempted_at: "2026-01-01T00:00:00+00:00",
        claim_token: "other-token",
        claim_expires_at: 0,
        check_count: 0,
      };
      driver.db
        .prepare("INSERT INTO news_posts(id,data) VALUES (?,?)")
        .run(otherId, JSON.stringify(other));
      expect(
        await repo.authorizePostSend(articleId, attempt.claimToken, now),
      ).toBe(false);
      expect(stored(driver.db, "posts")).toEqual(new Map([[otherId, other]]));
    });
  });

  it("leaves a replaced or expired ineligible claim unchanged", async () => {
    const articleId = await ready();
    const attempt = await claim();
    await repo.updateSettings({ postSelection: "candidates" });
    const before = stored(driver.db, "posts");
    const version = await repo.stateVersion();
    expect(await repo.authorizePostSend(articleId, "replaced", now)).toBe(
      false,
    );
    expect(
      await repo.authorizePostSend(articleId, attempt.claimToken, now + 600),
    ).toBe(false);
    expect(stored(driver.db, "posts")).toEqual(before);
    expect(await repo.stateVersion()).toBe(version);
  });

  it("refuses an expired or already submitted claim without changing it", async () => {
    const articleId = await ready();
    const attempt = await claim();
    expect(
      await repo.authorizePostSend(articleId, attempt.claimToken, now + 600),
    ).toBe(false);
    expect((await repo.publicationState()).posts[0]?.status).toBe("publishing");
    await repo.submitPost(
      articleId,
      "buffer",
      "channel",
      now,
      attempt.claimToken,
    );
    now = START + DAY;
    expect(
      await repo.authorizePostSend(articleId, attempt.claimToken, now),
    ).toBe(false);
    // Aging out never cancels a post already handed to Buffer.
    expect((await repo.claimPostCheck(now))?.article_id).toBe(articleId);
    await repo.finishPost(articleId, "posted", {
      postId: "1",
      claimToken: attempt.claimToken,
    });
    expect((await repo.publicationState()).posts[0]?.status).toBe("posted");
  });
});

describe("races", () => {
  it("gives concurrent claims exactly one winner", async () => {
    await ready();
    await candidate({ url: "https://example.org/b" });
    const [first] = connect();
    const [second] = connect();
    const attempts = await Promise.all([
      first.claimPost(now),
      second.claimPost(now),
    ]);
    expect(attempts.filter((attempt) => attempt !== null)).toHaveLength(1);
    expect((await repo.publicationState()).posts).toHaveLength(1);
  });

  it("opens one round across concurrent claims and never claims twice", async () => {
    const first = await ready();
    const second = await candidate({
      url: "https://example.org/b",
      publishedAt: published(-7260),
    });
    const [one] = connect();
    const [two] = connect();
    const opened = now;
    const attempts = (
      await Promise.all([one.claimPost(now), two.claimPost(now)])
    ).filter((attempt) => attempt !== null);
    expect(attempts.map((attempt) => attempt.articleId)).toEqual([first]);
    expect(stored(driver.db, "state").get("publication_batch")).toEqual({
      articleIds: [first, second],
      openedAt: opened,
    });
    // Neither connection claims the rest while the first is unconfirmed.
    expect(await Promise.all([one.claimPost(now), two.claimPost(now)])).toEqual(
      [null, null],
    );
    await repo.finishPost(first, "posted", {
      timestamp: now,
      claimToken: attempts[0]?.claimToken,
    });
    const next = (
      await Promise.all([one.claimPost(now), two.claimPost(now)])
    ).filter((attempt) => attempt !== null);
    expect(next.map((attempt) => attempt.articleId)).toEqual([second]);
    expect(stored(driver.db, "state").get("schedule")).toEqual({
      next_at: opened + POST_INTERVAL_SECONDS,
    });
  });

  it("never writes a failed compare under another mutation token", async () => {
    const articleId = await candidate();
    const [first] = connect();
    const [second] = connect();
    await Promise.all([
      first.review(articleId, "dismissed"),
      second.ingest(SOURCE, [{ ...ITEM, title: "新しい見出し" }]),
    ]);
    expect(await repo.article(articleId)).toMatchObject({
      title: "新しい見出し",
      reviewStatus: "dismissed",
    });
  });

  it("recomputes the loser from the winner state after a rejected batch", async () => {
    const articleId = await candidate();
    const [loser, loserDriver] = connect();
    const writes: SQLResult[][] = [];
    const [paused, release] = signal();
    const [read, reading] = signal();
    let snapshots = 0;
    intercept(loserDriver, async (original, statements) => {
      const results = await original(statements);
      if (
        statements.some(
          ([sql]) => sql === "SELECT id,data FROM news_articles",
        ) &&
        (snapshots += 1) === 1
      ) {
        reading();
        await paused;
      }
      if (statements[0]?.[0].startsWith("UPDATE news_meta"))
        writes.push(results);
      return results;
    });
    const pending = loser.review(articleId, "dismissed");
    await read;
    await repo.ingest(SOURCE, [{ ...ITEM, title: "勝者の見出し" }]);
    release();
    await pending;
    // The stale batch changed nothing: neither the revision nor any guarded row.
    expect(writes[0]?.every((result) => result.meta.changes === 0)).toBe(true);
    expect(writes[1]?.[0]?.meta.changes).toBe(1);
    expect(await repo.article(articleId)).toMatchObject({
      title: "勝者の見出し",
      reviewStatus: "dismissed",
    });
  });

  it("gives up after sustained contention without partial writes", async () => {
    const articleId = await candidate();
    let attempts = 0;
    intercept(driver, (original, statements) => {
      if (statements[0]?.[0].startsWith("UPDATE news_meta")) {
        attempts += 1;
        driver.db.exec(
          "UPDATE news_meta SET revision=revision+1,token='other' WHERE id=1",
        );
      }
      return original(statements);
    });
    await expect(repo.review(articleId, "dismissed")).rejects.toThrow(
      "同時更新が続いています。時間をおいて再実行してください",
    );
    expect(attempts).toBe(12);
    expect(stored(driver.db, "articles").get(articleId)?.reviewStatus).toBe(
      "saved",
    );
  });

  it("lets disabling win against a stale claim snapshot", async () => {
    await ready();
    const [proceed, release] = signal();
    const [read, reading] = signal();
    intercept(driver, async (original, statements) => {
      const results = await original(statements);
      if (
        statements.some(([sql]) => sql === "SELECT id,data FROM news_articles")
      ) {
        reading();
        await proceed;
      }
      return results;
    });
    const task = repo.claimPost(now);
    await read;
    const other = open();
    try {
      await other.updateSettings({ autoPost: false });
    } finally {
      release();
    }
    expect(await task).toBeNull();
    expect((await other.publicationState()).posts).toEqual([]);
  });

  it("rolls back every statement of a failed batch", async () => {
    await expect(
      driver.batch([
        [
          "INSERT INTO news_records(namespace,key,data,expires) VALUES ('a','b','{}',NULL)",
          [],
        ],
        ["INSERT INTO news_missing VALUES (1)", []],
      ]),
    ).rejects.toThrow();
    expect(await repo.getRecord("a", "b")).toBeNull();
    expect(driver.db.isTransaction).toBe(false);
  });
});

describe("jobs", () => {
  it("fences leases, resumes and releases", async () => {
    await repo.queueJob("collect");
    await expect(repo.queueJob("analyze")).rejects.toThrow(
      "処理中です。完了してから再実行してください",
    );
    const job = await repo.claimJob(now, 10);
    if (!job?.token) throw new Error("expected a job");
    expect(await repo.claimJob(now + 1)).toBeNull();
    await repo.updateJob(job.token, { cursor: 1, workIds: ["one", "two"] });
    await expect(
      repo.updateJob(job.token, { token: "stolen" }),
    ).rejects.toThrow("処理の所有権は変更できません");
    now += 10;
    await expect(repo.finishJob(job.token)).rejects.toThrow(
      "処理の有効期限または所有権が変わりました",
    );
    const next = await repo.claimJob(now);
    if (!next?.token) throw new Error("expected a job");
    expect(next.cursor).toBe(1);
    expect(next.token).not.toBe(job.token);
    await expect(
      repo.updateJob(job.token, { cursor: 99 }),
    ).rejects.toBeInstanceOf(UserError);
    await repo.releaseJob(next.token, { cursor: 2 });
    const final = await repo.claimJob(now);
    if (!final?.token) throw new Error("expected a job");
    expect(final.cursor).toBe(2);
    await repo.finishJob(final.token, { phase: "完了" });
    expect(await repo.getJob()).toMatchObject({
      running: false,
      token: null,
      leaseUntil: 0,
      phase: "完了",
      lastFinishedAt: "1970-01-01T02:46:50+00:00",
    });
    await expect(repo.finishJob(final.token)).rejects.toBeInstanceOf(UserError);
  });

  it("validates job requests", async () => {
    await expect(repo.queueJob("delete")).rejects.toThrow(
      "処理の種類が不正です",
    );
    await expect(
      repo.queueJob("analyze", [1] as unknown as string[]),
    ).rejects.toThrow("記事の指定が不正です");
    await expect(
      repo.queueJob(
        "analyze",
        Array.from({ length: 101 }, (_, index) => String(index)),
      ),
    ).rejects.toThrow("記事は100件以内で指定してください");
    await expect(repo.claimJob(now, 0)).rejects.toThrow("処理の期限が不正です");
    expect(await repo.claimJob(now)).toBeNull();
    const job = await repo.queueJob("analyze", ["a"]);
    expect(job).toMatchObject({
      kind: "analyze",
      articleIds: ["a"],
      phase: "仕分けの準備中",
      queuedAt: "1970-01-01T02:46:40+00:00",
    });
  });
});

describe("records, host leases and blobs", () => {
  it("fences host pacing and expires records", async () => {
    const token = await repo.acquireHost("example.org", now, 10);
    if (!token) throw new Error("expected a lease");
    expect(await repo.acquireHost("example.org", now, 10)).toBeNull();
    await repo.putRecord(
      "host",
      "example.org",
      { nextRequest: now + 3 },
      { leaseHost: "example.org", leaseToken: token },
    );
    now += 10;
    const newer = await repo.acquireHost("example.org", now, 10);
    if (!newer) throw new Error("expected a lease");
    expect(await repo.releaseHost("example.org", token)).toBe(false);
    await expect(
      repo.putRecord(
        "host",
        "example.org",
        { nextRequest: 0 },
        { leaseHost: "example.org", leaseToken: token },
      ),
    ).rejects.toThrow("取得処理の有効期限または所有権が変わりました");
    expect(
      await repo.getRecord<{ nextRequest: number }>("host", "example.org"),
    ).toEqual({ nextRequest: 10003 });
    await repo.putRecord("cache", "one", { body: "a" }, { expiresAt: now + 1 });
    expect(await repo.getRecord("cache", "one")).toEqual({ body: "a" });
    now += 1;
    expect(await repo.getRecord("cache", "one")).toBeNull();
    await repo.putRecord("cache", "two", { body: "b" });
    expect(
      driver.db
        .prepare("SELECT key FROM news_records WHERE namespace='cache'")
        .all()
        .map((row) => row.key),
    ).toEqual(["two"]);
    expect(await repo.releaseHost("example.org", newer)).toBe(true);
  });

  it("validates lease arguments and deletes records", async () => {
    await expect(
      repo.putRecord("host", "a", {}, { leaseHost: "a" }),
    ).rejects.toThrow("取得処理の所有権が不正です");
    await expect(repo.acquireHost("a", now, 0)).rejects.toThrow(
      "取得処理の期限が不正です",
    );
    await repo.putRecord("scheduler", "collection", { nextAt: 1 });
    await repo.deleteRecord("scheduler", "collection");
    expect(await repo.getRecord("scheduler", "collection")).toBeNull();
  });

  it("fences scheduler records by revision and by the job lease", async () => {
    let version = revision(driver.db);
    await repo.putRecord("notifications", "a", { at: 1 });
    await repo.deleteRecord("notifications", "a");
    expect(revision(driver.db)).toBe(version);
    await repo.putRecord("scheduler", "collection", { nextAt: 1 });
    expect(revision(driver.db)).toBe(++version);
    await repo.deleteRecord("scheduler", "collection");
    expect(revision(driver.db)).toBe(++version);
    await repo.deleteRecord("scheduler", "collection");
    expect(revision(driver.db)).toBe(version);
    const denied = "処理の有効期限または所有権が変わりました";
    await expect(
      repo.putRecord("scheduler", "analysis", {}, { jobToken: "none" }),
    ).rejects.toThrow(denied);
    await expect(
      repo.putRecord("scheduler", "analysis", {}, { jobToken: "" }),
    ).rejects.toThrow("処理の所有権が不正です");
    await repo.queueJob("analyze", []);
    const token = (await repo.claimJob(now, 60))!.token!;
    version = revision(driver.db);
    await repo.putRecord(
      "scheduler",
      "analysis",
      { nextAt: 5 },
      { jobToken: token },
    );
    expect(revision(driver.db)).toBe(++version);
    now += 60;
    await expect(
      repo.putRecord(
        "scheduler",
        "analysis",
        { nextAt: 9 },
        { jobToken: token },
      ),
    ).rejects.toThrow(denied);
    const newer = (await repo.claimJob(now))!.token!;
    await expect(
      repo.putRecord(
        "scheduler",
        "analysis",
        { nextAt: 9 },
        { jobToken: token },
      ),
    ).rejects.toThrow(denied);
    expect(revision(driver.db)).toBe(version + 1);
    await repo.finishJob(newer);
    version = revision(driver.db);
    await expect(
      repo.putRecord(
        "scheduler",
        "analysis",
        { nextAt: 9 },
        { jobToken: newer },
      ),
    ).rejects.toThrow(denied);
    expect(revision(driver.db)).toBe(version);
    expect(await repo.getRecord("scheduler", "analysis")).toEqual({
      nextAt: 5,
    });
  });

  it("chunks, replaces and expires blobs", async () => {
    const value = new Uint8Array(3_600_000).map((_, index) => index % 251);
    await repo.putBlob("one", value, now + 5);
    expect(sameBytes(await repo.getBlob("one"), value)).toBe(true);
    const sizes = driver.db
      .prepare("SELECT length(data) AS size FROM news_blobs")
      .all()
      .map((row) => Number(row.size));
    expect(sizes).toHaveLength(4);
    expect(sizes.every((size) => size < 2_000_000)).toBe(true);
    await repo.putBlob("one", new TextEncoder().encode("small"), now + 5);
    expect(
      new TextDecoder().decode((await repo.getBlob("one")) ?? new Uint8Array()),
    ).toBe("small");
    await repo.putBlob("empty", new Uint8Array());
    expect(await repo.getBlob("empty")).toEqual(new Uint8Array());
    now += 5;
    expect(await repo.getBlob("one")).toBeNull();
    await expect(
      repo.putBlob("big", new Uint8Array(4_000_001)),
    ).rejects.toThrow("キャッシュ本文が上限を超えています");
  });

  it("evicts the oldest complete blobs beyond the storage budget", async () => {
    const value = new Uint8Array(4_000_000);
    for (let index = 0; index < 12; index += 1) {
      now += 1;
      await repo.putBlob(`blob${index}`, value);
    }
    expect(await repo.getBlob("blob0")).toBeNull();
    expect(sameBytes(await repo.getBlob("blob1"), value)).toBe(true);
    expect(sameBytes(await repo.getBlob("blob11"), value)).toBe(true);
    expect(
      driver.db
        .prepare("SELECT COUNT(*) AS parts FROM news_blobs WHERE key='blob0'")
        .get()?.parts,
    ).toBe(0);
  }, 30_000); // Writes 48 MB to a real SQLite file, including chunking and eviction.
});

describe("snapshots", () => {
  it("round-trips while disabling automation and preserving unknown sends", async () => {
    const articleId = await ready();
    await repo.updateSettings({ autoCollect: true, autoAnalyze: true });
    const attempt = await claim();
    const snapshot = await repo.exportSnapshot();
    expect(snapshot).toMatchObject({
      version: 2,
      settings: { autoAnalyze: true },
    });
    expect(snapshot).not.toHaveProperty("job");
    expect(JSON.stringify(snapshot)).toContain('"_identity"');
    const other = open([SOURCE], join(directory, "restored.sqlite3"));
    await other.initialize();
    expect(await other.importSnapshot(snapshot)).toEqual({
      articles: 1,
      posts: 1,
      automationDisabled: true,
    });
    expect(await other.settings()).toMatchObject({
      autoCollect: false,
      autoAnalyze: false,
      autoPost: false,
    });
    expect((await other.publicationState()).nextAt).toBe(
      now + POST_INTERVAL_SECONDS,
    );
    expect((await other.getJob()).running).toBe(false);
    expect((await other.article(articleId)).reviewStatus).toBe("saved");
    expect((await other.publicationState()).posts[0]?.status).toBe("unknown");
    await expect(
      other.finishPost(articleId, "posted", { claimToken: attempt.claimToken }),
    ).rejects.toBeInstanceOf(UserError);
    expect(await other.ingest(SOURCE, [ITEM])).toBe(0);
    await expect(other.importSnapshot(snapshot)).rejects.toThrow(
      "移行先は空のデータベースにしてください",
    );
  });

  it("leaves an open round behind while its pending post stays reconcilable", async () => {
    const first = await ready();
    const second = await candidate({
      url: "https://example.org/b",
      publishedAt: published(-7260),
    });
    const attempt = await claim();
    await repo.submitPost(first, "buffer", "channel", now, attempt.claimToken);
    const snapshot = await exported(repo);
    expect(snapshot).not.toHaveProperty("publication_batch");
    expect(snapshot.schedule).toEqual({ next_at: now + POST_INTERVAL_SECONDS });
    const other = open([SOURCE], join(directory, "restored.sqlite3"));
    await other.initialize();
    await other.importSnapshot(snapshot);
    expect(
      stored(drivers.at(-1)?.db ?? driver.db, "state").get("publication_batch"),
    ).toEqual({ articleIds: [], openedAt: 0 });
    const pending = await other.claimPostCheck(now + 120);
    expect(pending).toMatchObject({ article_id: first, buffer_id: "buffer" });
    await other.finishPost(first, "posted", {
      timestamp: now + 120,
      claimToken: pending?.claim_token,
    });
    now += 120;
    await other.updateSettings({ autoPost: true });
    expect(await other.claimPost(now)).toBeNull();
    expect(await other.claimPost(now + POST_INTERVAL_SECONDS - 1)).toBeNull();
    expect(
      (await other.claimPost(now + POST_INTERVAL_SECONDS))?.articleId,
    ).toBe(second);
  });

  it("keeps a submitted Buffer identity and its confirmation budget", async () => {
    const articleId = await ready();
    const attempt = await claim();
    await repo.submitPost(
      articleId,
      "buffer",
      "channel",
      now,
      attempt.claimToken,
    );
    await repo.claimPostCheck(now + 120);
    const other = open([SOURCE], join(directory, "restored.sqlite3"));
    await other.initialize();
    await other.importSnapshot(await repo.exportSnapshot());
    const post = stored(drivers.at(-1)?.db ?? driver.db, "posts").get(
      articleId,
    );
    expect(post).toMatchObject({
      status: "submitted",
      buffer_id: "buffer",
      channel_id: "channel",
      check_count: 1,
    });
    expect(post?.claim_token).not.toBe(attempt.claimToken);
  });

  it("restores only configured sources and never unblocks one", async () => {
    const snapshot = await exported(repo);
    snapshot.sources = [
      {
        ...SOURCE,
        url: "https://evil.example/feed",
        enabled: true,
        lastError: "前回の失敗",
      },
      { ...SOURCE, id: "retired", enabled: true },
    ];
    const blocked: SourceConfig = { ...SOURCE, collectionBlocked: "停止中" };
    const other = open([blocked], join(directory, "restored.sqlite3"));
    await other.initialize();
    await other.importSnapshot(snapshot);
    const sources = stored(drivers.at(-1)?.db ?? driver.db, "sources");
    expect([...sources.keys()]).toEqual(["one"]);
    expect(sources.get("one")).toMatchObject({
      url: SOURCE.url,
      enabled: false,
      lastError: "前回の失敗",
      collectionBlocked: "停止中",
    });
  });

  it("refuses a target with automation enabled", async () => {
    const snapshot = await repo.exportSnapshot();
    const other = open([SOURCE], join(directory, "restored.sqlite3"));
    await other.initialize();
    await other.updateSettings({ autoCollect: true });
    await expect(other.importSnapshot(snapshot)).rejects.toThrow(
      "移行先の自動実行を停止してください",
    );
    await other.updateSettings({ autoCollect: false, autoAnalyze: true });
    await expect(other.importSnapshot(snapshot)).rejects.toThrow(
      "移行先の自動実行を停止してください",
    );
  });

  it.each([
    ["format", { format: "other" }, "対応していない移行データ形式です"],
    [
      "version before automatic classification",
      { version: 1 },
      "対応していない移行データ形式です",
    ],
    [
      "settings keys",
      { settings: { rubric: "x" } },
      "移行データの設定が不正です",
    ],
    [
      "schedule",
      { schedule: { next_at: -1 } },
      "移行データの投稿時刻が不正です",
    ],
    [
      "article shape",
      { articles: [{ id: "bad" }] },
      "移行データの記事が不正です",
    ],
    ["rows", { posts: [{}] }, "移行データの記事・情報源・投稿履歴が不正です"],
  ])(
    "leaves the target empty for an invalid %s",
    async (_name, change, message) => {
      const snapshot = { ...(await exported(repo)), ...change };
      const before = await repo.stateVersion();
      await expect(repo.importSnapshot(snapshot)).rejects.toThrow(message);
      expect(await repo.stateVersion()).toBe(before);
      expect(await repo.articles()).toEqual([]);
    },
  );

  it("requires a boolean automatic classification setting", async () => {
    const snapshot = await exported(repo);
    const settings = snapshot.settings as Record<string, unknown>;
    const { autoAnalyze: _omitted, ...missing } = settings;
    for (const invalid of [missing, { ...settings, autoAnalyze: "false" }]) {
      await expect(
        repo.importSnapshot({ ...snapshot, settings: invalid }),
      ).rejects.toThrow("移行データの設定が不正です");
    }
    expect(await repo.articles()).toEqual([]);
  });

  it("rejects duplicate ids, orphan posts and incomplete Buffer records", async () => {
    const articleId = await candidate();
    const snapshot = await exported(repo);
    const article: unknown = Array.isArray(snapshot.articles)
      ? snapshot.articles[0]
      : null;
    if (!isRecord(article)) throw new Error("missing exported article");
    const post = {
      article_id: articleId,
      status: "submitted",
      text: "t",
      attempted_at: "a",
      claim_token: "c",
      check_count: 0,
    };
    const target = open([SOURCE], join(directory, "restored.sqlite3"));
    await target.initialize();
    const version = await target.stateVersion();
    await expect(
      target.importSnapshot({ ...snapshot, articles: [article, article] }),
    ).rejects.toThrow("移行データに重複した ID があります");
    await expect(
      target.importSnapshot({
        ...snapshot,
        articles: [article, { ...article, id: "c".repeat(24) }],
      }),
    ).rejects.toThrow("移行データの記事が不正です");
    await expect(
      target.importSnapshot({
        ...snapshot,
        posts: [{ ...post, article_id: "d".repeat(24) }],
      }),
    ).rejects.toThrow("移行データの投稿履歴が不正です");
    await expect(
      target.importSnapshot({
        ...snapshot,
        posts: [{ ...post, check_count: 3 }],
      }),
    ).rejects.toThrow("移行データの投稿履歴が不正です");
    await expect(
      target.importSnapshot({ ...snapshot, posts: [post] }),
    ).rejects.toThrow("移行データの Buffer 登録情報が不正です");
    await expect(
      target.importSnapshot({
        ...snapshot,
        sources: [{ ...SOURCE, enabled: "yes" }],
      }),
    ).rejects.toThrow("移行データの情報源設定が不正です");
    expect(await target.stateVersion()).toBe(version);
  });
});

describe("posting window", () => {
  const DAY_SECONDS = 86400;
  /** Epoch seconds at a JST wall-clock time on the day of `START` (1970-01-01, 11:46:40 JST). */
  function jst(hours: number, minutes = 0, seconds = 0, day = 0): number {
    return day * DAY_SECONDS - 9 * 3600 + hours * 3600 + minutes * 60 + seconds;
  }

  it("uses daytime fixtures", () => {
    expect(new Date(START * 1000).toISOString()).toBe(
      "1970-01-01T02:46:40.000Z",
    );
    expect(jst(11, 46, 40)).toBe(START);
  });

  it("moves the first post after enabling late in the evening to the next 06:00", async () => {
    now = jst(22, 30);
    const articleId = await candidate();
    await repo.updateSettings({ autoPost: true });
    // Not 23:30, which is outside the window.
    expect((await repo.publicationState()).nextAt).toBe(jst(6, 0, 0, 1));
    now = jst(23, 30);
    expect(await repo.claimPost(now)).toBeNull();
    now = jst(5, 59, 59, 1);
    expect(await repo.claimPost(now)).toBeNull();
    now = jst(6, 0, 0, 1);
    expect((await claim()).articleId).toBe(articleId);
  });

  it("keeps the hour spacing between rounds near the close and pauses a round for the night", async () => {
    now = jst(20, 59, 59);
    const first = await candidate();
    await repo.updateSettings({ autoPost: true });
    now = jst(21, 59, 59);
    const sent = await claim();
    expect(sent.articleId).toBe(first);
    await repo.submitPost(first, "buffer-1", "channel", now, sent.claimToken);
    await repo.finishPost(first, "posted", {
      postId: "1",
      timestamp: now,
      claimToken: sent.claimToken,
    });
    expect((await repo.publicationState()).nextAt).toBe(jst(22, 59, 59));
    const second = await candidate({ url: "https://example.org/b" });
    const third = await candidate({ url: "https://example.org/c" });
    expect(await repo.claimPost(jst(22, 59, 58))).toBeNull();
    now = jst(22, 59, 59);
    const late = await claim();
    expect([second, third]).toContain(late.articleId);
    await repo.submitPost(
      late.articleId,
      "buffer-2",
      "channel",
      now,
      late.claimToken,
    );
    await repo.finishPost(late.articleId, "posted", {
      postId: "2",
      timestamp: now,
      claimToken: late.claimToken,
    });
    // The rest of the round is due at once, but 23:00 pauses it until 06:00.
    expect((await repo.publicationState()).nextAt).toBe(jst(22, 59, 59));
    now = jst(23, 0);
    expect((await repo.publicationState()).nextAt).toBe(jst(6, 0, 0, 1));
    now = jst(23, 59, 59);
    expect(await repo.claimPost(now)).toBeNull();
    now = jst(6, 0, 0, 1);
    expect((await claim()).articleId).not.toBe(late.articleId);
  });

  it("never claims with a tick timestamp from before the close", async () => {
    now = jst(21, 0);
    const articleId = await candidate();
    await repo.updateSettings({ autoPost: true });
    const version = await repo.stateVersion();
    // The tick read its timestamp at 22:30, but the clock has reached 23:00.
    now = jst(23, 0);
    expect(await repo.claimPost(jst(22, 30))).toBeNull();
    expect(await repo.stateVersion()).toBe(version);
    expect((await repo.publicationState()).posts).toEqual([]);
    expect((await repo.settings()).autoPost).toBe(true);
    now = jst(6, 0, 0, 1);
    expect((await claim()).articleId).toBe(articleId);
  });

  it("rechecks the window in the atomic claim after the early gate", async () => {
    now = jst(21, 0);
    await candidate();
    await repo.updateSettings({ autoPost: true });
    now = jst(22, 59, 59);
    intercept(driver, async (original, statements) => {
      const results = await original(statements);
      // The clock passes 23:00 right after the early settings read.
      if (
        statements.some(([sql]) => sql.includes("IN ('settings','schedule')"))
      )
        now = jst(23, 0);
      return results;
    });
    expect(await repo.claimPost(jst(22, 59, 59))).toBeNull();
    expect((await repo.publicationState()).posts).toEqual([]);
    expect((await repo.settings()).autoPost).toBe(true);
  });

  it("withdraws its own unsent claim when sending would start after 23:00", async () => {
    now = jst(21, 0);
    const articleId = await candidate();
    await repo.updateSettings({ autoPost: true });
    now = jst(22, 59, 50);
    const attempt = await claim();
    now = jst(23, 0);
    expect(
      await repo.authorizePostSend(
        articleId,
        attempt.claimToken,
        jst(22, 59, 55),
      ),
    ).toBe(false);
    const publication = await repo.publicationState();
    expect(publication.posts).toEqual([]);
    expect(publication.nextAt).toBe(jst(6, 0, 0, 1));
    expect(await repo.article(articleId)).toMatchObject({
      reviewStatus: "saved",
    });
    expect((await repo.settings()).autoPost).toBe(true);
    now = jst(23, 30);
    expect(await repo.claimPost(now)).toBeNull();
    now = jst(6, 0, 0, 1);
    const retry = await claim();
    expect(retry.articleId).toBe(articleId);
    expect(await repo.authorizePostSend(articleId, retry.claimToken, now)).toBe(
      true,
    );
  });

  it("shows the earliest allowed time while idle outside the window", async () => {
    now = jst(12, 0);
    await repo.updateSettings({ autoPost: true });
    const due = jst(13, 0);
    expect((await repo.publicationState()).nextAt).toBe(due);
    // Past due inside the window keeps the stored time: posting is due now.
    now = jst(18, 0);
    expect((await repo.publicationState()).nextAt).toBe(due);
    // Idle ticks reserve nothing, even overnight.
    expect(await repo.claimPost(now)).toBeNull();
    now = jst(23, 30);
    expect(await repo.claimPost(now)).toBeNull();
    expect((await repo.publicationState()).nextAt).toBe(jst(6, 0, 0, 1));
    now = jst(5, 0, 0, 1);
    expect((await repo.publicationState()).nextAt).toBe(jst(6, 0, 0, 1));
    expect((await repo.settings()).autoPost).toBe(true);
  });

  it("never claims an article already marked as posted", async () => {
    now = jst(12, 0);
    const articleId = await candidate();
    await repo.review(articleId, "posted");
    await repo.updateSettings({ autoPost: true });
    now = jst(13, 0);
    expect(await repo.postCandidates()).toEqual([]);
    expect(await repo.claimPost(now)).toBeNull();
    expect((await repo.publicationState()).posts).toEqual([]);
  });
});
