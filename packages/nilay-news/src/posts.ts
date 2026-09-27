// SPDX-License-Identifier: MIT
/** Deterministic news headlines, links and hashtags for X. */
import type { Article } from "./domain.ts";
import { UserError } from "./errors.ts";
import { hostnameOf, urlsplit, userinfo, type SplitUrl } from "./net/url.ts";
import { SPACE, words } from "./text.ts";

export const ACCOUNT = "NilayNews";
const TOPIC_TAGS: Record<string, string> = {
  "狩猟・猟銃": "狩猟",
  射撃競技: "射撃競技",
  "鳥獣被害・管理": "鳥獣対策",
  ジビエ: "ジビエ",
  "制度・行政": "制度改正",
};
const TAG_RULES: [RegExp, string][] = [
  [/パブリックコメント|パブコメ|意見募集/, "パブコメ"],
  [
    /クレー射撃|ライフル射撃|射撃(?:競技|大会|選手|協会|場|練習)|バイアスロン/,
    "射撃競技",
  ],
  [/ジビエ/, "ジビエ"],
  [/狩猟|猟銃|猟友会|ハンター/, "狩猟"],
  [
    /ヒグマ|ツキノワグマ|クマ|熊(?=[がをにはの、と]|出没|被害|捕獲|対策|目撃|襲撃)/,
    "クマ",
  ],
  [/イノシシ|猪(?=[がをにはの、と]|出没|被害|捕獲|対策|目撃)/, "イノシシ"],
  [/シカ|鹿(?=[がをにはの、と]|出没|被害|捕獲|対策|目撃)/, "シカ"],
  [/鳥獣|獣害|野生動物/, "鳥獣対策"],
];
const UNSAFE_URL = new RegExp(`[${SPACE}<>"\\x00-\\x1f]`);
const LINK = new RegExp(`https?://[^${SPACE}]+`, "g");
const SPACE_SPLIT = new RegExp(`([${SPACE}]+)`);
const TRAILING_SPACE = new RegExp(`[${SPACE}]+$`);

type Tagged = Partial<
  Pick<Article, "title" | "excerpt" | "topic" | "analysisStatus">
>;

/** Tags from the headline, excerpt and a current analysis only; bodies may hold unrelated notices. */
export function hashtags(article: Tagged): string[] {
  const text = `${article.title ?? ""} ${article.excerpt ?? ""}`;
  const tags: string[] = [];
  const topic = article.topic ? TOPIC_TAGS[article.topic] : undefined;
  if (article.analysisStatus === "done" && topic) tags.push(topic);
  for (const [pattern, tag] of TAG_RULES)
    if (pattern.test(text) && !tags.includes(tag)) tags.push(tag);
  return [ACCOUNT, ...(tags.length ? tags : ["ニュース"])]
    .slice(0, 3)
    .map((tag) => `#${tag}`);
}

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
  const budget = 280 - 23 - 2 - textWeight(tags);
  if (headlineWeight(title) > budget) {
    let cut = "";
    for (const char of title) {
      if (headlineWeight(`${cut}${char}…`) > budget) break;
      cut += char;
    }
    title = `${cut.replace(TRAILING_SPACE, "")}…`;
  }
  return `${title}\n${url}\n${tags}`;
}
