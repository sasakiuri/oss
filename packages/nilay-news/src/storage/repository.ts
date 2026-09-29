// cspell:words backoffs
// SPDX-License-Identifier: MIT
/**
 * Portable SQL repository with optimistic, transaction-wide mutation fencing.
 *
 * Every business mutation reads a transactionally consistent snapshot, then uses
 * one atomic batch to compare its revision and apply the changes. Each write also
 * checks an unguessable mutation token: a failed compare cannot accidentally write
 * under a newer revision. No process lock, persistent process, or BEGIN is needed.
 */
import { isSourceCandidate } from "../candidates.ts";
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
import {
  freshness,
  isFreshPublication,
  mergePublication,
  newestFirst,
  publicationSeconds,
} from "../freshness.ts";
import { draft } from "../posts.ts";
import {
  isPostingTime,
  nextPostingAt,
  POST_INTERVAL_SECONDS,
} from "../publication-policy.ts";
import type {
  FinishPostOptions,
  NewsRepository,
  RecordOptions,
} from "../repository.ts";
import { dailySlot, nextDailyRun, nextPhase } from "../schedule.ts";
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
  "dailyCollectionAt",
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

export const DEFAULT_RUBRIC = `日本国内を中心に、海外も同じ内容基準で、狩猟、猟銃・銃の所持、射撃競技、野生鳥獣の被害と保護管理、ジビエ、関連する法令・行政のニュースを集める。
野生動物・外来種の対象は鳥類と哺乳類に限る。ヒアリ等の昆虫、ザリガニ等の甲殻類、魚類、爬虫類、両生類、植物の話題は対象外。狩猟・銃・射撃競技・ジビエは、それ自体が対象分野である。
ゲーム、フィクション、比喩としてのハンター・罠、対象分野と関係のない商品や芸能記事は対象外。ペット・畜産のみの話題も、野生鳥獣や狩猟との具体的な関係がなければ対象外。
野生鳥獣の出没・捕獲・被害、対策・保護・調査、競技大会、銃の事件・事故、制度変更は候補に含める。関連記事欄や、別の主題の記事で付随的に触れただけの言及は対象にしない。
発生地域、日付、対象が異なる事件を混同しない。同じ事件でも新たな被害・捕獲・対策決定などの続報は残す。
取得できた見出しと記事情報で主題の関連性を判断する。本文がなくても主題が明確なら候補または対象外に決める。主題や対象分野との関係が本当に判断できない場合だけ要確認にする。`;

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
/**
 * The current posting round: the automatic candidates snapshotted, newest
 * first, when it opened and not yet posted. Empty when no round is open.
 * Transient runtime state; never part of the portable snapshot.
 */
interface PublicationBatch {
  articleIds: string[];
  openedAt: number;
}
/** The fields of a `crawl_source` record the scheduler reads. */
interface CrawlSourceRecord {
  last_requested: number;
  retry_at?: number;
}
/** Rows of news_state keyed by id; unknown ids are carried through untouched. */
type StateRows = {
  settings?: Settings;
  schedule?: Schedule;
  publication_batch?: PublicationBatch;
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
      ? value.metadata !== undefined &&
        Object.keys(value.metadata).some(
          (name) => name !== "publicationPrecision",
        ) &&
        !citationOnly(value.metadata)
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

/** `offset/period` of a source phased by `collectionOffsetMinutes`, or null. */
function phaseOf(config: SourceConfig): string | null {
  return config.collectionOffsetMinutes === undefined
    ? null
    : `${config.collectionOffsetMinutes}/${config.minCollectionMinutes ?? 60}`;
}

/** The stored automatic time of an offset source under its current phase. */
function autoCollectAt(source: Source, phase: string): number {
  return source.autoCollectPhase === phase &&
    typeof source.autoCollectAt === "string"
    ? Date.parse(source.autoCollectAt) / 1000
    : Number.NaN;
}

function settingsOf(state: StateRows): Settings {
  if (!state.settings) throw new Error("Repository is not initialized");
  return state.settings;
}

function scheduleOf(state: StateRows): Schedule {
  if (!state.schedule) throw new Error("Repository is not initialized");
  return state.schedule;
}

function batchOf(state: StateRows): PublicationBatch {
  if (!state.publication_batch)
    throw new Error("Repository is not initialized");
  return state.publication_batch;
}

function closedBatch(): PublicationBatch {
  return { articleIds: [], openedAt: 0 };
}

/** Automatic posting stops; an open round is never resumed by enabling it again. */
function disablePosting(state: StateRows): void {
  settingsOf(state).autoPost = false;
  state.publication_batch = closedBatch();
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

function assertReviewAllowed(post: Post | undefined): void {
  if (post && BLOCKING.has(post.status))
    throw new UserError(
      "X の投稿処理中、または結果確認待ちです。投稿結果の確認から操作してください",
    );
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

  /**
   * Reads the revision and the requested tables in one transactionally
   * consistent batch. `articleIds` narrows the articles table to those rows,
   * so a mutation neither sees nor writes any other article.
   */
  private async load(
    tables: readonly Table[],
    articleIds?: readonly string[],
  ): Promise<[number, Tables]> {
    const results = await this.driver.batch([
      ["SELECT revision FROM news_meta WHERE id=1", []],
      ...tables.map((table): SQLStatement =>
        table === "articles" && articleIds
          ? [
              "SELECT id,data FROM news_articles WHERE id IN (SELECT value FROM json_each(?))",
              [encode(articleIds)],
            ]
          : [`SELECT id,data FROM news_${table}`, []],
      ),
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
    articleIds?: readonly string[],
  ): Promise<R> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const [version, after] = await this.load(tables, articleIds);
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
      state.state.publication_batch ??= closedBatch();
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
        // An automatic time survives only while its offset and period stand.
        const phase = phaseOf(config);
        if (phase !== null && previous.autoCollectPhase === phase)
          Object.assign(source, {
            autoCollectAt: previous.autoCollectAt,
            autoCollectPhase: phase,
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
      // Switching automatic posting either way discards the open round.
      if (valid.autoPost !== previous.autoPost)
        state.state.publication_batch = closedBatch();
      if (valid.autoPost && !previous.autoPost) {
        if (
          [...state.posts.values()].some((post) => BLOCKING.has(post.status))
        ) {
          throw new UserError(
            "投稿結果を確認し、保留中の記事を解決してから有効にしてください",
          );
        }
        const schedule = scheduleOf(state.state);
        schedule.next_at = nextPostingAt(
          Math.max(schedule.next_at, this.clock() + POST_INTERVAL_SECONDS),
        );
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

  async scheduleAutoCollection(
    sourceId: string,
    at: number,
    jobToken: string,
  ): Promise<void> {
    if (!Number.isFinite(at)) throw new UserError("収集予定時刻が不正です");
    await this.mutate(["state", "sources"], (state) => {
      const job = jobOf(state.state);
      if (
        !jobToken ||
        !job.running ||
        job.token !== jobToken ||
        job.leaseUntil <= this.clock()
      )
        throw new UserError("処理の有効期限または所有権が変わりました");
      const source = state.sources.get(sourceId);
      const config = this.sourceConfig.find((item) => item.id === sourceId);
      if (!config || !source) throw new NotFoundError("情報源が見つかりません");
      const phase = phaseOf(config);
      if (phase === null) return;
      const stored = autoCollectAt(source, phase);
      const next = stored > this.clock() ? Math.max(stored, at) : at;
      Object.assign(source, {
        autoCollectAt: timestamp(Math.ceil(next)),
        autoCollectPhase: phase,
      });
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
          // Storage is the final authority: a story already older than the
          // freshness window is never added. Undated, invalid or future
          // times are kept for review but excluded from automation.
          if (
            freshness(
              item.publishedAt,
              this.clock(),
              item.metadata?.publicationPrecision,
            ) === "stale"
          )
            continue;
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
        // Never later than a valid time already known: an update timestamp or
        // re-listing must not revive a historical article.
        const published = mergePublication(
          article.publishedAt,
          item.publishedAt,
          sameSource,
          article.metadata?.publicationPrecision,
          item.metadata?.publicationPrecision,
        );
        const selectedTime = publicationSeconds(published);
        const observations = [article, item].filter(
          (observation) =>
            selectedTime !== null &&
            publicationSeconds(observation.publishedAt) === selectedTime,
        );
        const dateOnly =
          observations.length > 0 &&
          observations.every(
            (observation) =>
              observation.metadata?.publicationPrecision === "date",
          );
        if (published !== (article.publishedAt ?? null))
          article.publishedAt = published;
        if (sameSource) updateContent(article, item, timestamp(this.clock()));
        // Metadata belongs to the selected publication time, even when other
        // content is refreshed by a later or less precise observation.
        if (dateOnly)
          article.metadata = {
            ...article.metadata,
            publicationPrecision: "date",
          };
        else if (article.metadata?.publicationPrecision !== undefined) {
          article.metadata = { ...article.metadata };
          delete article.metadata.publicationPrecision;
        }
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
      assertReviewAllowed(state.posts.get(articleId));
      Object.assign(article, {
        reviewStatus: status,
        reviewedAt: timestamp(this.clock()),
      });
      return publicArticle(article);
    });
  }

  async dismiss(articleIds: unknown): Promise<Article[]> {
    if (
      !Array.isArray(articleIds) ||
      !articleIds.length ||
      !articleIds.every(
        (id): id is string =>
          typeof id === "string" && /^[a-f0-9]{24}$/.test(id),
      )
    )
      throw new UserError("見送る記事を選択してください");
    const ids = [...new Set(articleIds)];
    return this.mutate(
      ["articles", "posts"],
      (state) => {
        const reviewedAt = timestamp(this.clock());
        return ids.map((id) => {
          const article = articleOf(state.articles, id);
          assertReviewAllowed(state.posts.get(id));
          if (article.reviewStatus === "posted")
            throw new UserError(
              "投稿済みの記事はまとめて見送れません。一覧を更新してください",
            );
          Object.assign(article, { reviewStatus: "dismissed", reviewedAt });
          return publicArticle(article);
        });
      },
      ids,
    );
  }

  /**
   * `nextAt` is the earliest time a new post may be sent: the stored start of
   * the next round, moved to the next posting window when it, or a past due
   * time seen now, falls outside the window. While a round is open, its
   * remaining articles are due now, or when the posting window next opens.
   */
  private static publication(
    state: Pick<Tables, "state" | "posts">,
    now: number,
  ): Publication {
    const posts = [...state.posts.values()].sort((a, b) =>
      byKey(b.attempted_at, a.attempted_at),
    );
    const due = scheduleOf(state.state).next_at;
    const earliest = Math.max(due, now);
    return {
      nextAt: state.state.publication_batch?.articleIds.length
        ? nextPostingAt(now)
        : isPostingTime(earliest)
          ? due
          : nextPostingAt(earliest),
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
    return SQLRepository.publication(state, this.clock());
  }

  /**
   * Whether `article` is an automatic post candidate at `now` under the
   * current settings, ignoring its post record. Every mode, including saved
   * and source-rule articles, requires a fresh publication time; older,
   * undated and future articles stay only for manual review.
   */
  private static eligible(
    state: Pick<Tables, "state">,
    article: Article,
    now: number,
  ): boolean {
    const selection = settingsOf(state.state).postSelection;
    // A source-rule candidate ignores Jev entirely, including a duplicate
    // relation; the manual review and the post record still apply.
    const source = isSourceCandidate(article);
    return (
      isFreshPublication(
        article.publishedAt,
        now,
        article.metadata?.publicationPrecision,
      ) &&
      article.reviewStatus !== "posted" &&
      article.reviewStatus !== "dismissed" &&
      (source ||
        !["duplicate", "uncertain"].includes(article.relation ?? "")) &&
      ((selection !== "candidates" && article.reviewStatus === "saved") ||
        (selection !== "saved" &&
          (source ||
            (article.analysisStatus === "done" &&
              article.decision === "candidate"))))
    );
  }

  /** Automatic post candidates at `now` without a post record, newest publication first. */
  private static candidates(
    state: Pick<Tables, "state" | "posts" | "articles">,
    now: number,
  ): Article[] {
    return [...state.articles.values()]
      .filter(
        (article) =>
          !state.posts.has(article.id) &&
          SQLRepository.eligible(state, article, now),
      )
      .sort(newestFirst);
  }

  async postCandidates(): Promise<Article[]> {
    const [, state] = await this.snapshot(["state", "posts", "articles"]);
    return SQLRepository.candidates(state, this.clock()).map(publicArticle);
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
    if (expired) disablePosting(state.state);
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
    await this.recoverPosts(Math.max(now, this.clock()));
    // A stale tick timestamp never sends after the posting window closed.
    if (!isPostingTime(Math.max(now, this.clock()))) return null;
    // The minute tick normally exits here, without reading any articles or
    // historical posts. The actual reservation still rechecks everything in
    // its atomic mutation, including settings and eligibility changes.
    const gate = await this.driver.batch([
      [
        "SELECT id,data FROM news_state WHERE id IN ('settings','schedule')",
        [],
      ],
      ["SELECT id,data FROM news_state WHERE id='publication_batch'", []],
      [
        "SELECT 1 FROM news_posts WHERE json_extract(data,'$.status') IN ('publishing','submitted','unknown','failed') LIMIT 1",
        [],
      ],
    ]);
    const current: StateRows = {};
    for (const row of [
      ...(gate[0]?.results ?? []),
      ...(gate[1]?.results ?? []),
    ]) {
      const id = textColumn(row, "id");
      if (id === "settings")
        current.settings = decode<Settings>(textColumn(row, "data"));
      if (id === "schedule")
        current.schedule = decode<Schedule>(textColumn(row, "data"));
      if (id === "publication_batch")
        current.publication_batch = decode<PublicationBatch>(
          textColumn(row, "data"),
        );
    }
    if (
      !settingsOf(current).autoPost ||
      (scheduleOf(current).next_at > Math.max(now, this.clock()) &&
        !batchOf(current).articleIds.length) ||
      gate[2]?.results.length
    )
      return null;
    return this.mutate(["state", "articles", "posts"], (state) => {
      const current = Math.max(now, this.clock());
      SQLRepository.expirePosts(state, current);
      const settings = settingsOf(state.state);
      const schedule = scheduleOf(state.state);
      // Freshness and the posting window use the later clock, so a stale
      // tick timestamp never selects an aged-out article or sends after 23:00.
      if (!settings.autoPost || !isPostingTime(current)) return null;
      // Posts of a round are sent one at a time: each waits until the
      // previous one is confirmed, and an unresolved one stops the round.
      if ([...state.posts.values()].some((post) => BLOCKING.has(post.status)))
        return null;
      const candidates = SQLRepository.candidates(state, current);
      const batch = batchOf(state.state);
      let article: Article | undefined;
      if (batch.articleIds.length) {
        // A round only shrinks: articles no longer eligible now, including
        // aged-out ones after the night, leave it; new arrivals never join.
        const eligible = new Map(candidates.map((item) => [item.id, item]));
        batch.articleIds = batch.articleIds.filter((id) => eligible.has(id));
        article = eligible.get(batch.articleIds[0] ?? "");
        if (!article) state.state.publication_batch = closedBatch();
      }
      if (!article) {
        // A round opens when due with every current candidate; idle ticks
        // reserve nothing, so arriving news opens the next round when due.
        article = candidates[0];
        if (schedule.next_at > current || !article) return null;
        state.state.publication_batch = {
          articleIds: candidates.map((item) => item.id),
          openedAt: current,
        };
        schedule.next_at = nextPostingAt(current + POST_INTERVAL_SECONDS);
      }
      const claimToken = randomToken();
      const post: Post = {
        article_id: article.id,
        status: "publishing",
        text: "",
        // A delayed tick gets a fresh lease, starting when it actually claims.
        attempted_at: timestamp(current),
        claim_token: claimToken,
        claim_expires_at: current + 600,
        check_count: 0,
      };
      state.posts.set(article.id, post);
      try {
        post.text = draft(article);
      } catch (error) {
        if (!(error instanceof UserError)) throw error;
        Object.assign(post, { status: "failed", error: error.message });
        disablePosting(state.state);
        return null;
      }
      return { articleId: article.id, text: post.text, claimToken };
    });
  }

  /**
   * The last check before an unsent claim reaches Buffer. Only this claim's
   * own unexpired `publishing` record may be sent, within the posting window,
   * with automatic posting still enabled, no other post blocking, the article still a candidate
   * under the current settings, review, analysis and freshness, and its
   * current draft identical to the claimed text. When its own live claim is
   * no longer eligible, only that unsent record is withdrawn, so the article
   * is neither failed nor unknown. It stays in its round, which the next
   * claim rechecks. The next round keeps its scheduled hourly start even
   * if all articles in the current round become ineligible.
   * A lost, replaced or expired claim is refused without any change, since
   * another attempt may already be in flight or awaiting confirmation.
   */
  async authorizePostSend(
    articleId: string,
    claimToken: string,
    now: number,
  ): Promise<boolean> {
    return this.mutate(
      ["state", "articles", "posts"],
      (state) => {
        // Snapshot reads and CAS retries can cross the daily closing time.
        const current = Math.max(now, this.clock());
        const post = state.posts.get(articleId);
        if (
          !claimToken ||
          post?.status !== "publishing" ||
          post.claim_token !== claimToken ||
          post.claim_expires_at <= current
        )
          return false;
        const article = state.articles.get(articleId);
        if (
          isPostingTime(current) &&
          settingsOf(state.state).autoPost &&
          ![...state.posts.values()].some(
            (other) => other !== post && BLOCKING.has(other.status),
          ) &&
          article &&
          SQLRepository.eligible(state, article, current) &&
          SQLRepository.sameDraft(article, post.text)
        )
          return true;
        state.posts.delete(articleId);
        return false;
      },
      [articleId],
    );
  }

  /** Whether the article still drafts exactly the claimed text. */
  private static sameDraft(article: Article, text: string): boolean {
    try {
      return draft(article) === text;
    } catch (error) {
      if (error instanceof UserError) return false;
      throw error;
    }
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
      // The round, not each post, holds the next one back: the rest of the
      // round follows as soon as this post is confirmed.
      const batch = batchOf(state.state);
      batch.articleIds = batch.articleIds.filter((id) => id !== articleId);
      if (!batch.articleIds.length)
        state.state.publication_batch = closedBatch();
      Object.assign(articleOf(state.articles, articleId), {
        reviewStatus: "posted",
        reviewedAt: timestamp(now),
      });
    } else {
      disablePosting(state.state);
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
        check_at: now + 120,
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
      return SQLRepository.publication(state, this.clock());
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
    // Only the target and its relation are read, independent of the inbox size.
    const selected = result.relatedArticleId
      ? [articleId, result.relatedArticleId]
      : [articleId];
    return this.mutate(
      ["state", "articles"],
      async (state) => {
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
      },
      selected,
    );
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
   * An automatic collection of the given sources, fully initialized so that
   * the slice runner neither expands it to every source nor moves the
   * regular collection interval. `slot` is the daily JST slot it serves, if
   * any daily source is included.
   */
  private scheduledJob(
    state: StateRows,
    sourceIds: string[],
    slot: number,
  ): Job {
    return Object.assign(this.newJob(state, "collect", null, true), {
      phase: slot ? "定時収集の準備中" : "予定時刻の収集の準備中",
      ...(slot ? { dailyCollectionAt: slot } : {}),
      workIds: sourceIds,
      total: sourceIds.length,
      progress: 0,
      rubric: settingsOf(state).rubric,
      failed: 0,
      created: 0,
      limited: 0,
      deferred: 0,
    });
  }

  /**
   * Offset RSS sources due now, earliest first. A source without a time
   * under its current phase, or one overdue by a whole period (automation
   * off, source disabled, outage), is phased to the next JST slot no earlier
   * than the current minute and its settled crawl record; the row is written
   * by the caller's mutation. A slot at hh:mm:00 is due for a Cron firing
   * later in that minute.
   */
  private dueOffsets(
    sources: Map<string, Source>,
    configs: readonly SourceConfig[],
    records: Map<string, CrawlSourceRecord>,
    backoffs: Map<string, number>,
    now: number,
  ): string[] {
    const due: [number, string][] = [];
    for (const config of configs) {
      const source = sources.get(config.id);
      const phase = phaseOf(config);
      if (!source || phase === null) continue;
      const minutes = config.minCollectionMinutes ?? 60;
      const period = minutes * 60;
      let at = autoCollectAt(source, phase);
      if (!(at > now - period)) {
        const record = records.get(config.id);
        // Align the phase once; never round an actual request's minimum
        // up to another whole period. Shared host blocks resume staggered.
        at = Math.max(
          nextPhase(
            Math.max(
              Math.floor(now / 60) * 60,
              backoffs.get(
                new URL(config.url).hostname.replace(/^www\./, ""),
              ) ?? 0,
            ),
            config.collectionOffsetMinutes ?? 0,
            minutes,
          ),
          record ? record.last_requested + period : 0,
          record?.retry_at ?? 0,
        );
        Object.assign(source, {
          autoCollectAt: timestamp(at),
          autoCollectPhase: phase,
        });
      }
      if (at <= now) due.push([at, config.id]);
    }
    return due.sort((a, b) => a[0] - b[0]).map(([, id]) => id);
  }

  /**
   * Decides and queues at most one scheduler job in one atomic mutation.
   *
   * Scheduler records are read inside the mutation; every scheduler record
   * write increments the revision, so a concurrent job, setting, cooldown or
   * analysis result makes this decision retry from the new state.
   *
   * Offset RSS sources at their phased time and fixed daily sources at their
   * JST time come first, independent of the regular interval. An idle
   * automatic job yields to them at an item boundary: remaining sources are
   * carried and remaining analysis stays pending for a later batch. Offset
   * sources, each a single feed request, run before daily ones so a daily
   * batch does not shift their phase; manual jobs and live leases are never
   * replaced, and a queued batch that already holds every due source
   * continues. Neither time is revision-fenced against the crawl records, so
   * a source claimed meanwhile is deferred by CachedFetch.beginSource under
   * the host lease instead.
   *
   * Otherwise due regular collection wins, except that one analysis batch may
   * follow a finished collection so that collection longer than its interval
   * cannot starve classification. Only never-analyzed articles published
   * within the freshness window are chosen, newest first; older, undated,
   * invalid and future articles are left for manual review.
   */
  async queueAutomaticJob(canAnalyze: boolean): Promise<Job | null> {
    return this.mutate(["state", "sources"], async (state) => {
      const previous = jobOf(state.state);
      const settings = settingsOf(state.state);
      const now = this.clock();
      const active = (config: SourceConfig) => {
        const source = state.sources.get(config.id);
        return source?.enabled === true && !source.collectionBlocked;
      };
      const candidates = settings.autoCollect
        ? this.sourceConfig.filter(
            (config) =>
              (config.dailyAtJst || phaseOf(config) !== null) && active(config),
          )
        : [];
      const records = await this.crawlSources(
        candidates.map((config) => config.id),
        now,
      );
      const daily: string[] = [];
      let slot = 0;
      for (const config of candidates) {
        if (!config.dailyAtJst) continue;
        const started = records.get(config.id)?.last_requested;
        if (nextDailyRun(now, config.dailyAtJst, started) > now) continue;
        daily.push(config.id);
        slot = Math.max(slot, dailySlot(now, config.dailyAtJst));
      }
      const offsetHosts = [
        ...new Set(
          candidates
            .filter((item) => phaseOf(item) !== null)
            .map((item) => new URL(item.url).hostname.replace(/^www\./, "")),
        ),
      ];
      const backoffs = new Map(
        await Promise.all(
          offsetHosts.map(async (host): Promise<[string, number]> => {
            const record = await this.getRecord<{ blocked_until: number }>(
              "crawl_host",
              host,
            );
            if (record && !Number.isFinite(record.blocked_until))
              throw new UserError("サイトの待機記録が不正です");
            return [host, record?.blocked_until ?? 0];
          }),
        ),
      );
      const due = [
        ...this.dueOffsets(state.sources, candidates, records, backoffs, now),
        ...daily,
      ];
      if (previous.running) {
        if (!previous.automatic || previous.leaseUntil > now) return null;
        const remaining =
          previous.kind === "collect"
            ? (previous.workIds?.slice(previous.progress) ?? [])
            : [];
        if (due.every((id) => remaining.includes(id))) return null;
        const configs = new Map(
          this.sourceConfig.map((config) => [config.id, config]),
        );
        const rank = (id: string) => {
          const config = configs.get(id);
          return config && phaseOf(config) !== null
            ? 0
            : config?.dailyAtJst
              ? 1
              : 2;
        };
        const work = [...new Set([...remaining, ...due])].sort(
          (a, b) => rank(a) - rank(b),
        );
        if (remaining.some((id) => rank(id) === 1))
          slot = Math.max(slot, previous.dailyCollectionAt ?? 0);
        return this.scheduledJob(state.state, work, slot);
      }
      if (due.length) return this.scheduledJob(state.state, due, slot);
      const collection = await this.getRecord<{ nextAt: number }>(
        "scheduler",
        "collection",
      );
      const collect =
        settings.autoCollect &&
        now >= (collection?.nextAt ?? 0) &&
        this.sourceConfig.some(
          (config) =>
            !config.dailyAtJst && phaseOf(config) === null && active(config),
        );
      let analyze: string[] = [];
      if (canAnalyze && settings.autoAnalyze) {
        const pause = await this.getRecord<{ nextAt: number }>(
          "scheduler",
          "analysis",
        );
        // Read after the snapshot: every article write increments the
        // revision, so a decision on newer articles is rejected and retried.
        if (now >= (pause?.nextAt ?? 0))
          analyze = (await this.pendingArticles())
            .filter((article) =>
              isFreshPublication(
                article.publishedAt,
                now,
                article.metadata?.publicationPrecision,
              ),
            )
            .sort(newestFirst)
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

  /** Unexpired `crawl_source` records of the given sources, in one query. */
  private async crawlSources(
    sourceIds: readonly string[],
    now: number,
  ): Promise<Map<string, CrawlSourceRecord>> {
    if (!sourceIds.length) return new Map();
    const result = await this.driver.batch([
      [
        "SELECT key,data FROM news_records WHERE namespace=? AND key IN (SELECT value FROM json_each(?)) AND (expires IS NULL OR expires>?)",
        ["crawl_source", encode(sourceIds), now],
      ],
    ]);
    // A malformed record is left to CachedFetch, which refuses it.
    return new Map(
      (result[0]?.results ?? []).flatMap((row) => {
        const data = decode<Record<string, unknown>>(textColumn(row, "data"));
        if (!finite(data.last_requested)) return [];
        const record: CrawlSourceRecord = {
          last_requested: data.last_requested,
        };
        if (finite(data.retry_at)) record.retry_at = data.retry_at;
        return [[textColumn(row, "key"), record] as const];
      }),
    );
  }

  /** Never-analyzed articles, filtered in SQL so an analyzed inbox is not transferred. */
  private async pendingArticles(): Promise<Article[]> {
    const result = await this.driver.batch([
      [
        "SELECT data FROM news_articles WHERE json_extract(data,'$.analysisStatus')='pending'",
        [],
      ],
    ]);
    return (result[0]?.results ?? []).map((row) =>
      decode<Article>(textColumn(row, "data")),
    );
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
      next_at: nextPostingAt(
        Math.max(schedule.next_at, this.clock() + POST_INTERVAL_SECONDS),
      ),
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
        // An open round is runtime state; imported posting starts afresh.
        publication_batch: closedBatch(),
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
