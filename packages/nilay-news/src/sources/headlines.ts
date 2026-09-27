// SPDX-License-Identifier: MIT
/** Scoped article links from official index pages; pagination and PDFs are never followed. */
import { parseHtml } from "../html/tokenizer.ts";
import { canonicalUrl, hostname, urljoin, urlsplit } from "../net/url.ts";
import { clean, length, strip, truncate } from "../text.ts";
import { japaneseDate } from "../time.ts";

import type { CollectedItem } from "./types.ts";

const HIDDEN = new Set(["script", "style", "nav", "header", "footer"]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "dt"]);
/** A standalone date label; dates inside prose are not interpreted. */
const DATE_LABEL =
  /^(?:(?:20\d{2}|(?:令和|平成)(?:元|\d+))年)?\s*\d{1,2}月\s*\d{1,2}日(?:発表)?$/u;
/** Government indexes group headlines by a date or year heading. */
const DATE_HEADING =
  /^(?:20\p{Nd}{2}年|(?:令和|平成)[元\p{Nd}]+年|\p{Nd}{1,2}月)/u;

export function parseHeadlines(
  html: string,
  allowedPathPattern: string,
  baseUrl: string,
  limit: number,
): CollectedItem[] {
  const host = hostname(baseUrl);
  const self = canonicalUrl(baseUrl);
  const pattern = new RegExp(allowedPathPattern);
  const items: CollectedItem[] = [];
  const seen = new Set<string>();
  let hidden = 0;
  let anchor: { url: string; text: string; date: string | null } | null = null;
  let heading: string | null = null;
  let year: number | null = null;
  let headingDate: string | null = null;
  let rowDate: string | null = null;

  parseHtml(html, {
    open(tag, attrs) {
      if (hidden || HIDDEN.has(tag)) {
        hidden += 1;
        return;
      }
      if (tag === "tr") rowDate = null;
      if (HEADINGS.has(tag)) heading = "";
      if (tag !== "a") return;
      const href = strip(attrs.get("href") ?? "");
      const url =
        href && !href.startsWith("#")
          ? canonicalUrl(urljoin(baseUrl, href))
          : null;
      if (!url || hostname(url) !== host || url === self) return;
      const parts = urlsplit(url);
      if (pattern.test(parts.path + (parts.query ? `?${parts.query}` : "")))
        anchor = { url, text: "", date: rowDate ?? headingDate };
    },
    text(text) {
      if (hidden) return;
      if (anchor) {
        anchor.text += text;
      } else if (heading === null) {
        const label = strip(text.normalize("NFKC"));
        if (DATE_LABEL.test(label)) rowDate = japaneseDate(label, year)[0];
      }
      if (heading !== null) heading += text;
    },
    close(tag) {
      if (hidden) {
        hidden -= 1;
        return;
      }
      if (tag === "a" && anchor) {
        const { url, text, date } = anchor;
        anchor = null;
        const title = strip(
          truncate(clean(text), 500).replaceAll("PDFファイルを開く", ""),
        );
        if (length(title) >= 8 && !seen.has(url) && items.length < limit) {
          seen.add(url);
          items.push({ title, url, excerpt: "", publishedAt: date });
        }
      }
      if (HEADINGS.has(tag) && heading !== null) {
        const label = strip(heading);
        if (DATE_HEADING.test(label)) {
          [headingDate, year] = japaneseDate(label, year);
          rowDate = null;
        }
        heading = null;
      }
      if (tag === "tr") rowDate = null;
    },
  });
  return items;
}
