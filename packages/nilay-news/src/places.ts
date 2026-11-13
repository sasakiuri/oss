// SPDX-License-Identifier: MIT
/** Shared dictionary and extraction for article places and publication tags. */
import dictionary from "./municipalities.json" with { type: "json" };

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

export function isPlace(value: string): boolean {
  const key = fold(value);
  return (
    PREFECTURES.has(key) || ABBREVIATIONS.has(key) || MUNICIPALITIES.has(key)
  );
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

/** Extract places from the prepared headline and lead without processing them again. */
export function textPlaces(
  title: string,
  excerpt: string,
): { name: string; municipality: boolean }[] {
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
  return found.map((name) => ({
    name,
    municipality: !PREFECTURES.has(fold(name)),
  }));
}
