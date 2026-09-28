// SPDX-License-Identifier: MIT
// cspell:ignore ceek livedoor smartnews infoseek nordot abema newsdig asahi jiji mainichi yomiuri sankei kahoku shinmai minamishinshu kochinews ABEMATIMES TBSNEWSDIG
/**
 * Hashtags derived only from an article's stored fields: its original
 * publisher, where it happened, then what it is about. Anything the stored
 * evidence does not state is omitted rather than guessed.
 */
import dictionary from "./data/municipalities.json" with { type: "json" };
import type { Article } from "./domain.ts";
import { hostname } from "./net/url.ts";
import { citationOnly } from "./sources/types.ts";

type Tagged = Partial<
  Pick<
    Article,
    | "title"
    | "url"
    | "excerpt"
    | "sourceName"
    | "metadata"
    | "topic"
    | "analysisStatus"
  >
>;

/** One hashtag token: Unicode letters, marks, digits and underscores, with a letter. */
const TAG = /^[\p{L}\p{M}\p{N}_]+$/u;
const LETTER = /\p{L}/u;
const MAX_PUBLISHER = 20;

/** Collection sources that relay other publishers' articles. */
const AGGREGATORS: ReadonlySet<string> = new Set([
  "Google ニュース",
  "CEEK",
  "Yahoo!ニュース",
  "鳥獣ニュース",
  "e-Gov",
]);
/** Aggregators whose headlines end with the publisher, as `(名)` or ` - 名`. */
const ATTRIBUTED: ReadonlySet<string> = new Set([
  "Google ニュース",
  "CEEK",
  "Yahoo!ニュース",
]);
const ATTRIBUTED_HOSTS: ReadonlySet<string> = new Set([
  "news.google.com",
  "news.yahoo.co.jp",
]);
/** Portals and platforms, never an original publisher. */
const PORTAL =
  /yahoo|ヤフー|google|グーグル|ceek|livedoor|ライブドア|smartnews|スマートニュース|dメニュー|(?<![a-z])(?:goo|msn)(?![a-z])|infoseek|nordot|47news|au\s*web/i;
/** A trailing label that names a news outlet rather than a note or a place. */
const OUTLET =
  /新聞|新報|日報|タイムス|タイムズ|放送|テレビ|ニュース|通信|ラジオ|オンライン|NEWS|News|TV|ONLINE|Online|TIMES|Times|DIGITAL/;
const NOTE =
  /^(?:写真|動画|図|図解|表|詳報|続報|速報|更新|独自|解説|上|中|下|前編|中編|後編|全文|一問一答|音声|追記|訂正|修正|再掲|PR|広告|[\p{N}\s./:~-]+|\p{N}+月\p{N}+日.*)$/u;

/**
 * Sites identified by their exact host or a dot-bounded subdomain of it.
 * Portals (Yahoo, Google News) are absent; network sites keep their own brand.
 */
const HOSTS: ReadonlyMap<string, string> = new Map([
  ["times.abema.tv", "ABEMATIMES"],
  ["fnn.jp", "FNNプライムオンライン"],
  ["newsdig.tbs.co.jp", "TBSNEWSDIG"],
  ["news.ntv.co.jp", "日本テレビ"],
  ["news.tv-asahi.co.jp", "テレビ朝日"],
  ["nhk.or.jp", "NHK"],
  ["jiji.com", "時事通信"],
  ["asahi.com", "朝日新聞"],
  ["mainichi.jp", "毎日新聞"],
  ["yomiuri.co.jp", "読売新聞"],
  ["sankei.com", "産経新聞"],
  ["nikkei.com", "日本経済新聞"],
  ["tokyo-np.co.jp", "東京新聞"],
  ["hokkaido-np.co.jp", "北海道新聞"],
  ["kahoku.news", "河北新報"],
  ["shinmai.co.jp", "信濃毎日新聞"],
  ["minamishinshu.jp", "南信州新聞"],
  ["news.at-s.com", "静岡新聞"],
  ["kochinews.co.jp", "高知新聞"],
]);
/** Outlet names recognized as attribution labels, keyed by lower-cased tag. */
const KNOWN = new Map(
  [...HOSTS.values(), "ABEMA"].map((name) => [name.toLowerCase(), name]),
);

/** Jev topics with a tag; stored topics are untrusted, so no prototype lookups. */
const TOPICS: ReadonlyMap<string, string> = new Map([
  ["狩猟・猟銃", "狩猟"],
  ["射撃競技", "射撃競技"],
  ["鳥獣被害・管理", "鳥獣被害対策"],
  ["ジビエ", "ジビエ"],
  ["制度・行政", "制度改正"],
]);
const AFTER_ANIMAL =
  "(?=[がをにはの、とやもへ]|出没|被害|捕獲|対策|目撃|襲撃|駆除)";
const BEAR = new RegExp(
  `(?<!シロ)クマ(?!ゼミ|タカ|ムシ|ノミ|バチ)|ヒグマ|ツキノワグマ|熊${AFTER_ANIMAL}`,
);
const BOAR = new RegExp(`イノシシ|猪${AFTER_ANIMAL}`);
const DEER = new RegExp(
  `(?<!カモ)シカ(?!ゴ)|ニホンジカ|エゾジカ|鹿${AFTER_ANIMAL}`,
);
const MONKEY = /ニホンザル|(?<![ァ-ヶー])サル(?![ァ-ヶー])/;
const ANIMALS = [BEAR, BOAR, DEER, MONKEY];
/** The animal or its material must be what is used, not e.g. AI for bear control. */
const RESOURCE_USE = new RegExp(
  `(?:鳥獣|野生動物|ジビエ|${BEAR.source}|${BOAR.source}|${DEER.source})(?:の(?:肉|皮|骨|角))?(?:を|の)(?:(?:地域)?資源として)?(?:利活用|有効活用|活用|解体(?:施設|処理|見学|体験)|食肉処理)`,
);
/** Content tags in priority order; the headline outranks the excerpt. */
const RULES: [string, (text: string) => boolean][] = [
  [
    "事件事故",
    (text) =>
      /事件|事故(?!防止|対策|時)|誤射|暴発|死亡|死者|けが|ケガ|負傷|重傷|軽傷|襲われ|襲撃|人身被害|逮捕|容疑|盗ま|盗難|窃盗|発砲|殺人|殺害/.test(
        text,
      ),
  ],
  ["クマ", (text) => BEAR.test(text)],
  ["イノシシ", (text) => BOAR.test(text)],
  ["シカ", (text) => DEER.test(text)],
  ["サル", (text) => MONKEY.test(text)],
  [
    "狩猟",
    (text) =>
      /狩猟(?!採集)|猟銃|猟友会|散弾銃|ライフル銃|わな猟|銃猟|(?<![ァ-ヶー])ハンター/.test(
        text,
      ),
  ],
  [
    "射撃競技",
    (text) =>
      /クレー射撃|ライフル射撃|射撃(?:競技|大会|選手|協会|場|練習)|バイアスロン/.test(
        text,
      ),
  ],
  ["ジビエ", (text) => /ジビエ/.test(text)],
  [
    "野生鳥獣活用",
    (text) =>
      /獣皮|鹿革|シカ革|(?:鳥獣|野生動物|ジビエ)(?:利活用|有効活用|活用|解体|食肉処理)/.test(
        text,
      ) || RESOURCE_USE.test(text),
  ],
  [
    "鳥獣被害対策",
    (text) =>
      /鳥獣被害|獣害|農作物被害|有害鳥獣|鳥獣対策|電気柵|防護柵|侵入防止柵/.test(
        text,
      ) ||
      ((/鳥獣|野生動物/.test(text) ||
        ANIMALS.some((animal) => animal.test(text))) &&
        /対策|被害|食害|忌避|捕獲|駆除|防除|撃退|追い払/.test(text)),
  ],
  ["パブコメ", (text) => /パブリックコメント|パブコメ|意見募集/.test(text)],
  [
    "制度改正",
    (text) =>
      /法改正|法律案|法案|改正(?:法|案)|を改正する|施行規則|省令|政令|通達|告示|制度改正/.test(
        text,
      ),
  ],
];

interface Municipality {
  name: string;
  prefectures: string[];
}
const PREFECTURES = new Map<string, string>();
const ABBREVIATIONS = new Map<string, string>();
const MUNICIPALITIES = new Map<string, Municipality>();
for (const [prefecture, names] of Object.entries(dictionary.prefectures)) {
  PREFECTURES.set(fold(prefecture), prefecture);
  if (/[都府県]$/.test(prefecture))
    ABBREVIATIONS.set(fold(prefecture.slice(0, -1)), prefecture);
  for (const name of names) {
    const entry = MUNICIPALITIES.get(fold(name)) ?? { name, prefectures: [] };
    entry.prefectures.push(prefecture);
    MUNICIPALITIES.set(fold(name), entry);
  }
}
const LONGEST = Math.max(
  ...[...PREFECTURES.keys(), ...MUNICIPALITIES.keys()].map(
    (name) => name.length,
  ),
);
/** Tokyo special wards whose names are also wards of designated cities. */
const SHARED_WARDS: ReadonlySet<string> = new Set(["中央区", "北区", "港区"]);
const EDGE = /[\s、。・,.:;!?「」『』【】〈〉《》()[\]<>|/‐‑–—―]/;
const HAN = /\p{Script=Han}/u;
/** A place used as an outlet name or a reference point, e.g. 那覇市の東約140km. */
const NOT_LOCATION =
  /^(?:新聞|新報|日報|放送|テレビ|ニュース|タイムス|NEWS|の?[東西南北]{1,2}(?:約|およそ)?\p{N})/u;

/**
 * Same-length key for matching: small ケ and ヶ are written interchangeably, and
 * 塩竈市 accepts 塩釜 and 塩竃 for its name
 * (https://www.city.shiogama.miyagi.jp/soshiki/6/1082.html).
 */
function fold(value: string): string {
  return value.replaceAll("ヶ", "ケ").replace(/塩[釜竃]/g, "塩竈");
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\p{C}/gu, "");
}

/** A hashtag body of the value without spaces, or null if it is not one token. */
function token(value: string, limit = MAX_PUBLISHER): string | null {
  const tag = value.replace(/\s+/g, "").normalize("NFC");
  return TAG.test(tag) && LETTER.test(tag) && [...tag].length <= limit
    ? tag
    : null;
}

function isPlace(value: string): boolean {
  const key = fold(value);
  return (
    PREFECTURES.has(key) || ABBREVIATIONS.has(key) || MUNICIPALITIES.has(key)
  );
}

interface Attribution {
  headline: string;
  label: string | null;
}

/**
 * The headline without a trailing `(label)`, or ` - label` in an aggregator
 * feed, when the label is recognizably a news outlet.
 */
function attribution(title: string, attributed: boolean): Attribution {
  const text = title.trimEnd();
  let label: string | null = null;
  let headline = text;
  if (text.endsWith(")")) {
    let depth = 0;
    for (let index = text.length - 1; index >= 0; index -= 1) {
      if (text[index] === ")") depth += 1;
      else if (text[index] === "(" && --depth === 0) {
        label = text.slice(index + 1, -1).trim();
        headline = text.slice(0, index).trimEnd();
        break;
      }
    }
  } else if (attributed) {
    const dash = text.lastIndexOf(" - ");
    if (dash > 0) {
      label = text.slice(dash + 3).trim();
      headline = text.slice(0, dash).trimEnd();
    }
  }
  // Other parentheses, e.g. （受験者向け） or （北海道）, stay part of the headline.
  if (
    !label ||
    !headline ||
    NOTE.test(label) ||
    isPlace(label) ||
    !(OUTLET.test(label) || KNOWN.has(label.replace(/\s+/g, "").toLowerCase()))
  )
    return { headline: text, label: null };
  return { headline, label };
}

/** The outlet named by an attribution label; affiliate labels keep their network. */
function outlet(label: string): string | null {
  if (PORTAL.test(label)) return null;
  let name = label.replace(/\s+(?:powered\s+)?by\s.*$/i, "");
  const network = /^.+系\s*\(([^()]+)\)$/.exec(name);
  if (network?.[1]) name = network[1];
  const nested = /^(.+?)\s*\(([^()]+)\)$/.exec(name);
  for (const candidate of nested
    ? [nested[1] ?? "", nested[2] ?? ""]
    : [name]) {
    const tag = token(candidate);
    if (tag) return KNOWN.get(tag.toLowerCase()) ?? tag;
  }
  return null;
}

function hostPublisher(url: string): string | null {
  let host = hostname(url);
  // Press releases distributed through a news site are not its reporting.
  if (
    (host === "jiji.com" || host.endsWith(".jiji.com")) &&
    /[?&]g=prt(?:&|#|$)/.test(url)
  )
    return null;
  while (host.includes(".")) {
    const name = HOSTS.get(host);
    if (name) return name;
    host = host.slice(host.indexOf(".") + 1);
  }
  return null;
}

/** The single ministry or agency in charge; several or none give nothing. */
function agency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = normalize(value).trim();
  if (!text || /[、,・]|及び|並びに/.test(text)) return null;
  const match = /^(?:内閣府|内閣官房|\S{1,10}?(?:省|庁|委員会))/.exec(text);
  return match ? token(match[0]) : null;
}

/** Whether a municipality name starts the text. */
function municipalityAt(text: string): boolean {
  for (let span = Math.min(LONGEST, text.length); span >= 2; span -= 1)
    if (MUNICIPALITIES.has(text.slice(0, span))) return true;
  return false;
}

interface Place {
  prefecture?: string;
  municipality?: Municipality;
}

function atEdge(text: string, index: number): boolean {
  return index < 0 || index >= text.length || EDGE.test(text[index] ?? "");
}

/**
 * Places named in the text, leftmost-longest. Prefecture names without 都府県
 * count only as a standalone word, and names inside other words are skipped.
 */
function places(value: string, abbreviations: boolean): Place[] {
  const text = fold(value);
  const found: Place[] = [];
  let end = -1;
  let index = 0;
  while (index < text.length) {
    let place: Place | null = null;
    let size = 0;
    for (
      let span = Math.min(LONGEST, text.length - index);
      span >= 2;
      span -= 1
    ) {
      const name = text.slice(index, index + span);
      const municipality = MUNICIPALITIES.get(name);
      const prefecture =
        PREFECTURES.get(name) ??
        (abbreviations && atEdge(text, index - 1) && atEdge(text, index + span)
          ? ABBREVIATIONS.get(name)
          : undefined);
      if (municipality) place = { municipality };
      else if (prefecture) place = { prefecture };
      else continue;
      size = span;
      break;
    }
    const next = text.slice(index + size);
    const previous = found.at(-1);
    if (
      !place ||
      NOT_LOCATION.test(next) ||
      // e.g. 東京都市大学, unless a municipality follows (東京都町田市).
      (place.prefecture && /^[市町村区]/.test(next) && !municipalityAt(next)) ||
      // A two-character name inside a longer word, e.g. 新栄町.
      (size === 2 &&
        end !== index &&
        HAN.test(text[index - 1] ?? "") &&
        text[index - 1] !== "郡")
    ) {
      index += place ? size : 1;
      continue;
    }
    // A ward right after its city, e.g. 札幌市中央区, is part of that city.
    if (!(
      end === index &&
      previous?.municipality &&
      place.municipality?.name.endsWith("区")
    ))
      found.push(place);
    end = index + size;
    index = end;
  }
  return found;
}

interface Region {
  prefecture: string | null;
  name: string | null;
}

/** Up to two places, preferring a prefecture and a municipality within it. */
function regions(found: Place[]): string[] {
  const named = found.flatMap((place) => place.prefecture ?? []);
  const resolved = found.flatMap(({ prefecture, municipality }): Region[] => {
    if (prefecture) return [{ prefecture, name: null }];
    if (!municipality) return [];
    const { name, prefectures } = municipality;
    const candidates = prefectures.filter((candidate) =>
      named.includes(candidate),
    );
    const parent =
      prefectures.length === 1 && !SHARED_WARDS.has(name)
        ? prefectures[0]
        : candidates.length === 1
          ? candidates[0]
          : undefined;
    if (!parent && SHARED_WARDS.has(name)) return [];
    return [{ prefecture: parent ?? null, name }];
  });
  const prefectures = [
    ...new Set(resolved.flatMap((place) => place.prefecture ?? [])),
  ];
  const [primary, secondary] = prefectures;
  if (!primary) {
    const name = resolved.find((place) => place.name)?.name;
    return name ? [name] : [];
  }
  const within = resolved.find(
    (place) => place.name && place.prefecture === primary,
  )?.name;
  return [primary, ...(within ? [within] : secondary ? [secondary] : [])];
}

function topics(text: string): string[] {
  return text ? RULES.filter(([, test]) => test(text)).map(([tag]) => tag) : [];
}

/** A leading plain sentence of the excerpt; keyword snippets start mid-text. */
function lead(excerpt: string): string {
  const text = normalize(excerpt).trim();
  if (/^(?:\.{3}|…)/.test(text)) return "";
  return text.split("。")[0] ?? "";
}

function without(text: string, names: (string | null)[]): string {
  let result = text;
  for (const name of names)
    if (name && name.length >= 2) result = result.replaceAll(name, " ");
  return result;
}

/** Tags ordered publisher, up to two places, then up to two topics, all unique. */
export function hashtags(article: Tagged): string[] {
  const source = (article.sourceName ?? "").split(/[｜|]/)[0]?.trim() ?? "";
  const url = article.url ?? "";
  const aggregated = !source || AGGREGATORS.has(source);
  // Control characters stay in a label, so a disguised name is never a token.
  const attributed = attribution(
    (article.title ?? "").normalize("NFKC"),
    ATTRIBUTED.has(source) || ATTRIBUTED_HOSTS.has(hostname(url)),
  );
  const headline = normalize(attributed.headline);
  const { label } = attributed;
  const cited = !!article.metadata && citationOnly(article.metadata);
  const publisher = !aggregated
    ? token(normalize(source))
    : ((source === "e-Gov" && !cited
        ? agency(article.metadata?.agency)
        : null) ??
      (label ? outlet(label) : null) ??
      hostPublisher(url));
  // Source names say who published, not where or what the article is about.
  const title = without(headline, [
    publisher,
    aggregated ? null : normalize(source),
  ]);
  // A roundup citation's excerpt describes the roundup, not the article.
  const excerpt = cited
    ? ""
    : without(lead(article.excerpt ?? ""), [publisher]);

  const tags: string[] = [];
  const add = (tag: string | null | undefined) => {
    if (tag && token(tag, Infinity) && !tags.includes(tag)) tags.push(tag);
  };
  add(publisher);
  const named = places(title, true);
  const inExcerpt = places(excerpt, false);
  const found = regions(named.length ? named : inExcerpt);
  // The excerpt may name the municipality of the headline's only prefecture.
  const [only] = found;
  if (found.length === 1 && only && PREFECTURES.has(fold(only))) {
    const conflicting = inExcerpt.some(
      ({ prefecture }) => prefecture && prefecture !== only,
    );
    const within =
      !conflicting &&
      inExcerpt.find(({ municipality }) =>
        municipality?.prefectures.includes(only),
      )?.municipality?.name;
    if (within) found.push(within);
  }
  for (const place of found) add(place);
  const before = tags.length;
  const topic =
    article.analysisStatus === "done" && typeof article.topic === "string"
      ? TOPICS.get(article.topic)
      : undefined;
  for (const tag of [
    ...topics(title),
    ...(topic ? [topic] : []),
    ...topics(excerpt),
  ]) {
    if (tags.length - before >= 2) break;
    add(tag);
  }
  return tags.map((tag) => `#${tag}`);
}
