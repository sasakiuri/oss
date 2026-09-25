/**
 * An age class for a harvested sika deer or wild boar from its lower teeth, as two studies from
 * Hyogo Prefecture set them out. Only what the studies state is used: the deer from the wear of the
 * first incisor, the boar from the eruption of the molars. Both say their tables are a rough guide.
 */

export const TEETH_AGE_CHECKED_ON = '2026-09-24';

type Text = { ja: string; en: string };

export const TEETH_AGE_SOURCES = {
  deer: {
    title: '尾崎真也「兵庫県におけるニホンジカの第一切歯の摩滅と年齢の関係」',
    note: '兵庫県立農林水産技術総合センター研究報告〔森林林業編〕50: 15–16（2003）',
    url: 'https://hyogo-nourinsuisangc.jp/_3-k_seika/rinkenpo/50-4.pdf',
  },
  boar: {
    title: '辻知香・横山真弓「ニホンイノシシの年齢査定方法」',
    note: '兵庫ワイルドライフモノグラフ 6: 59–70（2014、兵庫県森林動物研究センター）',
    url: 'https://agriknowledge.affrc.go.jp/RN/2030912707.pdf',
  },
} as const;

// Deer ----------------------------------------------------------------------------------------------

export type DeerIncisor = 'deciduous' | 'permanent';
/** The wear classes of the permanent first incisor (表 2). */
export type DeerWear = 'I' | 'II' | 'III' | 'IV';

export const DEER_WEAR_CLASSES: Record<DeerWear, Text> = {
  I: { ja: '新しく生えた永久歯で、摩滅がほとんど認められない', en: 'Newly erupted, with hardly any wear' },
  II: {
    ja: '摩滅は認められるが、第 2 象牙質が認められない',
    en: 'Worn, but no secondary dentine shows',
  },
  III: {
    ja: '第 2 象牙質が認められ、摩滅が舌側の 1/2 に達しない',
    en: 'Secondary dentine shows; the wear has not reached half of the tongue side',
  },
  IV: { ja: '摩滅面が舌側の 1/2 以上に及んでいる', en: 'The worn surface covers half of the tongue side or more' },
};

export interface AgeEstimate {
  /** The age class in years, as the source gives it. `max` is `null` for an open-ended class. */
  min: number;
  max: number | null;
  label: Text;
  /** The source's own words behind the class. */
  basis: Text;
}

/**
 * 乳歯の場合は 0 才 (第一切歯は生後約 1 年の間に乳歯から永久歯に生え替わる), and the rough age range of each
 * wear class (摘要 3): I 1 才, II 2 才, III 3〜5 才, IV 6 才以上.
 */
export function deerAge(incisor: DeerIncisor | null, wear: DeerWear | null): AgeEstimate | null {
  if (incisor === 'deciduous')
    return {
      min: 0,
      max: 0,
      label: { ja: '0 歳', en: '0 years' },
      basis: {
        ja: '第一切歯は生後約 1 年の間に乳歯から永久歯に生え替わるため、乳歯の場合は 0 才（尾崎 2003、大泰司 1976 を引用）',
        en: 'The first incisor changes from milk to permanent within about a year of birth, so a milk incisor means 0 years.',
      },
    };
  if (incisor !== 'permanent' || wear === null) return null;
  const classes: Record<DeerWear, Pick<AgeEstimate, 'min' | 'max' | 'label'>> = {
    I: { min: 1, max: 1, label: { ja: '1 歳', en: '1 year' } },
    II: { min: 2, max: 2, label: { ja: '2 歳', en: '2 years' } },
    III: { min: 3, max: 5, label: { ja: '3〜5 歳', en: '3 to 5 years' } },
    IV: { min: 6, max: null, label: { ja: '6 歳以上', en: '6 years or more' } },
  };
  return {
    ...classes[wear],
    basis: {
      ja: `摩滅クラス ${wear}（${DEER_WEAR_CLASSES[wear].ja}）。性別による摩滅の進行速度を考慮した大まかな年齢の範囲（尾崎 2003）`,
      en: `Wear class ${wear} (${DEER_WEAR_CLASSES[wear].en}). The rough age range for the class, allowing for the sexes wearing at different rates.`,
    },
  };
}

/** Mean age by wear class and sex, ± 95 % confidence limit (表 3). Males wear faster from class III. */
export const DEER_MEAN_AGE: Record<DeerWear, { male: string; female: string }> = {
  I: { male: '1.0 ± 0.0', female: '1.0 ± 0.0' },
  II: { male: '1.8 ± 0.3', female: '2.0 ± 0.4' },
  III: { male: '3.6 ± 0.3', female: '4.3 ± 0.4' },
  IV: { male: '7.0 ± 0.7', female: '8.0 ± 0.7' },
};

// Boar ----------------------------------------------------------------------------------------------

/** How far a molar of the lower jaw has come through. */
export type MolarState = 'none' | 'erupting' | 'erupted';
/**
 * The third molar by its cusps: M3-1 up to the 1st and 2nd, M3-2 up to the 3rd and 4th, M3-3 up to
 * the 5th and 6th, and `full` once the last (7th) cusp is through.
 */
export type ThirdMolarState = 'none' | 'm3-1' | 'm3-2' | 'm3-3' | 'full';

export interface BoarTeeth {
  m1: MolarState | null;
  m2: MolarState | null;
  m3: ThirdMolarState | null;
}

/**
 * The timing the study sums up (5-3-1、図 6): M1 is through by the winter of age 0; M2 comes through in
 * the spring and early summer as the animal turns 1; M3 starts in the autumn and winter of age 1, its
 * 3rd to 6th cusps come in the autumn and winter of age 2, and the last (7th) in the autumn and winter
 * of age 3. The study takes 1 May as the birthday. Past the full third molar only the cementum annuli
 * (a laboratory method) tell the age.
 */
export function boarAge(teeth: BoarTeeth): AgeEstimate | null {
  const { m1, m2, m3 } = teeth;
  if (m3 === null && m2 === null && m1 === null) return null;
  if (m3 && m3 !== 'none') {
    if (m3 === 'full')
      return {
        min: 3,
        max: null,
        label: { ja: '3 歳（秋〜冬）以上', en: '3 years (autumn and winter) or more' },
        basis: {
          ja: '第三後臼歯の最後の第七咬頭は 3 歳の秋から冬にかけて萌出する。これより上の年齢は歯の萌出では分からず、第一後臼歯のセメント質の年輪で査定する',
          en: 'The last (7th) cusp of the third molar comes through in the autumn and winter of age 3. Beyond that, only the cementum annuli of the first molar tell the age.',
        },
      };
    if (m3 === 'm3-1')
      return {
        min: 1,
        max: 2,
        label: { ja: '1 歳（秋〜冬）〜2 歳', en: '1 year (autumn and winter) to 2 years' },
        basis: {
          ja: '第三後臼歯は 1 歳の秋から冬にかけて萌出を始め、第三〜六咬頭は 2 歳の秋から冬にかけて萌出する',
          en: 'The third molar starts in the autumn and winter of age 1; its 3rd to 6th cusps come in the autumn and winter of age 2.',
        },
      };
    return {
      min: 2,
      max: 3,
      label: { ja: '2 歳（秋〜冬）〜3 歳', en: '2 years (autumn and winter) to 3 years' },
      basis: {
        ja: '第三後臼歯の第三・四咬頭と第五・六咬頭は 2 歳の秋から冬にかけて萌出し、最後の第七咬頭は 3 歳の秋から冬にかけて萌出する',
        en: 'The 3rd to 6th cusps of the third molar come in the autumn and winter of age 2, the last (7th) in the autumn and winter of age 3.',
      },
    };
  }
  if (m2 === 'erupted')
    return {
      min: 1,
      max: 1,
      label: { ja: '1 歳', en: '1 year' },
      basis: {
        ja: '第二後臼歯は 1 歳を迎える春から初夏にかけて萌出し、第三後臼歯は 1 歳の秋から冬にかけて萌出を始める',
        en: 'The second molar comes through in the spring and early summer as the animal turns 1; the third starts in the autumn and winter of age 1.',
      },
    };
  if (m2 === 'erupting')
    return {
      min: 0,
      max: 1,
      label: { ja: '1 歳を迎えるころ（春〜初夏）', en: 'About to turn 1 (spring to early summer)' },
      basis: {
        ja: '第二後臼歯は 1 歳を迎える春から初夏にかけて萌出する',
        en: 'The second molar comes through in the spring and early summer as the animal turns 1.',
      },
    };
  if (m1 === null) return null;
  return {
    min: 0,
    max: 0,
    label: { ja: '0 歳', en: '0 years' },
    basis: {
      ja:
        m1 === 'erupted'
          ? '第一後臼歯は 0 歳の冬に萌出が完了し、第二後臼歯は 1 歳を迎える春から初夏にかけて萌出する'
          : '第一後臼歯は 0 歳の冬に萌出が完了する',
      en:
        m1 === 'erupted'
          ? 'The first molar is through by the winter of age 0; the second comes in the spring and early summer as the animal turns 1.'
          : 'The first molar is through by the winter of age 0.',
    },
  };
}
