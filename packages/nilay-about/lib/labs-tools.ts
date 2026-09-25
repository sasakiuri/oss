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
      ja: '写真で鳥獣の名前を覚え、4 択テストで確認します。',
      en: 'Learn species from photos and test yourself with multiple-choice questions.',
    },
    description:
      '狩猟免許試験の鳥獣判別の練習に。狩猟鳥獣 46 種の写真を、自己採点のスライドショーと時間制限つきの 4 択テストで確認できます。間違えた鳥獣だけを復習できます。',
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
    slug: 'license-exam',
    category: 'study',
    title: { ja: '狩猟免許試験・考査の練習', en: 'Hunting Licence and Firearms Course Practice' },
    summary: {
      ja: '狩猟免許試験と猟銃等講習会の模擬試験。間違えた問題を復習できます。',
      en: 'Mock hunting licence and firearms course exams, with review of missed questions.',
    },
    description:
      '狩猟免許試験の知識試験（法令・猟具・鳥獣・保護管理）と猟銃等講習会の考査の練習問題。免許の種類別の出題、本番形式の模擬試験と合否判定、分野別正答率、今日のテスト、間隔反復の復習。',
    japaneseOnly: true,
  },
  {
    slug: 'shoot-decision',
    category: 'study',
    title: { ja: '撃つか撃たないかの判断と急所', en: 'Shoot or Hold, and Where to Aim' },
    summary: {
      ja: '場面ごとに撃つか見送るかを判断する練習と、急所の図解。',
      en: 'Practise shoot-or-hold decisions and learn aiming points from diagrams.',
    },
    description:
      'シカ・イノシシ・クマに出会った場面で、背後の安全・時間・区域・猟期などから撃ってよいかを判断し、撃たない理由と根拠の条文を確認します。急所（頭部・頸部・胸部）の位置を図で練習。',
    japaneseOnly: true,
  },
  {
    slug: 'course-schedules',
    category: 'study',
    title: { ja: '講習会・試験の日程リンク集', en: 'Course and Exam Schedules' },
    summary: {
      ja: '都道府県別の公式日程へのリンク。受講予定をカレンダーに登録できます。',
      en: 'Official exam and course schedules by prefecture, with calendar export.',
    },
    description:
      '狩猟免許試験・猟銃等講習会・技能講習の公式の日程案内ページを都道府県ごとにまとめたリンク集。申込日や受講日を入力すると、カレンダーに取り込める .ics ファイルを作ります。',
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
    slug: 'unit-converter',
    category: 'sighting',
    title: { ja: '射撃の単位換算', en: 'Shooting Unit Converter' },
    summary: {
      ja: '充填圧・締付けトルク・速度・重さ・エネルギー・長さ・MOA と mil を換算します。',
      en: 'Convert fill pressure, torque, velocity, weight, energy, length, and MOA and mil.',
    },
    description:
      'PCP の充填圧（bar・MPa・psi）、スコープマウントの締付けトルク（N·m・kgf·cm・in-lb）、初速、弾頭重量（g・grain）、エネルギー（J・ft-lb）、MOA・mil・100 m あたりの cm を一度に換算します。',
  },
  {
    slug: 'wind-practice',
    category: 'sighting',
    title: { ja: '風読みの練習', en: 'Wind Call Practice' },
    summary: {
      ja: '風向き・風速・距離に応じたホールド量を答える練習。',
      en: 'Practise wind holds for different wind directions, speeds and distances.',
    },
    description:
      '時計の文字盤で表した風向きから横風の割合（フルバリュー・ハーフバリュー）を、風速と距離から自分の弾の風偏のホールド量（mil・MOA）を答える練習。間違えやすい風向きを集計します。',
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
    slug: 'target-score',
    category: 'loads',
    title: { ja: '標的の採点', en: 'Target Scoring' },
    summary: {
      ja: 'ISSF 標的をタップや写真から採点し、シリーズごとの得点を記録します。',
      en: 'Score ISSF targets by tapping or from photos, and record series totals.',
    },
    description:
      '10m エアライフル・エアピストル・50m ライフルなど ISSF 標的の弾痕をタップか写真から読み取り、小数点（10.9）とインナーテンで採点。シリーズ合計・平均・推移を記録できます。',
  },
  {
    slug: 'shot-timer',
    category: 'loads',
    title: { ja: 'ショットタイマー', en: 'Shot Timer' },
    summary: {
      ja: '開始音から発砲までの時間と発砲間隔を、マイクや動画の音声から測ります。',
      en: 'Measure shot times and splits from microphone or video audio.',
    },
    description:
      'ブラウザで動くショットタイマー。ランダム遅延の開始音と par タイム、マイクによる発砲検出（しきい値調整）でスプリットを計測。射撃動画の音から発砲のタイミングも出せます。',
  },
  {
    slug: 'match-timer',
    category: 'loads',
    title: { ja: '競技の号令タイマー', en: 'Match Command Timer' },
    summary: {
      ja: 'ISSF 競技の号令を読み上げ、残り時間を表示する練習用タイマー。',
      en: 'A practice timer with spoken ISSF commands and a countdown.',
    },
    description:
      'ISSF 規則の準備・試射時間、本射、決勝の号令と持ち時間を音声で読み上げる練習用タイマー。10m エアライフル・エアピストル、50m 伏射・3 姿勢に対応し、残り時間を表示します。',
  },
  {
    slug: 'pcp-fill',
    category: 'loads',
    title: { ja: 'PCP 空気銃の充填回数', en: 'PCP Fill Calculator' },
    summary: {
      ja: 'ダイビングボンベなどから PCP 空気銃に何回充填できるかを、容積と圧力から計算します。',
      en: 'How many times a cylinder fills a PCP air gun, from the volumes and pressures.',
    },
    description:
      'ダイビングボンベやカーボンボンベから PCP（プレチャージ式）空気銃に満充填できる回数と、充填ごとのボンベの残圧を、容積と圧力（bar・MPa・psi）から計算します。',
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
    slug: 'ammo-purchase-plan',
    category: 'loads',
    title: { ja: '火薬類の消費（購入）計画', en: 'Cartridge Purchase Plan' },
    summary: {
      ja: '譲受許可申請の「消費（購入）計画」を作成し、印刷します。',
      en: 'Prepare and print the consumption plan for a cartridge acquisition permit.',
    },
    description:
      '猟銃用火薬類等譲受許可申請書（別記様式第 2 号）の別紙「消費（購入）計画」を作ります。予定ごとの数量を種類別に合計し、譲受期間が 1 年を超えないか、申請数量と合うかを確かめて印刷できます。',
    japaneseOnly: true,
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
  {
    slug: 'hunting-seasons',
    category: 'field',
    title: { ja: '猟期と捕獲数制限の早見表', en: 'Hunting Seasons and Bag Limits' },
    summary: {
      ja: '都道府県ごとの猟期と捕獲数制限を、日付を指定して確認します。',
      en: 'Check hunting seasons and bag limits by prefecture and date.',
    },
    description:
      '鳥獣保護管理法施行規則の猟期と 1 日の捕獲数の上限に、都道府県が告示する猟期の延長や捕獲の制限を重ねて表示します。資料の確認日を示し、猟期を .ics でカレンダーに登録できます。',
  },
  {
    slug: 'hunting-costs',
    category: 'field',
    title: { ja: '狩猟にかかる費用の計算', en: 'Hunting Cost Calculator' },
    summary: {
      ja: '狩猟免許の手数料・狩猟税・登録手数料・猟友会費などを、初年度・通常の年・更新年で合計します。',
      en: 'Licence fees, hunting tax, registration fees and club dues, totalled for the first year, a usual year and a renewal year.',
    },
    description:
      '狩猟免許の手数料、狩猟者登録の手数料、狩猟税（所得割・放鳥獣猟区・許可捕獲の 1/2 軽減・非課税の特例）、猟友会費や保険を、初年度・通常の年・更新年で計算します。複数の都道府県の登録に対応。',
  },
  {
    slug: 'permit-deadlines',
    category: 'field',
    title: { ja: '所持許可・狩猟免許の期限', en: 'Permit and Licence Deadlines' },
    summary: {
      ja: '所持許可・狩猟免許の期限と更新申請期間を計算し、カレンダーに書き出します。',
      en: 'Calculate permit and licence deadlines and renewal windows, and export them to a calendar.',
    },
    description:
      '銃刀法 第 7 条の 2 の所持許可の満了日と更新申請の期間、鳥獣保護管理法 第 44 条の狩猟免許の期限を計算し、.ics に書き出します。更新の持ち物と、許可用途に 2 年使っていない銃の確認つき。',
  },
  {
    slug: 'wounded-game',
    category: 'field',
    title: { ja: '半矢の追跡', en: 'Tracking Wounded Game' },
    summary: {
      ja: '血の色や泡について公的資料が示す被弾部位の見方と追跡までの待ち時間を確認し、血痕の地点を記録します。',
      en: 'What public sources say blood sign means for the hit and the wait before trailing, with a log of the trail.',
    },
    description:
      '半矢になった獲物の追跡に。血の色や泡などの手がかりから、公的資料が示す被弾部位の見方と追跡開始までの待ち時間の目安を出典つきで確認し、血痕の地点と時刻を記録します。',
  },
  {
    slug: 'trap-tag',
    category: 'traps',
    title: { ja: 'わな・網の標識', en: 'Trap and Net Tags' },
    summary: {
      ja: 'わな・網に付ける法定の標識を実寸で作成して印刷します。',
      en: 'Make the legally required tag for a trap or net and print it at real size.',
    },
    description:
      'くくりわな・箱わななどのわなや網に付ける標識（名札。住所・氏名・登録番号など）を、一字 10 mm 以上の実寸で作成して印刷します。狩猟と許可捕獲の記載事項に対応。',
    japaneseOnly: true,
  },
  {
    slug: 'snare-gauge',
    category: 'traps',
    title: { ja: 'くくりわなの規格ゲージ', en: 'Snare Gauge' },
    summary: {
      ja: '輪の直径 12 cm などくくりわなの基準と都道府県の緩和を確認し、輪の直径を測る実寸ゲージを印刷します。',
      en: 'The snare rules and a prefecture’s relaxations, with a real-size gauge to check the loop.',
    },
    description:
      'くくりわなの輪の直径 12 cm 以内・締付け防止金具・よりもどし・ワイヤー径 4 mm 以上などの基準を、都道府県の緩和とあわせて一覧にします。輪の内径を確かめる実寸ゲージを印刷できます。',
  },
  {
    slug: 'trap-check-log',
    category: 'traps',
    title: { ja: 'わな見回りの記録', en: 'Trap Check Log' },
    summary: {
      ja: 'わなごとの見回りを記録し、決めた間隔を過ぎたわなを知らせます。',
      en: 'Log each trap check and see which traps are overdue.',
    },
    description:
      'わなごとに設置日と場所を登録し、見回りの日時と結果を記録します。最後の見回りからの経過時間を表示し、決めた間隔を過ぎたわなを知らせます。CSV 書き出しと見回り表の印刷に対応。',
  },
  {
    slug: 'trap-sign',
    category: 'traps',
    title: { ja: 'わな設置中の注意看板', en: 'Trap Warning Sign' },
    summary: {
      ja: '「わな設置中」の注意看板を A4・A3 で作って印刷します。',
      en: 'Make and print a “traps set” warning sign on A4 or A3.',
    },
    description:
      'くくりわな・箱わなの設置場所に掲げる「わな設置中」の注意看板を、対象の鳥獣・期間・設置者・連絡先を入れて A4・A3 で印刷します。英語の行も加えられます。',
  },
  {
    slug: 'electric-fence',
    category: 'damage',
    title: { ja: '電気柵の設計計算', en: 'Electric Fence Planner' },
    summary: {
      ja: 'シカ・イノシシ・サルなどに合わせた段の高さと、柵線・支柱・ガイシの数を計算します。',
      en: 'Wire heights for deer, boar or monkeys, and how much wire, posts and insulators you need.',
    },
    description:
      'イノシシ・シカ・サル・クマなどの獣種と出典を選んで、電気柵の段の地上高、柵線の総延長、支柱・ガイシ・出入口のグリップの数を計算します。電気さくの法令上の要件と点検項目も確認できます。',
  },
  {
    slug: 'bear-stats',
    category: 'damage',
    title: { ja: 'クマの出没・被害統計', en: 'Bear Incident Statistics' },
    summary: {
      ja: '環境省が公表するクマの人身被害・出没・捕獲の件数を、年度・都道府県・月別に表示します。',
      en: 'Bear injuries, sightings and captures published by the Ministry of the Environment, by year, prefecture and month.',
    },
    description:
      '環境省が公表するツキノワグマ・ヒグマの人身被害・出没件数・捕獲数・緊急銃猟の実施状況を、年度・都道府県・月別の表とグラフで確認できます（速報値）。',
  },
  {
    slug: 'bear-bell',
    category: 'damage',
    title: { ja: '熊鈴と遭遇時の備え', en: 'Bear Bell and Encounter Guide' },
    summary: {
      ja: '熊鈴の音を再生します。入山前の確認事項とクマに遭遇した際の対処も掲載。',
      en: 'Play a bear bell sound and read the pre-trip and encounter guidance.',
    },
    description:
      '熊鈴の音をブラウザーで鳴らします（一定間隔・ランダム・歩行連動）。環境省の資料に基づく入山前のチェックリストと、クマに遭遇したときの行動・クマ撃退スプレーの要点も確認できます。',
  },
  {
    slug: 'trace-gauge',
    category: 'damage',
    title: { ja: '足跡・糞の実寸ゲージ', en: 'Print and Dropping Gauges' },
    summary: {
      ja: '足跡と糞の大きさを実寸で印刷し、現地で当てて比べます。',
      en: 'Real-size prints of tracks and droppings to hold against what you find.',
    },
    description:
      'ツキノワグマ・アライグマ・ハクビシン・タヌキ・アナグマ・キツネ・ノウサギ・イノシシの足跡と、クマ・シカ・タヌキなどの糞の大きさを、農林水産省や県の資料の値で実寸印刷します。加害獣を見分ける目安に。',
  },
  {
    slug: 'village-check',
    category: 'damage',
    title: { ja: '集落点検・誘引物チェック', en: 'Village Attractant Check' },
    summary: {
      ja: '集落の誘引物・潜み場・クマの痕跡を点検し、記録・印刷します。',
      en: 'Record and print inspections for attractants, cover and bear signs in a village.',
    },
    description:
      '総務省の集落点検チェックシート（クマの項目）、農林水産省の鳥獣被害防止対策チェックシート別表、環境省のクマ類出没対応マニュアルの項目で、放任果樹・生ゴミ・藪などの誘引物を点検します。結果を保存して前回と比べ、点検表を印刷できます。',
  },
  {
    slug: 'deer-density',
    category: 'damage',
    title: { ja: 'シカの生息密度の推定', en: 'Deer Density Estimate' },
    summary: {
      ja: 'カメラの撮影頻度（REM）や糞粒調査の結果から、シカの生息密度を計算します。',
      en: 'Deer per km² from camera trap rates (REM) or pellet counts.',
    },
    description:
      'センサーカメラの撮影頻度から REM（Rowcliffe ら 2008）で、糞粒調査の結果から Taylor and Williams の式や FUNRYU（岩本ら 2000）で、ニホンジカの生息密度（頭/km²）を計算します。式と出典を表示します。',
  },
  {
    slug: 'capture-check',
    category: 'harvest',
    title: { ja: '捕獲確認の写真と報償金', en: 'Capture Photos and Payments' },
    summary: {
      ja: '捕獲の証拠写真を確認し、撮影用の標示板を印刷します。報償金も試算できます。',
      en: 'Check capture evidence photos, print a photo board and estimate payments.',
    },
    description:
      '有害鳥獣の捕獲確認（証拠写真）の準備に。農林水産省の捕獲確認マニュアル（令和7年4月）に沿った撮影チェック、標示板（捕獲日・従事者氏名・個体番号）の印刷、写真の撮影日時と位置の確認、国の上限単価と市町村の上乗せによる報償金の試算ができます。',
  },
  {
    slug: 'gibier-record',
    category: 'harvest',
    title: { ja: 'ジビエの捕獲時記録票', en: 'Game Meat Capture Record' },
    summary: {
      ja: '食肉処理施設に渡す捕獲時の記録票を 1 頭ごとに作成し、A4 で印刷します。',
      en: 'Fill in the capture record a game meat facility needs for each animal, and print it on A4.',
    },
    description:
      'シカ・イノシシをジビエとして食肉処理施設に持ち込むときの捕獲時の記録票を、厚生労働省のガイドラインと手引書の様式に沿って 1 頭ごとに作成し、A4 で印刷します。',
    japaneseOnly: true,
  },
  {
    slug: 'meat-yield',
    category: 'harvest',
    title: { ja: '肉の歩留まり計算', en: 'Meat Yield Calculator' },
    summary: {
      ja: 'シカ・イノシシの体重から、枝肉と食肉の重さ（歩留まり）と冷凍パック数の目安を計算します。',
      en: 'Carcass and meat weight from a deer or boar’s body weight, and how many freezer packs it makes.',
    },
    description:
      'シカ・イノシシの体重から、枝肉と食肉にできる部位の重さ（歩留まり）の目安を計算します。係数は農林水産省の資料の参考値か自分で量った値を使い、冷凍のパック数も求められます。',
  },
  {
    slug: 'cure-mix',
    category: 'harvest',
    title: { ja: '塩漬け・ソーセージの配合計算', en: 'Cure and Sausage Calculator' },
    summary: {
      ja: '肉の重さに応じた食塩・発色剤・香辛料の分量と、亜硝酸根の添加量を計算します。',
      en: 'Calculate salt, curing agent, spices and added nitrite from meat weight.',
    },
    description:
      'ジビエのハム・ベーコン・ソーセージ作りに。肉と水の重さから食塩・発色剤・香辛料の分量と、加える亜硝酸根の量（mg/kg）を計算します。赤身と脂の比率、ケーシングの長さ、原価も求められます。',
  },
  {
    slug: 'freezer-stock',
    category: 'harvest',
    title: { ja: '冷凍庫の在庫', en: 'Freezer Stock' },
    summary: {
      ja: 'ジビエの部位・重さ・冷凍日を記録し、残りのパック数を管理します。',
      en: 'Track frozen game meat by cut, weight, freezing date and packs remaining.',
    },
    description:
      '冷凍したシカ・イノシシの肉を、部位・1 パックの重さ・パック数・冷凍した日で記録し、古い順に並べて合計の重さを表示します。使い切る日を自分で決めて入力でき、ガイドラインの保存温度も確認できます。',
  },
  {
    slug: 'teeth-age',
    category: 'harvest',
    title: { ja: '歯による年齢の目安', en: 'Age from Teeth' },
    summary: {
      ja: 'ニホンジカは前歯のすり減り、イノシシは奥歯の生え方から年齢を推定します。',
      en: 'Age class of sika deer from front tooth wear, and of wild boar from the molars.',
    },
    description:
      '捕獲したニホンジカは下あごの第一切歯の摩滅、イノシシは後臼歯の萌出の状態に答えると、兵庫県の調査に基づく年齢の目安を表示します。ジビエの記録票の推定年齢の記入に。',
  },
  {
    slug: 'butchering-guide',
    category: 'harvest',
    title: { ja: '部位と解体の手引き', en: 'Cuts and Butchering Guide' },
    summary: {
      ja: 'シカ・イノシシの部位図と、解体時の衛生チェックリスト。',
      en: 'Deer and boar cut diagrams with a butchering hygiene checklist.',
    },
    description:
      'シカ・イノシシの部位（ネック・カタ・ロース・モモ・スネなど）を国産ジビエ認証制度のカットチャートの名前で図に示し、放血・内臓摘出・運搬・剥皮の衛生の要点を厚生労働省のガイドラインに沿ってチェックできます。',
  },
  {
    slug: 'antler-measure',
    category: 'harvest',
    title: { ja: '角の写真計測', en: 'Antler Photo Measure' },
    summary: {
      ja: '写真に写した定規を基準に、角や牙に沿って長さを測ります。',
      en: 'Trace antlers or tusks to measure their length using a ruler in the photo.',
    },
    description:
      'シカの角やイノシシの牙の写真に、長さの分かる基準物を一緒に写して縮尺を合わせ、角に沿って点をたどると長さを計算します。',
  },
] as const satisfies readonly LabsTool[];

export type LabsToolSlug = (typeof labsTools)[number]['slug'];

export function labsTool(slug: LabsToolSlug): LabsTool {
  const tool = labsTools.find((candidate) => candidate.slug === slug);
  if (!tool) throw new Error(`Unknown Labs tool: ${slug}`);
  return tool;
}
