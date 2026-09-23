import { describe, expect, it } from 'vitest';

import {
  GIBIER_ABNORMALITIES,
  GIBIER_TEMPERATURE_REFERENCE_C,
  checkGibierAbnormalities,
  checkGibierTemperature,
  formatGibierDateTime,
  formatGibierDuration,
  gibierElapsed,
  gibierRecordInForce,
  hasGibierSetAsideDetails,
  gibierSitesText,
  gibierSpeciesText,
  GIBIER_HIT_SITE_LABELS,
  checkGibierAbdominalHit,
  isInvalidGibierNumber,
  parseGibierNumber,
  parseLocalDateTime,
  sortGibierRecords,
} from '@/lib/gibier-record';
import {
  GIBIER_ABNORMALITY_KEYS,
  createGibierRecord,
  emptyGibierAbnormalities,
  gibierRecordSchema,
  type GibierAbnormalityKey,
  type GibierYesNo,
} from '@/lib/schemas/gibier-record';

const answers = (fill: GibierYesNo, overrides: Partial<Record<GibierAbnormalityKey, GibierYesNo>> = {}) => ({
  ...(Object.fromEntries(GIBIER_ABNORMALITY_KEYS.map((key) => [key, fill])) as Record<
    GibierAbnormalityKey,
    GibierYesNo
  >),
  ...overrides,
});

describe('the eleven items of 第 2 の 2（1）', () => {
  it('keeps the guideline order and wording, イ to ル', () => {
    // Copied from the guideline (生食発 0626 第 2 号, 別添 第 2 の 2（1）).
    expect(GIBIER_ABNORMALITY_KEYS.map((key) => GIBIER_ABNORMALITIES[key].letter)).toEqual([
      'イ',
      'ロ',
      'ハ',
      'ニ',
      'ホ',
      'ヘ',
      'ト',
      'チ',
      'リ',
      'ヌ',
      'ル',
    ]);
    expect(GIBIER_ABNORMALITY_KEYS.map((key) => GIBIER_ABNORMALITIES[key].guideline)).toEqual([
      '足取りがおぼつかないもの',
      '神経症状を呈し、挙動に異常があるもの',
      '顔面その他に異常な形（奇形・腫瘤等）を有するもの',
      'ダニ類等の外部寄生虫の寄生が著しいもの',
      '脱毛が著しいもの',
      '痩せている度合いが著しいもの',
      '大きな外傷が見られるもの',
      '皮下に膿を含むできもの（膿瘍）が多くの部位で見られるもの',
      '口腔、口唇、舌、乳房、ひづめ等に水ぶくれ（水疱）やただれ（びらん、潰瘍）等が多く見られるもの',
      '下痢を呈し尻周辺が著しく汚れているもの',
      'その他、外見上明らかな異常が見られるもの',
    ]);
  });

  it('asks in the wording of 様式 2, with 舌 and 水疱 put right', () => {
    // Read off 様式 2「捕獲・受入個体記録表（日報）」(手引書 p.62). The form prints 「下」 and 「水泡」
    // in リ, which the guideline writes 「舌」 and 「水疱」.
    expect(GIBIER_ABNORMALITY_KEYS.map((key) => GIBIER_ABNORMALITIES[key].form)).toEqual([
      '足取りがおぼつかない（捕獲時）',
      '神経症状を呈し、挙動に異常がある（捕獲時）',
      '顔面その他に異常な形（奇形・腫瘤等）がある',
      'ダニ類など外部寄生虫の寄生が著しい',
      '脱毛が著しい',
      '痩せている度合いが著しい',
      '大きな外傷や化膿部位、皮膚の炎症やかさぶたが見られる',
      '皮下に膿を含むできもの（膿瘍）が多くの部位で見られる',
      '口腔、口唇、舌、乳房、ひづめ等に水ぶくれ（水疱）やただれ（びらん、潰瘍）が多く見られる',
      '下痢を呈し尻周辺が著しく汚れている',
      'その他、外見上明らかな異常がある',
    ]);
    // The two items where the form differs in substance or has been corrected say so.
    expect(GIBIER_ABNORMALITY_KEYS.filter((key) => GIBIER_ABNORMALITIES[key].note)).toEqual(['wound', 'blisters']);
  });

  it('flags the record as soon as one item is はい, even with others unanswered', () => {
    const result = checkGibierAbnormalities(answers('', { hairLoss: 'yes' }));
    expect(result.status).toBe('found');
    expect(result.found).toEqual(['hairLoss']);
    expect(result.unanswered).toHaveLength(10);
  });

  it('counts every はい', () => {
    const result = checkGibierAbnormalities(answers('no', { unsteady: 'yes', otherVisible: 'yes' }));
    expect(result.found).toEqual(['unsteady', 'otherVisible']);
    expect(result.status).toBe('found');
  });

  it('calls it clear only when all eleven are answered いいえ', () => {
    expect(checkGibierAbnormalities(answers('no')).status).toBe('clear');
    expect(checkGibierAbnormalities(answers('no', { blisters: '' })).status).toBe('incomplete');
    const blank = checkGibierAbnormalities(emptyGibierAbnormalities);
    expect(blank.status).toBe('incomplete');
    expect(blank.unanswered).toHaveLength(11);
  });
});

describe('numbers typed as text', () => {
  it.each([
    ['41.5', 41.5],
    [' 42 ', 42],
    ['0', 0],
  ])('reads %j as %d', (text, value) => {
    expect(parseGibierNumber(text)).toBe(value);
    expect(isInvalidGibierNumber(text)).toBe(false);
  });

  it.each(['4,1', '1e2', '-1', '.5', '41.', '４２', 'abc'])('refuses %j rather than guess', (text) => {
    expect(parseGibierNumber(text)).toBeNull();
    expect(isInvalidGibierNumber(text)).toBe(true);
  });

  it('treats empty text as not entered, not as wrong', () => {
    expect(parseGibierNumber('')).toBeNull();
    expect(isInvalidGibierNumber('  ')).toBe(false);
  });
});

describe('local date and time', () => {
  it('reads a datetime-local value in local time', () => {
    const date = parseLocalDateTime('2026-09-23T06:30');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(8);
    expect(date?.getDate()).toBe(23);
    expect(date?.getHours()).toBe(6);
    expect(date?.getMinutes()).toBe(30);
    expect(formatGibierDateTime('2026-09-23T06:30')).toBe('2026/09/23 06:30');
  });

  it.each(['2026-02-30T10:00', '2026-09-23T24:00', '2026-09-23T06:60', '2026-09-23', ''])(
    'refuses %j instead of rolling it over',
    (text) => {
      expect(parseLocalDateTime(text)).toBeNull();
      expect(formatGibierDateTime(text)).toBe('');
    },
  );
});

describe('time from the start of bleeding (第 3（6）ヲ)', () => {
  it('counts whole minutes up to the delivery', () => {
    // 06:30 to 08:35 is 2 h 5 min = 125 min.
    expect(gibierElapsed('2026-09-23T06:30', '2026-09-23T08:35')).toEqual({ kind: 'ok', minutes: 125 });
    expect(formatGibierDuration(125)).toBe('2 時間 5 分');
  });

  it('runs across midnight', () => {
    // 23:50 to 00:20 the next day is 30 min.
    expect(gibierElapsed('2026-09-23T23:50', '2026-09-24T00:20')).toEqual({ kind: 'ok', minutes: 30 });
  });

  it('counts to the present before a delivery time is entered, dropping the part minute', () => {
    expect(gibierElapsed('2026-09-23T06:30', new Date(2026, 8, 23, 6, 30, 59))).toEqual({ kind: 'ok', minutes: 0 });
    expect(gibierElapsed('2026-09-23T06:30', new Date(2026, 8, 23, 7, 31, 0))).toEqual({ kind: 'ok', minutes: 61 });
  });

  it('reports a delivery before the start instead of a negative time', () => {
    expect(gibierElapsed('2026-09-23T08:00', '2026-09-23T07:59')).toEqual({ kind: 'reversed' });
    expect(gibierElapsed('2026-09-23T08:00', '2026-09-23T08:00')).toEqual({ kind: 'ok', minutes: 0 });
  });

  it('shows nothing without a start', () => {
    expect(gibierElapsed('', '2026-09-23T08:00')).toEqual({ kind: 'missing' });
    expect(gibierElapsed('2026-09-23T08:00', '')).toEqual({ kind: 'missing' });
  });

  it.each([
    [0, '0 分'],
    [59, '59 分'],
    [60, '1 時間 0 分'],
    [1441, '24 時間 1 分'],
  ])('writes %d minutes as %s', (minutes, text) => {
    expect(formatGibierDuration(minutes)).toBe(text);
  });
});

describe('body temperature against the handbook figure', () => {
  it('uses 42℃ for boar and 40℃ for deer, from 様式 2 and the 放血 section', () => {
    expect(GIBIER_TEMPERATURE_REFERENCE_C).toEqual({ boar: 42, deer: 40 });
  });

  it.each([
    ['boar', '41.9', 'below'],
    ['boar', '42', 'atOrAbove'],
    ['boar', '42.0', 'atOrAbove'],
    ['deer', '39.9', 'below'],
    ['deer', '40', 'atOrAbove'],
  ] as const)('%s at %s℃ is %s the figure (以上 includes it)', (species, text, kind) => {
    expect(checkGibierTemperature(species, text).kind).toBe(kind);
  });

  it('gives no figure for species the sources do not cover', () => {
    expect(checkGibierTemperature('other', '41')).toEqual({ kind: 'noReference', value: 41 });
    expect(checkGibierTemperature('', '41')).toEqual({ kind: 'noReference', value: 41 });
  });

  it('separates an empty field from a wrong one', () => {
    expect(checkGibierTemperature('boar', '')).toEqual({ kind: 'empty' });
    expect(checkGibierTemperature('boar', '４２')).toEqual({ kind: 'invalid' });
  });
});

describe('a bullet in the abdomen (第 2 の 1（1）ロ)', () => {
  it('counts an abdominal site as a bullet for a capture by gun', () => {
    expect(checkGibierAbdominalHit({ method: 'gun', hitSites: ['abdomen'], slaughterByGun: '' })).toBe('bullet');
    expect(checkGibierAbdominalHit({ method: 'gun', hitSites: ['chest'], slaughterByGun: '' })).toBe('none');
  });

  it('counts it as a bullet too when a trapped animal was killed with a gun', () => {
    // The site box of 様式 2 is for 被弾または止め刺し、電気ショッカー行使部位, so a trap capture can
    // still carry a bullet wound from the kill.
    expect(checkGibierAbdominalHit({ method: 'snare', hitSites: ['abdomen'], slaughterByGun: 'yes' })).toBe('bullet');
    expect(checkGibierAbdominalHit({ method: 'box', hitSites: ['abdomen'], slaughterByGun: 'no' })).toBe('none');
  });

  it('asks rather than decides while the use of a gun is not recorded', () => {
    expect(checkGibierAbdominalHit({ method: 'snare', hitSites: ['abdomen'], slaughterByGun: '' })).toBe('unclear');
    expect(checkGibierAbdominalHit({ method: '', hitSites: ['abdomen'], slaughterByGun: '' })).toBe('unclear');
  });
});

describe('text on the sheet', () => {
  it('writes the species with the text typed for その他', () => {
    expect(gibierSpeciesText({ species: 'boar', speciesOther: '' })).toBe('イノシシ');
    expect(gibierSpeciesText({ species: 'other', speciesOther: ' クマ ' })).toBe('その他（クマ）');
    expect(gibierSpeciesText({ species: 'other', speciesOther: '' })).toBe('その他');
    expect(gibierSpeciesText({ species: '', speciesOther: 'x' })).toBe('');
  });

  it('lists the ticked sites', () => {
    expect(gibierSitesText(['head', 'other'], GIBIER_HIT_SITE_LABELS, '肩')).toBe('頭部、その他（肩）');
    expect(gibierSitesText(['chest'], GIBIER_HIT_SITE_LABELS, '')).toBe('胸部（心臓）');
  });
});

describe('the stored record', () => {
  it('accepts a blank record', () => {
    expect(gibierRecordSchema.safeParse(createGibierRecord('a', '2026-09-23T00:00:00.000Z')).success).toBe(true);
  });

  it('refuses a site listed twice, a malformed time and an unknown answer', () => {
    const blank = createGibierRecord('a', '');
    expect(gibierRecordSchema.safeParse({ ...blank, hitSites: ['head', 'head'] }).success).toBe(false);
    expect(gibierRecordSchema.safeParse({ ...blank, bleedingStartedAt: '06:30' }).success).toBe(false);
    expect(gibierRecordSchema.safeParse({ ...blank, eviscerationStartedAt: '2026-09-23T06:30' }).success).toBe(false);
    expect(
      gibierRecordSchema.safeParse({ ...blank, abnormalities: { ...blank.abnormalities, wound: 'maybe' } }).success,
    ).toBe(false);
  });

  it('orders the list by capture time, newest first, and falls back to when a record was started', () => {
    const a = { ...createGibierRecord('a', '2026-09-20T00:00:00.000Z'), capturedAt: '2026-09-22T06:00' };
    const b = { ...createGibierRecord('b', '2026-09-21T00:00:00.000Z'), capturedAt: '2026-09-23T06:00' };
    const c = createGibierRecord('c', '2026-09-24T00:00:00.000Z');
    expect(sortGibierRecords([a, b, c]).map((record) => record.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('the record in force', () => {
  const full = {
    ...createGibierRecord('a', ''),
    species: 'boar' as const,
    speciesOther: 'クマ',
    method: 'gun' as const,
    methodOther: '網',
    hitSites: ['head' as const],
    hitSiteOther: '肩',
    injury: 'no' as const,
    injurySite: '左肩',
    bleeding: 'no' as const,
    bleedingStartedAt: '2026-09-23T06:30',
    bleedingPlace: '沢',
    arteryCut: 'yes' as const,
    bloodAppearance: 'abnormal' as const,
    bloodAppearanceNote: '黒い',
    evisceration: 'no' as const,
    eviscerationStartedAt: '07:00',
    eviscerationPlace: '沢',
    eviscerationMethod: '吊り下げ',
    organAbnormality: 'yes' as const,
    organAbnormalityNote: '白斑',
    odorAbnormality: 'yes' as const,
    odorAbnormalityNote: '腐敗臭',
    cooling: 'no' as const,
    coolingStartedAt: '08:00',
    coolingMethod: '氷',
    sex: 'male' as const,
    pregnant: 'yes' as const,
  };

  it('leaves out every detail whose answer no longer calls for it', () => {
    const inForce = gibierRecordInForce(full);
    for (const key of [
      'speciesOther',
      'methodOther',
      'hitSiteOther',
      'injurySite',
      'bleedingStartedAt',
      'bleedingPlace',
      'arteryCut',
      'bloodAppearance',
      'bloodAppearanceNote',
      'eviscerationStartedAt',
      'eviscerationPlace',
      'eviscerationMethod',
      'organAbnormality',
      'organAbnormalityNote',
      'odorAbnormality',
      'odorAbnormalityNote',
      'coolingStartedAt',
      'coolingMethod',
      'pregnant',
    ] as const) {
      expect({ [key]: inForce[key] }).toEqual({ [key]: '' });
    }
    expect(inForce.evisceration).toBe('no');
    expect(hasGibierSetAsideDetails(full)).toBe(true);
  });

  it('keeps them while the answers call for them', () => {
    const answered = {
      ...full,
      species: 'other' as const,
      method: 'other' as const,
      hitSites: ['other' as const],
      injury: 'yes' as const,
      bleeding: 'yes' as const,
      evisceration: 'yes' as const,
      cooling: 'yes' as const,
      sex: 'female' as const,
    };
    expect(gibierRecordInForce(answered)).toEqual(answered);
    expect(hasGibierSetAsideDetails(answered)).toBe(false);
  });

  it('drops a finding note once the finding is answered 無, even with evisceration 有', () => {
    const inForce = gibierRecordInForce({ ...full, evisceration: 'yes', organAbnormality: 'no', odorAbnormality: '' });
    expect(inForce.eviscerationMethod).toBe('吊り下げ');
    expect(inForce.organAbnormalityNote).toBe('');
    expect(inForce.odorAbnormalityNote).toBe('');
  });
});
