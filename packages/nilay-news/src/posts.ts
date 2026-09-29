// SPDX-License-Identifier: MIT
/** Deterministic news headlines, links and hashtags for X. */
import type { Article } from "./domain.ts";
import { UserError } from "./errors.ts";
import { hashtags } from "./hashtags.ts";
import { isGoogleNewsUrl } from "./net/google-news.ts";
import { hostnameOf, urlsplit, userinfo, type SplitUrl } from "./net/url.ts";
import { SPACE, words } from "./text.ts";

export const ACCOUNT = "NilayNews";
const UNSAFE_URL = new RegExp(`[${SPACE}<>"\\x00-\\x1f]`);
const LINK = new RegExp(`https?://[^${SPACE}]+`, "g");
const SPACE_SPLIT = new RegExp(`([${SPACE}]+)`);
const TRAILING_SPACE = new RegExp(`[${SPACE}]+$`);

/** Conservative twitter-text v3 weight; emoji sequences may be overcounted. */
export function textWeight(text: string): number {
  let weight = 0;
  for (const char of text.normalize("NFC")) {
    const code = char.codePointAt(0) ?? 0;
    const light =
      code <= 0x10ff ||
      (code >= 0x2000 && code <= 0x200d) ||
      (code >= 0x2010 && code <= 0x201f) ||
      (code >= 0x2032 && code <= 0x2037);
    weight += light ? 1 : 2;
  }
  return weight;
}

/** A bare domain in a headline may also become a 23-character t.co link; overcount dotted words. */
function headlineWeight(value: string): number {
  return value
    .split(SPACE_SPLIT)
    .reduce(
      (total, part) =>
        total +
        (/[.。．｡]/.test(part)
          ? Math.max(23, textWeight(part))
          : textWeight(part)),
      0,
    );
}

function validUrl(url: string): boolean {
  let parts: SplitUrl;
  try {
    parts = urlsplit(url);
  } catch {
    return false;
  }
  const host = hostnameOf(parts);
  const [username, password] = userinfo(parts.netloc);
  return (
    (parts.scheme === "http" || parts.scheme === "https") &&
    !!host &&
    host.includes(".") &&
    !username &&
    !password &&
    !UNSAFE_URL.test(url)
  );
}

export function draft(
  article: Pick<Article, "title" | "url"> & Partial<Article>,
): string {
  const url = article.url;
  if (!validUrl(url)) throw new UserError("投稿する元記事の URL が不正です");
  if (isGoogleNewsUrl(url))
    throw new UserError(
      "Google News の中継URLは投稿できません。元記事URLで再収集するか、旧記事を見送りにしてください",
    );
  // Headlines are data, not additional links, mentions, hashtags or cashtags.
  const cleaned = article.title
    .normalize("NFC")
    .replace(LINK, "")
    .replace(/[@＠#＃]/g, "")
    .replaceAll("$", "＄")
    .replace(/\p{C}/gu, "");
  let title = words(cleaned).join(" ");
  if (!title) throw new UserError("投稿する見出しがありません");
  const tags = hashtags(article).join(" ");
  // X shortens one URL to 23 characters; the URL and tags are kept in full.
  const budget = 280 - 23 - 1 - (tags ? 1 + textWeight(tags) : 0);
  if (headlineWeight(title) > budget) {
    let cut = "";
    for (const char of title) {
      if (headlineWeight(`${cut}${char}…`) > budget) break;
      cut += char;
    }
    title = `${cut.replace(TRAILING_SPACE, "")}…`;
  }
  return tags ? `${title}\n${url}\n${tags}` : `${title}\n${url}`;
}
