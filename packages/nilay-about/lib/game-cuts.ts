/**
 * The cuts of deer and wild boar as the national game meat certification scheme names them
 * (国産ジビエ認証制度 別表 4 カットチャート), with the joints or ribs each is cut at.
 *
 * The chart names the cuts and draws where they are divided; it gives no share of the carcass for
 * any of them, so none is given here either.
 */

export const GAME_CUTS_CHECKED_ON = '2026-09-24';

export const GAME_CUTS_SOURCES = {
  chart: {
    title: '国産ジビエ認証制度 別表 4 カットチャート',
    note: '農林水産省掲載',
    url: 'https://www.maff.go.jp/j/nousin/gibier/attach/pdf/ninsyou-9.pdf',
  },
  guidebook: {
    title: '国産ジビエ認証制度 ガイドブック【食肉処理事業者向け】（令和 5 年 8 月）Q5',
    note: '農林水産省 農村振興局 監修',
    url: 'https://www.maff.go.jp/j/nousin/gibier/attach/pdf/ninsyou-125.pdf',
  },
} as const;

export type GameCutSpecies = 'deer' | 'boar';

export type GameCutId =
  | 'neck'
  | 'shoulder'
  | 'shoulderLoin'
  | 'loin'
  | 'belly'
  | 'leg'
  | 'outsideLeg'
  | 'knuckle'
  | 'insideLeg'
  | 'shank'
  | 'foreShank';

export interface GameCut {
  id: GameCutId;
  ja: string;
  en: string;
  /** Where the chart divides it from its neighbours, in the chart's words. */
  boundary: { ja: string; en: string };
  /** A cut of the hind leg the chart draws apart from the whole leg (モモ). */
  partOf?: GameCutId;
}

/** The chart draws the hind leg split three ways without naming the lines it cuts along. */
const SPLIT_LEG = {
  ja: 'チャートの後肢の図で、モモを外モモ・シンタマ・内モモに分けている',
  en: 'The chart’s drawing of the hind leg divides the leg into these three',
};

const CUTS: Record<GameCutId, GameCut> = {
  neck: {
    id: 'neck',
    ja: 'ネック',
    en: 'Neck',
    boundary: { ja: '頸椎と第 1 肋骨の間までの首', en: 'The neck, up to between the neck vertebrae and the first rib' },
  },
  shoulder: {
    id: 'shoulder',
    ja: 'カタ',
    en: 'Shoulder',
    boundary: { ja: '肩関節から肘関節まで（前脚の付け根）', en: 'The foreleg from the shoulder joint to the elbow' },
  },
  shoulderLoin: {
    id: 'shoulderLoin',
    ja: '肩ロース',
    en: 'Shoulder loin',
    boundary: {
      ja: '背の前側。第 2〜3 肋骨の間でロースと分ける（36 kg 以上の個体は第 5〜6 肋骨の間）',
      en: 'The front of the back, divided from the loin between the 2nd and 3rd ribs (5th and 6th in animals of 36 kg or more)',
    },
  },
  loin: {
    id: 'loin',
    ja: 'ロース',
    en: 'Loin',
    boundary: {
      ja: '背骨に沿った背の肉。最後腰椎でモモと分ける',
      en: 'Along the spine, divided from the leg at the last lumbar vertebra',
    },
  },
  belly: {
    id: 'belly',
    ja: 'バラ',
    en: 'Belly',
    boundary: { ja: '腹側の肉', en: 'The belly side' },
  },
  leg: {
    id: 'leg',
    ja: 'モモ',
    en: 'Leg',
    boundary: {
      ja: '最後腰椎・股関節から膝関節まで',
      en: 'From the last lumbar vertebra and the hip joint to the knee',
    },
  },
  outsideLeg: {
    id: 'outsideLeg',
    ja: '外モモ',
    en: 'Outside leg',
    boundary: SPLIT_LEG,
    partOf: 'leg',
  },
  knuckle: {
    id: 'knuckle',
    ja: 'シンタマ',
    en: 'Knuckle',
    boundary: SPLIT_LEG,
    partOf: 'leg',
  },
  insideLeg: {
    id: 'insideLeg',
    ja: '内モモ',
    en: 'Inside leg',
    boundary: SPLIT_LEG,
    partOf: 'leg',
  },
  shank: {
    id: 'shank',
    ja: 'スネ',
    en: 'Hind shank',
    boundary: { ja: '膝関節から先の後脚', en: 'The hind leg below the knee' },
  },
  foreShank: {
    id: 'foreShank',
    ja: '前スネ',
    en: 'Fore shank',
    boundary: { ja: '肘関節から先の前脚', en: 'The foreleg below the elbow' },
  },
};

/**
 * The cuts on the chart for each species. The deer chart has no 肩ロース or バラ: the guidebook says the
 * belly of a deer carries little meat and may be sold as バラ where there is enough of it.
 */
export const GAME_CUTS: Record<GameCutSpecies, readonly GameCut[]> = {
  deer: [
    CUTS.neck,
    CUTS.shoulder,
    CUTS.loin,
    CUTS.leg,
    CUTS.outsideLeg,
    CUTS.knuckle,
    CUTS.insideLeg,
    CUTS.shank,
    CUTS.foreShank,
  ],
  boar: [
    CUTS.neck,
    CUTS.shoulder,
    CUTS.shoulderLoin,
    CUTS.loin,
    CUTS.belly,
    CUTS.leg,
    CUTS.outsideLeg,
    CUTS.knuckle,
    CUTS.insideLeg,
    CUTS.shank,
    CUTS.foreShank,
  ],
};

/** The cuts a carcass is sold in, with the leg given as its three parts rather than as a whole. */
export const saleCuts = (species: GameCutSpecies) => GAME_CUTS[species].filter((cut) => cut.id !== 'leg');
