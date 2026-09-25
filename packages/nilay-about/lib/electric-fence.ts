import type { ElectricFenceSettings, FenceSpecies, OuterWire, WireRow } from '@/lib/schemas/electric-fence';

export type { ElectricFenceSettings, FenceSpecies, OuterWire, WireRow } from '@/lib/schemas/electric-fence';

/** The day every source below was read. */
export const SOURCES_CHECKED_ON = '2026-09-23';

type Text = { ja: string; en: string };

export type FenceSourceId =
  | 'maff-general'
  | 'maff-mesocarnivore'
  | 'maff-practice-2014'
  | 'tottori'
  | 'fukui'
  | 'kyoto'
  | 'ordinance'
  | 'interpretation'
  | 'commentary'
  | 'maff-safety';

export interface FenceSource {
  /** The document's own title, in Japanese. */
  title: string;
  publisher: string;
  issued: string;
  url: string;
  /** A document the publisher now lists among its past editions. */
  superseded?: boolean;
}

export const FENCE_SOURCES: Record<FenceSourceId, FenceSource> = {
  'maff-general': {
    title: '野生鳥獣被害防止マニュアル【総合対策編】',
    publisher: '農林水産省',
    issued: '令和5年3月',
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/manyuaru/manual.html',
  },
  'maff-mesocarnivore': {
    title: '野生鳥獣被害防止マニュアル【中型獣類編】',
    publisher: '農林水産省',
    issued: '令和6年3月',
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/manyuaru/R5_tyuugata/r5_tyuugata_3_2.pdf',
  },
  'maff-practice-2014': {
    title: '【改訂版】野生鳥獣被害防止マニュアル－イノシシ、シカ、サル（実践編）－',
    publisher: '農林水産省（過去のマニュアル）',
    issued: '平成26年3月',
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/manyuaru/6_old_manual.html',
    superseded: true,
  },
  tottori: {
    title: '電気柵設置・点検マニュアル',
    publisher: '鳥取県 農林水産部 農業振興局 鳥獣対策課',
    issued: '平成28年3月発行（掲載中の版）',
    url: 'https://www.pref.tottori.lg.jp/257337.htm',
  },
  fukui: {
    title: 'シカとイノシシ用 電気柵 設置・管理のポイント／点検のポイント',
    publisher: '福井県 丹南農林総合事務所',
    issued: '令和5年',
    url: 'https://www.pref.fukui.lg.jp/doc/tan-noso/r5jugaifencemanual.html',
  },
  kyoto: {
    title: '獣害対策の手引き（4-3 電気柵（柵線型））',
    publisher: '京都府',
    issued: '2011年7月11日掲載',
    url: 'https://www.pref.kyoto.jp/nosoken/documents/1308634117559.pdf',
  },
  ordinance: {
    title: '電気設備に関する技術基準を定める省令 第74条',
    publisher: 'e-Gov 法令検索（平成9年通商産業省令第52号、令和5年3月20日施行の版）',
    issued: '令和5年3月20日施行',
    url: 'https://laws.e-gov.go.jp/law/409M50000400052',
  },
  interpretation: {
    title: '電気設備の技術基準の解釈 第192条',
    publisher: '経済産業省',
    issued: '令和7年11月20日改正',
    url: 'https://www.meti.go.jp/policy/safety_security/industrial_safety/law/denjikokuji.html',
  },
  commentary: {
    title: '電気設備の技術基準の解釈の解説 第192条',
    publisher: '経済産業省',
    issued: '令和7年11月20日改正',
    url: 'https://www.meti.go.jp/policy/safety_security/industrial_safety/law/denjikokuji.html',
  },
  'maff-safety': {
    title: '鳥獣による農作物等の被害の防止に係る電気さく施設における安全確保について',
    publisher: '農林水産省',
    issued: '平成28年3月',
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/tyuuikanki/denkisaku.html',
  },
};

export interface FencePreset {
  id: string;
  species: FenceSpecies;
  source: FenceSourceId;
  /** Where in the source the values are: a page, a figure. */
  locator: string;
  rows: readonly WireRow[];
  outerWire: { heightCm: number; offsetCm: number; range: Text } | null;
  /** The span between posts the source gives, as a range. Null where it gives none. */
  postSpacingM: readonly [number, number] | null;
  /** How far the source keeps the wire from paving, concrete or gravel. */
  pavementClearanceCm: number | null;
  voltage: Text | null;
  note: Text;
}

const on = (...heights: number[]): WireRow[] => heights.map((heightCm) => ({ heightCm, energized: true }));

const TOTTORI_VOLTAGE: Text = { ja: '5 kV 以上に保つ', en: 'Keep it at 5 kV or more' };
const KYOTO_VOLTAGE: Text = {
  ja: '1,500 V 以上で衝撃を与えられるが、晴天・曇天時に 4,000 V 以上を保持',
  en: '1,500 V gives a shock, but keep 4,000 V or more in fine or cloudy weather',
};

export const FENCE_PRESETS: readonly FencePreset[] = [
  {
    id: 'maff-general-boar',
    species: 'boar',
    source: 'maff-general',
    locator: '第3章 3-1(2)❶ p.27・図3-1-3 p.28',
    rows: on(20, 40),
    outerWire: null,
    postSpacingM: null,
    pavementClearanceCm: 30,
    voltage: null,
    note: {
      ja: '電線の間隔は 20 cm 以下、2 段または 3 段で十分（本文）。地上高は図3-1-3 の下 2 段。',
      en: 'Wires no more than 20 cm apart, two or three rows (text). Heights are the lowest two in figure 3-1-3.',
    },
  },
  {
    id: 'tottori-boar',
    species: 'boar',
    source: 'tottori',
    locator: '「2 電線の間隔」イノシシ用2段の例',
    rows: on(20, 40),
    outerWire: null,
    postSpacingM: [3, 4],
    pavementClearanceCm: 50,
    voltage: TOTTORI_VOLTAGE,
    note: {
      ja: '1 段目の地上高を 20 cm、2 段目を 40 cm に保つ。',
      en: 'Keep the first wire 20 cm and the second 40 cm above the ground.',
    },
  },
  {
    id: 'kyoto-boar',
    species: 'boar',
    source: 'kyoto',
    locator: '4-3 基本的な構造 p.28',
    rows: on(20, 40),
    outerWire: null,
    postSpacingM: [3, 4],
    pavementClearanceCm: 50,
    voltage: KYOTO_VOLTAGE,
    note: {
      ja: '2 段もしくは 3 段、柵線間隔 20 cm。',
      en: 'Two or three rows, 20 cm apart.',
    },
  },
  {
    id: 'maff-general-deer',
    species: 'deer',
    source: 'maff-general',
    locator: '第3章 3-1(2)❷ p.28',
    rows: on(20, 40, 60, 80, 100),
    outerWire: null,
    postSpacingM: null,
    pavementClearanceCm: 30,
    voltage: null,
    note: {
      ja: '本文の「シカ用に 20 cm 間隔の電線×5 段」。段数はイノシシより多い 3〜5 段程度。',
      en: 'The text’s “five wires 20 cm apart for deer”. Three to five rows, more than for wild boar.',
    },
  },
  {
    id: 'kyoto-deer',
    species: 'deer',
    source: 'kyoto',
    locator: '4-3 基本的な構造 p.28（ニホンジカ対策）',
    rows: on(20, 40, 60, 85, 115),
    outerWire: null,
    postSpacingM: [3, 4],
    pavementClearanceCm: 50,
    voltage: KYOTO_VOLTAGE,
    note: {
      ja: '①の 5 段。図の間隔は下から 20・20・20〜25・25〜30・30〜40 cm（範囲は下限）。支柱は 2 m 以上。②はその上に通電しないヒモを 2 段足す構成で、資料は「1m50cm 以上の高さの線はシカが跳ばずに触れることはほとんど無い」としています。',
      en: 'Option ①, five powered rows. The figure gives gaps of 20, 20, 20–25, 25–30 and 30–40 cm from the ground (lower end used). Posts of 2 m or more. Option ② adds two unpowered cords above; the source says a deer hardly touches a line 1.5 m or higher without jumping.',
    },
  },
  {
    id: 'maff-general-deer-boar',
    species: 'deer-boar',
    source: 'maff-general',
    locator: '第3章 図3-1-3 p.28',
    rows: on(20, 40, 60, 90, 130, 170),
    outerWire: null,
    postSpacingM: null,
    pavementClearanceCm: 30,
    voltage: null,
    note: {
      ja: '図3-1-3「電線の間隔と段数」（イノシシ・シカの電気柵設置）。',
      en: 'Figure 3-1-3, wire spacing and rows for wild boar and deer.',
    },
  },
  {
    id: 'tottori-deer-boar',
    species: 'deer-boar',
    source: 'tottori',
    locator: '「2 電線の間隔」イノシシ・シカ用6段の例',
    rows: on(20, 40, 60, 90, 120, 160),
    outerWire: null,
    postSpacingM: [3, 4],
    pavementClearanceCm: 50,
    voltage: TOTTORI_VOLTAGE,
    note: {
      ja: '上段の 5・6 段目は通電させなくてもよい、とされています。',
      en: 'The source says the fifth and sixth rows need not be powered.',
    },
  },
  {
    id: 'fukui-deer-boar',
    species: 'deer-boar',
    source: 'fukui',
    locator: '設置・管理のポイント（図）',
    rows: on(20, 40, 60, 90, 120),
    outerWire: null,
    postSpacingM: null,
    pavementClearanceCm: null,
    voltage: { ja: '5,000 V 以上を確保', en: 'Make sure of 5,000 V or more' },
    note: {
      ja: '特に下 4 段の高さに注意。必要であれば 150 cm に 6 段目（ダミーでも可）。コンクリートや砂利など通電性の悪い場所は避ける。',
      en: 'Mind the lowest four rows above all. A sixth row at 150 cm if needed (it may be a dummy). Avoid concrete, gravel and other ground that conducts poorly.',
    },
  },
  {
    id: 'maff-general-monkey',
    species: 'monkey',
    source: 'maff-general',
    locator: '第3章 3-1(2)❸ p.29',
    rows: [],
    outerWire: null,
    postSpacingM: null,
    pavementClearanceCm: null,
    voltage: null,
    note: {
      ja: 'ワイヤーメッシュ柵の支柱に通電する支柱を足す多獣種柵。1 段目の電線はワイヤーメッシュから 10 cm 以内、メッシュのマス目は 10 cm 以下。出典は各段の地上高を数値で示していないため、段は使う資材に合わせて入力してください。',
      en: 'A fence for several species that adds powered posts to a wire-mesh fence. The first wire within 10 cm of the mesh, and a mesh of 10 cm or less. The source gives no heights for the rows, so enter them for the materials you use.',
    },
  },
  {
    id: 'maff-general-bear',
    species: 'bear',
    source: 'maff-general',
    locator: '第6章 コラム(3) p.81 図1・図2',
    rows: on(20, 40, 60),
    outerWire: {
      heightCm: 20,
      offsetCm: 30,
      range: {
        ja: '高さ 20〜25 cm、柵の手前 30〜50 cm（下限で入力）',
        en: '20–25 cm high, 30–50 cm in front (lower ends used)',
      },
    },
    postSpacingM: null,
    pavementClearanceCm: null,
    voltage: null,
    note: {
      ja: '地面から 20 cm・20 cm・20 cm の 3 段。地面を掘る個体には手前に複線を 1 本。クマは日中も行動するので 24 時間通電。',
      en: 'Three rows, 20 cm apart from the ground. One extra line in front for a bear that digs. Power it 24 hours a day, since bears are also active in daytime.',
    },
  },
  {
    id: 'kyoto-bear',
    species: 'bear',
    source: 'kyoto',
    locator: '4-3 基本的な構造 p.28（ツキノワグマ対策）',
    rows: on(20, 40, 65, 90),
    outerWire: {
      heightCm: 20,
      offsetCm: 20,
      range: {
        ja: '高さ 20 cm、柵の外側約 20〜30 cm（下限で入力）',
        en: '20 cm high, about 20–30 cm outside (lower end used)',
      },
    },
    postSpacingM: [3, 4],
    pavementClearanceCm: 50,
    voltage: KYOTO_VOLTAGE,
    note: {
      ja: 'トリップライン＋3〜4 段。1・2 段目の間隔 20 cm、3 段目以降 25 cm。強力な機械を選び、出力に余裕を持たせる。',
      en: 'A trip line and three or four rows: 20 cm for the first two gaps, 25 cm above. Choose a powerful energiser with output to spare.',
    },
  },
  {
    id: 'maff-mesocarnivore',
    species: 'mesocarnivore',
    source: 'maff-mesocarnivore',
    locator: '3-2 侵入防止柵 (2)(3)② pp.29–31',
    rows: on(40),
    outerWire: null,
    postSpacingM: null,
    pavementClearanceCm: null,
    voltage: null,
    note: {
      ja: '高さ約 40 cm のネットの上部に通電線を張る複合柵（ネットは数えていません）。段張り方式にする場合、線の間隔は 10 cm 以下（種によっては 5 cm）。',
      en: 'A net about 40 cm high with a powered wire along its top (the net is not counted). Strung rows alone need gaps of 10 cm or less (5 cm for some species).',
    },
  },
];

export function presetsFor(species: FenceSpecies): FencePreset[] {
  return FENCE_PRESETS.filter((preset) => preset.species === species);
}

export function findPreset(id: string): FencePreset | undefined {
  return FENCE_PRESETS.find((preset) => preset.id === id);
}

/** Whether the rows and the outer line still hold the values the preset put there. */
export function matchesPreset(
  preset: FencePreset,
  settings: Pick<ElectricFenceSettings, 'rows' | 'outerWire'>,
): boolean {
  if (preset.rows.length !== settings.rows.length) return false;
  const sameRows = preset.rows.every(
    (row, index) =>
      row.heightCm === settings.rows[index]?.heightCm && row.energized === settings.rows[index]?.energized,
  );
  if (!sameRows) return false;
  if (preset.outerWire === null) return !settings.outerWire.enabled;
  return (
    settings.outerWire.enabled &&
    settings.outerWire.heightCm === preset.outerWire.heightCm &&
    settings.outerWire.offsetCm === preset.outerWire.offsetCm
  );
}

/**
 * What choosing a preset writes into the form. A source without a post spacing leaves the spacing
 * as it was: the tool has no figure of its own to put there. A range is entered at its short end,
 * the one that buys more posts.
 */
export function applyPreset(
  preset: FencePreset,
  settings: Pick<ElectricFenceSettings, 'outerWire' | 'postSpacingM'>,
): Pick<ElectricFenceSettings, 'species' | 'presetId' | 'rows' | 'outerWire' | 'postSpacingM'> {
  return {
    species: preset.species,
    presetId: preset.id,
    rows: preset.rows.map((row) => ({ ...row })),
    outerWire: preset.outerWire
      ? { enabled: true, heightCm: preset.outerWire.heightCm, offsetCm: preset.outerWire.offsetCm }
      : { ...settings.outerWire, enabled: false },
    postSpacingM: preset.postSpacingM ? preset.postSpacingM[0] : settings.postSpacingM,
  };
}

/** The Tottori manual joins the rows with a connecting lead every 50 m. */
export const CONNECTOR_INTERVAL_M = 50;

export interface FenceInput {
  rows: readonly WireRow[];
  outerWire: OuterWire;
  perimeterM: number;
  gates: number;
  corners: number;
  roughLengthM: number;
  postSpacingM: number;
  roughPostSpacingM: number;
  sparePercent: number;
}

export interface FenceResult {
  energizedRows: number;
  cordRows: number;
  flatLengthM: number;
  /** Corners, gate sides and the ends of the uneven stretch, where a post has to stand. */
  fixedPoints: number;
  /** The outer line runs round the fence at its offset, so it is longer by 2π × offset. */
  outerLengthM: number;
  /** Before the spare is added. */
  base: FenceQuantities;
  /** With the spare, rounded up for the counts. */
  total: FenceQuantities;
}

export interface FenceQuantities {
  energizedWireM: number;
  cordM: number;
  posts: number;
  outerPosts: number;
  insulators: number;
  grips: number;
  connectors: number;
}

const positive = (value: number) => Number.isFinite(value) && value > 0;
const nonNegative = (value: number) => Number.isFinite(value) && value >= 0;
const count = (value: number) => Number.isInteger(value) && value >= 0;
// Spans that come out at a whole number must not gain a post from floating-point dust.
const ceil = (value: number) => (value <= 0 ? 0 : Math.ceil(value - 1e-9));

/**
 * Posts on a closed line whose side lengths are not known.
 *
 * Every corner and each side of every gate is a fixed post, and so is each end of the uneven stretch
 * (taken as one continuous stretch), since the spacing changes there. These fixed points cut the line
 * into segments, and a segment of length L needs ceil(L / spacing) posts (every span ends at a post, and
 * the line is closed). Without the side lengths the segments cannot be laid out, so the count is the
 * most any layout can need: for k fixed points, Σ ceil(xᵢ) ≤ ceil(Σ xᵢ) + k − 1, because each ceiling
 * adds less than one. It never falls short of a real layout; it can exceed one by up to k − 1.
 */
export function fixedPostPoints(corners: number, gates: number, roughM: number, perimeterM: number): number {
  return corners + 2 * gates + (roughM > 0 && roughM < perimeterM ? 2 : 0);
}

function loopPosts(
  flatM: number,
  flatSpacingM: number,
  roughM: number,
  roughSpacingM: number,
  fixedPoints: number,
): number {
  const spans = ceil(Math.max(flatM, 0) / flatSpacingM + roughM / roughSpacingM);
  return spans + Math.max(0, fixedPoints - 1);
}

export function calculateFence(input: FenceInput): FenceResult | null {
  const { rows, outerWire, perimeterM, gates, corners, roughLengthM, postSpacingM, roughPostSpacingM, sparePercent } =
    input;
  if (
    !positive(perimeterM) ||
    !count(gates) ||
    !count(corners) ||
    !nonNegative(roughLengthM) ||
    roughLengthM > perimeterM ||
    !positive(postSpacingM) ||
    !positive(roughPostSpacingM) ||
    !nonNegative(sparePercent) ||
    sparePercent > 100 ||
    !rows.every((row) => positive(row.heightCm))
  )
    return null;
  const outer = outerWire.enabled;
  if (outer && (!positive(outerWire.heightCm) || !nonNegative(outerWire.offsetCm))) return null;
  if (rows.length === 0 && !outer) return null;

  const energizedRows = rows.filter((row) => row.energized).length;
  const cordRows = rows.length - energizedRows;
  const flatLengthM = perimeterM - roughLengthM;
  const outerLengthM = outer ? perimeterM + (2 * Math.PI * outerWire.offsetCm) / 100 : 0;
  const outerLines = outer ? 1 : 0;

  const fixedPoints = fixedPostPoints(corners, gates, roughLengthM, perimeterM);
  const posts =
    rows.length > 0 ? loopPosts(flatLengthM, postSpacingM, roughLengthM, roughPostSpacingM, fixedPoints) : 0;
  // The outer line is crossed at the same gates and turns at the same corners.
  const outerPosts = outer
    ? loopPosts(outerLengthM - roughLengthM, postSpacingM, roughLengthM, roughPostSpacingM, fixedPoints)
    : 0;
  const base: FenceQuantities = {
    energizedWireM: perimeterM * energizedRows + outerLengthM,
    cordM: perimeterM * cordRows,
    posts,
    outerPosts,
    // One insulator per powered wire on every post, and a second at each corner.
    insulators: (posts + (rows.length > 0 ? corners : 0)) * energizedRows + (outer ? (outerPosts + corners) * 1 : 0),
    grips: gates * (energizedRows + outerLines),
    connectors: energizedRows >= 2 ? ceil(perimeterM / CONNECTOR_INTERVAL_M) : 0,
  };
  const factor = 1 + sparePercent / 100;
  const total: FenceQuantities = {
    energizedWireM: base.energizedWireM * factor,
    cordM: base.cordM * factor,
    posts: ceil(base.posts * factor),
    outerPosts: ceil(base.outerPosts * factor),
    insulators: ceil(base.insulators * factor),
    grips: ceil(base.grips * factor),
    // A lead is fitted where the fence is, not bought as a spare.
    connectors: base.connectors,
  };
  return { energizedRows, cordRows, flatLengthM, fixedPoints, outerLengthM, base, total };
}

export interface ChecklistItem {
  id: string;
  text: Text;
  /** The sources that say it, each with where. */
  sources: readonly { id: FenceSourceId; where: string }[];
}

export const INSPECTION_CHECKLIST: readonly ChecklistItem[] = [
  {
    id: 'voltage',
    text: {
      ja: '電圧計で柵線の電圧を測った（目安は出典ごとに異なります：福井県 5,000 V 以上、鳥取県 5 kV 以上、京都府 晴天・曇天時 4,000 V 以上）。',
      en: 'The wire voltage has been measured with a fence tester (the sources differ: 5,000 V or more in Fukui, 5 kV or more in Tottori, 4,000 V or more in fine or cloudy weather in Kyoto).',
    },
    sources: [
      { id: 'fukui', where: '点検のポイント' },
      { id: 'tottori', where: '3 電気の管理' },
      { id: 'kyoto', where: '管理上の注意点 p.33' },
    ],
  },
  {
    id: 'grass',
    text: {
      ja: '草や作物が柵線に触れていない（漏電すると電圧が下がる）。',
      en: 'No grass or crop touches a wire (a leak pulls the voltage down).',
    },
    sources: [
      { id: 'maff-general', where: '第3章 p.28' },
      { id: 'fukui', where: '点検ポイント2' },
      { id: 'tottori', where: '日常点検のポイント' },
      { id: 'kyoto', where: 'p.33・p.34' },
    ],
  },
  {
    id: 'earth',
    text: {
      ja: 'アース棒が湿った場所に深く、地上に出ないよう打ち込まれている（複数本は 2 m 以上離す）。',
      en: 'The earth rods are driven deep into damp ground, none left standing proud (several rods 2 m or more apart).',
    },
    sources: [
      { id: 'tottori', where: 'ポイント⑥' },
      { id: 'kyoto', where: 'アース不良 p.38' },
    ],
  },
  {
    id: 'insulator',
    text: {
      ja: 'ガイシが動物の来る側（外側）を向き、柵線が支柱より外側を通っている。',
      en: 'The insulators face the side the animals come from, so the wire runs outside the posts.',
    },
    sources: [
      { id: 'tottori', where: 'ポイント④' },
      { id: 'kyoto', where: '柵線の設置時の注意 p.33' },
      { id: 'maff-practice-2014', where: '電気柵のチェックポイント④' },
    ],
  },
  {
    id: 'pavement',
    text: {
      ja: '舗装・コンクリート・砂利など電気を通しにくい地面から離して張っている（総合対策編 30 cm 以上、鳥取県・京都府 50 cm 以上）。',
      en: 'The fence stands clear of paving, concrete, gravel and other ground that conducts poorly (30 cm or more in the national manual, 50 cm or more in Tottori and Kyoto).',
    },
    sources: [
      { id: 'maff-general', where: '第3章 p.28' },
      { id: 'tottori', where: '1 設置場所' },
      { id: 'kyoto', where: 'p.38' },
      { id: 'fukui', where: '設置・管理のポイント' },
    ],
  },
  {
    id: 'always-on',
    text: {
      ja: '昼夜を問わず 24 時間通電している。作物のない時期に通電しないなら、線は片付けた。',
      en: 'The fence is powered day and night. Where it is switched off out of season, the wires have been taken down.',
    },
    sources: [
      { id: 'maff-general', where: '第3章 p.30・第6章 p.81' },
      { id: 'tottori', where: '3 電気の管理' },
      { id: 'kyoto', where: 'p.33・p.34' },
      { id: 'fukui', where: '設置・管理のポイント' },
    ],
  },
  {
    id: 'gap',
    text: {
      ja: 'くぼ地や傾斜の変わり目で、地面と最下段の間が広がっていない（京都府は 20 cm 以下。支柱や線を足す）。',
      en: 'The gap under the lowest wire does not open up over a dip or a change of slope (Kyoto: 20 cm or less, adding posts or wire).',
    },
    sources: [
      { id: 'kyoto', where: 'pp.35–36' },
      { id: 'tottori', where: '窪地での設置方法' },
      { id: 'maff-mesocarnivore', where: '図7・図8 p.30' },
    ],
  },
  {
    id: 'damage',
    text: {
      ja: '柵線の切断・たるみ、支柱の倒れ・傾き、倒木や枯れ枝の接触がない。',
      en: 'No broken or slack wire, no fallen or leaning post, no fallen tree or branch on the fence.',
    },
    sources: [
      { id: 'fukui', where: '点検ポイント1' },
      { id: 'tottori', where: '日常点検のポイント' },
    ],
  },
  {
    id: 'post-contact',
    text: {
      ja: '柵線が支柱（特に金属を含む支柱・角）に触れていない。',
      en: 'No wire touches a post, above all a post with metal in it and at the corners.',
    },
    sources: [{ id: 'kyoto', where: 'pp.37–38' }],
  },
  {
    id: 'energiser',
    text: {
      ja: '電源装置が柵の延長に合った能力のもので、バッテリーの残量が足りている。',
      en: 'The energiser is rated for the length of the fence, and the battery has charge left.',
    },
    sources: [
      { id: 'tottori', where: 'ポイント①・維持管理のポイント' },
      { id: 'kyoto', where: 'p.31・p.33' },
      { id: 'maff-general', where: '第3章 p.30' },
    ],
  },
];

export interface LegalRequirement {
  /** The item of 解釈 第192条 it comes from. */
  item: string;
  ja: string;
  en: string;
}

/** 解釈 第192条, item by item, as read on SOURCES_CHECKED_ON. */
export const LEGAL_REQUIREMENTS: readonly LegalRequirement[] = [
  {
    item: '第一号',
    ja: '田畑、牧場、その他これに類する場所において野獣の侵入又は家畜の脱出を防止するために施設するものであること。',
    en: 'It is put up on fields, pasture or similar places, to keep wild animals out or livestock in.',
  },
  {
    item: '第二号',
    ja: '電気さくを施設した場所には、人が見やすいように適当な間隔で危険である旨の表示をすること。',
    en: 'Danger signs, where people can see them, at suitable intervals along the fence.',
  },
  {
    item: '第三号',
    ja: '電気用品安全法の適用を受ける電気さく用電源装置、又は感電により人に危険を及ぼすおそれのないように出力電流が制限される電気さく用電源装置であって、電気用品安全法の適用を受ける直流電源装置若しくは蓄電池、太陽電池その他これらに類する直流の電源から電気の供給を受けるものから電気の供給を受けること。',
    en: 'It is fed by an energiser covered by the Electrical Appliances and Materials Safety Act, or by one with a limited output current that is itself fed by a DC supply covered by that act, or by a battery, a solar cell or a similar DC source.',
  },
  {
    item: '第四号',
    ja: '電気さく用電源装置（直流電源装置を介する場合は直流電源装置）が使用電圧 30 V 以上の電源から電気の供給を受ける場合において、人が容易に立ち入る場所に施設するときは、電流動作型で、定格感度電流 15 mA 以下、動作時間 0.1 秒以下の漏電遮断器を施設すること。',
    en: 'Where the energiser (or its DC supply) is fed from a supply of 30 V or more and the fence is where people can easily go, a current-operated earth-leakage breaker of 15 mA or less, tripping in 0.1 s or less.',
  },
  {
    item: '第五号',
    ja: '電気さくに電気を供給する電路には、容易に開閉できる箇所に専用の開閉器を施設すること。',
    en: 'A switch for the fence alone, where it can easily be operated, on the circuit that feeds it.',
  },
  {
    item: '第六号',
    ja: '衝撃電流を繰り返して発生する電気さく用電源装置は、電波又は高周波電流が無線設備の機能に継続的かつ重大な障害を与えるおそれがある場所には施設しないこと。',
    en: 'A pulsing energiser is not put where its radio emissions or high-frequency current could seriously and continually disturb radio equipment.',
  },
];

/** 省令 第74条, as read at e-Gov on SOURCES_CHECKED_ON. */
export const ORDINANCE_ARTICLE_74 =
  '電気さく（屋外において裸電線を固定して施設したさくであって、その裸電線に充電して使用するものをいう。）は、施設してはならない。ただし、田畑、牧場、その他これに類する場所において野獣の侵入又は家畜の脱出を防止するために施設する場合であって、絶縁性がないことを考慮し、感電又は火災のおそれがないように施設するときは、この限りでない。';
