/**
 * What a hunting licence and hunter registrations cost in a year: the fees and the hunting tax.
 *
 * The tax is set by statute (地方税法 第七百条の五十二, 附則 第三十二条・第三十二条の二) and is the same in
 * every prefecture. The fees are set by each prefecture's ordinance; the amounts here are the national
 * standard of 地方公共団体の手数料の標準に関する政令 (別表 百七・百八), which a prefecture may depart from,
 * so the reader can change them. Club dues and insurance differ by club and plan and are entered by
 * the reader. All were read on e-Gov on COSTS_CHECKED_ON.
 */

import { isoDate, parseIsoDate } from './calendar-days';
import type { CostRegistration, FeeSchedule, HuntingCostsSettings, TaxRelief } from './schemas/hunting-costs';
import type { LicenseType } from './schemas/hunting-log';

export const COSTS_CHECKED_ON = '2026-09-24';

export const COST_SOURCES = {
  localTaxAct: 'https://laws.e-gov.go.jp/law/325AC0000000226',
  feeOrder: 'https://laws.e-gov.go.jp/law/412CO0000000016',
  wildlifeAct: 'https://laws.e-gov.go.jp/law/414AC0000000088',
} as const;

/** 手数料の標準に関する政令 別表 百七 1・3、百八 1. */
export const STANDARD_FEES: FeeSchedule = {
  exam: 5_200,
  examPartlyExempt: 3_900,
  renewal: 2_900,
  registration: 1_800,
};

/** 地方税法 第七百条の五十二第一項. `reduced` is 第二号・第四号, for a holder who pays no income levy. */
export const HUNTING_TAX: Record<LicenseType, { full: number; reduced: number }> = {
  firstGun: { full: 16_500, reduced: 11_000 },
  net: { full: 8_200, reduced: 5_500 },
  trap: { full: 8_200, reduced: 5_500 },
  secondGun: { full: 5_500, reduced: 5_500 },
};

/** 附則 第三十二条・第三十二条の二: the relief covers registrations made up to this day. */
export const TAX_RELIEF_LAST_DAY = '2029-03-31';

/**
 * The registration year (登録年度, 施行規則 第四十八条第一項第七号) runs from 16 April to 15 April. Returns the
 * year it began in.
 */
export function registrationYearOf(today: string): number {
  const parsed = parseIsoDate(today);
  if (!parsed) throw new Error(`Not an ISO date: ${today}`);
  const [year] = parsed;
  return today >= isoDate(year, 4, 16) ? year : year - 1;
}

/**
 * How much of a registration year (16 April of `season` to 15 April of the next year) the relief
 * covers: all of it, only the registrations made up to TAX_RELIEF_LAST_DAY, or none.
 */
export function reliefPeriod(season: number): 'whole' | 'part' | 'none' {
  if (isoDate(season, 4, 16) > TAX_RELIEF_LAST_DAY) return 'none';
  return isoDate(season + 1, 4, 15) <= TAX_RELIEF_LAST_DAY ? 'whole' : 'part';
}

/** Why the relief cannot be applied to a registration of `season` made on `registeredOn` (or unknown). */
function reliefError(registeredOn: string, season: number): TaxLineError | null {
  if (registeredOn !== '') {
    if (registrationYearOf(registeredOn) !== season) return 'registeredOnOutsideYear';
    return registeredOn > TAX_RELIEF_LAST_DAY ? 'reliefExpired' : null;
  }
  const period = reliefPeriod(season);
  return period === 'none' ? 'reliefExpired' : period === 'part' ? 'registeredOnNeeded' : null;
}

export type TaxLineError =
  | 'reliefWithReleaseArea'
  | 'reliefExpired'
  /** The relief ends inside this registration year, so it depends on the day of registration. */
  | 'registeredOnNeeded'
  | 'registeredOnOutsideYear';

export interface TaxLine {
  type: LicenseType;
  /** The rate of 第一項 before any reduction. */
  base: number;
  tax: number;
  error?: TaxLineError;
}

export function registrationTax(
  type: LicenseType,
  registration: Pick<CostRegistration, 'releaseArea' | 'relief' | 'registeredOn'>,
  lowIncome: boolean,
  season: number,
): TaxLine {
  const rate = HUNTING_TAX[type];
  const base = lowIncome ? rate.reduced : rate.full;
  const relief: TaxRelief = registration.relief;
  if (relief !== 'none' && registration.releaseArea !== 'none')
    // How 第七百条の五十二第二項 and 附則 第三十二条の二 combine is not set out, so it is not worked out here.
    return { type, base, tax: NaN, error: 'reliefWithReleaseArea' };
  if (relief !== 'none') {
    const error = reliefError(registration.registeredOn, season);
    if (error) return { type, base, tax: NaN, error };
  }
  if (registration.releaseArea === 'releaseOnly') return { type, base, tax: base / 4 };
  if (registration.releaseArea === 'releaseAdded') return { type, base, tax: (base * 3) / 4 };
  if (relief === 'half') return { type, base, tax: base / 2 };
  if (relief === 'capturer' || relief === 'certified') return { type, base, tax: 0 };
  return { type, base, tax: base };
}

export type CostScenario = 'first' | 'regular' | 'renewal';
export const COST_SCENARIOS: readonly CostScenario[] = ['first', 'regular', 'renewal'];

export interface CostLine {
  kind: 'licenseExam' | 'licenseRenewal' | 'registrationFee' | 'tax' | 'other';
  /** The licence, for the licence fees and the tax. */
  type?: LicenseType;
  /** The registration it belongs to, for the registration fee and the tax. */
  registrationId?: string;
  otherId?: string;
  amount: number;
}

export interface CostBreakdown {
  scenario: CostScenario;
  lines: CostLine[];
  licenseFees: number;
  registrationFees: number;
  tax: number;
  others: number;
  total: number;
}

export type CostProblem =
  | { kind: 'unlicensedType'; registrationId: string; type: LicenseType }
  | { kind: 'noType'; registrationId: string }
  | { kind: 'duplicatePrefecture'; registrationId: string }
  | { kind: 'tax'; registrationId: string; type: LicenseType; error: TaxLineError };

export interface CostResult {
  scenarios: Record<CostScenario, CostBreakdown>;
  problems: CostProblem[];
  taxLines: Record<string, TaxLine[]>;
}

/**
 * The costs of one registration year in three cases: the year the licences are first taken, a year
 * with registrations only, and the year the licences are renewed. Registrations are made for each
 * licence in each prefecture, and each pays the fee and the tax.
 */
export function calculateHuntingCosts(settings: HuntingCostsSettings): CostResult {
  const { fees, season, lowIncome } = settings;
  const held = new Set(settings.licenses.map((license) => license.type));
  const problems: CostProblem[] = [];
  const taxLines: Record<string, TaxLine[]> = {};
  const registrationLines: CostLine[] = [];
  const seen = new Set<string>();

  for (const registration of settings.registrations) {
    if (seen.has(registration.prefecture))
      problems.push({ kind: 'duplicatePrefecture', registrationId: registration.id });
    seen.add(registration.prefecture);
    if (registration.types.length === 0) problems.push({ kind: 'noType', registrationId: registration.id });
    const lines: TaxLine[] = [];
    for (const type of registration.types) {
      if (!held.has(type)) problems.push({ kind: 'unlicensedType', registrationId: registration.id, type });
      const line = registrationTax(type, registration, lowIncome, season);
      if (line.error) problems.push({ kind: 'tax', registrationId: registration.id, type, error: line.error });
      lines.push(line);
      registrationLines.push(
        { kind: 'registrationFee', type, registrationId: registration.id, amount: fees.registration },
        { kind: 'tax', type, registrationId: registration.id, amount: line.tax },
      );
    }
    taxLines[registration.id] = lines;
  }

  const otherLines: CostLine[] = settings.others.map((other) => ({
    kind: 'other',
    otherId: other.id,
    amount: other.amount,
  }));

  const licenseLines = (scenario: CostScenario): CostLine[] => {
    if (scenario === 'regular') return [];
    return settings.licenses.map((license) =>
      scenario === 'first'
        ? {
            kind: 'licenseExam',
            type: license.type,
            amount: license.partlyExempt ? fees.examPartlyExempt : fees.exam,
          }
        : { kind: 'licenseRenewal', type: license.type, amount: fees.renewal },
    );
  };

  const sum = (lines: readonly CostLine[]) => lines.reduce((total, line) => total + line.amount, 0);
  const breakdown = (scenario: CostScenario): CostBreakdown => {
    const license = licenseLines(scenario);
    const lines = [...license, ...registrationLines, ...otherLines];
    const registrationFees = sum(registrationLines.filter((line) => line.kind === 'registrationFee'));
    const tax = sum(registrationLines.filter((line) => line.kind === 'tax'));
    const others = sum(otherLines);
    const licenseFees = sum(license);
    return {
      scenario,
      lines,
      licenseFees,
      registrationFees,
      tax,
      others,
      total: licenseFees + registrationFees + tax + others,
    };
  };

  return {
    scenarios: { first: breakdown('first'), regular: breakdown('regular'), renewal: breakdown('renewal') },
    problems,
    taxLines,
  };
}
