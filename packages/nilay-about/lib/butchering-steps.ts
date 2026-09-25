/**
 * The hygiene points of bleeding, gutting, carrying and dressing a deer or wild boar, in the order the
 * work is done, each with the words of the MHLW guideline it comes from.
 */

export const BUTCHERING_STEPS_CHECKED_ON = '2026-09-24';

export const BUTCHERING_GUIDELINE = {
  title: '野生鳥獣肉の衛生管理に関する指針（ガイドライン）',
  note: '厚生労働省、最終改正 令和 5 年 6 月 26 日（生食発 0626 第 2 号）',
  url: 'https://www.mhlw.go.jp/content/001455712.pdf',
} as const;

type Text = { ja: string; en: string };

export interface ButcheringStep {
  id: string;
  /** What to do, in short. */
  action: Text;
  /** The guideline's words, in Japanese as published. */
  quote: string;
  /** The section it comes from. */
  where: string;
}

export interface ButcheringStage {
  id: 'bleeding' | 'gutting' | 'carrying' | 'facility';
  title: Text;
  steps: readonly ButcheringStep[];
}

export const BUTCHERING_STAGES: readonly ButcheringStage[] = [
  {
    id: 'bleeding',
    title: { ja: '屋外での放血', en: 'Bleeding in the field' },
    steps: [
      {
        id: 'knife',
        action: {
          ja: 'ナイフは使う直前に消毒し、1 頭ごとに洗浄・消毒するか交換する',
          en: 'Disinfect the knife just before use, and clean it or change it for each animal',
        },
        quote:
          '放血に使用するナイフ等は使用する直前に火炎やアルコール等により消毒すること。複数の個体を取り扱う場合は、個体間の二次汚染を防ぐため、１頭ごとに洗浄・消毒して使用するか、または、複数のナイフ等を個体ごとに交換して使用すること。',
        where: '第 2 の 3（1）',
      },
      {
        id: 'gloves',
        action: {
          ja: 'ゴムか合成樹脂の手袋を使い、1 頭ごとに交換する（軍手は使わない）',
          en: 'Wear rubber or plastic gloves, changed for each animal (no cloth gloves)',
        },
        quote:
          '放血を行う際は、ゴム又は合成樹脂製の手袋を使用し、軍手等の繊維製のものは使用しないこと。複数個体の処理を行う場合は１頭ごとに交換すること。',
        where: '第 2 の 3（2）',
      },
      {
        id: 'opening',
        action: { ja: '切開は最小限にし、開口部を土などに触れさせない', en: 'Keep the cut small and off the ground' },
        quote: '切開は、開口部が汚染されないよう開口部が最小限となるよう行うこと。',
        where: '第 2 の 3（3）（4）',
      },
      {
        id: 'chest',
        action: {
          ja: '胸を撃った個体は前胸部を切開して胸の血を出す',
          en: 'For a chest shot, open the front of the chest to drain the blood',
        },
        quote:
          '胸部を撃った個体にあっては、前胸部（首の付け根、第一助骨付近）を切開し、胸腔内に溜まった血液を十分に排出すること。',
        where: '第 2 の 3（5）',
      },
      {
        id: 'head-low',
        action: { ja: '頭を低くして放血する', en: 'Keep the head low' },
        quote: '放血に当たっては、放血効率を高めるため、頭部を低くすること。',
        where: '第 2 の 3（6）',
      },
      {
        id: 'blood',
        action: {
          ja: '放血後、血液の性状と体温を確かめる',
          en: 'Check the blood and the body temperature after bleeding',
        },
        quote:
          '放血後、血液の性状を観察するとともに、足の付け根等に触れることにより、速やかに体温を調べ、異常を認めた個体は、食用に供さないこと。',
        where: '第 2 の 3（7）',
      },
      {
        id: 'water',
        action: { ja: '川や溜め水に浸けない', en: 'Do not put it in a stream or standing water' },
        quote: '開口部から個体の内部が汚染されないよう、捕獲した野生鳥獣は河川や貯め水等に浸漬しないこと。',
        where: '第 2 の 3（8）',
      },
    ],
  },
  {
    id: 'gutting',
    title: { ja: '屋外での内臓摘出（やむを得ない場合）', en: 'Gutting in the field (only when unavoidable)' },
    steps: [
      {
        id: 'only-if',
        action: {
          ja: '運搬に時間がかかるなど、やむを得ない場合に限る。雨天や体表が汚れているときは施設で行う',
          en: 'Only when it cannot wait, such as a long carry; not in rain or with a dirty coat',
        },
        quote:
          '屋外における内臓摘出は、捕獲場所から食肉処理施設への運搬に長時間を要し、腸管内微生物の著しい増殖が懸念される場合や急峻な地形での運搬で個体が損傷し、体腔内部の汚染が起こることが危惧される場合等、捕獲後の迅速かつ適正な衛生管理の観点からやむを得ない場合に限ること。',
        where: '第 2 の 4（1）（2）',
      },
      {
        id: 'hang',
        action: {
          ja: '吊るすか合成樹脂のシートの上で行い、摘出後は腹を紐で縛る',
          en: 'Hang it or lay it on a plastic sheet, and tie the belly shut afterwards',
        },
        quote:
          '内臓摘出は、個体を吊り下げる又は合成樹脂製のシートの上で実施するとともに、内臓摘出後の個体について腹を紐等で縛ることにより、体腔内壁が土壌等に接触することによる汚染のないように行うこと。',
        where: '第 2 の 4（5）',
      },
      {
        id: 'tie',
        action: {
          ja: '肛門を袋で覆って結さつし、食道も結さつする（二重に）',
          en: 'Bag and tie off the anus, and tie off the oesophagus, twice each',
        },
        quote:
          '消化管内容物による汚染を防ぐため、肛門を合成樹脂製の袋で覆い結さつし、同様に食道についても結さつすること。結さつに当たっては、紐やゴム、結束バンド等を使い、二重に結さつすること。',
        where: '第 2 の 4（6）ニ',
      },
      {
        id: 'leak',
        action: {
          ja: '消化管が破れて内容物が漏れたら、その個体は食用にしない',
          en: 'If the gut is cut and leaks, the animal is not eaten',
        },
        quote: 'なお、消化管を破損し、内容物が漏れ出た場合、その個体は食用としないこと。',
        where: '第 2 の 4（6）',
      },
      {
        id: 'organs',
        action: {
          ja: '摘出するのは原則として胃と腸。ほかの内臓は施設に運ぶ。屋外で摘出した内臓は食べない',
          en: 'Take out the stomach and intestines only; bring the other organs to the facility; organs taken out in the field are not eaten',
        },
        quote:
          'なお、個体から摘出する内臓は原則として胃及び腸とすること。…胃及び腸を除く内臓については、食肉処理施設に搬入し、食肉処理業者は異常の有無を確認すること。（9）屋外で摘出された内臓は、食用に供さないこと。',
        where: '第 2 の 4（7）（9）',
      },
      {
        id: 'leave',
        action: {
          ja: '摘出した胃・腸を捕獲場所に放置しない',
          en: 'Do not leave the stomach and intestines where the animal was taken',
        },
        quote:
          '摘出された胃、腸及び食用に適さないと判断した個体については、関係法令に基づき処理することとし、捕獲した場所に放置してはならないこと。',
        where: '第 2 の 4（10）',
      },
    ],
  },
  {
    id: 'carrying',
    title: { ja: '運搬', en: 'Carrying' },
    steps: [
      {
        id: 'cool',
        action: {
          ja: '速やかに搬入し、放血した個体は 10℃ 以下に冷やすのが望ましい',
          en: 'Deliver it quickly; a bled animal is best chilled to 10 °C or below',
        },
        quote:
          '捕獲個体は、速やかに食肉処理施設に搬入することとし、必要に応じ冷却しながら運搬するよう努めること。なお、放血した野生鳥獣は速やかに摂氏 10 度以下となるよう冷蔵することが望ましい。',
        where: '第 3（1）',
      },
      {
        id: 'cover',
        action: {
          ja: '1 頭ずつシートで覆い、個体どうしが触れないようにする',
          en: 'Cover each animal with a sheet so they do not touch',
        },
        quote:
          '捕獲個体を１頭ずつ合成樹脂製のシートで覆う等により、運搬時に個体が相互に接触しないよう、また、血液等による周囲への汚染がないよう配慮すること。',
        where: '第 3（3）',
      },
      {
        id: 'notice',
        action: { ja: '搬入予定時刻を施設に伝える', en: 'Tell the facility when you will arrive' },
        quote:
          '食肉処理施設への搬入後の処理をスムーズに行うため、搬入前に食肉処理業者に搬入予定時刻等の情報を伝達すること。',
        where: '第 3（2）',
      },
    ],
  },
  {
    id: 'facility',
    title: { ja: '施設での剥皮・内臓摘出・枝肉', en: 'Skinning, gutting and the carcass at the facility' },
    steps: [
      {
        id: 'hot-water',
        action: {
          ja: '個体に触れる器具は 1 頭ごとに 83℃ 以上の熱湯などで洗浄・消毒する',
          en: 'Clean and disinfect tools that touch the animal with water at 83 °C or hotter, for each animal',
        },
        quote:
          '個体に直接接触するナイフ、動力付はく皮ナイフ、結さつ器その他の機械器具については、１頭を処理するごとに摂氏 83 度以上の熱湯を用いること等により洗浄・消毒すること。',
        where: '第 4 の 5（1）ニ、（2）ト、（3）ト',
      },
      {
        id: 'skin',
        action: {
          ja: '最小限に切開してナイフを消毒し、刃を手前に向けて皮を内側から外側に切る',
          en: 'Make the smallest cut, disinfect the knife, and cut the hide from the inside out, blade towards you',
        },
        quote:
          '獣毛等による汚染を防ぐため、必要な最小限度の切開をした後、ナイフを消毒し、ナイフの刃を手前に向け、皮を内側から外側に切開すること。',
        where: '第 4 の 5（2）イ',
      },
      {
        id: 'trim',
        action: {
          ja: '外皮や消化管の内容物で汚れた部分は完全に切り取る',
          en: 'Cut away completely any part soiled by the hide or gut contents',
        },
        quote: 'はく皮された部分が外皮により汚染された場合、汚染部位を完全に切り取ること。',
        where: '第 4 の 5（2）ハ・ホ、（3）ホ',
      },
      {
        id: 'bullet',
        action: {
          ja: '着弾部位（弾の通った部分を含む）の肉は切り取り、食用にしない',
          en: 'Cut away the meat where the bullet struck and passed, and do not eat it',
        },
        quote:
          '着弾部位（弾丸が通過した部分を含む）の肉についても、汚染されている可能性があることから完全に切り取り、食用に供してはならない。',
        where: '第 4 の 5（5）イ',
      },
      {
        id: 'chill',
        action: {
          ja: '枝肉・カット肉は速やかに 10℃ 以下に冷やす',
          en: 'Chill the carcass and cuts to 10 °C or below quickly',
        },
        quote: '枝肉、カット肉及び食用に供する内臓は、速やかに摂氏 10 度以下となるよう冷却すること。',
        where: '第 4 の 5（8）',
      },
      {
        id: 'number',
        action: {
          ja: '個体や部位ごとに管理番号を付け、記録と結び付ける',
          en: 'Number each animal or cut and link it to the records',
        },
        quote:
          '個体又は部位ごとに管理番号をつけること等により捕獲、運搬及び処理の記録と紐付けることができるようにすること。',
        where: '第 4 の 5（9）',
      },
    ],
  },
];
