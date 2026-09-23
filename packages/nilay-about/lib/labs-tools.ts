type Text = { ja: string; en: string };

export type LabsCategoryId = 'study' | 'sighting' | 'loads' | 'shotgun' | 'field' | 'traps' | 'damage' | 'harvest';

export const labsCategories: { id: LabsCategoryId; title: Text }[] = [
  { id: 'study', title: { ja: '試験・法令の学習', en: 'Study' } },
  { id: 'sighting', title: { ja: '照準と弾道', en: 'Sighting and ballistics' } },
  { id: 'loads', title: { ja: '装弾と着弾の記録', en: 'Loads and groups' } },
  { id: 'shotgun', title: { ja: '散弾・クレー射撃', en: 'Shotgun and clays' } },
  { id: 'field', title: { ja: '出猟', en: 'In the field' } },
  { id: 'traps', title: { ja: 'わな猟', en: 'Trapping' } },
  { id: 'damage', title: { ja: '鳥獣被害対策', en: 'Wildlife damage' } },
  { id: 'harvest', title: { ja: '捕獲後の処理', en: 'After the harvest' } },
];

export interface LabsTool {
  slug: string;
  category: LabsCategoryId;
  /** The name on the list, in the tool's app bar and in the page title. */
  title: Text;
  /** One line on the Labs list. */
  summary: Text;
  /** The meta description. Search results show the Japanese page, so it is Japanese only. */
  description: string;
  /** Tools built on Japanese statutes and forms, shown in Japanese whatever the language. */
  japaneseOnly?: boolean;
}

export const labsTools = [
  {
    slug: 'game-species-test',
    category: 'study',
    title: { ja: '狩猟鳥獣の判別練習', en: 'Game Species Identification' },
    summary: {
      ja: '狩猟鳥獣 44 種の写真を見て名前を答えます。自己採点のスライドショーと、時間制限つきの 4 択テスト。',
      en: 'Name the 44 game species from photos, as a self-marked slideshow or a timed multiple-choice test.',
    },
    description:
      '狩猟免許試験の鳥獣判別の練習に。狩猟鳥獣 44 種の写真を、自己採点のスライドショーと時間制限つきの 4 択テストで確認できます。間違えた鳥獣だけを復習できます。',
  },
  {
    slug: 'law-quiz',
    category: 'study',
    title: { ja: '狩猟・銃砲の法令テスト', en: 'Hunting and Firearms Law Quiz' },
    summary: {
      ja: '鳥獣保護管理法・銃刀法・火薬類取締法などの 4 択問題。解答ごとに根拠の条文を表示します。',
      en: 'Multiple-choice questions on Japanese hunting, firearms and explosives law, each with the article it is based on.',
    },
    description:
      '鳥獣保護管理法・銃刀法・火薬類取締法・武器等製造法の条文から作った 4 択問題 97 問。狩猟免許試験や猟銃等講習会の考査の対策に。解答ごとに根拠の条番号と要旨を表示します。',
    japaneseOnly: true,
  },
  {
    slug: 'home-target',
    category: 'sighting',
    title: { ja: '練習用標的の作成', en: 'Practice Target Maker' },
    summary: {
      ja: '練習距離に合わせた黒点の直径と設置高さを計算し、実寸の PDF を作ります。',
      en: 'Scale the aiming mark and its height to your practice distance, and print it at real size.',
    },
    description:
      '室内練習などの短い距離に合わせて、標的の黒点の直径と中心の高さを計算し、A4・Letter で実寸印刷できる PDF を作成します。エアライフル・エアピストル・50m ライフルなど ISSF の種目に対応。',
  },
  {
    slug: 'sight-adjustment',
    category: 'sighting',
    title: { ja: '照準調整のクリック数計算', en: 'Scope Click Calculator' },
    summary: {
      ja: '着弾のズレから、スコープのダイヤルを回す向きとクリック数を計算します。',
      en: 'Which way to turn the turrets, and how many clicks, from where the shots landed.',
    },
    description:
      'ゼロイン（照準合わせ）で、射距離と着弾のズレからスコープや照準器のダイヤルを回す向きとクリック数を計算します。1/4 MOA・0.1 mil など各調整単位に対応し、傾斜射撃の水平距離も求められます。',
  },
] as const satisfies readonly LabsTool[];

export type LabsToolSlug = (typeof labsTools)[number]['slug'];

export function labsTool(slug: LabsToolSlug): LabsTool {
  const tool = labsTools.find((candidate) => candidate.slug === slug);
  if (!tool) throw new Error(`Unknown Labs tool: ${slug}`);
  return tool;
}
