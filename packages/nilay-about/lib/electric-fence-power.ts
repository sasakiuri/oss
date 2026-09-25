/**
 * The energiser, its solar panel and battery, the fittings that go with a fence, and a cost estimate
 * from prices the user enters. Only values with a published source are built in.
 */

export const POWER_SOURCES_CHECKED_ON = '2026-09-24';

export const POWER_SOURCES = {
  maffGeneral: {
    title: '野生鳥獣被害防止マニュアル【総合対策編】3-1 侵入防止柵（印刷 p.30）',
    publisher: '農林水産省',
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/yosan/attach/pdf/250416-10.pdf',
  },
  maffProcurement: {
    title: '鳥獣被害防止対策のチェックシート 別表3「資材の調達に当たっての留意事項」',
    publisher: '農林水産省',
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/yosan/attach/pdf/250416-8.pdf',
  },
  kyotoBear: {
    title: '獣害対策マニュアル-電気柵(クマ対策)「適切な機材・資材と設置」',
    publisher: '京都府 農林センター',
    url: 'https://www.pref.kyoto.jp/nosoken/documents/kuma3.pdf',
  },
  association: {
    title: '電気さく設置・維持管理のチェックポイント（p.3）',
    publisher: '日本電気さく協議会',
    url: 'http://www.nihondenkisakukyogikai.org/page/checkpoint',
  },
  kencove: {
    title: 'Solar Panel Calculator for Fence Energizers',
    publisher: 'Kencove（米国の電気柵資材販売店）',
    url: 'https://kencove.com/fencing-basics/solar-panel-calculator',
  },
  nedo: {
    title: '日射量データベース（MONSOLA-20）',
    publisher: 'NEDO',
    url: 'https://www.nedo.go.jp/library/nissharyou.html',
  },
  meti: {
    title: '電気さくの正しい設置のお願い',
    publisher: '経済産業省',
    url: 'https://www.meti.go.jp/policy/safety_security/industrial_safety/oshirase/2015/08/290200.pdf',
  },
} as const;

const positive = (value: number) => Number.isFinite(value) && value > 0;
const nonNegative = (value: number) => Number.isFinite(value) && value >= 0;

// ---------------------------------------------------------------------------------------------------
// The energiser
// ---------------------------------------------------------------------------------------------------

/**
 * Kyoto's guide for choosing an energiser for a bear fence, by the perimeter of what is protected
 * (not the wire length). It notes that makers measure joules differently, so models of different
 * makers cannot be compared by it.
 */
export const KYOTO_BEAR_ENERGY_GUIDE = [
  { joules: 1, perimeterM: [300, 450] },
  { joules: 1.5, perimeterM: [450, 600] },
  { joules: 2, perimeterM: [600, 900] },
] as const;

/**
 * The row of Kyoto's guide for a perimeter: the smallest whose range reaches it (below 300 m, the
 * 1 J row). Null beyond 900 m, which the guide does not cover.
 */
export function kyotoBearEnergy(perimeterM: number): (typeof KYOTO_BEAR_ENERGY_GUIDE)[number] | null {
  if (!positive(perimeterM)) return null;
  return KYOTO_BEAR_ENERGY_GUIDE.find((row) => perimeterM <= row.perimeterM[1]) ?? null;
}

// ---------------------------------------------------------------------------------------------------
// Solar panel and battery
// ---------------------------------------------------------------------------------------------------

export interface SolarInput {
  /** The energiser's power draw from its catalogue, in watts. */
  energizerW: number;
  /** Hours a day it runs: 24, or fewer when it runs at night only. */
  hoursPerDay: number;
  /** Battery voltage, usually 12 V. */
  batteryV: number;
  /** Peak sun hours at the site in the worst month used for sizing (kWh/m²/day). */
  peakSunHours: number;
  /** Days the battery alone has to carry the fence without sun. */
  daysWithoutSun: number;
  /** Share of the battery's rated capacity that may be used, in percent. */
  usablePercent: number;
}

/** Kencove adds 20 % to the panel for real-world losses. */
export const PANEL_LOSS_FACTOR = 1.2;

export interface SolarResult {
  dailyWh: number;
  dailyAh: number;
  panelW: number;
  batteryAh: number;
}

/**
 * Kencove's method: daily watt-hours = W × hours; amp-hours a day = Wh ÷ battery V; panel watts =
 * Wh a day ÷ peak sun hours × 1.2; battery = Ah a day × days without sun ÷ usable share.
 */
export function solarSizing(input: SolarInput): SolarResult | null {
  const { energizerW, hoursPerDay, batteryV, peakSunHours, daysWithoutSun, usablePercent } = input;
  if (![energizerW, batteryV, peakSunHours].every(positive)) return null;
  if (!(positive(hoursPerDay) && hoursPerDay <= 24)) return null;
  if (!nonNegative(daysWithoutSun) || !(positive(usablePercent) && usablePercent <= 100)) return null;
  const dailyWh = energizerW * hoursPerDay;
  const dailyAh = dailyWh / batteryV;
  return {
    dailyWh,
    dailyAh,
    panelW: (dailyWh / peakSunHours) * PANEL_LOSS_FACTOR,
    batteryAh: (dailyAh * daysWithoutSun) / (usablePercent / 100),
  };
}

// ---------------------------------------------------------------------------------------------------
// Fittings and cost
// ---------------------------------------------------------------------------------------------------

/** Danger signs at the spacing the user chooses; the law says only "at suitable intervals". */
export function dangerSigns(perimeterM: number, spacingM: number): number | null {
  if (!positive(perimeterM) || !positive(spacingM)) return null;
  // At least one: every fence has to carry a sign.
  return Math.max(1, Math.ceil(perimeterM / spacingM - 1e-9));
}

export interface CostLine {
  id: string;
  quantity: number;
  unitPrice: number;
}

/** Each line's quantity × price, and the total with what a subsidy of the given share leaves to pay. */
export function costEstimate(
  lines: readonly CostLine[],
  subsidyPercent: number,
): { totalYen: number; selfYen: number; missing: string[] } | null {
  if (!(nonNegative(subsidyPercent) && subsidyPercent <= 100)) return null;
  let totalYen = 0;
  const missing: string[] = [];
  for (const line of lines) {
    if (!nonNegative(line.quantity)) continue;
    if (!nonNegative(line.unitPrice)) {
      if (line.quantity > 0) missing.push(line.id);
      continue;
    }
    totalYen += line.quantity * line.unitPrice;
  }
  totalYen = Math.round(totalYen);
  return { totalYen, selfYen: Math.round(totalYen * (1 - subsidyPercent / 100)), missing };
}
