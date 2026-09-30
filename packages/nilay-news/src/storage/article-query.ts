// SPDX-License-Identifier: MIT
/** SQL predicates for the inbox and aggregate counts share one clock policy. */
import { UserError } from "../errors.ts";
import type { ArticleQuery } from "../repository.ts";

import type { SQLValue } from "./repository.ts";

const field = (key: string) => `json_extract(a.data,'$.${key}')`;
export const freshSQL = `${field("_publicationSeconds")} <= clock.now AND (${field("_publicationUntil")} > clock.now OR (${field("_publicationDate")}=0 AND ${field("_publicationUntil")}=clock.now))`;
const stale = `${field("_publicationSeconds")} <= clock.now AND NOT (${freshSQL})`;
const source = `${field("_sourceCandidate")}=1`;
const unread = `${field("reviewStatus")}='unread'`;
export const bucketsSQL: Record<string, string> = {
  all: "1",
  inbox: `${unread} AND (${freshSQL}) AND (${source} OR COALESCE(${field("decision")},'')<>'irrelevant')`,
  saved: `${field("reviewStatus")}='saved'`,
  approved: `${field("reviewStatus")}='approved'`,
  review: `${unread} AND (${freshSQL}) AND NOT (${source}) AND ${field("analysisStatus")}='done' AND (${field("decision")}='review' OR ${field("relation")}='uncertain')`,
  pending: `${unread} AND (${freshSQL}) AND NOT (${source}) AND ${field("analysisStatus")}<>'done'`,
  dates: `${unread} AND (${field("_publicationSeconds")} IS NULL OR ${field("_publicationSeconds")}>clock.now)`,
  expired: `${unread} AND (${stale})`,
  posted: `${field("reviewStatus")}='posted'`,
  dismissed: `${field("reviewStatus")}='dismissed' OR (${unread} AND (${freshSQL}) AND NOT (${source}) AND ${field("decision")}='irrelevant')`,
};
export const statsSQL = {
  pending: `${field("analysisStatus")}<>'done' AND (${freshSQL})`,
  expired: `${field("analysisStatus")}<>'done' AND (${stale})`,
  dateReview: `${field("analysisStatus")}<>'done' AND (${field("_publicationSeconds")} IS NULL OR ${field("_publicationSeconds")}>clock.now)`,
};
export function eligibleSQL(selection: string): string {
  const approved = `${field("reviewStatus")}='approved'`;
  return `(${freshSQL}) AND ${field("reviewStatus")} NOT IN ('posted','dismissed') AND (${approved} OR ${source} OR COALESCE(${field("relation")},'') NOT IN ('duplicate','uncertain')) AND (${approved} OR (${selection !== "candidates" ? "1" : "0"}=1 AND ${field("reviewStatus")}='saved') OR (${selection !== "saved" ? "1" : "0"}=1 AND (${source} OR (${field("analysisStatus")}='done' AND ${field("decision")}='candidate')))) AND NOT EXISTS (SELECT 1 FROM news_posts p WHERE p.id=a.id) AND (COALESCE(${field("sourceKey")},'')<>'' OR NOT EXISTS (SELECT 1 FROM news_articles used LEFT JOIN news_posts p ON p.id=used.id WHERE COALESCE(json_extract(used.data,'$.sourceKey'),'')='' AND json_extract(used.data,'$.url')=${field("url")} AND (p.id IS NOT NULL OR json_extract(used.data,'$.reviewStatus')='posted')))`;
}
export function querySQL(query: ArticleQuery): {
  where: string;
  order: string;
  values: SQLValue[];
  limit: number;
  offset: number;
} {
  const bucket = query.bucket ?? "inbox";
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  if (
    !Object.hasOwn(bucketsSQL, bucket) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    (query.sort && !["newest", "priority"].includes(query.sort))
  )
    throw new UserError("記事の取得条件が不正です");
  const filters = [`(${bucketsSQL[bucket]})`];
  const values: SQLValue[] = [];
  if (query.query) {
    if (query.query.length > 500) throw new UserError("検索条件が長すぎます");
    filters.push(`instr(COALESCE(${field("_listSearch")},''),?)>0`);
    values.push(query.query.toLocaleLowerCase());
  }
  if (query.topic) {
    filters.push(`${field("topic")}=?`);
    values.push(query.topic);
  }
  if (query.analysis) {
    if (["pending", "error"].includes(query.analysis)) {
      filters.push(`${field("analysisStatus")}=?`);
      values.push(query.analysis);
    } else {
      filters.push(
        `${field("analysisStatus")}='done' AND ${field("decision")}=?`,
      );
      values.push(query.analysis);
    }
  }
  if (query.relation === "none")
    filters.push(`${field("relation")} IS NULL OR ${field("relation")}=''`);
  else if (query.relation) {
    filters.push(`${field("relation")}=?`);
    values.push(query.relation);
  }
  const priority =
    query.sort === "priority"
      ? `(CASE WHEN ${source} THEN 3 WHEN ${field("decision")}='candidate' THEN 3 WHEN ${field("decision")}='review' THEN 1 WHEN ${field("decision")}='irrelevant' THEN -1 ELSE 0 END * 10 + COALESCE(${field("priority")},0)) DESC,`
      : "";
  return {
    where: filters.map((filter) => `(${filter})`).join(" AND "),
    order: `${priority}${field("_listOrder")} DESC,${field("discoveredAt")} DESC,a.id ASC`,
    values,
    limit,
    offset,
  };
}
