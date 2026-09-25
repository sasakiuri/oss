/**
 * The village inspection for what draws wild animals in: the items of the national forms, each with
 * the words of its source, and the comparison of one inspection with the one before it.
 */

type Text = { ja: string; en: string };

export const VILLAGE_SOURCES_CHECKED_ON = '2026-09-24';

export const VILLAGE_SOURCES = {
  soumu: {
    title: '集落点検チェックシート（◆５ 地区の環境について、令和8年7月3日の改正を反映）',
    publisher: '総務省（改正の通知は総務省・環境省）',
    url: 'https://www.soumu.go.jp/main_content/000952916.pdf',
  },
  maff: {
    title: '鳥獣被害防止対策のチェックシート 別表1「生息環境管理の取組に当たっての留意事項」',
    publisher: '農林水産省',
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/yosan/attach/pdf/250416-1.pdf',
  },
  moe: {
    title: 'クマ類の出没対応マニュアル －改定版－（印刷 p.14〜17）',
    publisher: '環境省（令和3年3月）',
    url: 'https://www.env.go.jp/nature/choju/docs/docs5-4a/pdfs/manual_full.pdf',
  },
} as const;
export type VillageSourceId = keyof typeof VILLAGE_SOURCES;

export interface VillageItem {
  id: string;
  /** What to look for. Finding it is what the inspection records. */
  text: Text;
  quote: string;
  source: VillageSourceId;
}

export interface VillageSection {
  id: string;
  title: Text;
  items: readonly VillageItem[];
}

export const VILLAGE_SECTIONS: readonly VillageSection[] = [
  {
    id: 'village',
    title: {
      ja: '集落の点検（総務省の集落点検チェックシート）',
      en: 'Village inspection (Ministry of Internal Affairs form)',
    },
    items: [
      {
        id: 's5-16',
        text: { ja: '獣害のある場所', en: 'Places with wildlife damage' },
        quote: '5－16 獣害のある場所はありますか',
        source: 'soumu',
      },
      {
        id: 's5-17',
        text: {
          ja: 'クマを誘引するおそれのある落ちた果実・実が残っている木（柿・栗・クルミ・クワ等）・放置農作物・生ごみ等',
          en: 'Fallen fruit, trees still in fruit (persimmon, chestnut, walnut, mulberry), abandoned crops or food waste that could draw bears',
        },
        quote:
          '5－17 クマを誘引するおそれのある、落ちた果実、実が残っている木（柿・栗・クルミ・クワ等）、放置農作物、生ごみ等に関する情報はありますか',
        source: 'soumu',
      },
      {
        id: 's5-18',
        text: {
          ja: 'クマの出没情報や痕跡（足跡・糞・爪痕等）らしきもの',
          en: 'Bear sightings or what look like signs (tracks, droppings, claw marks)',
        },
        quote: '5－18 クマの出没情報や痕跡（足跡・糞・爪痕等）らしきものはありますか',
        source: 'soumu',
      },
    ],
  },
  {
    id: 'habitat',
    title: { ja: '潜み場と餌場（農林水産省 別表1）', en: 'Cover and food (Ministry of Agriculture, table 1)' },
    items: [
      {
        id: 'river-bush',
        text: {
          ja: '集落内を流れる河川の河川敷の藪など、潜み場',
          en: 'Cover such as thickets on riverbanks in the village',
        },
        quote: '集落内を流れる河川周辺では、河川敷の藪など潜み場がないか確認すること。',
        source: 'maff',
      },
      {
        id: 'abandoned-field',
        text: { ja: '所有者不明の耕作放棄地', en: 'Abandoned fields whose owner is unknown' },
        quote: '所有者不明の耕作放棄地がないか確認すること。',
        source: 'maff',
      },
      {
        id: 'vacant-persimmon',
        text: {
          ja: '柿の木等が放置されている空き家や空き地',
          en: 'Empty houses or lots with persimmon or other trees left unpicked',
        },
        quote: '柿の木等が放置されている空き家や空き地がないか確認すること。',
        source: 'maff',
      },
      {
        id: 'farm-residue',
        text: {
          ja: '農地や山際に放置された生ゴミ・農作物残さ・放任果樹',
          en: 'Food waste, crop residue or untended fruit trees left on farmland or at the forest edge',
        },
        quote: '生ゴミや農作物残さ、放任果樹等を農地や山際に放置しないよう周知すること。',
        source: 'maff',
      },
      {
        id: 'bamboo',
        text: {
          ja: '管理されていない竹林・収穫されないタケノコ',
          en: 'Untended bamboo, bamboo shoots left unharvested',
        },
        quote: '竹林を適切に管理し、タケノコを未収穫としないよう周知すること。',
        source: 'maff',
      },
      {
        id: 'overgrowth',
        text: {
          ja: '刈り払われていない雑木林・耕作放棄地（緩衝帯がない）',
          en: 'Scrub or abandoned fields not cleared (no buffer strip)',
        },
        quote: '緩衝帯の設置や雑木林、耕作放棄地の刈り払いを行うよう周知すること。',
        source: 'maff',
      },
      {
        id: 'regrowth',
        text: { ja: '稲刈り後のひこばえ', en: 'Rice regrowth after harvest' },
        quote: '水稲の収穫後は、秋耕や石灰窒素の施用、冬期湛水田によるヒコバエ対策の実施を検討するよう周知すること。',
        source: 'maff',
      },
      {
        id: 'stall',
        text: { ja: '対策のない無人直売所', en: 'Unstaffed farm stalls with nothing to keep animals off' },
        quote:
          '無人直売所などでは、ネットをかけたりロッカーを使用したりするなど、被害を及ぼす野生鳥獣を引き寄せないような対策を講ずるよう周知すること。',
        source: 'maff',
      },
    ],
  },
  {
    id: 'homes',
    title: {
      ja: '住まいのまわり（農林水産省 別表1・環境省マニュアル）',
      en: 'Around homes (Ministry of Agriculture table 1, Ministry of the Environment manual)',
    },
    items: [
      {
        id: 'garbage',
        text: {
          ja: 'ゴミ置き場のマナーが守られていない（日時・袋の口・ネット）',
          en: 'Rubbish points not kept properly (days, tied bags, nets)',
        },
        quote:
          'ゴミ置き場では、ゴミ出しマナーを徹底するよう周知すること（ゴミ出し日時・場所、ゴミ袋の口を結ぶ、ネット等をかける等）。',
        source: 'maff',
      },
      {
        id: 'pet-food',
        text: { ja: 'ペットの小屋まわりに放置されたエサ', en: 'Pet food left around kennels and hutches' },
        quote: 'ペットの小屋まわり等では、エサを放置しないよう周知すること（後片付け）。',
        source: 'maff',
      },
      {
        id: 'garden',
        text: { ja: '家庭菜園の収穫残さ・防護のない菜園', en: 'Kitchen gardens with residue left or no protection' },
        quote: '家庭菜園では、ネットをかけるなどの防護対策や、収穫残さを放置しないよう周知すること。',
        source: 'maff',
      },
      {
        id: 'garden-fruit',
        text: { ja: '庭の柿の木等の実の放置', en: 'Fruit left on persimmon or other trees in gardens' },
        quote:
          '庭の柿の木等について、実を放置しないよう周知すること（収穫が困難な場合は伐採を含め検討するよう周知すること）。',
        source: 'maff',
      },
      {
        id: 'grave',
        text: { ja: 'お墓に残されたお供え物', en: 'Offerings left at graves' },
        quote: 'お墓のお供え物は持ち帰るよう周知すること。',
        source: 'maff',
      },
      {
        id: 'bees',
        text: { ja: 'ハチの巣・自家養蜂の巣箱', en: 'Wasp nests, or hives kept at home' },
        quote: 'ハチの巣、自家養蜂／可能であれば除去します。…電気柵が有効です。',
        source: 'moe',
      },
      {
        id: 'compost',
        text: { ja: '生ゴミ・肉・魚・果物を入れたコンポスト', en: 'Compost with food waste, meat, fish or fruit' },
        quote: '肉や魚、果物など、強いにおいを放つものは投入を控える',
        source: 'moe',
      },
      {
        id: 'stored-outside',
        text: {
          ja: '屋外に置かれた発酵食品・ペットフード・塗料・家畜飼料・有機肥料・油かす・燃料',
          en: 'Fermented food, pet food, paint, livestock feed, organic fertiliser, oil cake or fuel kept outdoors',
        },
        quote: '屋内で保管するようにします。',
        source: 'moe',
      },
    ],
  },
];

export const VILLAGE_ITEMS: readonly VillageItem[] = VILLAGE_SECTIONS.flatMap((section) => section.items);
export const VILLAGE_ITEM_IDS = VILLAGE_ITEMS.map((item) => item.id);

/** found: it is there. clear: looked, and it is not. unchecked: not looked at, or not relevant. */
export const ITEM_STATUSES = ['unchecked', 'clear', 'found'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export interface ItemResult {
  status: ItemStatus;
  note: string;
}

export interface Inspection {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  area: string;
  results: Record<string, ItemResult>;
}

export interface InspectionSummary {
  found: number;
  clear: number;
  unchecked: number;
}

export function summarizeInspection(results: Record<string, ItemResult>): InspectionSummary {
  const summary: InspectionSummary = { found: 0, clear: 0, unchecked: 0 };
  for (const id of VILLAGE_ITEM_IDS) summary[results[id]?.status ?? 'unchecked'] += 1;
  return summary;
}

export type ItemChange = 'new' | 'resolved' | 'remaining';

/**
 * What changed on each item since an earlier inspection: found now and not before (new), found
 * before and clear now (resolved), found both times (remaining). An item not looked at either time
 * is left out, as nothing can be said of it.
 */
export function compareInspections(
  current: Record<string, ItemResult>,
  previous: Record<string, ItemResult>,
): { id: string; change: ItemChange }[] {
  const changes: { id: string; change: ItemChange }[] = [];
  for (const id of VILLAGE_ITEM_IDS) {
    const now = current[id]?.status ?? 'unchecked';
    const before = previous[id]?.status ?? 'unchecked';
    if (now === 'found' && before !== 'found') changes.push({ id, change: 'new' });
    else if (now === 'clear' && before === 'found') changes.push({ id, change: 'resolved' });
    else if (now === 'found' && before === 'found') changes.push({ id, change: 'remaining' });
  }
  return changes;
}

/** The inspection before a given one: the latest with an earlier date, or earlier in the list on the same date. */
export function previousInspection(inspections: readonly Inspection[], id: string): Inspection | null {
  const index = inspections.findIndex((inspection) => inspection.id === id);
  const current = inspections[index];
  if (!current) return null;
  let best: { inspection: Inspection; index: number } | null = null;
  inspections.forEach((inspection, position) => {
    if (inspection.id === id) return;
    const earlier = inspection.date < current.date || (inspection.date === current.date && position < index);
    if (!earlier) return;
    if (
      !best ||
      inspection.date > best.inspection.date ||
      (inspection.date === best.inspection.date && position > best.index)
    )
      best = { inspection, index: position };
  });
  return (best as { inspection: Inspection } | null)?.inspection ?? null;
}
