/**
 * The bear bell: a bell sound made in the browser, how often it rings, a step detector for ringing
 * as one walks, and the sourced advice shown beside it. Nothing here touches the audio hardware or
 * a sensor; the page feeds the samples in and plays what these functions describe.
 */

type Text = { ja: string; en: string };

/** The day every source below was read. */
export const BEAR_SOURCES_CHECKED_ON = '2026-09-24';

// ---------------------------------------------------------------------------------------------------
// The sound
// ---------------------------------------------------------------------------------------------------

export const BELL_TONES = ['bright', 'mellow', 'pair'] as const;
export type BellTone = (typeof BELL_TONES)[number];

export interface BellPartial {
  /** Frequency in hertz. */
  frequencyHz: number;
  /** Peak level relative to the loudest partial. */
  gain: number;
  /** Time for the partial to fall to 1/e of its peak, in seconds. */
  decaySeconds: number;
  /** Delay from the strike, for a second clapper in the pair. */
  offsetSeconds: number;
}

// A small cast bell's overtones are not whole multiples of the fundamental. These ratios are a common
// approximation for a small bell and give the metallic ring; they are a sound design choice, not a
// measurement of any bell sold for bears. The fundamentals keep the highest partial under 17 kHz, so
// all four stay within the range of hearing.
const BELL_RATIOS = [
  { ratio: 1, gain: 1, decay: 0.9 },
  { ratio: 2.76, gain: 0.55, decay: 0.5 },
  { ratio: 5.4, gain: 0.3, decay: 0.28 },
  { ratio: 8.93, gain: 0.15, decay: 0.16 },
] as const;

const strike = (fundamentalHz: number, offsetSeconds = 0, level = 1): BellPartial[] =>
  BELL_RATIOS.map(({ ratio, gain, decay }) => ({
    frequencyHz: fundamentalHz * ratio,
    gain: gain * level,
    decaySeconds: decay,
    offsetSeconds,
  }));

/** The partials of one ring. `pair` is two bells a little apart in pitch, struck one after the other. */
export function bellPartials(tone: BellTone): BellPartial[] {
  switch (tone) {
    case 'bright':
      return strike(1800);
    case 'mellow':
      return strike(1100);
    case 'pair':
      return [...strike(1600), ...strike(1780, 0.12, 0.8)];
  }
}

/** How long a ring lasts before it is inaudible (four decay times of its longest partial). */
export function ringSeconds(partials: readonly BellPartial[]): number {
  return Math.max(...partials.map((partial) => partial.offsetSeconds + partial.decaySeconds * 4));
}

// ---------------------------------------------------------------------------------------------------
// When it rings
// ---------------------------------------------------------------------------------------------------

export const INTERVAL_SECONDS_MIN = 1;
export const INTERVAL_SECONDS_MAX = 60;
export const AUTO_OFF_MINUTES_MAX = 600;

export interface RingTiming {
  intervalSeconds: number;
  /** Spread the wait between rings over half to one and a half times the interval. */
  vary: boolean;
}

/** The wait before the next ring. `random` is a number in [0, 1), passed in so the choice can be tested. */
export function nextRingDelayMs({ intervalSeconds, vary }: RingTiming, random: number): number {
  const seconds = vary ? intervalSeconds * (0.5 + random) : intervalSeconds;
  return Math.round(seconds * 1000);
}

/** A ring's level: the chosen volume, or when varied anywhere from 60 % of it up to it. */
export function ringLevel(volumePercent: number, vary: boolean, random: number): number {
  const level = Math.min(Math.max(volumePercent, 0), 100) / 100;
  return vary ? level * (0.6 + 0.4 * random) : level;
}

/** When the bell stops by itself, or null when it rings until stopped. */
export function autoOffAt(startMs: number, minutes: number): number | null {
  return minutes > 0 ? startMs + minutes * 60_000 : null;
}

// ---------------------------------------------------------------------------------------------------
// Ringing as one walks
// ---------------------------------------------------------------------------------------------------

export const SENSITIVITY_LEVELS = [1, 2, 3, 4, 5] as const;
export type Sensitivity = (typeof SENSITIVITY_LEVELS)[number];

/**
 * How far, in m/s², the acceleration has to rise above its running average to count as a step. A
 * higher sensitivity is a lower threshold. The values were set by walking with a phone in a pocket;
 * they are a starting point, which the page lets the person change.
 */
export const STEP_THRESHOLDS: Record<Sensitivity, number> = { 1: 4, 2: 3, 3: 2.2, 4: 1.6, 5: 1.1 };

/** Two steps closer together than this are one (a brisk walk is about two steps a second). */
export const STEP_MIN_GAP_MS = 280;

export interface MotionSample {
  /** Acceleration including gravity, in m/s². */
  x: number;
  y: number;
  z: number;
  /** When the sample was taken, in milliseconds. */
  timeMs: number;
}

export interface StepDetector {
  /** Takes the next sample and says whether it completes a step. */
  push: (sample: MotionSample) => boolean;
}

/**
 * Finds steps in the stream of motion samples. The magnitude of the acceleration is compared with a
 * slow running average, which follows gravity whichever way the phone is held; a step is a rise above
 * the threshold, counted once until the signal falls back under half of it.
 */
export function createStepDetector(sensitivity: Sensitivity): StepDetector {
  const threshold = STEP_THRESHOLDS[sensitivity];
  let baseline: number | null = null;
  let armed = true;
  let lastStepMs = Number.NEGATIVE_INFINITY;
  return {
    push: ({ x, y, z, timeMs }) => {
      const magnitude = Math.hypot(x, y, z);
      if (!Number.isFinite(magnitude)) return false;
      if (baseline === null) {
        baseline = magnitude;
        return false;
      }
      // A time constant of about a second at the usual 60 samples a second.
      baseline += (magnitude - baseline) * 0.02;
      const rise = magnitude - baseline;
      if (!armed) {
        if (rise < threshold / 2) armed = true;
        return false;
      }
      if (rise < threshold || timeMs - lastStepMs < STEP_MIN_GAP_MS) return false;
      armed = false;
      lastStepMs = timeMs;
      return true;
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------------

export type BearSourceId =
  'sixRules' | 'report' | 'manual' | 'govOnline' | 'akita' | 'spray' | 'poster' | 'caa' | 'emergency';

export interface BearSource {
  title: string;
  publisher: string;
  issued: string;
  url: string;
}

export const BEAR_SOURCES: Record<BearSourceId, BearSource> = {
  sixRules: {
    title: '山に行くみなさん！クマにご注意を！（６箇条）',
    publisher: '政府広報・環境省',
    issued: '2026年5月',
    url: 'https://www.env.go.jp/nature/choju/effort/effort12/6kajyou.pdf',
  },
  report: {
    title: 'クマによる人身被害の分析レポート',
    publisher: '環境省',
    issued: '令和8年4月',
    url: 'https://www.env.go.jp/nature/choju/effort/effort12/kuma-bunseki-r0804.pdf',
  },
  manual: {
    title: 'クマ類の出没対応マニュアル －改定版－',
    publisher: '環境省 自然環境局',
    issued: '令和3年3月',
    url: 'https://www.env.go.jp/nature/choju/docs/docs5-4a/index.html',
  },
  govOnline: {
    title: 'クマに出会わないために。知っておきたい対策',
    publisher: '政府広報オンライン（取材協力：環境省）',
    issued: '2026年9月10日',
    url: 'https://www.gov-online.go.jp/article/202609/entry-11625.html',
  },
  akita: {
    title: 'ツキノワグマ情報',
    publisher: '秋田県',
    issued: '2026年9月23日更新',
    url: 'https://www.pref.akita.lg.jp/pages/archive/23295',
  },
  spray: {
    title: 'クマ撃退スプレーの性能に係る推奨要件',
    publisher: '環境省 自然環境局',
    issued: '令和8年8月',
    url: 'https://www.env.go.jp/nature/choju/effort/effort12/kuma-oshirase-r080825.html',
  },
  poster: {
    title: 'クマ撃退スプレー ポスター',
    publisher: '環境省・消費者庁・国民生活センター',
    issued: '2026年8月',
    url: 'https://www.env.go.jp/nature/choju/effort/effort12/poster.pdf',
  },
  caa: {
    title: 'クマ撃退スプレーの備え方―事前の確認・準備が必須です―',
    publisher: '消費者庁・環境省・国民生活センター',
    issued: '2026年8月25日',
    url: 'https://www.caa.go.jp/policies/policy/consumer_safety/caution/caution_087/',
  },
  emergency: {
    title: '緊急銃猟実施時に用いるチラシ（ツキノワグマ）',
    publisher: '環境省',
    issued: '2025年7月',
    url: 'https://www.env.go.jp/nature/choju/effort/effort15/doc/tsukikuma.pdf',
  },
};

/** The hub where the ministry lists its current material for the public. */
export const BEAR_INFO_URL = 'https://www.env.go.jp/nature/choju/effort/effort12/kuma-info-citizen.html';

export interface SourcedText {
  text: Text;
  /** The words of the source, in Japanese, and where they are. */
  quote: string;
  source: BearSourceId;
  where: string;
}

// ---------------------------------------------------------------------------------------------------
// Before going in
// ---------------------------------------------------------------------------------------------------

export interface ChecklistItem extends SourcedText {
  id: string;
}

export const PRE_TRIP_CHECKLIST: readonly ChecklistItem[] = [
  {
    id: 'sightings',
    text: {
      ja: '行き先と経路の出没情報を、自治体の発表で確認した',
      en: 'Checked the municipality’s sighting reports for the route and destination',
    },
    quote: '出没情報を事前に確認する　お住まいの自治体の発表を確認し、目撃・出没情報があれば行くのを控える。',
    source: 'sixRules',
    where: '1',
  },
  {
    id: 'company',
    text: { ja: '1 人で入らない。同行者と離れない', en: 'Not going alone, and staying with the others' },
    quote: '1人で行動しない　複数人で山に入るのはもちろん、山菜採りに夢中になり同行者と離れないように。',
    source: 'sixRules',
    where: '2',
  },
  {
    id: 'hours',
    text: { ja: '早朝・夕方を避ける予定にした', en: 'Planned to avoid early morning and dusk' },
    quote: '早朝・夕方を避ける　明け方や日の入り前後は、クマの行動が活発になります。',
    source: 'sixRules',
    where: '3',
  },
  {
    id: 'sound',
    text: {
      ja: '鈴やラジオなど、音の出るものを持った（止まると鈴は鳴らない）',
      en: 'Carrying a bell or radio (a bell is silent when you stop)',
    },
    quote: 'ラジオや鈴を鳴らし続ける　たえず音を鳴らすように。立ち止まると鈴は鳴らない点にも要注意です。',
    source: 'sixRules',
    where: '4',
  },
  {
    id: 'food',
    text: {
      ja: '食べ物は密閉し、残飯・ごみは持ち帰る',
      en: 'Food sealed; leftovers and rubbish taken home',
    },
    quote: '残飯などクマの誘引物となるものは必ず持ち帰りましょう。',
    source: 'manual',
    where: '印刷 p.28',
  },
  {
    id: 'spray',
    text: {
      ja: 'クマ撃退スプレーを、すぐ取り出せる位置に身に着けた（持つ場合）',
      en: 'Bear spray worn where it can be drawn at once (if carried)',
    },
    quote: '事前に使い方を確認し、すぐに取り出して噴射できるように身に着ける',
    source: 'poster',
    where: '本文',
  },
  {
    id: 'rehearse',
    text: {
      ja: '遭遇したときの行動を確認した（下の行動ガイド）',
      en: 'Went over what to do in an encounter (the guide below)',
    },
    quote: 'クマと遭遇した際の正しい対処法を事前に把握し、イメージトレーニングをしましょう',
    source: 'manual',
    where: '印刷 p.28',
  },
  {
    id: 'route',
    text: {
      ja: '推奨ルートから外れない予定にした。新しい痕跡を見たら引き返す',
      en: 'Staying on the recommended route, and turning back at fresh signs',
    },
    quote:
      '登山やトレッキングなどでは、推奨ルートから外れないようにしましょう。／新しいクマの痕跡（糞、足跡など）を発見した場合は、安全策を取り、引き返しましょう。',
    source: 'manual',
    where: '印刷 p.28',
  },
];

// ---------------------------------------------------------------------------------------------------
// The limits of a bell
// ---------------------------------------------------------------------------------------------------

export const BELL_LIMITS: readonly SourcedText[] = [
  {
    text: {
      ja: 'ほとんどのクマは人の気配で逃げるので、音出しは有効な事故防止策です。ただし、積極的に人に近づくクマには効きません。',
      en: 'Most bears flee when they sense people, so making noise helps prevent accidents; it does not stop a bear that approaches people.',
    },
    quote:
      'このようなクマについては、鈴やラジオ等の一般的な対策では事故を防ぐことが困難です（※）。※積極的に人に接近するのは特定の限られたクマであり、ほとんどのクマは人の気配を感じると逃げるので、鈴やラジオなどの音出しは有効な事故防止策です。',
    source: 'akita',
    where: '山での事故対策',
  },
  {
    text: {
      ja: '人の存在を知らせて突然の遭遇を避けるための装備で、過信は禁物です。',
      en: 'It tells a bear someone is coming, to avoid a sudden meeting. Do not rely on it.',
    },
    quote:
      '鈴やラジオなど音が鳴るものを携帯しましょう。※人の存在・接近をクマに知らせ、突発的な遭遇を避けるための装備ですが、過信はせず、常に周囲に気を配ることを忘れてはいけません。',
    source: 'manual',
    where: '印刷 p.28',
  },
  {
    text: {
      ja: '沢の音・雨音で音がかき消されます。見通しの悪い場所では声も出します。',
      en: 'Streams and rain drown the sound; where you cannot see far, call out as well.',
    },
    quote:
      '雨天時にレインカバーに圧されて鈴が鳴らなかったり、川のそばや雨等の水音で鈴などの音が周辺に響かない点に注意しましょう／見通しの悪い場所や、音が響きにくい場所では、意識して大きな音や声を出しましょう。',
    source: 'report',
    where: 'p.6',
  },
  {
    text: {
      ja: '人の生活圏に繰り返し出るクマには効かないことがあります。',
      en: 'It may not work on a bear that keeps coming into places where people live.',
    },
    quote: 'ただし、繰り返し人の生活圏に出没しているクマに対しては、効果がない場合もあるため、',
    source: 'govOnline',
    where: '対策2',
  },
  {
    text: {
      ja: 'クマに出会ってから、大きな音で威嚇してはいけません。',
      en: 'Once you have met a bear, do not try to scare it with loud noise.',
    },
    quote: '× してはいけないこと　クマに対して大きな声や音を出して威嚇する',
    source: 'report',
    where: 'p.8',
  },
];

// ---------------------------------------------------------------------------------------------------
// In an encounter
// ---------------------------------------------------------------------------------------------------

export interface EncounterStage {
  id: string;
  title: Text;
  steps: readonly Text[];
  quotes: readonly { quote: string; source: BearSourceId; where: string }[];
}

export const ENCOUNTER_STAGES: readonly EncounterStage[] = [
  {
    id: 'far',
    title: { ja: '遠くにクマがいるのに気づいた', en: 'You see a bear some way off' },
    steps: [
      { ja: '落ち着いて、静かにその場を離れる。', en: 'Stay calm and leave quietly.' },
      {
        ja: 'クマが気づいていないようなら、様子を見ながら物音を立てて存在を知らせる。急に大声をあげたり急に動いたりしない。',
        en: 'If it has not noticed you, let it know you are there with some noise while watching it. No sudden shouting or movement.',
      },
    ],
    quotes: [
      {
        quote:
          '落ち着いて静かにその場から立ち去ります。クマが先に人の気配に気づいて隠れる、逃走する場合が多いですが、もし気が付いていないようであれば存在を知らせるため、物音を立てるなど様子を見ながら立ち去りましょう。急に大声をあげたり、急な動きをしたりするとクマが驚いてどのような行動をするか分からないため、注意しましょう。',
        source: 'manual',
        where: '印刷 p.72（1）',
      },
    ],
  },
  {
    id: 'near',
    title: { ja: '近くにクマがいる・こちらに気づいた', en: 'A bear is close, or has noticed you' },
    steps: [
      {
        ja: 'クマを見ながら、ゆっくり後退して距離をとる。背中を見せて走らない。',
        en: 'Back away slowly, watching the bear. Do not turn and run.',
      },
      {
        ja: '突進してきてもすぐ止まって引き返すこと（威嚇突進）がある。落ち着いて距離をとる。',
        en: 'A charge may stop short and turn back (a bluff charge). Keep calm and open the distance.',
      },
      {
        ja: '大声・物を投げる・リュックを置いて逃げる、はしない。',
        en: 'Do not shout, throw things, or drop your pack and run.',
      },
      {
        ja: '車や建物が近ければ中に避難する。電柱や木など遮るものをクマとの間に挟む。',
        en: 'Get into a car or building if one is near; keep a pole or tree between you and the bear.',
      },
    ],
    quotes: [
      {
        quote:
          'クマは逃走する対象を追いかける傾向があるので、背中を見せて逃げ出すと攻撃性を高める場合があります。そのため、クマを見ながらゆっくり後退する、静かに語りかけながら後退する、など落ち着いて距離をとるようにします。慌てて走って逃げてはいけません。',
        source: 'manual',
        where: '印刷 p.72（2）',
      },
      {
        quote:
          '× してはいけないこと　クマに対して大きな声や音を出して威嚇する／背中を見せ、走り出す／クマに対して物を投げたりして、刺激を与える／リュックやかばんを置いて逃げる',
        source: 'report',
        where: 'p.8',
      },
      {
        quote:
          '電柱や木、車などの遮蔽物が近くにある場合は、クマと自分の間に挟むような位置に移動します。／近くに車や民家、店舗、公共施設などがある場合は、車内や屋内など、クマから身を守れる場所に避難します。',
        source: 'govOnline',
        where: '遭遇時',
      },
    ],
  },
  {
    id: 'attack',
    title: { ja: '至近距離で出会った・襲われそう', en: 'At close range, or about to be attacked' },
    steps: [
      {
        ja: 'クマ撃退スプレーを持っていれば、顔に向けて噴射する。',
        en: 'If you carry bear spray, spray it at the face.',
      },
      {
        ja: '最終手段は防御姿勢：うつ伏せになり、顔・胸・腹を守る。手指を組んで後頭部と首の後ろを覆う。',
        en: 'As a last resort, lie face down to protect face, chest and belly, with fingers laced over the back of the head and neck.',
      },
    ],
    quotes: [
      {
        quote:
          '顔面・頭部が攻撃されることが多いため、両腕で顔面や頭部を覆い、直ちにうつ伏せになるなどして重大な障害や致命的ダメージを最小限にとどめることが重要です。クマ撃退スプレー（唐辛子成分であるカプサイシンを発射するスプレー）を携行している場合は、クマに向かって噴射することで攻撃を回避できる可能性が高くなります。',
        source: 'manual',
        where: '印刷 p.72（3）',
      },
      {
        quote:
          '防御姿勢はあくまで最終手段です。…うつ伏せになり、顔や胸、腹部を守りましょう。後頭部と首の後ろは手指を組み合わせて攻撃を防ぎます。',
        source: 'report',
        where: 'p.8',
      },
    ],
  },
  {
    id: 'after',
    title: { ja: '遭遇したあと', en: 'Afterwards' },
    steps: [
      {
        ja: 'まず安全な場所へ避難する。出没した場所・時間・移動した方向を整理して、その地域の市町村か警察署に連絡する。',
        en: 'First get somewhere safe. Then report where and when, and which way it went, to the municipality or the police for that area.',
      },
      {
        ja: '緊急銃猟などで通行が制限されたら、市町村職員の指示に従い、現場に近づかない。',
        en: 'If roads are closed for an emergency shooting, follow the officials and keep away from the scene.',
      },
    ],
    quotes: [
      {
        quote:
          'クマを目撃した、あるいは遭遇した場合、まずは安全な場所へ避難してください。その上で、クマが出没した場所や時間、移動した方向などを分かる範囲で整理し、出没した地域の自治体又は管轄の警察署に連絡しましょう。',
        source: 'govOnline',
        where: '遭遇後',
      },
      {
        quote:
          '安全が確認されるまでは、市町村職員からの指示に従い身の安全を確保してください。／特に、現場周辺に近づく、避難している場所から外出する行為は危険なためやめてください。',
        source: 'emergency',
        where: '地域の皆さまへのお願い 3・4',
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------
// Bear spray
// ---------------------------------------------------------------------------------------------------

export const SPRAY_POINTS: readonly SourcedText[] = [
  {
    text: {
      ja: '目安の性能：CRC 濃度 1.0〜2.0 % 程度、噴射距離 7.5 m 程度以上、噴射時間 6 秒程度以上、霧状に広がる噴射。',
      en: 'Performance to look for: CRC about 1.0–2.0 %, a range of about 7.5 m or more, about 6 s of spray, a spreading mist.',
    },
    quote:
      'CRC濃度 1.0〜2.0％程度を目安／噴射距離 7.5ｍ程度以上／噴射時間 ６秒程度以上／円錐状に広がる霧状（ミスト状）噴射',
    source: 'spray',
    where: '概要',
  },
  {
    text: {
      ja: '接近・突進してくるクマへの緊急の防御手段。追い払いや、事前にまいて寄せ付けない使い方は想定されていません。',
      en: 'An emergency defence against a bear that approaches or charges; not for driving bears off or for spraying in advance.',
    },
    quote:
      '忌避を目的としたクマ撃退スプレーの事前噴射は推奨されない。／クマ撃退スプレーは接近・突進してくるクマに対する緊急的な防御手段であり、追い払いを目的とした使用は想定されていない。',
    source: 'spray',
    where: '印刷 p.3',
  },
  {
    text: {
      ja: '5〜10 m ほどの距離でクマの顔（目・鼻）を狙う。風上から使い、寒いとガス圧が下がって届く距離が短くなります。',
      en: 'Aim at the face (eyes and nose) at about 5–10 m. Use it upwind; cold lowers the gas pressure and the range.',
    },
    quote:
      '5～10ｍ程度の距離を置いた状態でクマの顔面（目、鼻）を狙って噴射する／原則として、クマよりも風上から使用する／冬の低温時にはガス圧が低下し、噴射距離が短くなることに留意する',
    source: 'caa',
    where: '本文',
  },
];
