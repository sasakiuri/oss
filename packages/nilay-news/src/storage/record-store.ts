// SPDX-License-Identifier: MIT
/** Expiring crawl records, host leases, and chunked response bodies. */
import { UserError } from "../errors.ts";
import type { RecordOptions } from "../repository.ts";
import { randomToken } from "../text.ts";

import { decode, encode, textColumn } from "./row-codec.ts";
import type { SQLStatement, SQLValue } from "./sql.ts";
import type { StorageContext } from "./transaction-store.ts";

/** Records deciding automatic jobs; their writes take part in revision fencing. */
const SCHEDULER = "scheduler";

const BLOB_LIMIT = 4_000_000;

const BLOB_PART = 1_000_000;

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

export class RecordStore {
  private readonly context: Pick<StorageContext, "driver" | "clock">;

  constructor(context: Pick<StorageContext, "driver" | "clock">) {
    this.context = context;
  }

  async getRecord<T extends object = Record<string, unknown>>(
    namespace: string,
    key: string,
  ): Promise<T | null> {
    const result = await this.context.driver.batch([
      [
        "SELECT data FROM news_records WHERE namespace=? AND key=? AND (expires IS NULL OR expires>?)",
        [namespace, key, this.context.clock()],
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
    const now = this.context.clock();
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
    const result = await this.context.driver.batch(statements);
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
    await this.context.driver.batch(statements);
  }

  async acquireHost(
    host: string,
    now: number,
    leaseSeconds: number,
  ): Promise<string | null> {
    if (!(leaseSeconds > 0)) throw new UserError("取得処理の期限が不正です");
    const token = randomToken();
    const result = await this.context.driver.batch([
      [
        "INSERT INTO news_host_leases(host,token,expires) VALUES (?,?,?) ON CONFLICT(host) " +
          "DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE news_host_leases.expires<=?",
        [host, token, now + leaseSeconds, now],
      ],
    ]);
    return result[0]?.meta.changes === 1 ? token : null;
  }

  async releaseHost(host: string, token: string): Promise<boolean> {
    const result = await this.context.driver.batch([
      ["DELETE FROM news_host_leases WHERE host=? AND token=?", [host, token]],
    ]);
    return result[0]?.meta.changes === 1;
  }

  async getBlob(key: string): Promise<Uint8Array | null> {
    const result = await this.context.driver.batch([
      [
        "SELECT part,data FROM news_blobs WHERE key=? AND (expires IS NULL OR expires>?) ORDER BY part",
        [key, this.context.clock()],
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
    const now = this.context.clock();
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
    await this.context.driver.batch(writes);
  }
}
