/**
 * Deadlines of a firearms possession permit and a hunting licence, worked from the statutes.
 *
 * Every rule here is quoted from e-Gov on LAW_CHECKED_ON, and each function names the article it
 * follows. The tool only reads the dates the law sets; it does not decide what a public safety
 * commission or a governor will do.
 */

import { addDays, ageOn, isIsoDate, isoDate, lastDayOfYears, parseIsoDate, shiftMonths } from './calendar-days';

export const LAW_CHECKED_ON = '2026-09-24';
/** 年齢計算ニ関スル法律 and 民法 第百四十三条, for the age on the last day of a permit. */
export const AGE_LAW_CHECKED_ON = '2026-09-25';

export const LAW_URLS = {
  firearmsAct: 'https://laws.e-gov.go.jp/law/333AC0000000006',
  firearmsRegulation: 'https://laws.e-gov.go.jp/law/333M50000002016',
  ageAct: 'https://laws.e-gov.go.jp/law/135AC1000000050',
  civilCode: 'https://laws.e-gov.go.jp/law/129AC0000000089',
  wildlifeAct: 'https://laws.e-gov.go.jp/law/414AC0000000088',
  wildlifeRegulation: 'https://laws.e-gov.go.jp/law/414M60001000028',
  /** 警察庁「令和７年３月１日から所持者の制度が変わります！」（令和７年１月） */
  npaLeaflet: 'https://www.npa.go.jp/bureau/safetylife/hoan/r6jutohokaisei/kohosiryo_ryojushoji.pdf',
} as const;

function required(value: string, what: string): [number, number, number] {
  const parsed = parseIsoDate(value);
  if (!parsed) throw new Error(`${what} is not an ISO date: ${value}`);
  return parsed;
}

/**
 * The day a birthday falls on in `year`. 銃刀法 第七条の二第一項 treats a birthday on 29 February as
 * 28 February, in every year.
 */
function permitBirthday(birthDate: string, year: number): string {
  const [, month, day] = required(birthDate, 'The birth date');
  return month === 2 && day === 29 ? isoDate(year, 2, 28) : isoDate(year, month, day);
}

export type PermitBasis = 'granted' | 'renewed';

/**
 * The last day of a permit for a hunting gun, an air gun or a crossbow (銃刀法 第七条の二).
 *
 * - `granted`: `from` is the day the permit was granted, and the permit runs until the holder's third
 *   birthday after that day has passed (第一項).
 * - `renewed`: `from` is the last day of the permit before renewal, and the renewed permit runs until
 *   the third birthday after that has passed (第二項).
 *
 * A birthday passes at the end of its day, so the birthday itself is the last day.
 */
export function firearmPermitExpiry(birthDate: string, from: string): string {
  const [year] = required(from, 'The start');
  required(birthDate, 'The birth date');
  const first = permitBirthday(birthDate, year) > from ? year : year + 1;
  return permitBirthday(birthDate, first + 2);
}

/**
 * 銃刀法施行規則 第三十四条: the renewal is applied for from two months to one month before the day
 * the permit ends. The same months back that have no such day end on their last day.
 */
export function permitRenewalWindow(expiry: string): { from: string; to: string } {
  required(expiry, 'The expiry');
  return { from: shiftMonths(expiry, -2), to: shiftMonths(expiry, -1) };
}

/**
 * 銃刀法 第四条の三 as read by 第七条の三第三項: a holder who is 75 or older on the day the permit ends
 * takes the cognitive test, which 施行規則 第十六条 holds in the same two-to-one-month window. The age is
 * that of 年齢計算ニ関スル法律 (see `ageOn`), so a holder born on 29 February whose permit ends on the
 * 28 February they turn 75 takes it.
 */
export function needsCognitiveTest(birthDate: string, expiry: string): boolean {
  return ageOn(birthDate, expiry) >= 75;
}

/**
 * The last day of a hunting licence (鳥獣保護管理法 第四十四条).
 *
 * - `exam`: `date` is the day of the licence examination. The licence runs to 14 September of the year
 *   in which three years from that day have passed (第一項). Three years from any day of year Y pass
 *   in year Y + 3.
 * - `renewed`: `date` is the last day of the licence being renewed, which is a 14 September. The
 *   licence is renewed on the next day (施行規則 第六十条第一項) for three years (第二項), so it ends on
 *   14 September three years later.
 *
 * Renewing several licences on the day one of them ends (施行規則 第六十条第二項) is not covered.
 */
export function huntingLicenseExpiry(basis: 'exam' | 'renewed', date: string): string {
  const [year, month, day] = required(date, 'The date');
  if (basis === 'renewed' && !(month === 9 && day === 14))
    throw new Error('A hunting licence being renewed ends on 14 September.');
  return isoDate(year + 3, 9, 14);
}

export function isSeptember14(date: string): boolean {
  const parsed = parseIsoDate(date);
  return parsed !== null && parsed[1] === 9 && parsed[2] === 14;
}

/**
 * The last day a course certificate or a skills course certificate counts: 銃刀法 第五条の二 accepts one
 * "その交付を受けた日から起算して三年を経過しないもの" (第一項第一号, 第三項第一号). 「起算して」 names the
 * day of issue as the first day of the period, which sets aside 民法 第百四十条 (as in 国税通則法 第四十条
 * 「督促状を発した日から起算して十日を経過した日」), so the three years end the day before the same date
 * (民法 第百四十三条第二項): issued on 28 February 2025, it counts until 27 February 2028.
 */
export function certificateLastDay(issuedOn: string): string {
  required(issuedOn, 'The issue date');
  return lastDayOfYears(issuedOn, 3);
}

// ---------------------------------------------------------------------------------------------
// Guns not used for their permitted purposes (いわゆる眠り銃)

export const PERMIT_PURPOSES = ['hunting', 'pestControl', 'targetShooting'] as const;
export type PermitPurpose = (typeof PERMIT_PURPOSES)[number];

/** 銃砲刀剣類所持等取締法の一部を改正する法律（令和六年法律第四十八号）: 第十一条第五項 took effect on this day. */
export const DORMANT_RULE_START = '2025-03-01';

export interface PurposeUse {
  purpose: PermitPurpose;
  /** The last day the gun was used for this purpose. Null when it has not been since the permit. */
  lastUsedOn: string | null;
}

export interface DormantInput {
  /** The day the permit for this gun was first granted. Needed only for a purpose never used. */
  grantedOn: string | null;
  /** True when the holder already held this permit on 1 March 2025 (附則 第五条). */
  heldBeforeRuleStart: boolean;
  uses: readonly PurposeUse[];
  /** The day to judge on, in Japan. */
  on: string;
}

export interface PurposeStatus {
  purpose: PermitPurpose;
  /** The day the period without use began: the day after the last use, or after the permit. */
  unusedFrom: string;
  /** The last day of two years without use. */
  twoYearsEnd: string;
  /** The last day of three years without use, for the transitional reading. */
  threeYearsEnd: string;
  /** True when the period the applicable reading counts has run to its end by `on`. */
  reached: boolean;
}

export type DormantOutcome =
  /** No period in the article has run its course. */
  | 'none'
  /** Some purposes have: the permit can be changed to drop them (第十一条第五項第二号). */
  | 'partial'
  /** Every purpose has: the permit can be revoked (第五項第一号, or 附則 第五条). */
  | 'all';

export type DormantResult =
  | {
      ok: true;
      /**
       * `standard`: 第十一条第五項 as written (two years, all or some purposes).
       * `transitional`: 附則 第五条 for a permit held before 1 March 2025 (three years, all purposes),
       * unless two years without use have run since that day.
       */
      reading: 'standard' | 'transitional';
      purposes: PurposeStatus[];
      outcome: DormantOutcome;
    }
  | { ok: false; reason: 'noPurpose' | 'dates' | 'grantedOnMissing' | 'future' | 'beforePermit' };

/**
 * Whether the periods of 銃刀法 第十一条第五項 have run for the purposes of one permit.
 *
 * The article lets the commission revoke or narrow a permit when it finds the gun has not been put to
 * its permitted purposes for two years or more in a row. Counting starts the day after the last use
 * and ends on the last day of two years (民法 第百四十三条), and the result says only whether that day
 * has come: whether use for a purpose counts, and what the commission does, are not decided here.
 */
export function judgeDormantGun(input: DormantInput): DormantResult {
  const purposes = [...new Set(input.uses.map((use) => use.purpose))];
  if (purposes.length === 0 || purposes.length !== input.uses.length) return { ok: false, reason: 'noPurpose' };
  if (!isIsoDate(input.on)) return { ok: false, reason: 'dates' };
  if (input.grantedOn !== null && !isIsoDate(input.grantedOn)) return { ok: false, reason: 'dates' };
  for (const use of input.uses) {
    if (use.lastUsedOn === null) {
      if (input.grantedOn === null) return { ok: false, reason: 'grantedOnMissing' };
      continue;
    }
    if (!isIsoDate(use.lastUsedOn)) return { ok: false, reason: 'dates' };
    if (use.lastUsedOn > input.on) return { ok: false, reason: 'future' };
    // 第十一条第五項 counts use for the purposes of this permit, so a day before it is not a use under it.
    if (input.grantedOn !== null && use.lastUsedOn < input.grantedOn) return { ok: false, reason: 'beforePermit' };
  }
  if (input.grantedOn !== null && input.grantedOn > input.on) return { ok: false, reason: 'future' };

  const statuses = input.uses.map((use) => {
    const unusedFrom = addDays(use.lastUsedOn ?? (input.grantedOn as string), 1);
    return {
      purpose: use.purpose,
      unusedFrom,
      twoYearsEnd: lastDayOfYears(unusedFrom, 2),
      threeYearsEnd: lastDayOfYears(unusedFrom, 3),
    };
  });

  // 附則 第五条: the transitional reading is withheld from a holder who, since 1 March 2025, has gone two
  // years in a row without putting the gun to all or some of its purposes.
  const twoYearsSinceStart = (unusedFrom: string) =>
    lastDayOfYears(unusedFrom > DORMANT_RULE_START ? unusedFrom : DORMANT_RULE_START, 2);
  const transitional =
    input.heldBeforeRuleStart && !statuses.some((status) => input.on >= twoYearsSinceStart(status.unusedFrom));

  const purposesWithReach = statuses.map((status) => ({
    ...status,
    reached: input.on >= (transitional ? status.threeYearsEnd : status.twoYearsEnd),
  }));
  const reachedCount = purposesWithReach.filter((status) => status.reached).length;
  const outcome: DormantOutcome =
    reachedCount === 0
      ? 'none'
      : reachedCount === purposesWithReach.length
        ? 'all'
        : // The transitional reading counts only all purposes together.
          transitional
          ? 'none'
          : 'partial';
  return { ok: true, reading: transitional ? 'transitional' : 'standard', purposes: purposesWithReach, outcome };
}

// ---------------------------------------------------------------------------------------------
// What to bring when renewing a permit

export type RenewalGun = 'huntingGun' | 'airGun';

export interface ChecklistItem {
  id: string;
  ja: string;
  en: string;
  /** The article that asks for it, in Japanese. */
  basis: string;
}

/**
 * The documents of a renewal, from 銃刀法 and 施行規則. The table 別表第二 (第十一条関係) row 五イ (hunting
 * gun, not a competition shooter) and row 六 (air gun) list the certificates; 第九条 and 第十一条 the
 * forms. A competition shooter's row (五ロ) differs and is not covered.
 */
export function renewalChecklist(gun: RenewalGun, cognitiveTest: boolean): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      id: 'application',
      ja: '猟銃等所持許可更新申請書（別記様式第九号）',
      en: 'Renewal application (Form 9)',
      basis: '施行規則 第九条第一項第四号',
    },
    {
      id: 'medical',
      ja: '医師の診断書（精神保健指定医又はかかりつけの医師などが作成したもの）',
      en: 'A doctor’s certificate (from a designated psychiatrist or a doctor who has treated you)',
      basis: '法 第四条の二第二項（第七条の三第三項で準用）、施行規則 第十条',
    },
    {
      id: 'household',
      ja: '同居親族書（別記様式第十三号）',
      en: 'Household members statement (Form 13)',
      basis: '施行規則 第十一条第二号',
    },
    {
      id: 'bankruptcy',
      ja: '破産手続開始の決定を受けて復権を得ない者に該当しない旨の市町村長の証明書',
      en: 'Certificate from the municipality that you are not an undischarged bankrupt',
      basis: '施行規則 第十一条第二号',
    },
    {
      id: 'course',
      ja: '講習修了証明書（交付から 3 年以内のもの。提示）',
      en: 'Course certificate, issued within three years (shown)',
      basis: '施行規則 別表第二、法 第五条の二第一項第一号',
    },
  ];
  if (gun === 'huntingGun')
    items.push({
      id: 'skills',
      ja: '技能講習修了証明書（交付から 3 年以内のもの。提示）',
      en: 'Skills course certificate, issued within three years (shown)',
      basis: '施行規則 別表第二、法 第五条の二第三項第一号',
    });
  items.push(
    {
      id: 'permit',
      ja: '所持許可証（提示）',
      en: 'The permit (shown)',
      basis: '施行規則 別表第二',
    },
    {
      id: 'usage',
      ja: '使用実績報告書（別記様式第七十四号）',
      en: 'Usage report (Form 74)',
      basis: '施行規則 別表第二',
    },
    {
      id: 'history',
      ja: '経歴書',
      en: 'Personal history',
      basis: '施行規則 別表第二',
    },
    {
      id: 'gun',
      ja: '更新する銃（申請書と共に提示）',
      en: 'The gun being renewed, shown with the application',
      basis: '施行規則 第三十四条',
    },
  );
  if (cognitiveTest)
    items.push({
      id: 'cognitive',
      ja: '認知機能検査（満了日に 75 歳以上。満了の 2 か月前から 1 か月前までに実施）',
      en: 'Cognitive test (75 or older on the last day; held two to one month before it)',
      basis: '法 第四条の三（第七条の三第三項で準用）、施行規則 第十六条',
    });
  return items;
}

// ---------------------------------------------------------------------------------------------
// The deadlines of one reader, and the calendar file

export interface PermitDeadlines {
  expiry: string;
  renewal: { from: string; to: string };
  cognitiveTest: boolean;
}

/** Null until the birth date and the start date are complete and in order. */
export function permitDeadlines(birthDate: string, permitFrom: string): PermitDeadlines | null {
  if (!isIsoDate(birthDate) || !isIsoDate(permitFrom) || permitFrom < birthDate) return null;
  const expiry = firearmPermitExpiry(birthDate, permitFrom);
  return { expiry, renewal: permitRenewalWindow(expiry), cognitiveTest: needsCognitiveTest(birthDate, expiry) };
}

export interface DeadlineInput {
  birthDate: string;
  permitFrom: string;
  courseIssuedOn: string;
  skillsIssuedOn: string;
  gun: RenewalGun;
  licenses: readonly { id: string; type: string; basis: 'exam' | 'renewed'; date: string }[];
}

export interface DeadlineEvent {
  key: string;
  start: string;
  end?: string;
  ja: string;
  en: string;
  basisJa: string;
  basisEn: string;
}

/** Every dated deadline the inputs give, in date order. Entries not yet complete are left out. */
export function deadlineEvents(
  input: DeadlineInput,
  licenseNames: Record<string, { ja: string; en: string }>,
): DeadlineEvent[] {
  const events: DeadlineEvent[] = [];
  const permit = permitDeadlines(input.birthDate, input.permitFrom);
  if (permit)
    events.push(
      {
        key: 'permit-renewal',
        start: permit.renewal.from,
        end: permit.renewal.to,
        ja: '所持許可の更新申請期間',
        en: 'Firearms permit renewal application period',
        basisJa: '銃刀法施行規則 第34条',
        basisEn: 'Firearms Regulation art. 34',
      },
      {
        key: 'permit-expiry',
        start: permit.expiry,
        ja: '所持許可の有効期間の満了日',
        en: 'Last day of the firearms permit',
        basisJa: '銃刀法 第7条の2',
        basisEn: 'Firearms Act art. 7-2',
      },
    );
  if (isIsoDate(input.courseIssuedOn))
    events.push({
      key: 'course-certificate',
      start: certificateLastDay(input.courseIssuedOn),
      ja: '講習修了証明書が使える最後の日',
      en: 'Last day the course certificate counts',
      basisJa: '銃刀法 第5条の2第1項第1号',
      basisEn: 'Firearms Act art. 5-2(1)(i)',
    });
  if (input.gun === 'huntingGun' && isIsoDate(input.skillsIssuedOn))
    events.push({
      key: 'skills-certificate',
      start: certificateLastDay(input.skillsIssuedOn),
      ja: '技能講習修了証明書が使える最後の日',
      en: 'Last day the skills course certificate counts',
      basisJa: '銃刀法 第5条の2第3項第1号',
      basisEn: 'Firearms Act art. 5-2(3)(i)',
    });
  for (const license of input.licenses) {
    if (!isIsoDate(license.date)) continue;
    if (license.basis === 'renewed' && !isSeptember14(license.date)) continue;
    const name = licenseNames[license.type] ?? { ja: license.type, en: license.type };
    events.push({
      key: `license-${license.id}`,
      start: huntingLicenseExpiry(license.basis, license.date),
      ja: `狩猟免許（${name.ja}）の有効期間の満了日`,
      en: `Last day of the hunting licence (${name.en})`,
      basisJa: '鳥獣保護管理法 第44条',
      basisEn: 'Wildlife Act art. 44',
    });
  }
  return events.sort((a, b) => a.start.localeCompare(b.start));
}
