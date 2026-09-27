// SPDX-License-Identifier: MIT
/**
 * Portable SQL repository with optimistic, transaction-wide mutation fencing.
 *
 * Every business mutation reads a transactionally consistent snapshot, then uses
 * one atomic batch to compare its revision and apply the changes. Each write also
 * checks an unguessable mutation token: a failed compare cannot accidentally write
 * under a newer revision. No process lock, persistent process, or BEGIN is needed.
 */
import { clock as defaultClock } from "../domain.ts";
import type {
  Analysis,
  Article,
  Clock,
  Job,
  Post,
  PostClaim,
  PostStatus,
  Publication,
  ReviewStatus,
  Settings,
  Source,
} from "../domain.ts";
import { NotFoundError, UserError } from "../errors.ts";
import { draft } from "../posts.ts";
import type {
  FinishPostOptions,
  NewsRepository,
  RecordOptions,
} from "../repository.ts";
import {
  citationOnly,
  type CollectedItem,
  type SourceConfig,
} from "../sources/types.ts";
import {
  isInteger,
  isRecord,
  length,
  randomToken,
  sha256,
  strip,
  utf8,
} from "../text.ts";
import { isoSeconds } from "../time.ts";

export type SQLValue = string | number | null;
export type SQLStatement = readonly [string, readonly SQLValue[]];
export type SQLRow = Record<string, SQLValue>;
export interface SQLResult {
  results: SQLRow[];
  meta: { changes: number };
}
/** Executes all statements sequentially in one transaction, rolling back every statement on failure. */
export interface SqlDriver {
  batch(statements: SQLStatement[]): Promise<SQLResult[]>;
}

const REVIEW_STATUSES: ReadonlySet<unknown> = new Set<ReviewStatus>([
  "unread",
  "saved",
  "dismissed",
  "posted",
]);
const ANALYSIS_STATUSES: ReadonlySet<unknown> = new Set([
  "pending",
  "done",
  "error",
]);
const BLOCKING: ReadonlySet<PostStatus> = new Set<PostStatus>([
  "publishing",
  "submitted",
  "unknown",
  "failed",
]);
const POST_STATUSES: ReadonlySet<unknown> = new Set<PostStatus>([
  ...BLOCKING,
  "posted",
]);
const SETTING_KEYS = new Set([
  "rubric",
  "pollMinutes",
  "autoCollect",
  "autoAnalyze",
  "autoPost",
  "postSelection",
]);
const SELECTIONS: ReadonlySet<unknown> = new Set([
  "saved",
  "candidates",
  "both",
]);
const JOB_OWNERSHIP = new Set([
  "id",
  "token",
  "leaseUntil",
  "kind",
  "articleIds",
  "running",
  "automatic",
]);
const DETAIL_KEYS = [
  "body",
  "metadata",
  "attachments",
  "contentError",
] as const;
const EVIDENCE_KEYS = [
  "title",
  "excerpt",
  "publishedAt",
  "body",
  "bodyStale",
  "metadata",
  "contentError",
] as const;
const SOURCE_STATE = [
  "enabled",
  "lastFetchedAt",
  "lastError",
  "lastCount",
  "lastWarnings",
  "lastDeferred",
  "nextFetchAt",
] as const;
/** Records deciding automatic jobs; their writes take part in revision fencing. */
const SCHEDULER = "scheduler";
const YAHOO_ARTICLE = /^https:\/\/news\.yahoo\.co\.jp\/articles\/[a-f0-9]{40}$/;
const ROW_LIMIT = 1_800_000;
const BLOB_LIMIT = 4_000_000;
const BLOB_PART = 1_000_000;

export const DEFAULT_RUBRIC = `日本国内を中心とする狩猟、猟銃・銃の所持、射撃競技、鳥獣被害と保護管理、ジビエ、関連する法令・行政のニュースを集める。
ゲーム、フィクション、比喩としてのハンター・罠、対象分野と関係のない商品や芸能記事は対象外。
動物の出没・捕獲・被害、対策や調査、競技大会、事故、制度変更は候補に含める。
発生地域、日付、対象が異なる事件を混同しない。同じ事件でも新たな被害・捕獲・対策決定などの続報は残す。
記事に書かれている範囲で判断し、情報不足の場合は要確認にする。`;

const DEFAULT_JOB: Job = {
  running: false,
  automatic: false,
  kind: null,
  articleIds: null,
  phase: "待機中",
  progress: 0,
  total: 0,
  cursor: 0,
  error: null,
  warning: null,
  lastFinishedAt: null,
  token: null,
  leaseUntil: 0,
};

interface Schedule {
  next_at: number;
}
/** Rows of news_state keyed by id; unknown ids are carried through untouched. */
type StateRows = {
  settings?: Settings;
  schedule?: Schedule;
  job?: Job;
  imported?: { at: string };
};
interface Tables {
  articles: Map<string, Article>;
  sources: Map<string, Source>;
  posts: Map<string, Post>;
  state: StateRows;
}
type Table = keyof Tables;

function encode(value: unknown): string {
  return JSON.stringify(value);
}

function byKey(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Key-order independent encoding, used to detect changed rows like a deep equality. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => byKey(a, b)))
      : item,
  );
}

function compareCodePoints(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const diff =
      (left[index]?.codePointAt(0) ?? 0) - (right[index]?.codePointAt(0) ?? 0);
    if (diff) return diff;
  }
  return left.length - right.length;
}

/** Stable JSON with sorted keys, Unicode characters, and spaces after separators for evidence hashes. */
function pythonJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (Number.isFinite(value)) return JSON.stringify(value);
    return Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity";
  }
  if (Array.isArray(value))
    return `[${value.map((item: unknown) => pythonJson(item)).join(", ")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort(compareCodePoints);
    return `{${keys.map((key) => `${JSON.stringify(key)}: ${pythonJson(value[key])}`).join(", ")}}`;
  }
  throw new TypeError("Unsupported evidence value");
}

function evidenceText(article: Article): string {
  return pythonJson(EVIDENCE_KEYS.map((key) => article[key] ?? null));
}

function timestamp(value: number): string {
  return isoSeconds(value);
}

function publicArticle(article: Article): Article {
  const copy = { ...article };
  for (const key of Object.keys(copy))
    if (key.startsWith("_")) Reflect.deleteProperty(copy, key);
  return copy;
}

function chronological(a: Article, b: Article): number {
  return (
    byKey(a.publishedAt || a.discoveredAt, b.publishedAt || b.discoveredAt) ||
    byKey(a.discoveredAt, b.discoveredAt) ||
    byKey(a.id, b.id)
  );
}

function resetAnalysis(article: Article): void {
  Object.assign(article, {
    topic: null,
    decision: null,
    priority: null,
    reason: null,
    probability: null,
    analysisStatus: "pending",
    analysisError: null,
    relatedArticleId: null,
    relation: null,
    analyzedAt: null,
  });
}

/** Details make a source the content owner; a roundup citation alone does not. */
function hasDetails(value: Partial<CollectedItem>): boolean {
  return DETAIL_KEYS.some((key) =>
    key === "metadata"
      ? value.metadata !== undefined && !citationOnly(value.metadata)
      : value[key] !== undefined,
  );
}

function isCitation(item: CollectedItem): boolean {
  return (
    item.metadata !== undefined &&
    citationOnly(item.metadata) &&
    !hasDetails(item)
  );
}

function updateContent(
  article: Article,
  item: CollectedItem,
  now: string,
): void {
  if (item.sourceKey !== undefined) article.sourceKey = item.sourceKey;
  if (item.attachments !== undefined) article.attachments = item.attachments;
  if (item.metadata !== undefined) article.metadata = item.metadata;
  if (item.contentError !== undefined) article.contentError = item.contentError;
  if (item.body)
    Object.assign(article, {
      body: item.body,
      bodyFetchedAt: now,
      bodyStale: false,
    });
  else if (item.contentError && article.body) article.bodyStale = true;
  else if (item.body !== undefined)
    Object.assign(article, { body: item.body, bodyStale: false });
}

function validRubric(value: unknown): boolean {
  return (
    typeof value === "string" &&
    length(strip(value)) >= 10 &&
    length(strip(value)) <= 8000
  );
}

function validPollMinutes(value: unknown): boolean {
  return isInteger(value) && value >= 15 && value <= 1440;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function settingsOf(state: StateRows): Settings {
  if (!state.settings) throw new Error("Repository is not initialized");
  return state.settings;
}

function scheduleOf(state: StateRows): Schedule {
  if (!state.schedule) throw new Error("Repository is not initialized");
  return state.schedule;
}

function jobOf(state: StateRows): Job {
  if (!state.job) throw new Error("Repository is not initialized");
  return state.job;
}

function articleOf(articles: Map<string, Article>, articleId: string): Article {
  const article = articles.get(articleId);
  if (!article) throw new NotFoundError("記事が見つかりません");
  return article;
}

function column(row: SQLRow | undefined, name: string): SQLValue {
  if (!row || !(name in row)) throw new Error(`Missing column ${name}`);
  return row[name] ?? null;
}

function textColumn(row: SQLRow | undefined, name: string): string {
  const value = column(row, name);
  if (typeof value !== "string") throw new Error(`Column ${name} is not text`);
  return value;
}

function numberColumn(row: SQLRow | undefined, name: string): number {
  const value = column(row, name);
  if (typeof value !== "number")
    throw new Error(`Column ${name} is not numeric`);
  return value;
}

/** Stored JSON documents acquire their repository types only here. */
function decode<T>(data: string): T {
  return JSON.parse(data) as T;
}

function decodeState(rows: readonly (readonly [string, string])[]): StateRows {
  return Object.fromEntries(
    rows.map(([id, data]) => [id, decode<unknown>(data)]),
  ) as StateRows;
}

function rowsOf(tables: Tables, table: Table): Map<string, unknown> {
  const rows = tables[table];
  return rows instanceof Map
    ? rows
    : new Map<string, unknown>(Object.entries(rows));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export class SQLRepository implements NewsRepository {
  private readonly sourceConfig: readonly SourceConfig[];
  private readonly sourceIds: ReadonlySet<string>;

  constructor(
    readonly driver: SqlDriver,
    sources: readonly SourceConfig[],
    private readonly clock: Clock = defaultClock,
  ) {
    this.sourceConfig = structuredClone(sources);
    this.sourceIds = new Set(sources.map((source) => source.id));
  }

  private async snapshot<K extends Table>(
    tables: readonly K[],
  ): Promise<[number, Pick<Tables, K>]> {
    return this.load(tables);
  }

  /** Reads the revision and the requested tables in one transactionally consistent batch. */
  private async load(tables: readonly Table[]): Promise<[number, Tables]> {
    const results = await this.driver.batch([
      ["SELECT revision FROM news_meta WHERE id=1", []],
      ...tables.map((table): SQLStatement => [
        `SELECT id,data FROM news_${table}`,
        [],
      ]),
    ]);
    const version = numberColumn(results[0]?.results[0], "revision");
    const snapshot: Tables = {
      articles: new Map(),
      sources: new Map(),
      posts: new Map(),
      state: {},
    };
    tables.forEach((table, index) => {
      const rows = (results[index + 1]?.results ?? []).map(
        (row) => [textColumn(row, "id"), textColumn(row, "data")] as const,
      );
      if (table === "state") snapshot.state = decodeState(rows);
      else if (table === "articles")
        snapshot.articles = new Map(
          rows.map(([id, data]) => [id, decode<Article>(data)]),
        );
      else if (table === "sources")
        snapshot.sources = new Map(
          rows.map(([id, data]) => [id, decode<Source>(data)]),
        );
      else
        snapshot.posts = new Map(
          rows.map(([id, data]) => [id, decode<Post>(data)]),
        );
    });
    return [version, snapshot];
  }

  private async mutate<K extends Table, R>(
    tables: readonly K[],
    transform: (state: Pick<Tables, K>) => R | Promise<R>,
  ): Promise<R> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const [version, after] = await this.load(tables);
      const before = new Map(
        tables.map((table) => [
          table,
          new Map(
            [...rowsOf(after, table)].map(([id, value]) => [
              id,
              canonical(value),
            ]),
          ),
        ]),
      );
      const result = await transform(after);
      const writes: SQLStatement[] = [];
      const token = randomToken();
      const guard = "(SELECT token FROM news_meta WHERE id=1)=?";
      // Group row changes to keep a large ingest/rubric reset within D1's
      // per-invocation query limit. Bound values, never SQL interpolation.
      for (const table of tables) {
        const previous = before.get(table) ?? new Map<string, string>();
        const current = rowsOf(after, table);
        const chunks: { id: string; data: string }[][] = [];
        let chunk: { id: string; data: string }[] = [];
        let size = 0;
        for (const [id, value] of current) {
          if (previous.get(id) === canonical(value)) continue;
          const row = { id, data: encode(value) };
          const rowSize = utf8(encode(row)).length;
          if (rowSize > ROW_LIMIT)
            throw new UserError(
              "保存する記事または処理状態が上限を超えています",
            );
          if (
            chunk.length &&
            (chunk.length === 25 || size + rowSize > ROW_LIMIT)
          ) {
            chunks.push(chunk);
            chunk = [];
            size = 0;
          }
          chunk.push(row);
          size += rowSize + 1;
        }
        if (chunk.length) chunks.push(chunk);
        for (const rows of chunks) {
          writes.push([
            `INSERT INTO news_${table}(id,data) SELECT json_extract(value,'$.id'), json_extract(value,'$.data') FROM json_each(?) ` +
              `WHERE ${guard} ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
            [encode(rows), token],
          ]);
        }
        const removed = [...previous.keys()].filter((id) => !current.has(id));
        if (removed.length) {
          writes.push([
            `DELETE FROM news_${table} WHERE id IN (SELECT value FROM json_each(?)) AND ${guard}`,
            [encode(removed), token],
          ]);
        }
      }
      if (!writes.length) return result;
      const results = await this.driver.batch([
        [
          "UPDATE news_meta SET revision=revision+1,token=? WHERE id=1 AND revision=?",
          [token, version],
        ],
        ...writes,
      ]);
      if (results[0]?.meta.changes === 1) return result;
    }
    throw new UserError(
      "同時更新が続いています。時間をおいて再実行してください",
    );
  }

  async initialize(): Promise<void> {
    await this.mutate(["state", "sources"], (state) => {
      const stored = state.state.settings;
      if (stored && typeof stored.autoAnalyze !== "boolean")
        throw new Error("D1 migration 0002_auto_analyze has not been applied");
      const job = state.state.job;
      if (job && typeof job.automatic !== "boolean")
        throw new Error(
          "D1 migration 0003_automatic_jobs has not been applied",
        );
      state.state.settings ??= {
        rubric: DEFAULT_RUBRIC,
        autoCollect: false,
        pollMinutes: 60,
        autoAnalyze: false,
        autoPost: false,
        postSelection: "both",
      };
      state.state.schedule ??= { next_at: 0 };
      state.state.job ??= structuredClone(DEFAULT_JOB);
      for (const config of this.sourceConfig) {
        const previous: Partial<Source> = state.sources.get(config.id) ?? {};
        const source: Source = { ...structuredClone(config) };
        const defaults = {
          enabled: config.enabled,
          lastFetchedAt: null,
          lastError: null,
          lastCount: null,
          lastWarnings: [],
          lastDeferred: null,
          nextFetchAt: null,
        };
        for (const key of SOURCE_STATE)
          Object.assign(source, {
            [key]: key in previous ? previous[key] : defaults[key],
          });
        if (source.collectionBlocked) source.enabled = false;
        state.sources.set(source.id, source);
      }
    });
  }

  async stateVersion(): Promise<number> {
    const result = await this.driver.batch([
      ["SELECT revision FROM news_meta WHERE id=1", []],
    ]);
    return numberColumn(result[0]?.results[0], "revision");
  }

  async settings(): Promise<Settings> {
    const [, state] = await this.snapshot(["state"]);
    return settingsOf(state.state);
  }

  async updateSettings(changes: Record<string, unknown>): Promise<Settings> {
    if (Object.keys(changes).some((key) => !SETTING_KEYS.has(key)))
      throw new UserError("未対応の設定項目です");
    return this.mutate(["state", "posts", "articles"], (state) => {
      const previous = settingsOf(state.state);
      const settings: Record<string, unknown> = { ...previous, ...changes };
      if (!validRubric(settings.rubric))
        throw new UserError("選定基準は10〜8000文字で入力してください");
      if (!validPollMinutes(settings.pollMinutes))
        throw new UserError("収集間隔は15〜1440分にしてください");
      if (
        typeof settings.autoCollect !== "boolean" ||
        typeof settings.autoAnalyze !== "boolean" ||
        typeof settings.autoPost !== "boolean"
      ) {
        throw new UserError("自動実行の設定が不正です");
      }
      if (!SELECTIONS.has(settings.postSelection))
        throw new UserError("自動投稿の対象が不正です");
      const valid = settings as unknown as Settings;
      if (valid.autoPost && !previous.autoPost) {
        if (
          [...state.posts.values()].some((post) => BLOCKING.has(post.status))
        ) {
          throw new UserError(
            "投稿結果を確認し、保留中の記事を解決してから有効にしてください",
          );
        }
        const schedule = scheduleOf(state.state);
        schedule.next_at = Math.max(schedule.next_at, this.clock() + 3600);
      }
      if (valid.rubric !== previous.rubric)
        for (const article of state.articles.values()) resetAnalysis(article);
      state.state.settings = valid;
      return valid;
    });
  }

  async sources(): Promise<Source[]> {
    const [, state] = await this.snapshot(["sources"]);
    return this.sourceConfig.flatMap(
      (config) => state.sources.get(config.id) ?? [],
    );
  }

  async updateSource(
    sourceId: string,
    changes: Partial<Source>,
  ): Promise<Source> {
    return this.mutate(["sources"], (state) => {
      const source = state.sources.get(sourceId);
      if (!this.sourceIds.has(sourceId) || !source)
        throw new NotFoundError("情報源が見つかりません");
      if (changes.enabled && source.collectionBlocked)
        throw new UserError(source.collectionBlocked);
      Object.assign(source, changes);
      return source;
    });
  }

  async ingest(source: SourceConfig, items: CollectedItem[]): Promise<number> {
    const identityOf = (item: CollectedItem): string =>
      item.sourceKey ? `${source.id}:${item.sourceKey}` : item.url;
    const ids = new Map(
      await Promise.all(
        items.map(
          async (item) =>
            [
              identityOf(item),
              (await sha256(identityOf(item))).slice(0, 24),
            ] as const,
        ),
      ),
    );
    return this.mutate(["articles"], (state) => {
      const articles = state.articles;
      const identities = new Map(
        [...articles.values()].map((article) => [article._identity, article]),
      );
      const changed = new Set<string>();
      let created = 0;
      for (const item of items) {
        const identity = identityOf(item);
        let article = identities.get(identity);
        if (
          article === undefined &&
          identity === item.url &&
          YAHOO_ARTICLE.test(identity)
        ) {
          article = identities.get(`${identity}?source=rss`);
          identities.delete(`${identity}?source=rss`);
          if (article) {
            article._identity = identity;
            identities.set(identity, article);
          }
        }
        if (article === undefined) {
          const now = timestamp(this.clock());
          const fresh: Article = {
            id: ids.get(identity) ?? "",
            _identity: identity,
            url: item.url,
            title: item.title,
            excerpt: item.excerpt ?? "",
            sourceName: source.name,
            sourceIds: [source.id],
            publishedAt: item.publishedAt ?? null,
            discoveredAt: now,
            reviewStatus: "unread",
            analysisStatus: "pending",
          };
          updateContent(fresh, item, timestamp(this.clock()));
          if (hasDetails(item)) fresh.contentSourceId = source.id;
          resetAnalysis(fresh);
          articles.set(fresh.id, fresh);
          identities.set(identity, fresh);
          created += 1;
          continue;
        }
        const before = evidenceText(article);
        article.url = item.url;
        if (!article.sourceIds.includes(source.id))
          article.sourceIds.push(source.id);
        const details = hasDetails(item);
        let owner = article.contentSourceId;
        if (!owner && hasDetails(article)) owner = article.sourceIds[0];
        // A publisher feed outranks an attribution-only roundup even without
        // a full body. Persist that ownership so later citations cannot undo it.
        // A pinned plain feed still allows actual rich details to enrich it.
        const promote =
          (details && (!owner || !hasDetails(article))) ||
          (!owner && isCitation(article) && !isCitation(item));
        const sameSource =
          promote || source.id === (owner || article.sourceIds[0]);
        if ((details || promote) && sameSource)
          article.contentSourceId = source.id;
        if (promote) article.sourceName = source.name;
        if (
          sameSource ||
          (!isCitation(item) &&
            length(item.excerpt ?? "") > length(article.excerpt))
        )
          article.excerpt = item.excerpt ?? "";
        if (sameSource) article.title = item.title;
        if (item.publishedAt && (!article.publishedAt || sameSource))
          article.publishedAt = item.publishedAt;
        if (sameSource) updateContent(article, item, timestamp(this.clock()));
        if (before !== evidenceText(article)) {
          resetAnalysis(article);
          changed.add(article.id);
        }
      }
      for (const article of articles.values()) {
        if (article.relatedArticleId && changed.has(article.relatedArticleId))
          resetAnalysis(article);
      }
      return created;
    });
  }

  async articles(limit?: number, offset = 0): Promise<Article[]> {
    if (
      !isInteger(offset) ||
      offset < 0 ||
      (limit !== undefined && (!isInteger(limit) || limit < 0))
    ) {
      throw new UserError("記事の取得範囲が不正です");
    }
    const result = await this.driver.batch([
      [
        "SELECT data FROM news_articles ORDER BY json_extract(data,'$.discoveredAt') DESC,rowid DESC LIMIT ? OFFSET ?",
        [limit ?? -1, offset],
      ],
    ]);
    return (result[0]?.results ?? []).map((row) =>
      publicArticle(decode<Article>(textColumn(row, "data"))),
    );
  }

  async article(articleId: string): Promise<Article> {
    const result = await this.driver.batch([
      ["SELECT data FROM news_articles WHERE id=?", [articleId]],
    ]);
    const row = result[0]?.results[0];
    if (!row) throw new NotFoundError("記事が見つかりません");
    return publicArticle(decode<Article>(textColumn(row, "data")));
  }

  async review(articleId: string, status: unknown): Promise<Article> {
    if (typeof status !== "string" || !REVIEW_STATUSES.has(status))
      throw new UserError("記事の状態が不正です");
    return this.mutate(["articles", "posts"], (state) => {
      const article = articleOf(state.articles, articleId);
      const post = state.posts.get(articleId);
      if (post && BLOCKING.has(post.status)) {
        throw new UserError(
          "X の投稿処理中、または結果確認待ちです。投稿結果の確認から操作してください",
        );
      }
      Object.assign(article, {
        reviewStatus: status,
        reviewedAt: timestamp(this.clock()),
      });
      return publicArticle(article);
    });
  }

  private static publication(
    state: Pick<Tables, "state" | "posts">,
  ): Publication {
    const posts = [...state.posts.values()].sort((a, b) =>
      byKey(b.attempted_at, a.attempted_at),
    );
    return {
      nextAt: scheduleOf(state.state).next_at,
      posts: posts.map((row) => ({
        articleId: row.article_id,
        status: row.status,
        text: row.text,
        attemptedAt: row.attempted_at,
        postId: row.post_id ?? null,
        bufferId: row.buffer_id ?? null,
        error: row.error ?? null,
      })),
    };
  }

  async publicationState(): Promise<Publication> {
    const [, state] = await this.snapshot(["state", "posts"]);
    return SQLRepository.publication(state);
  }

  private static candidates(
    state: Pick<Tables, "state" | "posts" | "articles">,
  ): Article[] {
    const selection = settingsOf(state.state).postSelection;
    return [...state.articles.values()]
      .filter(
        (article) =>
          !state.posts.has(article.id) &&
          article.reviewStatus !== "posted" &&
          article.reviewStatus !== "dismissed" &&
          article.relation !== "duplicate" &&
          ((selection !== "candidates" && article.reviewStatus === "saved") ||
            (selection !== "saved" &&
              article.analysisStatus === "done" &&
              article.decision === "candidate")),
      )
      .sort(chronological);
  }

  async postCandidates(): Promise<Article[]> {
    const [, state] = await this.snapshot(["state", "posts", "articles"]);
    return SQLRepository.candidates(state).map(publicArticle);
  }

  private static expirePosts(
    state: Pick<Tables, "state" | "posts">,
    now: number,
  ): number {
    let expired = 0;
    for (const post of state.posts.values()) {
      if (post.status === "publishing" && post.claim_expires_at <= now) {
        Object.assign(post, {
          status: "unknown",
          error:
            "送信中に処理が停止しました。Buffer と X の投稿結果を確認してください",
        });
        expired += 1;
      }
    }
    if (expired) settingsOf(state.state).autoPost = false;
    return expired;
  }

  async recoverPosts(at?: number): Promise<number> {
    const now = at ?? this.clock();
    const found = await this.driver.batch([
      [
        "SELECT 1 FROM news_posts WHERE json_extract(data,'$.status')='publishing' AND json_extract(data,'$.claim_expires_at')<=? LIMIT 1",
        [now],
      ],
    ]);
    if (!found[0]?.results.length) return 0;
    return this.mutate(["state", "posts"], (state) =>
      SQLRepository.expirePosts(state, now),
    );
  }

  async claimPost(now: number): Promise<PostClaim | null> {
    await this.recoverPosts(now);
    // The minute tick normally exits here, without reading any articles or
    // historical posts. The actual reservation still rechecks everything in
    // its atomic mutation, including settings and eligibility changes.
    const gate = await this.driver.batch([
      [
        "SELECT id,data FROM news_state WHERE id IN ('settings','schedule')",
        [],
      ],
      [
        "SELECT 1 FROM news_posts WHERE json_extract(data,'$.status') IN ('publishing','submitted','unknown','failed') LIMIT 1",
        [],
      ],
    ]);
    const current: StateRows = {};
    for (const row of gate[0]?.results ?? []) {
      const id = textColumn(row, "id");
      if (id === "settings")
        current.settings = decode<Settings>(textColumn(row, "data"));
      if (id === "schedule")
        current.schedule = decode<Schedule>(textColumn(row, "data"));
    }
    if (
      !settingsOf(current).autoPost ||
      scheduleOf(current).next_at > now ||
      gate[1]?.results.length
    )
      return null;
    return this.mutate(["state", "articles", "posts"], (state) => {
      SQLRepository.expirePosts(state, now);
      const settings = settingsOf(state.state);
      const schedule = scheduleOf(state.state);
      if (!settings.autoPost || schedule.next_at > now) return null;
      if ([...state.posts.values()].some((post) => BLOCKING.has(post.status)))
        return null;
      schedule.next_at = now + 3600;
      const article = SQLRepository.candidates(state)[0];
      if (!article) return null;
      const claimToken = randomToken();
      const post: Post = {
        article_id: article.id,
        status: "publishing",
        text: "",
        attempted_at: timestamp(now),
        claim_token: claimToken,
        claim_expires_at: now + 600,
        check_count: 0,
      };
      state.posts.set(article.id, post);
      try {
        post.text = draft(article);
      } catch (error) {
        if (!(error instanceof UserError)) throw error;
        Object.assign(post, { status: "failed", error: error.message });
        settings.autoPost = false;
        return null;
      }
      return { articleId: article.id, text: post.text, claimToken };
    });
  }

  private static post(
    state: Pick<Tables, "posts">,
    articleId: string,
    statuses: readonly PostStatus[],
    claimToken?: string,
  ): Post {
    const post = state.posts.get(articleId);
    if (
      !post ||
      !statuses.includes(post.status) ||
      (claimToken !== undefined && post.claim_token !== claimToken)
    ) {
      throw new UserError("投稿処理の状態が変わりました");
    }
    return post;
  }

  private static finish(
    state: Pick<Tables, "state" | "articles" | "posts">,
    articleId: string,
    status: "posted" | "failed" | "unknown",
    postId: string | null,
    error: string | null,
    now: number,
    claimToken?: string,
  ): void {
    const post = SQLRepository.post(
      state,
      articleId,
      ["publishing", "submitted"],
      claimToken,
    );
    Object.assign(post, { status, post_id: postId, error });
    if (status === "posted") {
      const schedule = scheduleOf(state.state);
      schedule.next_at = Math.max(schedule.next_at, now + 3600);
      Object.assign(articleOf(state.articles, articleId), {
        reviewStatus: "posted",
        reviewedAt: timestamp(now),
      });
    } else {
      settingsOf(state.state).autoPost = false;
    }
  }

  async finishPost(
    articleId: string,
    status: "posted" | "failed" | "unknown",
    options: FinishPostOptions = {},
  ): Promise<void> {
    if (!["posted", "failed", "unknown"].includes(status))
      throw new UserError("投稿結果が不正です");
    const now = options.timestamp ?? this.clock();
    await this.mutate(["state", "articles", "posts"], (state) =>
      SQLRepository.finish(
        state,
        articleId,
        status,
        options.postId ?? null,
        options.error ?? null,
        now,
        options.claimToken,
      ),
    );
  }

  async submitPost(
    articleId: string,
    bufferId: string,
    channelId: string,
    now: number,
    claimToken?: string,
  ): Promise<void> {
    await this.mutate(["posts"], (state) => {
      const post = SQLRepository.post(
        state,
        articleId,
        ["publishing"],
        claimToken,
      );
      Object.assign(post, {
        status: "submitted",
        buffer_id: bufferId,
        channel_id: channelId,
        check_at: now + 120,
        check_count: 0,
      });
    });
  }

  async claimPostCheck(now: number): Promise<Post | null> {
    const found = await this.driver.batch([
      [
        "SELECT 1 FROM news_posts WHERE json_extract(data,'$.status')='submitted' AND json_extract(data,'$.check_at')<=? LIMIT 1",
        [now],
      ],
    ]);
    if (!found[0]?.results.length) return null;
    // Claiming a check consumes the durable confirmation budget before any network request.
    return this.mutate(["state", "articles", "posts"], (state) => {
      const pending = [...state.posts.values()]
        .filter(
          (post) =>
            post.status === "submitted" && (post.check_at ?? Infinity) <= now,
        )
        .sort((a, b) => (a.check_at ?? 0) - (b.check_at ?? 0));
      const post = pending[0];
      if (!post) return null;
      if (post.check_count >= 2) {
        SQLRepository.finish(
          state,
          post.article_id,
          "unknown",
          null,
          "Buffer の投稿完了を確認できません。Buffer と X を確認してください",
          now,
        );
        return null;
      }
      const previous = { ...post };
      Object.assign(post, {
        check_at: now + 3600,
        check_count: post.check_count + 1,
      });
      return previous;
    });
  }

  async resolvePost(articleId: string, outcome: unknown): Promise<Publication> {
    if (outcome !== "posted" && outcome !== "not_posted")
      throw new UserError("X で確認した投稿結果を指定してください");
    return this.mutate(["state", "articles", "posts"], (state) => {
      const post = SQLRepository.post(state, articleId, ["unknown", "failed"]);
      if (outcome === "posted") {
        Object.assign(post, { status: "posted", error: null });
        Object.assign(articleOf(state.articles, articleId), {
          reviewStatus: "posted",
          reviewedAt: timestamp(this.clock()),
        });
      } else {
        state.posts.delete(articleId);
      }
      return SQLRepository.publication(state);
    });
  }

  async evidenceHash(article: Article): Promise<string> {
    return sha256(evidenceText(article));
  }

  async analyzeResult(
    articleId: string,
    evidenceHash: string,
    rubric: string,
    result: Analysis,
    relationHash?: string | null,
  ): Promise<boolean> {
    return this.mutate(["state", "articles"], async (state) => {
      const article = articleOf(state.articles, articleId);
      if (
        (await this.evidenceHash(article)) !== evidenceHash ||
        settingsOf(state.state).rubric !== rubric
      )
        return false;
      if (
        result.relatedArticleId &&
        relationHash !== undefined &&
        relationHash !== null
      ) {
        const target = state.articles.get(result.relatedArticleId);
        if (!target || (await this.evidenceHash(target)) !== relationHash)
          return false;
      }
      Object.assign(article, structuredClone(result), {
        analyzedAt: timestamp(this.clock()),
      });
      return true;
    });
  }

  async getJob(): Promise<Job> {
    const [, state] = await this.snapshot(["state"]);
    return jobOf(state.state);
  }

  async queueJob(
    kind: string,
    articleIds: string[] | null = null,
  ): Promise<Job> {
    if (kind !== "collect" && kind !== "analyze")
      throw new UserError("処理の種類が不正です");
    if (
      articleIds !== null &&
      (!Array.isArray(articleIds) ||
        articleIds.some((item) => typeof item !== "string"))
    ) {
      throw new UserError("記事の指定が不正です");
    }
    if (articleIds !== null && articleIds.length > 100)
      throw new UserError("記事は100件以内で指定してください");
    return this.mutate(["state"], (state) => {
      const previous = jobOf(state.state);
      if (previous.running)
        throw new UserError("処理中です。完了してから再実行してください");
      return this.newJob(state.state, kind, articleIds, false);
    });
  }

  private newJob(
    state: StateRows,
    kind: "collect" | "analyze",
    articleIds: string[] | null,
    automatic: boolean,
  ): Job {
    const job: Job = {
      ...DEFAULT_JOB,
      id: randomToken(),
      running: true,
      automatic,
      kind,
      articleIds: articleIds && [...articleIds],
      queuedAt: timestamp(this.clock()),
      phase: kind === "collect" ? "取得の準備中" : "仕分けの準備中",
      lastFinishedAt: jobOf(state).lastFinishedAt,
    };
    state.job = job;
    return job;
  }

  /**
   * Decides and queues at most one scheduler job in one atomic mutation.
   *
   * Scheduler records are read inside the mutation; every scheduler record
   * write increments the revision, so a concurrent job, setting, cooldown or
   * analysis result makes this decision retry from the new state. Due
   * collection wins, except that one analysis batch may follow a finished
   * collection so that collection longer than its interval cannot starve
   * classification. Only never-analyzed articles are chosen, oldest first.
   */
  async queueAutomaticJob(canAnalyze: boolean): Promise<Job | null> {
    return this.mutate(["state", "articles", "sources"], async (state) => {
      const previous = jobOf(state.state);
      if (previous.running) return null;
      const settings = settingsOf(state.state);
      const now = this.clock();
      const collection = await this.getRecord<{ nextAt: number }>(
        "scheduler",
        "collection",
      );
      const collect =
        settings.autoCollect &&
        now >= (collection?.nextAt ?? 0) &&
        this.sourceConfig.some(
          (config) => state.sources.get(config.id)?.enabled === true,
        );
      let analyze: string[] = [];
      if (canAnalyze && settings.autoAnalyze) {
        const pause = await this.getRecord<{ nextAt: number }>(
          "scheduler",
          "analysis",
        );
        if (now >= (pause?.nextAt ?? 0))
          analyze = [...state.articles.values()]
            .filter((article) => article.analysisStatus === "pending")
            .sort(chronological)
            .slice(0, Math.min(100, settings.pollMinutes))
            .map((article) => article.id);
      }
      if (collect && !(analyze.length && previous.kind === "collect"))
        return this.newJob(state.state, "collect", null, true);
      if (analyze.length)
        return this.newJob(state.state, "analyze", analyze, true);
      return null;
    });
  }

  async claimJob(now: number, leaseSeconds = 600): Promise<Job | null> {
    if (!(leaseSeconds > 0)) throw new UserError("処理の期限が不正です");
    return this.mutate(["state"], (state) => {
      const job = jobOf(state.state);
      if (!job.running || job.leaseUntil > now) return null;
      Object.assign(job, {
        token: randomToken(),
        leaseUntil: now + leaseSeconds,
      });
      return job;
    });
  }

  private async changeJob(
    token: string,
    changes: Partial<Job>,
    mode: "update" | "release" | "finish",
  ): Promise<Job> {
    if (Object.keys(changes).some((key) => JOB_OWNERSHIP.has(key)))
      throw new UserError("処理の所有権は変更できません");
    return this.mutate(["state"], (state) => {
      const job = jobOf(state.state);
      if (
        !token ||
        job.token !== token ||
        !job.running ||
        job.leaseUntil <= this.clock()
      ) {
        throw new UserError("処理の有効期限または所有権が変わりました");
      }
      Object.assign(job, structuredClone(changes));
      if (mode !== "update") Object.assign(job, { token: null, leaseUntil: 0 });
      if (mode === "finish")
        Object.assign(job, {
          running: false,
          lastFinishedAt: timestamp(this.clock()),
        });
      return job;
    });
  }

  async updateJob(token: string, changes: Partial<Job>): Promise<Job> {
    return this.changeJob(token, changes, "update");
  }

  async releaseJob(token: string, changes: Partial<Job>): Promise<Job> {
    return this.changeJob(token, changes, "release");
  }

  async finishJob(token: string, changes: Partial<Job> = {}): Promise<Job> {
    return this.changeJob(token, changes, "finish");
  }

  async getRecord<T extends object = Record<string, unknown>>(
    namespace: string,
    key: string,
  ): Promise<T | null> {
    const result = await this.driver.batch([
      [
        "SELECT data FROM news_records WHERE namespace=? AND key=? AND (expires IS NULL OR expires>?)",
        [namespace, key, this.clock()],
      ],
    ]);
    const row = result[0]?.results[0];
    return row ? decode<T>(textColumn(row, "data")) : null;
  }

  async putRecord(
    namespace: string,
    key: string,
    value: object,
    options: RecordOptions = {},
  ): Promise<void> {
    const { expiresAt, leaseHost, leaseToken, jobToken } = options;
    if ((leaseHost === undefined) !== (leaseToken === undefined))
      throw new UserError("取得処理の所有権が不正です");
    if (jobToken !== undefined && !jobToken)
      throw new UserError("処理の所有権が不正です");
    const now = this.clock();
    const guards: string[] = [];
    const args: SQLValue[] = [];
    if (leaseHost !== undefined && leaseToken !== undefined) {
      guards.push(
        "EXISTS (SELECT 1 FROM news_host_leases WHERE host=? AND token=? AND expires>?)",
      );
      args.push(leaseHost, leaseToken, now);
    }
    if (jobToken !== undefined) {
      guards.push(
        "EXISTS (SELECT 1 FROM news_state WHERE id='job' AND json_extract(data,'$.token')=? " +
          "AND json_extract(data,'$.running')=1 AND json_extract(data,'$.leaseUntil')>?)",
      );
      args.push(jobToken, now);
    }
    const guard = guards.join(" AND ") || "1";
    const statements: SQLStatement[] = [
      [
        `INSERT INTO news_records(namespace,key,data,expires) SELECT ?,?,?,? WHERE ${guard} ` +
          "ON CONFLICT(namespace,key) DO UPDATE SET data=excluded.data,expires=excluded.expires",
        [namespace, key, encode(value), expiresAt ?? null, ...args],
      ],
    ];
    // Scheduler decisions are fenced by the revision, like every business row.
    // The guard still holds within the transaction, so a denied write never
    // changes the revision.
    if (namespace === SCHEDULER)
      statements.push([
        `UPDATE news_meta SET revision=revision+1 WHERE id=1 AND ${guard}`,
        args,
      ]);
    statements.push(["DELETE FROM news_records WHERE expires<=?", [now]]);
    const result = await this.driver.batch(statements);
    if (result[0]?.meta.changes !== 1)
      throw new UserError(
        jobToken === undefined
          ? "取得処理の有効期限または所有権が変わりました"
          : "処理の有効期限または所有権が変わりました",
      );
  }

  async deleteRecord(namespace: string, key: string): Promise<void> {
    const statements: SQLStatement[] = [];
    if (namespace === SCHEDULER)
      statements.push([
        "UPDATE news_meta SET revision=revision+1 WHERE id=1 AND EXISTS " +
          "(SELECT 1 FROM news_records WHERE namespace=? AND key=?)",
        [namespace, key],
      ]);
    statements.push([
      "DELETE FROM news_records WHERE namespace=? AND key=?",
      [namespace, key],
    ]);
    await this.driver.batch(statements);
  }

  async acquireHost(
    host: string,
    now: number,
    leaseSeconds: number,
  ): Promise<string | null> {
    if (!(leaseSeconds > 0)) throw new UserError("取得処理の期限が不正です");
    const token = randomToken();
    const result = await this.driver.batch([
      [
        "INSERT INTO news_host_leases(host,token,expires) VALUES (?,?,?) ON CONFLICT(host) " +
          "DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE news_host_leases.expires<=?",
        [host, token, now + leaseSeconds, now],
      ],
    ]);
    return result[0]?.meta.changes === 1 ? token : null;
  }

  async releaseHost(host: string, token: string): Promise<boolean> {
    const result = await this.driver.batch([
      ["DELETE FROM news_host_leases WHERE host=? AND token=?", [host, token]],
    ]);
    return result[0]?.meta.changes === 1;
  }

  async getBlob(key: string): Promise<Uint8Array | null> {
    const result = await this.driver.batch([
      [
        "SELECT part,data FROM news_blobs WHERE key=? AND (expires IS NULL OR expires>?) ORDER BY part",
        [key, this.clock()],
      ],
    ]);
    const rows = result[0]?.results ?? [];
    if (!rows.length) return null;
    const parts = rows.map((row) => fromBase64(textColumn(row, "data")));
    const value = new Uint8Array(
      parts.reduce((total, part) => total + part.length, 0),
    );
    let offset = 0;
    for (const part of parts) {
      value.set(part, offset);
      offset += part.length;
    }
    return value;
  }

  async putBlob(
    key: string,
    value: Uint8Array,
    expiresAt?: number,
  ): Promise<void> {
    if (!(value instanceof Uint8Array) || value.length > BLOB_LIMIT)
      throw new UserError("キャッシュ本文が上限を超えています");
    const now = this.clock();
    const writes: SQLStatement[] = [
      ["DELETE FROM news_blobs WHERE key=? OR expires<=?", [key, now]],
    ];
    const chunks: Uint8Array[] = [];
    for (let start = 0; start < value.length; start += BLOB_PART)
      chunks.push(value.subarray(start, start + BLOB_PART));
    if (!chunks.length) chunks.push(new Uint8Array());
    chunks.forEach((chunk, part) => {
      writes.push([
        "INSERT INTO news_blobs(key,part,data,expires,created) VALUES (?,?,?,?,?)",
        [key, part, toBase64(chunk), expiresAt ?? null, now],
      ]);
    });
    // Bound the cache by complete entries, not individual chunks. Base64's
    // overhead is included in the cap, so actual binary usage is smaller.
    writes.push([
      "DELETE FROM news_blobs WHERE key IN (SELECT key FROM (" +
        "SELECT key,SUM(SUM(LENGTH(data))) OVER (ORDER BY MAX(created) DESC,key) AS total " +
        "FROM news_blobs GROUP BY key) WHERE total>64000000)",
      [],
    ]);
    await this.driver.batch(writes);
  }

  /**
   * Portable business data; runtime secrets, jobs and response cache excluded.
   *
   * _identity is intentionally retained for faithful article deduplication.
   * This format belongs to NewsRepository, not to an underlying SQL schema.
   */
  async exportSnapshot(): Promise<object> {
    const [revision, state] = await this.snapshot([
      "state",
      "articles",
      "sources",
      "posts",
    ]);
    return {
      format: "nilay-news",
      version: 2,
      revision,
      exportedAt: timestamp(this.clock()),
      settings: settingsOf(state.state),
      schedule: scheduleOf(state.state),
      articles: [...state.articles.values()],
      sources: [...state.sources.values()],
      posts: [...state.posts.values()],
    };
  }

  /**
   * Import once into an empty repository, with automation always disabled.
   *
   * The caller supplies the parsed portable format, never an arbitrary SQL
   * dump. Pending sending claims become unknown; submitted Buffer identities
   * retain their confirmation budget. Reconciliation is required before any
   * unresolved publication can be enabled again.
   */
  async importSnapshot(input: unknown): Promise<object> {
    const snapshot: unknown = structuredClone(input);
    if (
      !isRecord(snapshot) ||
      snapshot.format !== "nilay-news" ||
      snapshot.version !== 2
    ) {
      throw new UserError("対応していない移行データ形式です");
    }
    const { settings, schedule } = snapshot;
    if (
      !isRecord(settings) ||
      Object.keys(settings).length !== SETTING_KEYS.size ||
      Object.keys(settings).some((key) => !SETTING_KEYS.has(key))
    ) {
      throw new UserError("移行データの設定が不正です");
    }
    if (
      !validRubric(settings.rubric) ||
      !validPollMinutes(settings.pollMinutes) ||
      !SELECTIONS.has(settings.postSelection) ||
      typeof settings.autoCollect !== "boolean" ||
      typeof settings.autoAnalyze !== "boolean" ||
      typeof settings.autoPost !== "boolean"
    ) {
      throw new UserError("移行データの設定が不正です");
    }
    if (
      !isRecord(schedule) ||
      Object.keys(schedule).join() !== "next_at" ||
      !finite(schedule.next_at) ||
      schedule.next_at < 0
    ) {
      throw new UserError("移行データの投稿時刻が不正です");
    }
    const tables = new Map<string, Map<string, Record<string, unknown>>>();
    for (const [name, key] of [
      ["articles", "id"],
      ["sources", "id"],
      ["posts", "article_id"],
    ] as const) {
      const rows = snapshot[name];
      if (
        !Array.isArray(rows) ||
        rows.some((row) => !isRecord(row) || typeof row[key] !== "string")
      ) {
        throw new UserError("移行データの記事・情報源・投稿履歴が不正です");
      }
      const table = new Map(
        rows.filter(isRecord).map((row) => [String(row[key]), row]),
      );
      if (table.size !== rows.length)
        throw new UserError("移行データに重複した ID があります");
      tables.set(name, table);
    }
    const articles =
      tables.get("articles") ?? new Map<string, Record<string, unknown>>();
    const posts =
      tables.get("posts") ?? new Map<string, Record<string, unknown>>();
    const sources =
      tables.get("sources") ?? new Map<string, Record<string, unknown>>();
    const identities = new Set<string>();
    for (const [articleId, article] of articles) {
      const identity = article._identity;
      if (
        !/^[a-f0-9]{24}$/.test(articleId) ||
        [
          "_identity",
          "url",
          "title",
          "excerpt",
          "sourceName",
          "discoveredAt",
        ].some((key) => typeof article[key] !== "string") ||
        typeof identity !== "string" ||
        !identity ||
        length(identity) > 16384 ||
        identities.has(identity) ||
        !REVIEW_STATUSES.has(article.reviewStatus) ||
        !ANALYSIS_STATUSES.has(article.analysisStatus) ||
        !Array.isArray(article.sourceIds) ||
        !article.sourceIds.length ||
        article.sourceIds.some((value) => typeof value !== "string")
      ) {
        throw new UserError("移行データの記事が不正です");
      }
      identities.add(identity);
    }
    for (const [articleId, post] of posts) {
      if (
        !articles.has(articleId) ||
        !POST_STATUSES.has(post.status) ||
        ["text", "attempted_at", "claim_token"].some(
          (key) => typeof post[key] !== "string",
        ) ||
        !isInteger(post.check_count) ||
        post.check_count < 0 ||
        post.check_count > 2
      ) {
        throw new UserError("移行データの投稿履歴が不正です");
      }
      if (
        post.status === "submitted" &&
        (["buffer_id", "channel_id"].some(
          (key) => typeof post[key] !== "string" || !post[key],
        ) ||
          !finite(post.check_at))
      ) {
        throw new UserError("移行データの Buffer 登録情報が不正です");
      }
      if (post.status === "publishing")
        Object.assign(post, {
          status: "unknown",
          error: "移行前の送信結果を Buffer と X で確認してください",
        });
      // A stale process on the old database must never own the new record.
      post.claim_token = randomToken();
    }
    const configs = new Map(
      this.sourceConfig.map((source) => [source.id, source]),
    );
    const restoredSources = new Map<string, Source>();
    for (const [sourceId, source] of sources) {
      const config = configs.get(sourceId);
      if (!config) continue; // Historical article provenance remains in sourceIds.
      const allowed = Object.fromEntries(
        SOURCE_STATE.filter((key) => key in source).map((key) => [
          key,
          source[key],
        ]),
      );
      if ("enabled" in allowed && typeof allowed.enabled !== "boolean")
        throw new UserError("移行データの情報源設定が不正です");
      const restored: Source = { ...structuredClone(config), ...allowed };
      if (restored.collectionBlocked) restored.enabled = false;
      restoredSources.set(sourceId, restored);
    }
    const importedSettings = {
      ...settings,
      autoPost: false,
      autoCollect: false,
      autoAnalyze: false,
    } as unknown as Settings;
    const importedSchedule: Schedule = {
      next_at: Math.max(schedule.next_at, this.clock() + 3600),
    };
    return this.mutate(["state", "articles", "sources", "posts"], (state) => {
      if (
        state.articles.size ||
        state.posts.size ||
        jobOf(state.state).running ||
        state.state.imported !== undefined
      ) {
        throw new UserError("移行先は空のデータベースにしてください");
      }
      const current = settingsOf(state.state);
      if (current.autoPost || current.autoCollect || current.autoAnalyze)
        throw new UserError("移行先の自動実行を停止してください");
      // The validated portable documents become repository rows unchanged.
      for (const [id, article] of articles)
        state.articles.set(id, article as unknown as Article);
      for (const [id, post] of posts)
        state.posts.set(id, post as unknown as Post);
      for (const [id, source] of restoredSources) state.sources.set(id, source);
      Object.assign(state.state, {
        settings: importedSettings,
        schedule: importedSchedule,
        job: structuredClone(DEFAULT_JOB),
        imported: { at: timestamp(this.clock()) },
      });
      return {
        articles: articles.size,
        posts: posts.size,
        automationDisabled: true,
      };
    });
  }
}
