import { describe, expect, it } from 'vitest';

import {
  FENCE_PRESETS,
  FENCE_SOURCES,
  INSPECTION_CHECKLIST,
  LEGAL_REQUIREMENTS,
  ORDINANCE_ARTICLE_74,
  applyPreset,
  calculateFence,
  findPreset,
  matchesPreset,
  presetsFor,
  type FenceInput,
} from '@/lib/electric-fence';
import { electricFenceSettingsSchema } from '@/lib/schemas/electric-fence';

const on = (...heights: number[]) => heights.map((heightCm) => ({ heightCm, energized: true }));
const noOuter = { enabled: false, heightCm: 20, offsetCm: 30 };

const base: FenceInput = {
  rows: on(20, 40, 60, 90, 120, 160),
  outerWire: noOuter,
  perimeterM: 200,
  gates: 1,
  corners: 4,
  roughLengthM: 0,
  postSpacingM: 3,
  roughPostSpacingM: 3,
  sparePercent: 0,
};

describe('calculateFence', () => {
  it('counts a six-row fence round 200 m with four corners and one gate', () => {
    const result = calculateFence(base)!;
    // Fixed posts: 4 corners + 2 gate sides = 6. 200 / 3 = 66.7 → 67 spans, plus 6 − 1.
    expect(result.fixedPoints).toBe(6);
    expect(result.base.posts).toBe(72);
    expect(result.base.energizedWireM).toBe(1200);
    expect(result.base.cordM).toBe(0);
    // (72 posts + 4 corners) × 6 rows.
    expect(result.base.insulators).toBe(456);
    expect(result.base.grips).toBe(6);
    // One lead every 50 m: 200 / 50.
    expect(result.base.connectors).toBe(4);
    expect(result.total).toEqual(result.base);
  });

  it('never counts fewer posts than a small square needs', () => {
    // 12 m round four corners at 4 m: the corners alone are four posts. 12 / 4 = 3, plus 4 − 1.
    const result = calculateFence({ ...base, rows: on(20, 40), perimeterM: 12, postSpacingM: 4, gates: 0 })!;
    expect(result.base.posts).toBe(6);
    expect(result.base.posts).toBeGreaterThanOrEqual(4);
  });

  it('covers a 50 m square with a gate in one side', () => {
    // Laid out by hand: three sides of 50 m need 17 posts each (ceil(50 / 3)); the gated side splits into
    // two runs, so it needs at most 17 + 1 + 1 (the gate's second post and the one extra ceiling).
    // That is at most 70 posts; the count must not fall short of it.
    const result = calculateFence(base)!;
    expect(result.base.posts).toBeGreaterThanOrEqual(3 * 17 + 19);
  });

  it('counts a round fence with no corner or gate by the spacing alone', () => {
    expect(calculateFence({ ...base, corners: 0, gates: 0 })!.base.posts).toBe(67);
  });

  it('adds the spare to every quantity and rounds the counts up', () => {
    const result = calculateFence({ ...base, sparePercent: 10 })!;
    expect(result.total.energizedWireM).toBeCloseTo(1320, 9);
    expect(result.total.posts).toBe(80); // 79.2
    expect(result.total.insulators).toBe(502); // 501.6
    expect(result.total.grips).toBe(7); // 6.6
    // A lead is fitted where the fence is, not bought as a spare.
    expect(result.total.connectors).toBe(4);
  });

  it('closes up the posts on the uneven stretch and fixes a post at each end of it', () => {
    const result = calculateFence({
      ...base,
      rows: on(20, 40),
      perimeterM: 100,
      roughLengthM: 20,
      postSpacingM: 4,
      roughPostSpacingM: 2,
    })!;
    // 80 m / 4 m + 20 m / 2 m = 30 spans. Fixed: 4 corners + 2 gate sides + 2 ends of the stretch = 8.
    expect(result.flatLengthM).toBe(80);
    expect(result.fixedPoints).toBe(8);
    expect(result.base.posts).toBe(37);
    expect(result.base.insulators).toBe((37 + 4) * 2);
  });

  it('keeps unpowered cords out of the insulators and the gate handles', () => {
    const rows = [...on(20, 40, 60, 85, 115), { heightCm: 150, energized: false }, { heightCm: 180, energized: false }];
    const result = calculateFence({ ...base, rows, perimeterM: 120, gates: 2 })!;
    expect(result.energizedRows).toBe(5);
    expect(result.cordRows).toBe(2);
    // 120 / 3 = 40 spans; fixed 4 + 2 × 2 = 8.
    expect(result.base.posts).toBe(47);
    expect(result.base.energizedWireM).toBe(600);
    expect(result.base.cordM).toBe(240);
    expect(result.base.insulators).toBe((47 + 4) * 5);
    expect(result.base.grips).toBe(10);
    expect(result.base.connectors).toBe(3); // 120 / 50 = 2.4
  });

  it('runs the outer line round the fence at its offset, on its own posts', () => {
    const result = calculateFence({
      ...base,
      rows: on(20, 40, 60),
      outerWire: { enabled: true, heightCm: 20, offsetCm: 30 },
      perimeterM: 100,
    })!;
    // 100 m + 2π × 0.3 m.
    expect(result.outerLengthM).toBeCloseTo(101.884956, 5);
    expect(result.base.energizedWireM).toBeCloseTo(401.884956, 5);
    expect(result.base.posts).toBe(39); // ceil(33.3) + 5
    expect(result.base.outerPosts).toBe(39); // ceil(33.96) + 5
    // (39 + 4) × 3 rows on the fence, and 39 + 4 for the outer line.
    expect(result.base.insulators).toBe(172);
    expect(result.base.grips).toBe(4);
  });

  it('needs no lead to join the rows when there is only one', () => {
    expect(calculateFence({ ...base, rows: on(40) })!.base.connectors).toBe(0);
  });

  it('counts an outer line on its own when the fence has no rows yet', () => {
    const result = calculateFence({ ...base, rows: [], outerWire: { enabled: true, heightCm: 20, offsetCm: 0 } })!;
    expect(result.base.posts).toBe(0);
    expect(result.base.outerPosts).toBe(72);
    expect(result.base.insulators).toBe(72 + 4);
    expect(result.base.energizedWireM).toBe(200);
  });

  it.each([
    ['no rows at all', { rows: [] }],
    ['an uneven stretch longer than the fence', { roughLengthM: 201 }],
    ['a zero post spacing', { postSpacingM: 0 }],
    ['a zero spacing on uneven ground', { roughPostSpacingM: 0 }],
    ['a spare above 100 %', { sparePercent: 101 }],
    ['a negative spare', { sparePercent: -1 }],
    ['half a gate', { gates: 1.5 }],
    ['a row at ground level', { rows: on(0, 20) }],
    ['a field being typed', { perimeterM: NaN }],
    ['an outer line with no height', { outerWire: { enabled: true, heightCm: 0, offsetCm: 30 } }],
  ] satisfies [string, Partial<FenceInput>][])('gives no result for %s', (_, change) => {
    expect(calculateFence({ ...base, ...change })).toBeNull();
  });

  it('fixes no stretch ends when the whole fence is uneven', () => {
    const result = calculateFence({ ...base, roughLengthM: 200, roughPostSpacingM: 2 })!;
    // 200 / 2 = 100 spans; fixed 4 + 2 = 6.
    expect(result.fixedPoints).toBe(6);
    expect(result.base.posts).toBe(105);
  });
});

describe('presets', () => {
  it('carries the rows as the sources give them', () => {
    // 鳥取県 イノシシ・シカ用6段の例: gaps of 20, 20, 20, 30, 30, 40 cm from the ground.
    expect(findPreset('tottori-deer-boar')!.rows).toEqual(on(20, 40, 60, 90, 120, 160));
    // 総合対策編 図3-1-3.
    expect(findPreset('maff-general-deer-boar')!.rows).toEqual(on(20, 40, 60, 90, 130, 170));
    // 福井県: 20, 40, 60, 90, 120 cm, with a sixth at 150 cm only if needed.
    expect(findPreset('fukui-deer-boar')!.rows).toEqual(on(20, 40, 60, 90, 120));
    // 総合対策編 第6章: 20 cm, 20 cm, 20 cm from the ground.
    expect(findPreset('maff-general-bear')!.rows).toEqual(on(20, 40, 60));
    // 京都府 ツキノワグマ: 20 cm for the first two gaps, 25 cm above.
    expect(findPreset('kyoto-bear')!.rows).toEqual(on(20, 40, 65, 90));
    // The monkey fence's source gives no heights, so none are made up.
    expect(findPreset('maff-general-monkey')!.rows).toEqual([]);
  });

  it('powers every Kyoto deer row, since its unpowered cords are only for lines of 1.5 m and up', () => {
    // 京都府 ①: gaps of 20, 20, 20–25, 25–30, 30–40 cm, at their lower ends, all powered. The cords of ②
    // rest on 「1m50cm 以上の高さの線はシカが跳ばずに触れることはほとんど無い」, so no preset may leave a
    // row below 150 cm unpowered.
    expect(findPreset('kyoto-deer')!.rows).toEqual(on(20, 40, 60, 85, 115));
    const lowUnpowered = FENCE_PRESETS.flatMap((preset) =>
      preset.rows.filter((row) => !row.energized && row.heightCm < 150).map((row) => `${preset.id} ${row.heightCm}`),
    );
    expect(lowUnpowered).toEqual([]);
  });

  it('offers at least one source for every species, and names only real sources', () => {
    for (const species of ['boar', 'deer', 'deer-boar', 'monkey', 'bear', 'mesocarnivore'] as const)
      expect(presetsFor(species).length).toBeGreaterThan(0);
    for (const preset of FENCE_PRESETS) {
      expect(FENCE_SOURCES[preset.source]).toBeDefined();
      const heights = preset.rows.map((row) => row.heightCm);
      expect(heights).toEqual([...heights].sort((a, b) => a - b));
    }
    for (const item of INSPECTION_CHECKLIST)
      for (const ref of item.sources) expect(FENCE_SOURCES[ref.id]).toBeDefined();
    expect(LEGAL_REQUIREMENTS.map((requirement) => requirement.item)).toEqual([
      '第一号',
      '第二号',
      '第三号',
      '第四号',
      '第五号',
      '第六号',
    ]);
  });

  it('enters a spacing range at its short end and leaves the spacing alone where a source gives none', () => {
    const current = { outerWire: { enabled: true, heightCm: 25, offsetCm: 40 }, postSpacingM: 5 };
    expect(applyPreset(findPreset('tottori-boar')!, current).postSpacingM).toBe(3);
    const general = applyPreset(findPreset('maff-general-boar')!, current);
    expect(general.postSpacingM).toBe(5);
    // A source without an outer line switches it off but keeps what was typed for it.
    expect(general.outerWire).toEqual({ enabled: false, heightCm: 25, offsetCm: 40 });
    expect(applyPreset(findPreset('maff-general-bear')!, current).outerWire).toEqual({
      enabled: true,
      heightCm: 20,
      offsetCm: 30,
    });
  });

  it('tells a preset from rows that have been changed', () => {
    const preset = findPreset('tottori-boar')!;
    expect(matchesPreset(preset, { rows: on(20, 40), outerWire: noOuter })).toBe(true);
    expect(matchesPreset(preset, { rows: on(20, 45), outerWire: noOuter })).toBe(false);
    expect(matchesPreset(preset, { rows: on(20, 40, 60), outerWire: noOuter })).toBe(false);
    expect(matchesPreset(preset, { rows: on(20, 40), outerWire: { ...noOuter, enabled: true } })).toBe(false);
  });
});

describe('the legal text', () => {
  it('quotes 省令 第74条 as e-Gov gives it', () => {
    expect(ORDINANCE_ARTICLE_74).toBe(
      '電気さく（屋外において裸電線を固定して施設したさくであって、その裸電線に充電して使用するものをいう。）は、施設してはならない。ただし、田畑、牧場、その他これに類する場所において野獣の侵入又は家畜の脱出を防止するために施設する場合であって、絶縁性がないことを考慮し、感電又は火災のおそれがないように施設するときは、この限りでない。',
    );
  });

  it('keeps each item of 解釈 第192条 to what it says', () => {
    const item = (name: string) => LEGAL_REQUIREMENTS.find((requirement) => requirement.item === name)!.ja;
    expect(item('第一号')).toBe(
      '田畑、牧場、その他これに類する場所において野獣の侵入又は家畜の脱出を防止するために施設するものであること。',
    );
    expect(item('第二号')).toBe(
      '電気さくを施設した場所には、人が見やすいように適当な間隔で危険である旨の表示をすること。',
    );
    for (const phrase of [
      '電気用品安全法の適用を受ける電気さく用電源装置',
      '感電により人に危険を及ぼすおそれのないように出力電流が制限される電気さく用電源装置',
      '電気用品安全法の適用を受ける直流電源装置',
      '蓄電池、太陽電池その他これらに類する直流の電源',
    ])
      expect(item('第三号')).toContain(phrase);
    for (const phrase of [
      '直流電源装置を介する場合は直流電源装置',
      '使用電圧 30 V 以上の電源',
      '人が容易に立ち入る場所',
      '電流動作型',
      '定格感度電流 15 mA 以下',
      '動作時間 0.1 秒以下',
      '漏電遮断器',
    ])
      expect(item('第四号')).toContain(phrase);
    expect(item('第五号')).toBe('電気さくに電気を供給する電路には、容易に開閉できる箇所に専用の開閉器を施設すること。');
    for (const phrase of [
      '衝撃電流を繰り返して発生する電気さく用電源装置',
      '無線設備の機能に継続的かつ重大な障害',
      '施設しないこと',
    ])
      expect(item('第六号')).toContain(phrase);
  });
});

describe('electricFenceSettingsSchema', () => {
  const settings = {
    ...applyPreset(findPreset('tottori-deer-boar')!, { outerWire: noOuter, postSpacingM: 3 }),
    perimeterM: 200,
    gates: 1,
    corners: 4,
    roughLengthM: 0,
    roughPostSpacingM: 3,
    sparePercent: 0,
    checked: ['voltage'],
  };

  it('accepts complete settings and refuses an uneven stretch longer than the fence', () => {
    expect(electricFenceSettingsSchema.safeParse(settings).success).toBe(true);
    expect(electricFenceSettingsSchema.safeParse({ ...settings, roughLengthM: 300 }).success).toBe(false);
    expect(electricFenceSettingsSchema.safeParse({ ...settings, gates: 0.5 }).success).toBe(false);
  });
});
