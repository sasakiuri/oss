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
  {
    slug: 'click-verification',
    category: 'sighting',
    title: { ja: 'スコープのクリック値検証', en: 'Scope Click Verification' },
    summary: {
      ja: '縦長標的のタワーテストで、スコープの実際のクリック値と誤差を求めます。標的も印刷できます。',
      en: 'Measure what one click on your scope really moves with a tall-target test. The target prints on A4.',
    },
    description:
      '縦長標的を使ったタワーテスト（トラッキングテスト）の結果から、スコープの実際のクリック値・補正係数・公称値との誤差を計算します。必要な高さの縦長標的を A4 に分割して印刷できます。',
  },
  {
    slug: 'reticle-ranging',
    category: 'sighting',
    title: { ja: 'レティクルの測距', en: 'Reticle Ranging' },
    summary: {
      ja: 'mil・MOA レティクルで読んだ大きさから距離を求めます。',
      en: 'Range an object from its size against a mil or MOA reticle.',
    },
    description:
      'スコープの mil（ミルドット）・MOA レティクルで読んだ見かけの大きさと実寸から、対象までの距離を計算します。SFP スコープの倍率補正と、読み取り誤差による距離の幅も確認できます。',
  },
  {
    slug: 'trajectory',
    category: 'sighting',
    title: { ja: '弾道計算とゼロイン', en: 'Ballistic Calculator' },
    summary: {
      ja: '距離ごとの落差・風偏・残存エネルギーを計算し、実寸の弾道カードを印刷します。',
      en: 'Drop, wind drift and energy at each distance, printed as a real-size drop card.',
    },
    description:
      '初速・弾頭重量・弾道係数（G1・G7）・ゼロイン距離から、距離ごとの落差・風偏・残存速度・エネルギー・飛行時間を計算する弾道計算機。最大直接照準距離も求められ、弾道カードを実寸で印刷できます。',
  },
  {
    slug: 'trajectory-truing',
    category: 'sighting',
    title: { ja: '弾道の合わせ込み（トゥルーイング）', en: 'Trajectory Truing' },
    summary: {
      ja: '実測した落差に合わせて、弾道係数か初速を補正します。',
      en: 'Adjust the ballistic coefficient or the muzzle velocity to match the drops you measured.',
    },
    description:
      '距離ごとに実測した落差から、弾道係数（BC）か初速を実射に合わせて補正します（トゥルーイング）。補正後の残差と、測定精度から見た値の幅も表示します。',
  },
  {
    slug: 'twist-stability',
    category: 'sighting',
    title: { ja: 'ツイストと安定性の計算', en: 'Twist Rate and Stability' },
    summary: {
      ja: '弾頭とツイストからジャイロ安定係数を計算します。必要なツイストも求められます。',
      en: 'Gyroscopic stability from the bullet and the twist rate, and the twist a bullet needs.',
    },
    description:
      '弾頭の直径・長さ・重量とライフリングのツイスト、初速、気温・気圧から、Miller の式でジャイロ安定係数を計算します。必要なツイストと、そのツイストで安定する最大の弾長も求められます。',
  },
  {
    slug: 'max-range',
    category: 'sighting',
    title: { ja: '最大到達距離の計算', en: 'Maximum Range' },
    summary: {
      ja: '弾や散弾が最も遠くまで届く距離と、落下時の速度・エネルギーを計算します。',
      en: 'How far a bullet or shot can travel at most, and its speed and energy when it comes down.',
    },
    description:
      'ライフル弾・スラッグ・散弾の粒が仰角をつけて撃たれたときの最大到達距離を計算します。そのときの仰角・滞空時間・落下時の速度とエネルギーも求められます。跳弾と地形は含まないため、安全距離の根拠にはなりません。',
  },
  {
    slug: 'velocity-spread',
    category: 'loads',
    title: { ja: '初速のばらつき', en: 'Velocity Spread' },
    summary: {
      ja: '弾速計（クロノグラフ）の記録から平均・標準偏差（SD）・最大最小差（ES）を集計します。',
      en: 'Average, standard deviation and extreme spread from a chronograph string.',
    },
    description:
      '弾速計（クロノグラフ）で測った初速から、平均・標準偏差（SD）・最大最小差（ES）を集計し、発数に応じた SD の信頼区間と、距離ごとの縦の広がりを計算します。',
  },
  {
    slug: 'load-development',
    category: 'loads',
    title: { ja: 'ロード開発（ラダーテスト）の解析', en: 'Load Development' },
    summary: {
      ja: '装薬量の段ごとに初速と着弾を比べ、差がばらつきを超えているかを判定します。',
      en: 'Compare velocity and impact between charge steps and see whether the differences exceed the scatter.',
    },
    description:
      'ハンドロードの装薬量テスト（ラダーテストなど）の段ごとの初速と着弾から、平均と標準偏差、隣り合う段の差を求め、その差が発数から見たばらつきを超えているかを判定します。',
  },
  {
    slug: 'shot-group',
    category: 'loads',
    title: { ja: '着弾群の測定', en: 'Group Size Measurement' },
    summary: {
      ja: '標的を撮影して弾痕を検出し、グルーピングの大きさを MOA・mil で測ります。',
      en: 'Photograph the target, find the holes and measure the group in MOA and mil.',
    },
    description:
      '標的をスマートフォンで撮影し、弾痕を自動で検出して着弾群の大きさ（最大中心間距離・平均半径）と平均着弾点を測ります。MOA・mil に換算し、平均着弾点のズレを照準調整に使えます。画像は端末の外に送信しません。',
  },
  {
    slug: 'recoil',
    category: 'loads',
    title: { ja: '反動の計算', en: 'Recoil Calculator' },
    summary: {
      ja: '銃と装弾の重さ・初速から自由反動エネルギー（J・ft-lb）を計算し、2 つの条件を比べます。',
      en: 'Free recoil energy from the gun, the load and the velocity, with two setups side by side.',
    },
    description:
      '銃の重量、弾頭・散弾の重量、装薬量、初速から、自由反動の運動量・速度・エネルギーを計算します。2 つの条件を並べて、反動が何 % 変わるかを比べられます。',
  },
  {
    slug: 'shot-pattern',
    category: 'shotgun',
    title: { ja: '散弾パターンの測定', en: 'Shotgun Pattern Measurement' },
    summary: {
      ja: 'パターンボードを撮影し、30 インチ円内の着弾数とパターン率を数えます。',
      en: 'Photograph the pattern board and count the hits and the percentage inside the 30-inch circle.',
    },
    description:
      '散弾銃のパターンテスト用。パターンボードを撮影し、直径 76.2 cm（30 インチ）の円内の着弾数・パターン率・分布の偏りを数えます。粒の痕は自動で検出でき、画像は端末の外に送信しません。',
  },
  {
    slug: 'shot-pellets',
    category: 'shotgun',
    title: { ja: '散弾の粒数とエネルギー', en: 'Shot Pellet Count and Energy' },
    summary: {
      ja: '号数・材質・装弾量から粒数と、距離ごとの 1 粒の速度・エネルギーを計算します。',
      en: 'Pellet count from shot size, material and load weight, and the energy per pellet at distance.',
    },
    description:
      '散弾の号数（粒の直径）・材質（鉛・スチール・ビスマスなど）・装弾量・初速から、1 粒の重量と装弾の粒数、距離ごとの残存速度とエネルギーを計算します。鉛と非鉛弾を並べて比べられます。',
  },
  {
    slug: 'target-lead',
    category: 'shotgun',
    title: { ja: 'リード（見越し）の計算', en: 'Lead Calculator' },
    summary: {
      ja: '動く的に対して前に取る距離と、銃口を振る角度を計算します。',
      en: 'How far ahead of a moving target to shoot, and how far to swing the muzzle.',
    },
    description:
      'クレー射撃や鳥猟のリード（見越し）の計算。的の速度・距離・交差角から、的の何 m 先を狙うかと銃口を振る角度、弾の飛行時間を求めます。',
  },
  {
    slug: 'clay-score',
    category: 'shotgun',
    title: { ja: 'クレー射撃のスコアシート', en: 'Clay Shooting Score Sheet' },
    summary: {
      ja: 'トラップ・スキートの 25 枚を記録し、射台ごとの命中率を集計します。白紙のシートも印刷できます。',
      en: 'Score a 25-target trap or skeet round and see the hit rate at each station. Blank sheets print too.',
    },
    description:
      'トラップ・スキートの 1 ラウンド 25 枚を命中・失中で記録し、合計・射台別の命中率・連続命中を集計するスコアシート。ラウンドの履歴を残せて、白紙のスコアシートも印刷できます。',
  },
  {
    slug: 'hunting-hours',
    category: 'field',
    title: { ja: '銃猟可能時間', en: 'Legal Shooting Hours' },
    summary: {
      ja: '地点と日付から日の出・日の入りを求め、銃猟ができる時間帯を表示します。',
      en: 'Sunrise and sunset for a place and date, and the hours you may hunt with a gun.',
    },
    description:
      '日の出前と日没後の銃猟は禁止されています（鳥獣保護管理法第 38 条）。地点と日付から日の出・日の入りの時刻を計算し、銃猟ができる時間帯と日没までの残り時間を表示します。',
  },
  {
    slug: 'hunter-map',
    category: 'field',
    title: { ja: '狩猟マップ', en: 'Hunting Area Map' },
    summary: {
      ja: '手持ちの鳥獣保護区等位置図の画像に、現在地を重ねて表示します。',
      en: 'Show where you are on an image of the protected-area map you already have.',
    },
    description:
      '都道府県の鳥獣保護区等位置図（ハンターマップ）の画像に基準点を置いて位置を合わせ、GPS の現在地を図の上に表示します。図と位置情報は端末の外に送信しません。',
  },
  {
    slug: 'hunting-log',
    category: 'field',
    title: { ja: '出猟・捕獲の記録', en: 'Hunting Log' },
    summary: {
      ja: '出猟日ごとの場所・猟法・捕獲数を記録し、狩猟の結果の報告の下書きを作ります。',
      en: 'Log each day out and what you took, then total it into a draft of the end-of-season report.',
    },
    description:
      '出猟日ごとの場所・猟法・捕獲した鳥獣を記録し、狩猟者登録の満了後に提出する「狩猟の結果の報告」の下書きを様式の欄に沿って集計・印刷します。記録は端末の中だけに保存します。',
  },
] as const satisfies readonly LabsTool[];

export type LabsToolSlug = (typeof labsTools)[number]['slug'];

export function labsTool(slug: LabsToolSlug): LabsTool {
  const tool = labsTools.find((candidate) => candidate.slug === slug);
  if (!tool) throw new Error(`Unknown Labs tool: ${slug}`);
  return tool;
}
