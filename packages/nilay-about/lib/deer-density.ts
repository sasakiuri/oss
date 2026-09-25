/**
 * Deer density from camera traps (the random encounter model) and from pellet counts (Taylor and
 * Williams's formula, and FUNRYU of Iwamoto et al. 2000). Each is the published formula with the
 * published defaults; none of them is a count of the deer present.
 */

export const DENSITY_SOURCES_CHECKED_ON = '2026-09-24';

export const DENSITY_SOURCES = {
  rem: {
    citation:
      'Rowcliffe, J.M., Field, J., Turvey, S.T. & Carbone, C. (2008) Estimating animal density using camera traps without the need for individual recognition. Journal of Applied Ecology 45: 1228–1236 (eqn 4)',
    url: 'https://doi.org/10.1111/j.1365-2664.2008.01473.x',
  },
  gunma: {
    citation:
      '群馬県 片平篤行「カメラトラップ法と糞塊法を用いたニホンジカの生息密度推定」p.5・p.10（ニホンジカへの適用例）',
    url: 'https://www.pref.gunma.jp/uploaded/attachment/45891.pdf',
  },
  nagano: {
    citation:
      '長野県 第二種特定鳥獣管理計画（第6期ニホンジカ管理）資料編 資料1-4 p.14（糞粒法、Taylor and Williams 1956 の式、排糞数は Horino and Nomiya 2008）',
    url: 'https://www.pref.nagano.lg.jp/kankyo/shingikai/documents/r080317shiryo1-4.pdf',
  },
  funryu: {
    citation: '岩本俊孝ほか (2000)「糞粒法によるシカ密度推定式の改良」哺乳類科学 40(1): 1-17（(2)(5)(9) 式、付録1）',
    url: 'https://www.jstage.jst.go.jp/article/mammalianscience/40/1/40_1_1/_pdf/-char/ja',
  },
} as const;

const positive = (value: number) => Number.isFinite(value) && value > 0;

// ---------------------------------------------------------------------------------------------------
// Random encounter model
// ---------------------------------------------------------------------------------------------------

export interface RemInput {
  /** Independent passes recorded (the paper's y). */
  photos: number;
  /** Camera effort in camera-days (the paper's t). */
  cameraDays: number;
  /** Day range, the distance an animal moves in a day, in km (v). */
  dayRangeKm: number;
  /** Detection radius in metres (r). */
  radiusM: number;
  /** Detection angle in degrees (θ, converted to radians). */
  angleDegrees: number;
  /** Mean group size (g); 1 when each pass is counted as one animal. */
  groupSize: number;
}

/** D = (y/t) · π / (v · r · (2 + θ)) · g, in animals per km². Null for an input the formula cannot take. */
export function remDensity(input: RemInput): number | null {
  const { photos, cameraDays, dayRangeKm, radiusM, angleDegrees, groupSize } = input;
  if (!(Number.isFinite(photos) && photos >= 0)) return null;
  if (![cameraDays, dayRangeKm, radiusM, groupSize].every(positive)) return null;
  if (!(Number.isFinite(angleDegrees) && angleDegrees >= 0 && angleDegrees <= 360)) return null;
  const theta = (angleDegrees * Math.PI) / 180;
  const radiusKm = radiusM / 1000;
  return ((photos / cameraDays) * Math.PI * groupSize) / (dayRangeKm * radiusKm * (2 + theta));
}

// ---------------------------------------------------------------------------------------------------
// Taylor and Williams (as in Nagano's plan)
// ---------------------------------------------------------------------------------------------------

export interface PelletClearanceInput {
  /** Pellets per m² on the plots at the second survey (m₂). */
  pelletsPerM2: number;
  /** Pellets set out at the first survey to measure how fast they disappear (k₁), and left at the second (k₂). */
  placed: number;
  remaining: number;
  /** Days between the two surveys (t₂ − t₁). */
  days: number;
  /** Pellets one deer drops a day (p). */
  pelletsPerDay: number;
}

/** Nagano's defaults for p, from Horino and Nomiya (2008). */
export const PELLETS_PER_DAY_PRESETS = [
  { id: 'janMar', pelletsPerDay: 1385, label: { ja: '1〜3 月', en: 'January to March' } },
  { id: 'octDec', pelletsPerDay: 1521, label: { ja: '10〜12 月', en: 'October to December' } },
] as const;

/**
 * n = 1/p × m₂ × k₁/(k₁ − k₂) × ln(k₁/k₂)/(t₂ − t₁) × 10000, deer per hectare. Some pellets must
 * have gone (k₂ < k₁) and some must remain (k₂ > 0), or the rate of loss is not defined.
 */
export function pelletClearanceDensity(input: PelletClearanceInput): { perHa: number; perKm2: number } | null {
  const { pelletsPerM2, placed, remaining, days, pelletsPerDay } = input;
  if (!(Number.isFinite(pelletsPerM2) && pelletsPerM2 >= 0)) return null;
  if (![placed, remaining, days, pelletsPerDay].every(positive) || remaining >= placed) return null;
  const perHa =
    (1 / pelletsPerDay) *
    pelletsPerM2 *
    (placed / (placed - remaining)) *
    (Math.log(placed / remaining) / days) *
    10000;
  return { perHa, perKm2: perHa * 100 };
}

// ---------------------------------------------------------------------------------------------------
// FUNRYU (Iwamoto et al. 2000)
// ---------------------------------------------------------------------------------------------------

/** Pellets one deer drops a month, January to December (付録1, from 高槻ほか 1981). */
export const FUNRYU_MONTHLY_PELLETS = [
  36129, 36129, 31524, 31524, 31524, 26325, 26325, 26325, 27168, 27168, 27168, 36129,
] as const;

/** The example temperatures of 付録1 (犬ヶ岳), January to December, °C. */
export const FUNRYU_EXAMPLE_TEMPERATURES = [1.9, 2.7, 5.1, 8.0, 15.4, 19.8, 22.9, 24.1, 19.7, 14.2, 9.8, 3.9] as const;

/** How many months back the pellets on the ground are traced (the paper's program uses 100). */
export const FUNRYU_MONTHS_BACK = 100;

/** Eq (9): the share of pellets lost in a month (%), from that month's mean temperature and the pellets' age in months. */
export function monthlyLossPercent(temperature: number, ageMonths: number): number {
  return (0.188 * temperature + 0.778) / (0.027 * ageMonths + 0.057);
}

export interface FunryuInput {
  /** Pellets per m² found at the survey. */
  pelletsPerM2: number;
  /** The month of the survey, 1 to 12. */
  surveyMonth: number;
  /** Mean temperature of each month at the site, January to December, °C. */
  temperatures: readonly number[];
}

/**
 * Deer per km². Pellets dropped t months before the survey (t = 1 … 100) are added at the start of
 * that month and lose, in each month i of their age, the share of eq (9) for the temperature of that
 * month, taken as a continuous rate by eq (2). The density is the pellets found divided by what one
 * deer leaves on the ground by the survey (eq 5, with the finding rate β = 1).
 */
export function funryuDensity({ pelletsPerM2, surveyMonth, temperatures }: FunryuInput): number | null {
  if (!(Number.isFinite(pelletsPerM2) && pelletsPerM2 >= 0)) return null;
  if (!Number.isInteger(surveyMonth) || surveyMonth < 1 || surveyMonth > 12) return null;
  if (temperatures.length !== 12 || !temperatures.every(Number.isFinite)) return null;
  const month = (index: number) => ((index % 12) + 12) % 12;
  const survey = surveyMonth - 1;
  let perDeer = 0;
  for (let t = 1; t <= FUNRYU_MONTHS_BACK; t += 1) {
    const added = month(survey - t);
    let continuous = 0;
    for (let age = 1; age <= t; age += 1) {
      const loss = monthlyLossPercent(temperatures[month(added + age - 1)] ?? Number.NaN, age);
      // Below about −4.1 °C eq (9) gives a negative loss, which the paper does not cover.
      if (!(loss >= 0)) return null;
      // A month that takes every pellet leaves none of that month's pellets to count.
      if (loss >= 100) {
        continuous = Number.POSITIVE_INFINITY;
        break;
      }
      continuous += -Math.log(1 - loss / 100);
    }
    perDeer += (FUNRYU_MONTHLY_PELLETS[added] ?? 0) * Math.exp(-continuous);
  }
  if (!(perDeer > 0)) return null;
  // Pellets per m² over pellets per deer is deer per m²; there are 10⁶ m² in a km².
  return (pelletsPerM2 / perDeer) * 1e6;
}
