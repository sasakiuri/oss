// SPDX-License-Identifier: MIT
/** Robots rules for our honest NilayNews product token (no UA impersonation). */
import { FetchError } from "./net/http.ts";
import { quote, urlsplit } from "./net/url.ts";
import { strip } from "./text.ts";

/** Preserve encoded reserved characters; decode only RFC 3986 unreserved bytes. */
function normalizedPath(value: string): string {
  return quote(value, "/%!$&'()*+,-.:;=?@_~").replace(
    /%([a-fA-F0-9]{2})/g,
    (_, code: string) => {
      const char = String.fromCharCode(Number.parseInt(code, 16));
      return /^[A-Za-z0-9._~-]$/.test(char) ? char : `%${code.toUpperCase()}`;
    },
  );
}

/** Parse a finite decimal crawl delay, accepting underscores between digits. */
function decimal(value: string): number {
  const text = strip(value);
  return /^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(text)
    ? Number(text)
    : Number.NaN;
}

interface Rule {
  chunks: string[];
  end: boolean;
  length: number;
  allow: boolean;
}

const LINES = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/;

export class RobotsPolicy {
  readonly delay: number = 0;
  private readonly rules: Rule[] = [];

  constructor(text: string) {
    if (/<(?:!doctype|html|head|body)\b/i.test(text))
      throw new FetchError("robots.txt が HTML のため収集を停止しました");
    const groups: [string[], [string, string][]][] = [];
    let agents: string[] = [];
    let rules: [string, string][] = [];
    for (const line of text.replace(/^﻿+/, "").split(LINES)) {
      const content = line.split("#", 1)[0] ?? "";
      const colon = content.indexOf(":");
      if (colon < 0) continue;
      const key = strip(content.slice(0, colon)).toLowerCase();
      const value = strip(content.slice(colon + 1));
      if (key === "user-agent") {
        if (rules.length) {
          groups.push([agents, rules]);
          agents = [];
          rules = [];
        }
        agents.push(value.toLowerCase());
      } else if (
        agents.length &&
        ["allow", "disallow", "crawl-delay", "request-rate"].includes(key)
      ) {
        rules.push([key, value]);
      }
    }
    groups.push([agents, rules]);
    let selected = groups.filter(([names]) => names.includes("nilaynews"));
    if (!selected.length)
      selected = groups.filter(([names]) => names.includes("*"));
    for (const [, group] of selected) {
      for (const [key, value] of group) {
        if ((key === "allow" || key === "disallow") && value.startsWith("/")) {
          let pattern = normalizedPath(value);
          const end = pattern.endsWith("$");
          if (end) pattern = pattern.slice(0, -1);
          // Literal chunks between wildcards avoid exponential backtracking.
          this.rules.push({
            chunks: pattern.split("*"),
            end,
            length: pattern.replaceAll("*", "").length,
            allow: key === "allow",
          });
        } else if (key === "crawl-delay" || key === "request-rate") {
          let delay: number;
          if (key === "request-rate") {
            const slash = value.indexOf("/");
            delay =
              slash < 0
                ? Number.NaN
                : decimal(value.slice(slash + 1)) /
                  decimal(value.slice(0, slash));
          } else {
            delay = decimal(value);
          }
          if (!Number.isFinite(delay) || delay < 0)
            throw new FetchError(
              "robots.txt の取得間隔を解釈できないため収集を停止しました",
            );
          this.delay = Math.max(this.delay, delay);
        }
      }
    }
  }

  allows(url: string): boolean {
    const parts = urlsplit(url);
    const path = normalizedPath(
      (parts.path || "/") + (parts.query ? `?${parts.query}` : ""),
    );
    let best: [number, boolean] | null = null;
    for (const { chunks, end, length, allow } of this.rules) {
      const first = chunks[0] ?? "";
      if (!path.startsWith(first)) continue;
      let position = first.length;
      let matched = true;
      for (let index = 1; index < chunks.length; index += 1) {
        const chunk = chunks[index] ?? "";
        let found: number;
        if (end && index === chunks.length - 1) {
          found = path.endsWith(chunk) ? path.length - chunk.length : -1;
          if (found < position) matched = false;
        } else {
          found = path.indexOf(chunk, position);
          if (found < 0) matched = false;
        }
        if (!matched) break;
        position = found + chunk.length;
      }
      // The longest match wins; on a tie Allow wins.
      if (
        matched &&
        (!end || position === path.length) &&
        (!best || length > best[0] || (length === best[0] && allow))
      ) {
        best = [length, allow];
      }
    }
    return best ? best[1] : true;
  }
}
