// SPDX-License-Identifier: MIT
import type { Article, Job, Post, Settings, Source } from "../domain.ts";

import type { SQLStatement } from "./sql.ts";

export const DEFAULT_JOB: Job = {
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

export interface Schedule {
  next_at: number;
}

/**
 * The current posting round: the automatic candidates snapshotted, newest
 * first, when it opened and not yet posted. Empty when no round is open.
 * Transient runtime state.
 */
export interface PublicationBatch {
  articleIds: string[];
  openedAt: number;
}

/** Rows of news_state keyed by id; unknown ids are carried through untouched. */
export type StateRows = {
  settings?: Settings;
  settings_revision?: { value: string };
  schedule?: Schedule;
  publication_batch?: PublicationBatch;
  job?: Job;
};

export interface Tables {
  articles: Map<string, Article>;
  sources: Map<string, Source>;
  posts: Map<string, Post>;
  state: StateRows;
}

export type Table = keyof Tables;

/**
 * The article rows a load reads: listed IDs, or the `id,data` rows a query
 * selects in the same consistent batch.
 */
export type ArticleScope = readonly string[] | { query: SQLStatement };

export function settingsOf(state: StateRows): Settings {
  if (!state.settings) throw new Error("Repository is not initialized");
  return state.settings;
}

export function scheduleOf(state: StateRows): Schedule {
  if (!state.schedule) throw new Error("Repository is not initialized");
  return state.schedule;
}

export function batchOf(state: StateRows): PublicationBatch {
  if (!state.publication_batch)
    throw new Error("Repository is not initialized");
  return state.publication_batch;
}

export function closedBatch(): PublicationBatch {
  return { articleIds: [], openedAt: 0 };
}

export function jobOf(state: StateRows): Job {
  if (!state.job) throw new Error("Repository is not initialized");
  return state.job;
}
