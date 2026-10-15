// SPDX-License-Identifier: MIT
/** Repository initialization and settings/source edits. */
import { DEFAULT_RUBRIC } from "../criteria.ts";
import type { Settings, Source } from "../domain.ts";
import { NotFoundError, SettingsConflictError, UserError } from "../errors.ts";
import {
  nextPostingAt,
  POST_INTERVAL_SECONDS,
  UNRESOLVED_POST_STATUSES,
} from "../publishing/policy.ts";
import type { SettingsSnapshot } from "../repository.ts";
import type { SourceConfig } from "../sources/types.ts";
import { isInteger, length, randomToken, strip } from "../text.ts";
import { isoSeconds as timestamp } from "../time.ts";

import { RESET_ALL_ANALYSES } from "./article-content.ts";
import { textColumn } from "./row-codec.ts";
import { autoCollectAt, phaseOf } from "./source-schedule.ts";
import {
  closedBatch,
  DEFAULT_JOB,
  jobOf,
  scheduleOf,
  settingsOf,
} from "./state.ts";
import type { StorageContext } from "./transaction-store.ts";

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

const SOURCE_STATE = [
  "enabled",
  "lastFetchedAt",
  "lastError",
  "lastCount",
  "lastWarnings",
  "lastDeferred",
  "nextFetchAt",
] as const;

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

export class ConfigurationStore {
  private readonly context: StorageContext;
  private readonly sourceConfig: readonly SourceConfig[];
  private readonly sourceIds: ReadonlySet<string>;

  constructor(context: StorageContext, sources: readonly SourceConfig[]) {
    this.context = context;
    this.sourceConfig = sources;
    this.sourceIds = new Set(sources.map((source) => source.id));
  }

  async initialize(): Promise<void> {
    // Backfill existing rows once, in bounded, revision-fenced chunks. No date
    // parsing in SQL: stored/RFC dates obey the same policy as fresh writes.
    for (;;) {
      const result = await this.context.driver.batch([
        [
          "SELECT id FROM news_articles WHERE json_extract(data,'$._publicationIndex') IS NULL OR json_extract(data,'$._publicationIndex')<3 ORDER BY id LIMIT 100",
          [],
        ],
      ]);
      const ids = (result[0]?.results ?? []).map((row) =>
        textColumn(row, "id"),
      );
      if (!ids.length) break;
      await this.context.transactions.mutate(
        ["articles"],
        () => undefined,
        ids,
      );
    }
    await this.context.transactions.mutate(["state", "sources"], (state) => {
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
      state.state.settings_revision ??= { value: randomToken() };
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

  async settings(): Promise<Settings> {
    const [, state] = await this.context.transactions.snapshot(["state"]);
    return settingsOf(state.state);
  }

  async settingsSnapshot(): Promise<SettingsSnapshot> {
    const [, snapshot] = await this.context.transactions.snapshot(["state"]);
    const revision = snapshot.state.settings_revision?.value;
    if (!revision) throw new Error("Repository is not initialized");
    return { ...settingsOf(snapshot.state), revision };
  }

  async updateSettings(
    changes: Record<string, unknown>,
    expectedRevision?: string,
  ): Promise<Settings> {
    if (Object.keys(changes).some((key) => !SETTING_KEYS.has(key)))
      throw new UserError("未対応の設定項目です");
    return this.context.transactions.mutate(
      ["state", "posts"],
      (state, statements) => {
        // Compare on every retry, before rubric resets, scheduling or any writes.
        if (
          expectedRevision !== undefined &&
          expectedRevision !== state.state.settings_revision?.value
        )
          throw new SettingsConflictError();
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
            [...state.posts.values()].some((post) =>
              UNRESOLVED_POST_STATUSES.has(post.status),
            )
          ) {
            throw new UserError(
              "投稿結果を確認し、保留中の記事を解決してから有効にしてください",
            );
          }
          const schedule = scheduleOf(state.state);
          schedule.next_at = nextPostingAt(
            Math.max(
              schedule.next_at,
              this.context.clock() + POST_INTERVAL_SECONDS,
            ),
          );
        }
        if (valid.rubric !== previous.rubric)
          statements.push(RESET_ALL_ANALYSES);
        state.state.settings = valid;
        // Even a no-op public edit must commit its compare atomically rather
        // than returning before the mutation fence has run.
        if (expectedRevision !== undefined)
          state.state.settings_revision = { value: randomToken() };
        return valid;
      },
    );
  }

  async sources(): Promise<Source[]> {
    const [, state] = await this.context.transactions.snapshot(["sources"]);
    return this.sourceConfig.flatMap(
      (config) => state.sources.get(config.id) ?? [],
    );
  }

  async updateSource(
    sourceId: string,
    changes: Partial<Source>,
  ): Promise<Source> {
    return this.context.transactions.mutate(["sources"], (state) => {
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
    await this.context.transactions.mutate(["state", "sources"], (state) => {
      const job = jobOf(state.state);
      if (
        !jobToken ||
        !job.running ||
        job.token !== jobToken ||
        job.leaseUntil <= this.context.clock()
      )
        throw new UserError("処理の有効期限または所有権が変わりました");
      const source = state.sources.get(sourceId);
      const config = this.sourceConfig.find((item) => item.id === sourceId);
      if (!config || !source) throw new NotFoundError("情報源が見つかりません");
      const phase = phaseOf(config);
      if (phase === null) return;
      const stored = autoCollectAt(source, phase);
      const next = stored > this.context.clock() ? Math.max(stored, at) : at;
      Object.assign(source, {
        autoCollectAt: timestamp(Math.ceil(next)),
        autoCollectPhase: phase,
      });
    });
  }
}
