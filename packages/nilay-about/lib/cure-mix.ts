import type { CureMixSettings } from './schemas/cure-mix';

export type { CureMixBasis, CureMixIngredient, CureMixSettings, NitriteExpressedAs } from './schemas/cure-mix';

export const CURE_MIX_SOURCES_CHECKED_ON = '2026-09-24';

/**
 * 亜硝酸ナトリウムの使用基準（食品、添加物等の規格基準 第 2 添加物 F 使用基準）: 「亜硝酸根として、食肉製品
 * 及び鯨肉ベーコンにあってはその１kgにつき0.070ｇを超える量を…残存しないように使用しなければならない。」
 * A limit on what is left in the finished product, in grams of nitrite (NO2⁻) per kilogram. It is quoted
 * on the page only: drying concentrates the nitrite and heating and storage use it up, so the amount
 * added cannot say whether a product meets it.
 */
export const NITRITE_RESIDUE_LIMIT_G_PER_KG = 0.07;

/**
 * Standard atomic weights (IUPAC CIAAW, abridged 2024): N 14.007, O 15.999, Na 22.990.
 * NO2⁻ 46.005 and NaNO2 68.995, so a gram of sodium nitrite carries 0.66679 g of nitrite.
 */
const ATOMIC_WEIGHT = { N: 14.007, O: 15.999, Na: 22.99 } as const;
export const NITRITE_MOLAR_MASS = ATOMIC_WEIGHT.N + 2 * ATOMIC_WEIGHT.O;
export const SODIUM_NITRITE_MOLAR_MASS = ATOMIC_WEIGHT.Na + NITRITE_MOLAR_MASS;
export const NITRITE_PER_SODIUM_NITRITE = NITRITE_MOLAR_MASS / SODIUM_NITRITE_MOLAR_MASS;

export const CURE_MIX_SOURCES = {
  additiveStandard: {
    title: '食品、添加物等の規格基準（昭和 34 年厚生省告示第 370 号）第 2 添加物 F 使用基準（亜硝酸ナトリウム）',
    note: '令和 6 年 2 月 6 日厚生労働省告示第 29 号による改正後の告示本体（消費者庁掲載、2026-09-25 再確認）',
    url: 'https://www.caa.go.jp/policies/policy/standards_evaluation/food_additives/second_additive_01/assets/cms_standards103_20240507_11.pdf',
  },
  meatProducts: {
    title: '食品、添加物等の規格基準 第 1 食品 D 各条「食肉製品」（成分規格・製造基準）',
    note: '消費者庁掲載の抜粋',
    url: 'https://www.caa.go.jp/policies/policy/standards_evaluation/other/category/assets/0000071198.pdf',
  },
  guideline: {
    title: '野生鳥獣肉の衛生管理に関する指針（ガイドライン）第 5（3）・第 6',
    note: '厚生労働省、最終改正 令和 5 年 6 月 26 日',
    url: 'https://www.mhlw.go.jp/content/001455712.pdf',
  },
  permit: {
    title: '食品衛生法施行令 第 35 条第 15 号（食肉製品製造業）',
    note: 'e-Gov 法令検索',
    url: 'https://laws.e-gov.go.jp/law/328CO0000000229',
  },
  atomicWeights: {
    title: 'IUPAC CIAAW, Abridged Standard Atomic Weights',
    note: 'N 14.007、O 15.999、Na 22.990',
    url: 'https://www.ciaaw.org/abridged-atomic-weights.htm',
  },
} as const;

export interface CureMixLine {
  /** `lean`, `fat`, `water`, `salt`, `cure` or an ingredient's id. */
  id: string;
  grams: number;
  /** Yen for this line, or `null` without a price. */
  cost: number | null;
}

export type NitriteAdded =
  | { kind: 'none' }
  | { kind: 'incomplete' }
  /** The agent's salt and sodium nitrite come to more than the agent itself. */
  | { kind: 'composition' }
  /** Nitrite added over the whole batch as mixed, in mg of NO2⁻ per kg. Not the residue. */
  | { kind: 'added'; mgPerKg: number };

export interface CureMixResult {
  meatG: number;
  basisG: number;
  /** Fat as a share of the meat (lean and fat), or `null` without meat. */
  fatPercent: number | null;
  lines: CureMixLine[];
  /** The salt the curing agent already brings, taken off the salt to add. */
  saltFromCureG: number;
  /** More salt comes with the curing agent than the salt percentage asks for. */
  saltShortfall: boolean;
  totalG: number;
  /** Salt from every source as a share of the whole batch. */
  saltPercentOfTotal: number | null;
  nitrite: NitriteAdded;
  /** Yen for the lines that have a price; `null` when none has. */
  cost: number | null;
  /** Lines with grams but no price, so the cost is short of them. */
  unpricedLines: number;
  costPerKg: number | null;
  links: { count: number; lastLinkG: number } | null;
  casing: { metres: number; cost: number | null } | null;
}

const EPSILON = 1e-9;
const value = (input: number | null) => (input !== null && Number.isFinite(input) && input > 0 ? input : 0);
/** A percentage the calculation can use: above 0 and no more than 100. */
const percentValue = (input: number | null) => (input !== null && input > 0 && input <= 100 ? input : 0);
/** Whether an entered number is out of range for its field (empty is not). */
export const isInvalidAmount = (input: number | null) => input !== null && !(Number.isFinite(input) && input >= 0);
export const isInvalidPercent = (input: number | null) =>
  input !== null && !(Number.isFinite(input) && input >= 0 && input <= 100);
/** The agent's sodium nitrite as a share of the agent (0–1), from its label. */
const sodiumNitriteShare = (settings: Pick<CureMixSettings, 'cureNitritePercent' | 'cureExpressedAs'>) =>
  (percentValue(settings.cureNitritePercent) / 100) *
  (settings.cureExpressedAs === 'nitrite' ? 1 / NITRITE_PER_SODIUM_NITRITE : 1);

/**
 * Whether the salt and the sodium nitrite the agent's label gives come to more than the whole agent,
 * which no agent can hold. A label given as nitrite is converted to sodium nitrite first.
 */
export const isCureCompositionOver = (
  settings: Pick<CureMixSettings, 'cureNitritePercent' | 'cureExpressedAs' | 'cureSaltPercent'>,
) => sodiumNitriteShare(settings) + percentValue(settings.cureSaltPercent) / 100 > 1 + EPSILON;

const cost = (grams: number, pricePerKg: number | null) =>
  grams > 0 && pricePerKg !== null && Number.isFinite(pricePerKg) && pricePerKg >= 0
    ? (grams / 1000) * pricePerKg
    : null;

/**
 * Every weight of the batch from the meat, the water and the recipe's percentages.
 *
 * The percentages are of the basis (the meat, or the meat and the water). Salt is the total salt the
 * recipe asks for; whatever the curing agent brings is taken off the salt to add. The nitrite added is
 * divided by the whole batch as mixed. It is not compared with the residue limit: what remains in the
 * product depends on drying, heating and storage, which this does not know.
 */
export function calculateCureMix(settings: CureMixSettings): CureMixResult {
  const lean = value(settings.leanG);
  const fat = value(settings.fatG);
  const water = value(settings.waterG);
  const meatG = lean + fat;
  const basisG = settings.basis === 'meat' ? meatG : meatG + water;
  const share = (percent: number | null) => (basisG * percentValue(percent)) / 100;

  const cureG = settings.useCure ? share(settings.curePercent) : 0;
  // An agent with more contents than itself has no salt or nitrite the calculation can use.
  const compositionOver = settings.useCure && isCureCompositionOver(settings);
  const saltFromCureG = compositionOver ? 0 : (cureG * percentValue(settings.cureSaltPercent)) / 100;
  const saltWanted = share(settings.saltPercent);
  const saltG = Math.max(0, saltWanted - saltFromCureG);

  const lines: CureMixLine[] = [
    { id: 'lean', grams: lean, cost: cost(lean, settings.leanPricePerKg) },
    { id: 'fat', grams: fat, cost: cost(fat, settings.fatPricePerKg) },
    { id: 'water', grams: water, cost: null },
    { id: 'salt', grams: saltG, cost: cost(saltG, settings.saltPricePerKg) },
    ...(settings.useCure ? [{ id: 'cure', grams: cureG, cost: cost(cureG, settings.curePricePerKg) }] : []),
    ...settings.ingredients.map((ingredient) => {
      const grams = share(ingredient.percent);
      return { id: ingredient.id, grams, cost: cost(grams, ingredient.pricePerKg) };
    }),
  ];
  const totalG = lines.reduce((sum, line) => sum + line.grams, 0);

  let nitrite: NitriteAdded = { kind: 'none' };
  if (settings.useCure) {
    if (compositionOver) nitrite = { kind: 'composition' };
    else if (percentValue(settings.cureNitritePercent) === 0 || totalG <= 0) nitrite = { kind: 'incomplete' };
    else
      nitrite = {
        kind: 'added',
        mgPerKg: (cureG * sodiumNitriteShare(settings) * NITRITE_PER_SODIUM_NITRITE * 1e6) / totalG,
      };
  }

  const priced = lines.filter((line) => line.cost !== null);
  const totalCost = priced.length > 0 ? priced.reduce((sum, line) => sum + (line.cost ?? 0), 0) : null;
  const unpricedLines = lines.filter((line) => line.grams > 0 && line.cost === null && line.id !== 'water').length;

  const linkG = value(settings.linkG);
  const links =
    linkG > 0 && totalG > 0
      ? (() => {
          const count = Math.ceil(totalG / linkG - EPSILON);
          return { count, lastLinkG: totalG - (count - 1) * linkG };
        })()
      : null;
  const casingGPerM = value(settings.casingGPerM);
  const metres = casingGPerM > 0 && totalG > 0 ? totalG / casingGPerM : null;
  const casingCost =
    metres !== null && settings.casingPricePerM !== null && !isInvalidAmount(settings.casingPricePerM)
      ? metres * settings.casingPricePerM
      : null;
  const costWithCasing = totalCost === null && casingCost === null ? null : (totalCost ?? 0) + (casingCost ?? 0);

  return {
    meatG,
    basisG,
    fatPercent: meatG > 0 ? (fat / meatG) * 100 : null,
    lines,
    saltFromCureG,
    saltShortfall: saltFromCureG > saltWanted + EPSILON,
    totalG,
    saltPercentOfTotal: totalG > 0 ? ((saltG + saltFromCureG) / totalG) * 100 : null,
    nitrite,
    cost: costWithCasing,
    unpricedLines,
    costPerKg: costWithCasing !== null && totalG > 0 ? costWithCasing / (totalG / 1000) : null,
    links,
    casing: metres === null ? null : { metres, cost: casingCost },
  };
}

/**
 * Lean and fat for a batch of `totalG` with `fatPercent` fat, from two trimmings whose own fat
 * contents are `leanFatPercent` and `fatFatPercent` (the Pearson square). `null` when the target is
 * not between the two, which no mix of them can reach.
 */
export function leanFatBlend(
  totalG: number,
  fatPercent: number,
  leanFatPercent: number,
  fatFatPercent: number,
): { leanG: number; fatG: number } | null {
  if (![totalG, fatPercent, leanFatPercent, fatFatPercent].every(Number.isFinite) || totalG <= 0) return null;
  if (fatFatPercent <= leanFatPercent) return null;
  if (fatPercent < leanFatPercent || fatPercent > fatFatPercent) return null;
  const leanG = (totalG * (fatFatPercent - fatPercent)) / (fatFatPercent - leanFatPercent);
  return { leanG, fatG: totalG - leanG };
}
