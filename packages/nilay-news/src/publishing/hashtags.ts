// SPDX-License-Identifier: MIT
/**
 * Hashtags derived only from an article's stored fields: its original
 * publisher, where it happened, then what it is about. Anything the stored
 * evidence does not state is omitted rather than guessed.
 */
import type { Article } from "../domain.ts";
import { tagEvidence, tagToken } from "../tag-evidence.ts";

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

function topics(text: string): string[] {
  return text ? RULES.filter(([, test]) => test(text)).map(([tag]) => tag) : [];
}

/** Tags ordered publisher, up to two places, then up to two topics, all unique. */
export function hashtags(article: Tagged): string[] {
  const { publisher, title, excerpt, places } = tagEvidence(article);
  const tags: string[] = [];
  const add = (tag: string | null | undefined) => {
    if (tag && tagToken(tag, Infinity) && !tags.includes(tag)) tags.push(tag);
  };
  add(publisher);
  for (const { name } of places) add(name);
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
