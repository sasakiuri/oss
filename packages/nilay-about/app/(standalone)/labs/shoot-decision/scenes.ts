/**
 * Shoot-or-hold scenes. Each is written for this tool from the rule it rests on: an article of the
 * Wildlife Protection and Hunting Management Act or its regulation, a model statement of the police
 * circular on the firearms course test, or the Ministry of the Environment's safety guidance. The
 * sources are the same documents the licence exam practice cites (`../license-exam/sources.ts`).
 */

import type { Scene, ShootReason } from '@/lib/shoot-decision';

export const reasonLabels: Record<ShootReason, { ja: string; en: string }> = {
  shoot: { ja: '撃ってよい', en: 'Shoot' },
  backstop: { ja: '矢先の安全（バックストップ）を確認できない', en: 'No backstop you can see' },
  target: { ja: '獲物を確実に確認できていない', en: 'Target not identified' },
  people: { ja: '弾の届く先に人・建物・道路・乗物がある', en: 'People, buildings or roads in range' },
  ricochet: { ja: '跳弾のおそれがある', en: 'Risk of ricochet' },
  time: { ja: '日の出前・日没後', en: 'Before sunrise or after sunset' },
  place: { ja: '銃猟できない場所', en: 'Shooting not allowed here' },
  season: { ja: '狩猟期間外', en: 'Out of season' },
  species: { ja: '捕獲できない鳥獣', en: 'Not an animal you may take' },
};

export const scenes: readonly Scene[] = [
  {
    id: 'deer-bank',
    animal: 'deer',
    situation:
      '12 月の昼、狩猟者登録をした区域の山林。オスジカが 50 m 先で横を向いて立ち止まった。背後は土の斜面で、射手の位置から着弾点まで見通せ、周囲に人はいない。',
    layout: { backdrop: 'bank', light: 'day' },
    answer: 'shoot',
    explanation:
      '狩猟期間中の昼、狩猟できる区域で、着弾が想定される土の斜面（バックストップ）まで目で確認でき、その間に危険がないため、撃てる状況です。認定事業者講習テキストは、着弾点が射手から目視で確認でき、その間に危険がないことが確認できてはじめてバックストップが確保されているとしています。',
    sources: [
      { doc: 'moeCapture', locator: 'p.111-112 バックストップの判断' },
      { doc: 'act', locator: '第 11 条第 1 項' },
    ],
  },
  {
    id: 'deer-skyline',
    animal: 'deer',
    situation: '12 月の昼、山林。シカが尾根の上に立ち、その背後は空で、尾根の向こう側は見えない。',
    layout: { backdrop: 'skyline', light: 'day' },
    answer: 'backstop',
    explanation:
      '尾根の上の獲物を撃ち上げると、弾は尾根を越えて見えない場所に飛びます。認定事業者講習テキストは、射手とバックストップの間に視界をさえぎるものがあったり、バックストップまでの状況がわからない場合は射撃を控えなければならないとし、考査の基準問題も斜面に沿って撃ち上げると見えないところにいる人を直撃するおそれがあるとしています。',
    sources: [
      { doc: 'moeCapture', locator: 'p.112 バックストップの判断' },
      { doc: 'npaCourse', locator: '別添3 第2-3-(1)-⑨-2' },
    ],
  },
  {
    id: 'boar-house',
    animal: 'boar',
    situation: '1 月の昼、里山の畑の縁。イノシシの向こう 150 m ほどに民家が見える。',
    layout: { backdrop: 'field', light: 'day', house: true },
    answer: 'people',
    explanation:
      '法第 38 条第 3 項は、弾丸の到達するおそれのある人、飼養動物、建物、電車・自動車・船舶などの乗物に向かって銃猟をしてはならないと定めています。散弾でも最大到達距離は約 515 m とされています。',
    sources: [
      { doc: 'act', locator: '第 38 条第 3 項' },
      { doc: 'npaCourse', locator: '別添3 第2-2-(3)-②-9' },
    ],
  },
  {
    id: 'deer-dusk',
    animal: 'deer',
    situation: '12 月、日没から 20 分たった薄暗い林縁。シカの輪郭はまだ見え、背後は土の斜面。',
    layout: { backdrop: 'bank', light: 'dusk' },
    answer: 'time',
    explanation:
      '法第 38 条第 1 項は、日出前及び日没後の銃猟を禁止しています。まだ見えていても、日没を過ぎたら撃てません。',
    sources: [{ doc: 'act', locator: '第 38 条第 1 項' }],
  },
  {
    id: 'boar-movement',
    animal: 'boar',
    situation: '12 月の昼、やぶの中で黒い影が動き、イノシシのようにも見えるが、全体は見えない。',
    layout: { backdrop: 'field', light: 'day', movement: true },
    answer: 'target',
    explanation:
      '考査の基準問題は、狩猟等で獲物の確認に少しでも不安があるときは銃を発射してはならず、用心金に指を入れるのは獲物が確実に確認できた場合に限るとしています。やぶの中の影は人や猟犬のこともあります。',
    sources: [
      { doc: 'npaCourse', locator: '別添3 第2-3-(1)-⑦-2' },
      { doc: 'npaCourse', locator: '別添3 第2-3-(1)-②-4' },
    ],
  },
  {
    id: 'deer-water',
    animal: 'deer',
    situation: '12 月の昼、川原。シカが浅瀬を渡っていて、弾は水面に向かう角度になる。',
    layout: { backdrop: 'water', light: 'day' },
    answer: 'ricochet',
    explanation:
      '考査の基準問題は、水面に向けて射撃をした場合も跳弾となる場合があり、跳弾は飛んでいく方向が予測できないとしています。緊急銃猟ガイドラインも、竹、金属面、岩石、コンクリート等の硬質の材や水面は跳弾のおそれが大きいため避けるべきとしています。',
    sources: [
      { doc: 'npaCourse', locator: '別添3 第2-3-(1)-⑩-3・4' },
      { doc: 'moeEmergency', locator: 'p.65 観点2 バックストップ（安土）と跳弾' },
    ],
  },
  {
    id: 'boar-rock',
    animal: 'boar',
    situation: '1 月の昼、沢沿い。イノシシの背後は岩場と竹やぶで、土の斜面はない。',
    layout: { backdrop: 'rock', light: 'day' },
    answer: 'ricochet',
    explanation:
      '考査の基準問題は、猟場で竹やぶや石垣等に向けて発射すると跳弾が発生して危険であるとしています。緊急銃猟ガイドラインも、芝生や畑等の土のような柔らかいものをバックストップにし、竹・岩石などの硬質の材は避けるべきとしています。',
    sources: [
      { doc: 'npaCourse', locator: '別添3 第2-3-(1)-⑩-2' },
      { doc: 'moeEmergency', locator: 'p.65 観点2 バックストップ（安土）と跳弾' },
    ],
  },
  {
    id: 'bear-town',
    animal: 'bear',
    situation:
      '10 月の昼、住宅が集まる地区の公園にツキノワグマが出没した。あなたは狩猟免許と猟銃の所持許可を持っている。',
    layout: { backdrop: 'field', light: 'day', house: true, sign: '公園' },
    answer: 'place',
    explanation:
      '法第 38 条第 2 項は、住居が集合している地域や広場・駅など多数の者の集合する場所（住居集合地域等）での銃猟を禁止しています。人の日常生活圏に侵入した危険鳥獣への緊急銃猟は、市町村長が判断して職員や委託した者に実施させるもので（法第 34 条の 2）、個人の判断で撃つことはできません。',
    sources: [
      { doc: 'act', locator: '第 38 条第 2 項' },
      { doc: 'act', locator: '第 34 条の 2' },
    ],
  },
  {
    id: 'deer-road',
    animal: 'deer',
    situation: '12 月の昼、林道ではない舗装された公道の上に、シカが立っている。',
    layout: { backdrop: 'bank', light: 'day', road: true },
    answer: 'place',
    explanation:
      '公道は、法第 11 条第 1 項の狩猟可能区域から除かれる区域です（規則第 8 条、第 7 条第 1 項第 7 号ハ）。社寺境内や墓地、鳥獣保護区・休猟区なども同じです。また、道路の方向に向けて撃つこと自体、考査の基準問題が禁じている発射です。',
    sources: [
      { doc: 'act', locator: '第 11 条第 1 項' },
      { doc: 'regulation', locator: '第 8 条、第 7 条第 1 項第 7 号' },
      { doc: 'npaCourse', locator: '別添3 第2-3-(1)-⑦-4' },
    ],
  },
  {
    id: 'deer-sanctuary',
    animal: 'deer',
    situation: '12 月の昼、「鳥獣保護区」の標識が立つ山林。シカの背後は土の斜面。',
    layout: { backdrop: 'bank', light: 'day', sign: '鳥獣保護区' },
    answer: 'place',
    explanation:
      '鳥獣保護区は、狩猟可能区域から除かれています（法第 11 条第 1 項）。バックストップがあっても、狩猟として捕獲することはできません。',
    sources: [{ doc: 'act', locator: '第 11 条第 1 項' }],
  },
  {
    id: 'deer-april',
    animal: 'deer',
    situation: '4 月 20 日の昼、本州の山林。シカの背後は土の斜面で、周囲に人はいない。',
    layout: { backdrop: 'bank', light: 'day' },
    answer: 'season',
    explanation:
      '法第 2 条第 10 項は、狩猟期間を毎年 10 月 15 日（北海道は 9 月 15 日）から翌年 4 月 15 日までと定め、狩猟はその期間内に限られます（法第 11 条第 1 項）。都道府県がさらに期間を短くしていることもあります。',
    sources: [
      { doc: 'act', locator: '第 2 条第 10 項' },
      { doc: 'act', locator: '第 11 条第 1 項' },
    ],
  },
  {
    id: 'serow',
    animal: 'serow',
    situation: '12 月の昼、山林。シカだと思ったが、双眼鏡で確かめるとニホンカモシカだった。背後は土の斜面。',
    layout: { backdrop: 'bank', light: 'day' },
    answer: 'species',
    explanation:
      'ニホンカモシカは、規則別表第二の狩猟鳥獣に含まれていません。狩猟鳥獣でない鳥獣は、狩猟で捕獲できません。撃つ前に種を確かめることが必要です。',
    sources: [
      { doc: 'regulation', locator: '別表第二' },
      { doc: 'npaCourse', locator: '別添3 第2-3-(1)-⑦-2' },
    ],
  },
  {
    id: 'bear-shikoku',
    animal: 'bear',
    situation: '12 月の昼、高知県の山林でツキノワグマに出会った。背後は土の斜面。',
    layout: { backdrop: 'bank', light: 'day' },
    answer: 'species',
    explanation:
      '規則第 10 条第 1 項は、ツキノワグマの捕獲等を、三重・奈良・和歌山・島根・広島・山口・徳島・香川・愛媛・高知の各県の区域で、令和 9 年 9 月 14 日まで禁止しています。',
    sources: [{ doc: 'regulation', locator: '第 10 条第 1 項' }],
  },
  {
    id: 'boar-morning',
    animal: 'boar',
    situation: '1 月、日の出から 30 分後の山林。イノシシが正面から近づき、背後は土の斜面で、見通しがよく人はいない。',
    layout: { backdrop: 'bank', light: 'day' },
    answer: 'shoot',
    explanation:
      '日の出後、狩猟期間中で、バックストップが確認できるため撃てる状況です。緊急銃猟ガイドラインは、イノシシは正面から胸部を狙うとよく、鼻筋に当たると跳弾しやすいとしています。',
    sources: [
      { doc: 'act', locator: '第 38 条第 1 項' },
      { doc: 'moeEmergency', locator: 'p.110 イノシシの急所等' },
    ],
  },
  {
    id: 'deer-hunter',
    animal: 'deer',
    situation: '12 月の昼、巻き狩り。シカが走る先の林の中に、オレンジのベストを着た仲間の姿がちらりと見えた。',
    layout: { backdrop: 'field', light: 'day', person: true },
    answer: 'people',
    explanation:
      '法第 38 条第 3 項は、弾丸の到達するおそれのある人に向かっての銃猟を禁止しています。認定事業者講習テキストは、移動する対象を撃つときは対象が向かう先の状況も確認し、想定した範囲の外に銃口を向けないよう求めています。',
    sources: [
      { doc: 'act', locator: '第 38 条第 3 項' },
      { doc: 'moeCapture', locator: 'p.112-113 移動する対象への射角・発砲時の判断' },
    ],
  },
];
