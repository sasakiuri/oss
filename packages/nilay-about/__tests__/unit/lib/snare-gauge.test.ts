import { describe, expect, it } from 'vitest';

import { snareGaugeSettingsSchema } from '@/lib/schemas/snare-gauge';
import {
  SNARE_GAUGE_PAGE,
  SNARE_GAUGE_SIZES_MM,
  defaultSnareGaugeSize,
  getSnareGaugeLayout,
  getSnareRequirements,
  isPastDate,
  isWithinRanges,
  keepSnareGaugeSize,
  snareGaugeLayoutBottomMm,
  todayInJapan,
} from '@/lib/snare-gauge';
import { SNARE_PREFECTURE_RULES, type SnareRelaxationCase } from '@/lib/snare-gauge-data';

// A day inside every plan period the data carries, and outside every dated season.
const TODAY = '2026-09-23';
const states = (code: string, species: 'boar' | 'deer', today: string) =>
  getSnareRequirements(code, species, today).cases.map(({ state }) => state);

describe('the national rule (Enforcement Regulation art. 10(3)(ix) and (x))', () => {
  it('holds boar and deer to 12 cm, a stopper, a swivel and 4 mm wire', () => {
    for (const species of ['boar', 'deer'] as const) {
      const requirements = getSnareRequirements('national', species, TODAY);
      expect(requirements.statutoryLimitMm).toBe(120);
      expect(requirements.cases).toEqual([]);
      expect(requirements.possibleLimits).toEqual([]);
      expect(requirements.stopperRequired).toBe(true);
      expect(requirements.swivelRequired).toBe(true);
      expect(requirements.wireMinMm).toBe(4);
      expect(requirements.gaugeSizesMm).toEqual([120]);
      expect(requirements.status).toBeUndefined();
    }
  });

  it('holds other mammals to 12 cm and a stopper, with no swivel or wire rule', () => {
    const requirements = getSnareRequirements('national', 'other', TODAY);
    expect(requirements.statutoryLimitMm).toBe(120);
    expect(requirements.swivelRequired).toBe(false);
    expect(requirements.wireMinMm).toBeNull();
  });
});

describe('the date in Japan', () => {
  it('takes the calendar day in Japan whatever the time zone of the browser', () => {
    // 15 December 00:30 in Japan is still 14 December in UTC and in Los Angeles.
    expect(todayInJapan(new Date('2026-12-14T15:30:00Z'))).toBe('2026-12-15');
    expect(todayInJapan(new Date('2026-12-14T14:59:59Z'))).toBe('2026-12-14');
    expect(todayInJapan(new Date('2027-03-31T15:00:00Z'))).toBe('2027-04-01');
  });

  it('decides Nagano’s first day by the day in Japan', () => {
    const inLosAngeles = new Date('2026-12-14T08:00:00-08:00'); // 01:00 on 15 December in Japan
    expect(states('nagano', 'deer', todayInJapan(inLosAngeles))).toEqual(['inPeriod']);
  });
});

describe('prefectural relaxations, shown as conditional beside the statute', () => {
  it('leads with the statute and offers Chiba’s 15 cm as a possible relaxation', () => {
    const requirements = getSnareRequirements('chiba', 'boar', TODAY);
    expect(requirements.statutoryLimitMm).toBe(120);
    expect(requirements.cases.map(({ relaxation, state }) => [relaxation.limitMm, state])).toEqual([
      [150, 'conditional'],
    ]);
    expect(requirements.possibleLimits).toEqual([150]);
    expect(requirements.gaugeSizesMm).toEqual([120, 150]);
    expect(requirements.wireMinMm).toBe(4);
    expect(requirements.swivelRequired).toBe(true);
  });

  it('starts the gauge at the statute’s 12 cm whatever the prefecture', () => {
    expect(defaultSnareGaugeSize()).toBe(120);
    const chiba = getSnareRequirements('chiba', 'boar', TODAY);
    expect(keepSnareGaugeSize(150, chiba)).toBe(150);
    expect(keepSnareGaugeSize(200, chiba)).toBe(120);
    expect(keepSnareGaugeSize(150, getSnareRequirements('national', 'boar', TODAY))).toBe(120);
  });

  it('keeps Yamanashi’s 20 cm as undetermined, and only for the fiscal year its notice is for', () => {
    const requirements = getSnareRequirements('yamanashi', 'deer', TODAY);
    expect(requirements.cases.map(({ state }) => state)).toEqual(['periodUndetermined']);
    expect(requirements.possibleLimits).toEqual([200]);
    expect(requirements.gaugeSizesMm).toEqual([120, 200]);
    expect(states('yamanashi', 'deer', '2027-04-01')).toEqual(['expired']);
    expect(getSnareRequirements('yamanashi', 'deer', '2027-04-01').gaugeSizesMm).toEqual([120]);
  });

  it('marks a lifted limit as needing no gauge, and offers only the statutory gauge', () => {
    const requirements = getSnareRequirements('ibaraki', 'boar', TODAY);
    expect(requirements.possibleLimits).toEqual([null]);
    expect(requirements.hasNoLimitCase).toBe(true);
    expect(requirements.gaugeSizesMm).toEqual([120]);
  });

  it('keeps a relaxation to the species the prefecture names', () => {
    expect(getSnareRequirements('kanagawa', 'boar', TODAY).cases).toHaveLength(1);
    expect(getSnareRequirements('kanagawa', 'deer', TODAY).cases).toEqual([]);
    expect(getSnareRequirements('nagano', 'boar', TODAY).cases).toEqual([]);
  });

  it('applies Tochigi’s relaxation to boar only, and shows the deer case as disputed', () => {
    expect(states('tochigi', 'boar', TODAY)).toEqual(['conditional']);
    const deer = getSnareRequirements('tochigi', 'deer', TODAY);
    expect(deer.cases.map(({ state }) => state)).toEqual(['disputed']);
    expect(deer.possibleLimits).toEqual([]);
    expect(deer.cases[0]?.relaxation.disputed).toContain('ニホンジカ・イノシシ捕獲に係る');
  });

  it('says where Hiroshima forbids setting snares at all', () => {
    const cases = [
      ...getSnareRequirements('hiroshima', 'boar', TODAY).cases,
      ...getSnareRequirements('hiroshima', 'deer', TODAY).cases,
    ];
    expect(
      cases.map(({ relaxation }) => relaxation.area.includes('くくりわなの架設が禁止されている区域を除く')),
    ).toEqual([true, true]);
    expect(cases[1]?.relaxation.area).toContain('廿日市市宮島町を除く');
    expect(cases[0]?.relaxation.evidence.map((source) => source.quote).join('')).toContain('安芸太田町一円');
  });

  it('keeps Shimane’s deer relaxation to the areas its plan names', () => {
    const deer = getSnareRequirements('shimane', 'deer', TODAY).cases[0]?.relaxation;
    expect(deer?.area).toContain('湖北地域と中国山地地域');
    expect(deer?.area).toContain('出雲北山地域では狩猟での捕獲を行わず');
    expect(getSnareRequirements('shimane', 'boar', TODAY).cases[0]?.relaxation.area).toContain('隠岐地域');
  });

  it('never relaxes the rule for other mammals', () => {
    for (const rule of SNARE_PREFECTURE_RULES) {
      const requirements = getSnareRequirements(rule.code, 'other', TODAY);
      expect(requirements.cases).toEqual([]);
      expect(requirements.gaugeSizesMm).toEqual([120]);
    }
  });
});

describe('prefectures without a relaxation', () => {
  it('calls a species unrelaxed only where the sources speak for it', () => {
    // Fukui's deer plan holds snares to 12 cm; nothing fetched says so for boar.
    expect(getSnareRequirements('fukui', 'deer', TODAY).status).toBe('none');
    expect(getSnareRequirements('fukui', 'boar', TODAY).status).toBe('unconfirmed');
    // Gifu's boar plan sets no relaxed area; nothing fetched says so for deer.
    expect(getSnareRequirements('gifu', 'boar', TODAY).status).toBe('none');
    expect(getSnareRequirements('gifu', 'deer', TODAY).status).toBe('unconfirmed');
    // Aichi's guide only asks buyers to check the size, so it confirms nothing.
    expect(getSnareRequirements('aichi', 'boar', TODAY).status).toBe('unconfirmed');
    expect(getSnareRequirements('mie', 'boar', TODAY).status).toBe('none');
    expect(getSnareRequirements('mie', 'deer', TODAY).status).toBe('none');
  });

  it('stops calling a species unrelaxed once the document behind it has run out', () => {
    // Fukui's fifth deer plan runs from 1 April 2022 to 31 March 2027.
    expect(getSnareRequirements('fukui', 'deer', '2027-03-31').status).toBe('none');
    expect(getSnareRequirements('fukui', 'deer', '2027-04-01').status).toBe('unconfirmed');
    // Gifu's third boar plan runs to 31 March 2030.
    expect(getSnareRequirements('gifu', 'boar', '2030-03-31').status).toBe('none');
    expect(getSnareRequirements('gifu', 'boar', '2030-04-01').status).toBe('unconfirmed');
    // The answer stays the statute's either way.
    expect(getSnareRequirements('fukui', 'deer', '2027-04-01').gaugeSizesMm).toEqual([120]);
  });
});

describe('relaxations limited to dated periods', () => {
  it('holds Nagano’s deer relaxation to 15 December – 15 March, both days included', () => {
    expect(states('nagano', 'deer', TODAY)).toEqual(['outOfPeriod']);
    expect(getSnareRequirements('nagano', 'deer', TODAY).possibleLimits).toEqual([]);
    expect(states('nagano', 'deer', '2026-12-14')).toEqual(['outOfPeriod']);
    expect(states('nagano', 'deer', '2026-12-15')).toEqual(['inPeriod']);
    expect(states('nagano', 'deer', '2027-01-01')).toEqual(['inPeriod']);
    expect(states('nagano', 'deer', '2027-03-15')).toEqual(['inPeriod']);
    expect(states('nagano', 'deer', '2027-03-16')).toEqual(['outOfPeriod']);
    // The plan runs to March 2031; its last winter is covered and nothing after it.
    expect(states('nagano', 'deer', '2031-03-15')).toEqual(['inPeriod']);
    expect(states('nagano', 'deer', '2031-12-15')).toEqual(['expired']);
  });

  it('follows Shizuoka’s table for the 2026 season only', () => {
    // [whole prefecture 1/1–2/28, south of the Tomei 11/1–12/31 and 3/1–3/15]
    expect(states('shizuoka', 'boar', '2026-10-31')).toEqual(['outOfPeriod', 'outOfPeriod']);
    expect(states('shizuoka', 'boar', '2026-11-01')).toEqual(['outOfPeriod', 'inPeriod']);
    expect(states('shizuoka', 'boar', '2026-12-31')).toEqual(['outOfPeriod', 'inPeriod']);
    expect(states('shizuoka', 'boar', '2027-01-01')).toEqual(['inPeriod', 'outOfPeriod']);
    expect(states('shizuoka', 'boar', '2027-02-28')).toEqual(['inPeriod', 'outOfPeriod']);
    expect(states('shizuoka', 'boar', '2027-03-01')).toEqual(['outOfPeriod', 'inPeriod']);
    expect(states('shizuoka', 'boar', '2027-03-15')).toEqual(['outOfPeriod', 'inPeriod']);
    // The notice is for the 2026 season, which ends on 15 March 2027. It says nothing of the next.
    expect(states('shizuoka', 'boar', '2027-03-16')).toEqual(['expired', 'expired']);
    expect(states('shizuoka', 'boar', '2027-11-01')).toEqual(['expired', 'expired']);
    expect(getSnareRequirements('shizuoka', 'boar', '2027-11-01').possibleLimits).toEqual([]);
    // The deer-only case for snares built against by-catch holds through the season.
    // It is held to the 2026 season, 1 November 2026 to 15 March 2027, both days included.
    expect(states('shizuoka', 'deer', '2026-09-23')).toEqual(['outOfPeriod', 'outOfPeriod', 'outOfPeriod']);
    expect(states('shizuoka', 'deer', '2026-10-31')).toEqual(['outOfPeriod', 'outOfPeriod', 'outOfPeriod']);
    expect(getSnareRequirements('shizuoka', 'deer', '2026-10-31').possibleLimits).toEqual([]);
    expect(states('shizuoka', 'deer', '2026-11-01')).toEqual(['outOfPeriod', 'inPeriod', 'inPeriod']);
    expect(states('shizuoka', 'deer', '2027-03-15')).toEqual(['outOfPeriod', 'inPeriod', 'inPeriod']);
    expect(states('shizuoka', 'deer', '2027-03-16')).toEqual(['expired', 'expired', 'expired']);
  });

  it('reads ranges with both ends included', () => {
    const winter = [{ from: '2026-12-15', to: '2027-03-15' }];
    expect(isWithinRanges(winter, '2026-12-31')).toBe(true);
    expect(isWithinRanges(winter, '2027-03-16')).toBe(false);
    expect(isWithinRanges(winter, '2027-12-31')).toBe(false);
  });
});

describe('a relaxation whose plan has ended', () => {
  it('is dropped from the possible limits and the gauge sizes the day after the plan ends', () => {
    const lastDay = getSnareRequirements('ibaraki', 'boar', '2027-03-31');
    expect(lastDay.expired).toBe(false);
    expect(lastDay.possibleLimits).toEqual([null]);
    const after = getSnareRequirements('ibaraki', 'boar', '2027-04-01');
    expect(after.expired).toBe(true);
    expect(after.cases.map(({ state }) => state)).toEqual(['expired']);
    expect(after.possibleLimits).toEqual([]);
    expect(after.hasNoLimitCase).toBe(false);
    expect(after.gaugeSizesMm).toEqual([120]);
    expect(getSnareRequirements('okayama', 'boar', '2027-04-01').gaugeSizesMm).toEqual([120]);
  });

  it('is not flagged when the prefecture publishes no end date', () => {
    expect(getSnareRequirements('chiba', 'boar', '2040-01-01').expired).toBe(false);
  });

  it('compares ISO dates', () => {
    expect(isPastDate('2027-02-28', '2027-02-28')).toBe(false);
    expect(isPastDate('2027-02-28', '2027-03-01')).toBe(true);
    expect(() => isPastDate('2027-2-28', '2027-03-01')).toThrow();
  });
});

describe('the prefectural data', () => {
  it('covers each of the 47 prefectures once', () => {
    expect(SNARE_PREFECTURE_RULES).toHaveLength(47);
    expect(new Set(SNARE_PREFECTURE_RULES.map((rule) => rule.code)).size).toBe(47);
    expect(new Set(SNARE_PREFECTURE_RULES.map((rule) => rule.name)).size).toBe(47);
  });

  it('counts 29 with a relaxation, 14 without and 4 unconfirmed', () => {
    const codes = (status: string) =>
      SNARE_PREFECTURE_RULES.filter((rule) => rule.status === status).map((rule) => rule.code);
    expect(codes('relaxed')).toHaveLength(29);
    expect(codes('none')).toHaveLength(14);
    expect(codes('unconfirmed').sort()).toEqual(['aichi', 'hokkaido', 'niigata', 'okinawa']);
  });

  it('links a source for every prefecture it calls relaxed or unrelaxed', () => {
    const unlinked = SNARE_PREFECTURE_RULES.filter(
      (rule) =>
        rule.status !== 'unconfirmed' &&
        ![...rule.sources, ...rule.cases.flatMap((relaxation) => relaxation.evidence)].some((source) =>
          source.url.startsWith('http'),
        ),
    );
    expect(unlinked.map((rule) => rule.code)).toEqual([]);
    expect(
      SNARE_PREFECTURE_RULES.filter((entry) => entry.status !== 'relaxed' && entry.cases.length > 0).map(
        (rule) => rule.code,
      ),
    ).toEqual([]);
  });
});

/**
 * Each case is checked against its own quotes alone, never against other documents of the same
 * prefecture: its limit and area must stand in them, its species in them or in their titles, and
 * the days of a dated period too. The quotes themselves were checked word for word against the
 * fetched documents when the data was written.
 */
describe('each case is backed by its own quotes', () => {
  const squash = (text: string) => text.replace(/\s+/g, '');
  const casesOf = SNARE_PREFECTURE_RULES.flatMap((rule) =>
    rule.cases.map((relaxation, index) => [`${rule.code} #${index + 1}`, relaxation] as const),
  );
  const quotes = (relaxation: SnareRelaxationCase) =>
    relaxation.evidence.map((source) => squash(source.quote ?? '')).join('\n');
  const titled = (relaxation: SnareRelaxationCase) =>
    relaxation.evidence.map((source) => squash(`${source.title} ${source.quote ?? ''}`)).join('\n');
  // Saga's guide names no species; the note on the entry says why it is read as boar and deer.
  const speciesFromContext = new Set(['saga #1']);
  // A disputed case is not applied, and the dispute is that the documents do not bear it out.
  const asserted = casesOf.filter(([, relaxation]) => !relaxation.disputed);

  it.each(casesOf)('%s: has quoted evidence', (_, relaxation) => {
    expect(relaxation.evidence.length).toBeGreaterThan(0);
    expect(relaxation.evidence.every((source) => source.url.startsWith('http'))).toBe(true);
  });

  it.each(asserted)('%s: the limit is in its quotes', (_, relaxation) => {
    const pattern =
      relaxation.limitMm === null
        ? /(12|１２)(cm|㎝|ｃｍ|センチ).{0,30}(超|越え|以上|解除)|(12|１２)(cm|㎝|ｃｍ|センチ).{0,40}使用を(可|認め)/
        : new RegExp(`${relaxation.limitMm / 10}(cm|㎝|センチ)`);
    expect(quotes(relaxation)).toMatch(pattern);
  });

  it.each(asserted.filter(([name]) => !speciesFromContext.has(name)))(
    '%s: each species is named in its quotes or their titles',
    (_, relaxation) => {
      const text = titled(relaxation);
      const named = relaxation.species.map((species) =>
        species === 'boar' ? /イノシシ/.test(text) : /ニホンジカ|二ホンジカ|シカ/.test(text),
      );
      expect(named.every(Boolean)).toBe(true);
    },
  );

  it.each(asserted)('%s: the area is in its quotes, or it says the quotes set none', (_, relaxation) => {
    const areaQuote = relaxation.areaQuote === null ? null : squash(relaxation.areaQuote);
    expect(
      areaQuote === null ? relaxation.area.includes('区域の限定なし') : quotes(relaxation).includes(areaQuote),
    ).toBe(true);
    expect(areaQuote === null || squash(relaxation.area).includes(areaQuote)).toBe(true);
  });

  it.each(asserted.filter(([, relaxation]) => relaxation.periodRanges))(
    '%s: its dated period is in its wording and its quotes',
    (_, relaxation) => {
      const days = (relaxation.periodRanges ?? []).flatMap(({ from, to }) => [from, to]);
      const monthDays = days.map((iso) => {
        const [, month, day] = iso.split('-').map(Number);
        return `${month}月${day}日`;
      });
      expect(monthDays.filter((text) => !(relaxation.period ?? '').includes(text))).toEqual([]);
      expect(monthDays.filter((text) => !quotes(relaxation).includes(text))).toEqual([]);
    },
  );
});

describe('the printed gauge', () => {
  it.each(SNARE_GAUGE_SIZES_MM)('draws the %i mm limit at its real size inside A4', (limitMm) => {
    const layout = getSnareGaugeLayout(limitMm);
    expect(layout.page).toEqual({ widthMm: 210, heightMm: 297 });
    expect(layout.circle.r * 2).toBe(limitMm);
    expect(layout.strip.lengthMm).toBe(limitMm);
    expect(layout.slit.widthMm).toBe(4);
    expect(layout.ruler.lengthMm).toBe(100);
    expect(layout.circle.cx - layout.circle.r).toBeGreaterThanOrEqual(0);
    expect(layout.circle.cx + layout.circle.r).toBeLessThanOrEqual(SNARE_GAUGE_PAGE.widthMm);
    expect(layout.strip.x).toBeGreaterThanOrEqual(0);
    expect(snareGaugeLayoutBottomMm(layout)).toBeLessThanOrEqual(SNARE_GAUGE_PAGE.heightMm - 8);
  });
});

describe('the saved settings', () => {
  it('accepts a known prefecture and an offered gauge size', () => {
    expect(snareGaugeSettingsSchema.safeParse({ prefecture: 'chiba', species: 'boar', gaugeMm: 150 }).success).toBe(
      true,
    );
  });

  it('rejects an unknown prefecture, species or size', () => {
    expect(snareGaugeSettingsSchema.safeParse({ prefecture: 'atlantis', species: 'boar', gaugeMm: 120 }).success).toBe(
      false,
    );
    expect(snareGaugeSettingsSchema.safeParse({ prefecture: 'chiba', species: 'bear', gaugeMm: 120 }).success).toBe(
      false,
    );
    expect(snareGaugeSettingsSchema.safeParse({ prefecture: 'chiba', species: 'boar', gaugeMm: 130 }).success).toBe(
      false,
    );
  });
});
