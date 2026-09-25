import { describe, expect, it } from 'vitest';

import {
  buildReportDraft,
  emptyOutingDraft,
  outingsOutsideRegistration,
  parseOutingDraft,
  registrationPeriod,
  reportDeadline,
  reportGroups,
  seasonOf,
  type OutingDraft,
} from '@/lib/hunting-log';
import { GAME_SPECIES, outingSchema, outingsSchema, type HuntingOuting } from '@/lib/schemas/hunting-log';

const outing = (overrides: Partial<HuntingOuting>): HuntingOuting => ({
  id: overrides.id ?? `${overrides.date ?? '2025-11-20'}-${Math.random()}`,
  date: '2025-11-20',
  prefecture: '長野県',
  municipality: '',
  mesh: '',
  license: 'trap',
  catches: [],
  note: '',
  ...overrides,
});

describe('game species (施行規則 別表第二)', () => {
  it('lists the species of the table, in its order', () => {
    // Copied by hand from 別表第二 (the Japanese names in parentheses), birds then mammals.
    expect(GAME_SPECIES.map((species) => species.name)).toEqual([
      'エゾライチョウ',
      'ヤマドリ',
      'キジ',
      'コジュケイ',
      'ヨシガモ',
      'ヒドリガモ',
      'マガモ',
      'カルガモ',
      'ハシビロガモ',
      'オナガガモ',
      'コガモ',
      'ホシハジロ',
      'キンクロハジロ',
      'スズガモ',
      'クロガモ',
      'キジバト',
      'カワウ',
      'ヤマシギ',
      'タシギ',
      'ミヤマガラス',
      'ハシボソガラス',
      'ハシブトガラス',
      'ヒヨドリ',
      'ムクドリ',
      'ニュウナイスズメ',
      'スズメ',
      'タヌキ',
      'キツネ',
      'ノイヌ',
      'ノネコ',
      'テン',
      'イタチ',
      'シベリアイタチ',
      'ミンク',
      'アナグマ',
      'アライグマ',
      'ヒグマ',
      'ツキノワグマ',
      'ハクビシン',
      'イノシシ',
      'ニホンジカ',
      'タイワンリス',
      'シマリス',
      'ヌートリア',
      'ユキウサギ',
      'ノウサギ',
    ]);
    expect(
      GAME_SPECIES.flatMap((species) => ('qualifier' in species ? [[species.name, species.qualifier]] : [])),
    ).toEqual([
      ['ヤマドリ', '亜種コシジロヤマドリを除く'],
      ['テン', '亜種ツシマテンを除く'],
      ['イタチ', 'オスに限る'],
      ['シベリアイタチ', '長崎県対馬市の個体群以外の個体群'],
    ]);
  });

  it('lists the 26 birds and 20 mammals of the table, each once', () => {
    expect(GAME_SPECIES.filter((species) => species.group === 'bird')).toHaveLength(26);
    expect(GAME_SPECIES.filter((species) => species.group === 'mammal')).toHaveLength(20);
    expect(new Set(GAME_SPECIES.map((species) => species.name)).size).toBe(46);
  });
});

describe('registration period (法第五十五条第二項)', () => {
  it('runs from 15 October to 15 April, and from 15 September in Hokkaido', () => {
    expect(registrationPeriod(2025, '長野県')).toEqual({
      season: 2025,
      start: '2025-10-15',
      end: '2026-04-15',
      fromRegistrationDate: false,
    });
    expect(registrationPeriod(2025, '北海道').start).toBe('2025-09-15');
  });

  it.each([
    ['長野県', '2025-10-01', '2025-10-15', true],
    ['長野県', '2025-10-15', '2025-10-15', true],
    ['長野県', '2025-10-16', '2025-10-16', true],
    ['長野県', '2025-11-01', '2025-11-01', true],
    ['北海道', '2025-09-15', '2025-09-15', true],
    ['北海道', '2025-09-16', '2025-09-16', true],
    ['長野県', '2026-04-15', '2026-04-15', true],
    // Outside the season: not a day this registration can have been granted, so it is ignored.
    ['長野県', '2026-04-16', '2025-10-15', false],
    ['長野県', '2024-12-31', '2025-10-15', false],
    ['長野県', '2025-02-30', '2025-10-15', false],
  ] as const)('in %s, a registration granted on %s runs from %s', (prefecture, granted, start, used) => {
    const period = registrationPeriod(2025, prefecture, granted);
    expect(period.start).toBe(start);
    expect(period.fromRegistrationDate).toBe(used);
    expect(period.end).toBe('2026-04-15');
  });

  it.each([
    ['2025-10-14', '長野県', null],
    ['2025-10-15', '長野県', 2025],
    ['2025-12-31', '長野県', 2025],
    ['2026-01-01', '長野県', 2025],
    ['2026-04-15', '長野県', 2025],
    ['2026-04-16', '長野県', null],
    ['2025-09-14', '北海道', null],
    ['2025-09-15', '北海道', 2025],
    ['2025-09-15', '長野県', null],
  ] as const)('places %s in %s in the period of %s', (date, prefecture, season) => {
    expect(seasonOf(date, prefecture)).toBe(season);
  });
});

describe('report deadline (法第六十六条)', () => {
  // 「有効期間が満了したときは、…その日から起算して三十日を経過する日までに」: the period runs to the end of
  // its last day, so it has expired from the next day, which is day 1 of the thirty. 愛媛県「狩猟者登録証の
  // 返納等について」 (checked 2026-09-25) gives 15 May for the registrations ending on 15 April.
  it('is the 30th day counting the first day after the registration as day 1', () => {
    // 16 April is day 1, 30 April day 15, 15 May day 30.
    expect(reportDeadline('2026-04-15')).toBe('2026-05-15');
    // 1 February is day 1, 28 February day 28, 1 March day 29, 2 March day 30 (2026 is not a leap year).
    expect(reportDeadline('2026-01-31')).toBe('2026-03-02');
    // In a leap year 29 February is day 29, so day 30 is 1 March.
    expect(reportDeadline('2028-01-31')).toBe('2028-03-01');
  });
});

describe('the report draft', () => {
  it('sums each species by licence and place, and leaves out outings of another prefecture or season', () => {
    const outings = [
      outing({ date: '2025-11-20', mesh: '12', catches: [{ species: 'ニホンジカ', count: 1, gun: null }] }),
      outing({
        date: '2025-12-01',
        mesh: '12',
        catches: [
          { species: 'ニホンジカ', count: 2, gun: null },
          { species: 'イノシシ', count: 1, gun: null },
        ],
      }),
      outing({ date: '2026-01-05', mesh: '3', catches: [{ species: 'ニホンジカ', count: 1, gun: null }] }),
      outing({ date: '2026-01-06', mesh: '3' }),
      outing({ date: '2025-12-10', prefecture: '山梨県', catches: [{ species: 'ニホンジカ', count: 5, gun: null }] }),
      outing({ date: '2026-11-20', catches: [{ species: 'ニホンジカ', count: 5, gun: null }] }),
    ];
    const draft = buildReportDraft(outings, { prefecture: '長野県', season: 2025 });
    expect(draft.deadline).toBe('2026-05-15');
    expect(draft.beforeRegistration).toEqual([]);
    expect(draft.split).toBe(false);
    // Places sort as numbers, so mesh 3 comes before mesh 12; species follow the order of the table.
    expect(draft.main).toEqual([
      { license: 'trap', place: '3', species: 'ニホンジカ', count: 1 },
      { license: 'trap', place: '12', species: 'イノシシ', count: 1 },
      { license: 'trap', place: '12', species: 'ニホンジカ', count: 3 },
    ]);
    expect(draft.totals).toEqual([
      { species: 'イノシシ', count: 1 },
      { species: 'ニホンジカ', count: 4 },
    ]);
    expect(draft.days).toBe(4);
    expect(draft.outings).toHaveLength(4);
    expect(draft.withoutMesh).toBe(0);
  });

  it('keeps licences apart and falls back to the municipality when there is no mesh number', () => {
    const draft = buildReportDraft(
      [
        outing({ license: 'net', municipality: '松本市', catches: [{ species: 'マガモ', count: 2, gun: null }] }),
        outing({ license: 'trap', municipality: '松本市', catches: [{ species: 'イノシシ', count: 1, gun: null }] }),
        outing({ license: 'trap', catches: [{ species: 'イノシシ', count: 1, gun: null }] }),
      ],
      { prefecture: '長野県', season: 2025 },
    );
    expect(draft.main).toEqual([
      { license: 'net', place: '松本市', species: 'マガモ', count: 2 },
      { license: 'trap', place: '', species: 'イノシシ', count: 1 },
      { license: 'trap', place: '松本市', species: 'イノシシ', count: 1 },
    ]);
    expect(draft.withoutMesh).toBe(3);
    expect(draft.withoutPlace).toBe(1);
  });

  it('splits a first-class gun report into cartridge-gun and air-gun columns only when both were used (様式第十七 備考 6)', () => {
    // Both guns on one day, in one record.
    const oneDay = outing({
      license: 'firstGun',
      mesh: '5',
      catches: [
        { species: 'キジ', count: 1, gun: 'powder' },
        { species: 'キジバト', count: 2, gun: 'air' },
        { species: 'キジ', count: 1, gun: 'air' },
      ],
    });
    const both = buildReportDraft([oneDay], { prefecture: '長野県', season: 2025 });
    expect(both.split).toBe(true);
    expect(both.main).toEqual([{ license: 'firstGun', place: '5', species: 'キジ', count: 1 }]);
    expect(both.air).toEqual([
      { license: 'firstGun', place: '5', species: 'キジ', count: 1 },
      { license: 'firstGun', place: '5', species: 'キジバト', count: 2 },
    ]);
    expect(both.totals).toEqual([
      { species: 'キジ', count: 2 },
      { species: 'キジバト', count: 2 },
    ]);

    const airOnly = buildReportDraft(
      [outing({ license: 'firstGun', mesh: '5', catches: [{ species: 'キジバト', count: 2, gun: 'air' }] })],
      { prefecture: '長野県', season: 2025 },
    );
    expect(airOnly.split).toBe(false);
    expect(airOnly.main).toEqual([{ license: 'firstGun', place: '5', species: 'キジバト', count: 2 }]);
    expect(airOnly.air).toEqual([]);

    // Air-gun takes under a second-class licence are not the first-class registrant's split.
    const secondClass = buildReportDraft(
      [
        outing({ license: 'firstGun', catches: [{ species: 'キジ', count: 1, gun: 'powder' }] }),
        outing({ license: 'secondGun', catches: [{ species: 'キジバト', count: 1, gun: null }] }),
      ],
      { prefecture: '長野県', season: 2025 },
    );
    expect(secondClass.split).toBe(false);
  });

  it('leaves out outings before the day of registration (法第五十五条第二項 後段)', () => {
    const early = outing({ date: '2025-10-20', catches: [{ species: 'イノシシ', count: 1, gun: null }] });
    const onTheDay = outing({ date: '2025-11-01', catches: [{ species: 'イノシシ', count: 2, gun: null }] });
    const draft = buildReportDraft([early, onTheDay], { prefecture: '長野県', season: 2025 }, '2025-11-01');
    expect(draft.period.start).toBe('2025-11-01');
    expect(draft.beforeRegistration).toEqual([early]);
    expect(draft.outings).toEqual([onTheDay]);
    expect(draft.main).toEqual([{ license: 'trap', place: '', species: 'イノシシ', count: 2 }]);
    // Without the day the earliest start applies and both are counted.
    expect(buildReportDraft([early, onTheDay], { prefecture: '長野県', season: 2025 }).main[0]?.count).toBe(3);
  });

  it('lists the latest season first and sets aside dates no registration covers', () => {
    const summer = outing({ date: '2026-07-01' });
    const outings = [
      outing({ date: '2024-11-20' }),
      outing({ date: '2026-02-01', prefecture: '北海道' }),
      outing({ date: '2026-02-01' }),
      summer,
    ];
    expect(reportGroups(outings)).toEqual([
      { prefecture: '北海道', season: 2025 },
      { prefecture: '長野県', season: 2025 },
      { prefecture: '長野県', season: 2024 },
    ]);
    expect(outingsOutsideRegistration(outings)).toEqual([summer]);
  });
});

describe('the outing form', () => {
  const filled = (overrides: Partial<OutingDraft> = {}): OutingDraft => ({
    ...emptyOutingDraft('2025-11-20', '長野県'),
    license: 'trap',
    ...overrides,
  });

  it('turns a complete form into a valid outing with trimmed text', () => {
    const result = parseOutingDraft(
      filled({ mesh: ' 12 ', catches: [{ species: 'ニホンジカ', count: 2, gun: null }], note: ' 晴れ ' }),
      'a',
    );
    expect(result.errors).toEqual({});
    expect(result.outing).toMatchObject({ id: 'a', mesh: '12', note: '晴れ' });
    expect(outingSchema.safeParse(result.outing).success).toBe(true);
  });

  it('accepts a day with nothing taken', () => {
    expect(parseOutingDraft(filled(), 'a').outing?.catches).toEqual([]);
  });

  it('asks for the date, the prefecture and the licence', () => {
    const result = parseOutingDraft(emptyOutingDraft('', null), 'a');
    expect(result.outing).toBeNull();
    expect(result.errors).toEqual({ date: 'required', prefecture: 'required', license: 'required' });
    expect(parseOutingDraft(filled({ date: '2025-02-30' }), 'a').errors.date).toBe('invalid');
  });

  it('asks which gun on each line for a first-class gun licence and drops it for the others', () => {
    const line = (gun: 'powder' | 'air' | null, species: 'キジ' | 'キジバト' = 'キジ') => ({ species, count: 1, gun });
    expect(parseOutingDraft(filled({ license: 'firstGun', catches: [line(null)] }), 'a').catchErrors).toEqual(['gun']);
    // Both guns on one day, even for the same species.
    const both = parseOutingDraft(filled({ license: 'firstGun', catches: [line('powder'), line('air')] }), 'a');
    expect(both.outing?.catches.map((item) => item.gun)).toEqual(['powder', 'air']);
    expect(
      parseOutingDraft(filled({ license: 'firstGun', catches: [line('air'), line('air')] }), 'a').catchErrors,
    ).toEqual([null, 'duplicate']);
    // A day out with nothing taken needs no gun.
    expect(parseOutingDraft(filled({ license: 'firstGun' }), 'a').outing).not.toBeNull();
    expect(
      parseOutingDraft(filled({ license: 'secondGun', catches: [line('air')] }), 'a').outing?.catches[0]?.gun,
    ).toBeNull();
  });

  it.each([
    [0, 'count'],
    [1, null],
    [999, null],
    [1000, 'count'],
    [1.5, 'count'],
    [NaN, 'count'],
  ] as const)('checks a count of %s', (count, error) => {
    expect(parseOutingDraft(filled({ catches: [{ species: 'イノシシ', count, gun: null }] }), 'a').catchErrors).toEqual(
      [error],
    );
  });

  it('refuses a species left empty or listed twice', () => {
    const result = parseOutingDraft(
      filled({
        catches: [
          { species: '', count: 1, gun: null },
          { species: 'イノシシ', count: 1, gun: null },
          { species: 'イノシシ', count: 2, gun: null },
        ],
      }),
      'a',
    );
    expect(result.catchErrors).toEqual(['species', null, 'duplicate']);
    expect(result.outing).toBeNull();
  });

  it('limits the length of the text fields', () => {
    const result = parseOutingDraft(filled({ mesh: 'x'.repeat(61), note: 'x'.repeat(201) }), 'a');
    expect(result.errors).toEqual({ mesh: 'tooLong', note: 'tooLong' });
    expect(parseOutingDraft(filled({ mesh: 'x'.repeat(60), note: 'x'.repeat(200) }), 'a').outing).not.toBeNull();
  });
});

describe('the saved log', () => {
  it('rejects a take whose gun does not match its licence', () => {
    expect(
      outingsSchema.safeParse([outing({ license: 'trap', catches: [{ species: 'キジ', count: 1, gun: 'air' }] })])
        .success,
    ).toBe(false);
    expect(
      outingsSchema.safeParse([outing({ license: 'firstGun', catches: [{ species: 'キジ', count: 1, gun: null }] })])
        .success,
    ).toBe(false);
    expect(
      outingsSchema.safeParse([outing({ license: 'firstGun', catches: [{ species: 'キジ', count: 1, gun: 'air' }] })])
        .success,
    ).toBe(true);
  });
});
