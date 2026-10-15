// SPDX-License-Identifier: MIT
import type { Article } from "../../src/domain.ts";
import type { CollectedItem, SourceConfig } from "../../src/sources/types.ts";

/** The common epoch-second start for repository, application and Publisher tests. */
export const START = 10_000;
/** A zoned publication time `seconds` after the common start clock. */
export function published(seconds: number): string {
  return new Date((START + seconds) * 1000).toISOString();
}

export function rssSource(changes: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: "one",
    name: "Source",
    description: "Fixture",
    url: "https://example.org/feed",
    kind: "rss",
    enabled: true,
    ...changes,
  };
}

export function namedRssSource(
  id: string,
  changes: Partial<SourceConfig> = {},
): SourceConfig {
  return rssSource({
    id,
    name: id,
    description: id,
    url: `https://example.org/${id}`,
    ...changes,
  });
}

export function collectedItem(
  changes: Partial<CollectedItem> = {},
): CollectedItem {
  return {
    title: "クマの出没と対策",
    url: "https://example.org/a",
    excerpt: "市が対策を発表",
    publishedAt: published(-3600),
    ...changes,
  };
}

export function articleFixture(changes: Partial<Article> = {}): Article {
  return {
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
    ...changes,
  };
}
