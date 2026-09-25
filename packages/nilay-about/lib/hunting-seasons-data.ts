import type { PrefectureSeasons } from './hunting-seasons';

/**
 * What prefectures have published on their hunting seasons and limits, quoted from their own pages and
 * public notices on the day in `checkedOn`. Only the prefectures collected so far are here; the tool
 * sends the reader to the prefecture's page for the rest. `season` is the season the documents are for;
 * data for an earlier season than today's is shown with a warning.
 *
 * Generated from the research notes; quotes are verbatim, with whitespace possibly differing.
 */
export const PREFECTURE_SEASONS: readonly PrefectureSeasons[] = [
  {
    prefecture: '東京都',
    status: 'confirmed',
    season: 2026,
    checkedOn: '2026-09-24',
    overviewUrl: 'https://www.kankyo.metro.tokyo.lg.jp/nature/animals_plants/birds/hunting_license/s-touroku',
    rules: [
      {
        kind: 'extension',
        species: ['ニホンジカ'],
        period: {
          from: '2026-11-15',
          to: '2027-02-28',
        },
        periodText:
          '毎年2月16日から2月末日まで（(2)の区域では、毎年11月15日から翌年の2月末日までシカの狩猟ができます。）',
        area: '青梅市、檜原村及び奥多摩町',
        methods: null,
        limit: null,
        source: {
          title: '狩猟規制の緩和|シカ対策について|東京都環境局',
          url: 'https://www.kankyo.metro.tokyo.lg.jp/nature/animals_plants/deer/shooter',
        },
        quote: '(2)の区域では、毎年11月15日から翌年の2月末日までシカの狩猟ができます。',
      },
      {
        kind: 'prohibition',
        species: ['メスヤマドリ', 'メスキジ'],
        period: null,
        periodText: '',
        area: '都内全域',
        methods: null,
        limit: null,
        source: {
          title: '狩猟鳥獣の種類等について｜鳥獣保護管理対策｜東京都環境局',
          url: 'https://www.kankyo.metro.tokyo.lg.jp/nature/animals_plants/birds/hunting_kind',
        },
        quote: '特定の狩猟鳥獣の捕獲禁止(東京都内) 捕獲禁止鳥獣 捕獲禁止場所 メスヤマドリ、メスキジ 都内全域',
      },
      {
        kind: 'prohibition',
        species: ['ツキノワグマ'],
        period: null,
        periodText: '',
        area: '奥多摩町、檜原村、青梅市、日の出町、あきる野市、八王子市',
        methods: null,
        limit: null,
        source: {
          title: '狩猟鳥獣の種類等について｜鳥獣保護管理対策｜東京都環境局',
          url: 'https://www.kankyo.metro.tokyo.lg.jp/nature/animals_plants/birds/hunting_kind',
        },
        quote: 'ツキノワグマ 奥多摩町、檜原村、青梅市、日の出町、あきる野市、八王子市',
      },
      {
        kind: 'prohibition',
        species: ['ヒヨドリ'],
        period: null,
        periodText: '',
        area: '小笠原村全域',
        methods: null,
        limit: null,
        source: {
          title: '狩猟鳥獣の種類等について｜鳥獣保護管理対策｜東京都環境局',
          url: 'https://www.kankyo.metro.tokyo.lg.jp/nature/animals_plants/birds/hunting_kind',
        },
        quote: 'ヒヨドリ 小笠原村全域',
      },
    ],
    notes: [
      'シカの延長（毎年2月16日から2月末日まで）は、第6期第二種シカ管理計画の期間内（令和9年3月31日まで）です。',
      '捕獲禁止3件は「狩猟鳥獣の種類等について」ページの表（【令和4年4月時点】）によります。',
    ],
  },
  {
    prefecture: '神奈川県',
    status: 'confirmed',
    season: 2026,
    checkedOn: '2026-09-24',
    overviewUrl: 'https://www.pref.kanagawa.jp/docs/t4i/cnt/f986/p889838.html',
    rules: [
      {
        kind: 'extension',
        species: ['ニホンジカ'],
        period: {
          from: '2026-11-15',
          to: '2027-02-28',
        },
        periodText:
          '毎年11月15日から翌年2月末日までに延長する。延長後の狩猟期間を適用する期間 令和6年2月16日から令和9年2月28日まで',
        area: '平塚市、小田原市、相模原市（緑区のうち、相原、大島、大山町、上九沢、下九沢、田名、西橋本、二本松、橋本、橋本台、東橋本及び元橋本町を除く区域に限る。）、秦野市、厚木市、伊勢原市、南足柄市、大磯町、二宮町、中井町、大井町、松田町、山北町、開成町、箱根町、真鶴町、湯河原町、愛川町及び清川村の区域のうち、猟区の認可（平成25年神奈川県告示第580号）により定めた山北町三保猟区、山北町世附猟区、清川村猟区及び相模原市鳥屋猟区を除いた区域のうち、鳥獣の保護及び管理並びに狩猟の適正化に関する法律第11条第1項に基づく狩猟可能区域',
        methods: null,
        limit: null,
        source: {
          title:
            'ニホンジカ及びイノシシの狩猟期間の延長及びイノシシに係るくくりわなの径の規制解除について - 神奈川県ホームページ',
          url: 'https://www.pref.kanagawa.jp/docs/t4i/cnt/f986/documents/tokurei.html',
        },
        quote: '毎年11月15日から翌年2月15日までの狩猟期間を毎年11月15日から翌年2月末日までに延長する。',
      },
      {
        kind: 'extension',
        species: ['イノシシ'],
        period: {
          from: '2026-11-15',
          to: '2027-02-28',
        },
        periodText:
          '毎年11月15日から翌年2月末日までに延長する。延長後の狩猟期間を適用する期間 令和6年2月16日から令和9年2月28日まで',
        area: '神奈川県全域から猟区の認可（平成25年神奈川県告示第580号）により定めた山北町三保猟区、山北町世附猟区、清川村猟区及び相模原市鳥屋猟区を除いた区域のうち、鳥獣の保護及び管理並びに狩猟の適正化に関する法律第11条第1項に基づく狩猟可能区域',
        methods: null,
        limit: null,
        source: {
          title:
            'ニホンジカ及びイノシシの狩猟期間の延長及びイノシシに係るくくりわなの径の規制解除について - 神奈川県ホームページ',
          url: 'https://www.pref.kanagawa.jp/docs/t4i/cnt/f986/documents/tokurei.html',
        },
        quote: '毎年11月15日から翌年2月15日までの狩猟期間を毎年11月15日から翌年2月末日までに延長する。',
      },
    ],
    notes: ['ツキノワグマの狩猟の自粛が要請されています（捕獲禁止ではありません）。'],
  },
  {
    prefecture: '新潟県',
    status: 'confirmed',
    season: 2026,
    checkedOn: '2026-09-24',
    overviewUrl: 'https://www.pref.niigata.lg.jp/sec/kankyotaisaku/1356823231127.html',
    rules: [
      {
        kind: 'extension',
        species: ['イノシシ'],
        period: {
          from: '2026-11-15',
          to: '2027-03-15',
        },
        periodText: '11月15日から翌年３月15日まで',
        area: '佐渡市及び粟島浦村を除く',
        methods: null,
        limit: null,
        source: {
          title: '令和８年度狩猟者登録手続き（県内在住者）',
          url: 'https://www.pref.niigata.lg.jp/uploaded/attachment/506596.pdf',
        },
        quote:
          '令和８年度の新潟県の狩猟期間 ○全対象狩猟鳥獣 11月15日から翌年２月15日まで ○イノシシ 11月15日から翌年３月15日まで（佐渡市及び粟島浦村を除く）',
      },
      {
        kind: 'extension',
        species: ['ニホンジカ'],
        period: {
          from: '2026-11-15',
          to: '2027-03-15',
        },
        periodText: '11月15日から翌年３月15日まで',
        area: '佐渡市を除く',
        methods: null,
        limit: null,
        source: {
          title: '令和８年度狩猟者登録手続き（県内在住者）',
          url: 'https://www.pref.niigata.lg.jp/uploaded/attachment/506596.pdf',
        },
        quote: '○ニホンジカ 11月15日から翌年３月15日まで（佐渡市を除く）',
      },
    ],
    notes: [
      'ガンカモ類の生息調査日（令和9年1月16日～令和9年1月18日）は、カモ類・カワウの捕獲の自粛が要請されています。',
    ],
  },
  {
    prefecture: '富山県',
    status: 'confirmed',
    season: 2026,
    checkedOn: '2026-09-24',
    overviewUrl: 'https://www.pref.toyama.jp/1709/kurashi/kankyoushizen/shizen/shuryou/touroku.html',
    rules: [
      {
        kind: 'extension',
        species: ['イノシシ', 'ニホンジカ'],
        period: {
          from: '2026-11-01',
          to: '2027-03-31',
        },
        periodText: '11月１日から翌年３月31日まで',
        area: '富山県内',
        methods: 'ただし、11月１日から11月14日までの間における猟法は、わな猟に限る（銃器の使用は、止めさしに限る。）。',
        limit: null,
        source: {
          title: '令和8年度に富山県に入猟しようとする者の狩猟者登録取扱要領',
          url: 'https://www.pref.toyama.jp/documents/43056/r8kengai_youryou.pdf',
        },
        quote:
          '富山県内でのイノシシ及びニホンジカの狩猟期間は、11月１日から翌年３月31日までである。ただし、11月１日から11月14日までの間における猟法は、わな猟に限る（銃器の使用は、止めさしに限る。）。',
      },
      {
        kind: 'extension',
        species: ['ツキノワグマ'],
        period: {
          from: '2026-11-15',
          to: '2027-03-31',
        },
        periodText: '11月15日から翌年３月31日まで',
        area: '富山県内',
        methods: null,
        limit: null,
        source: {
          title: '令和8年度に富山県に入猟しようとする者の狩猟者登録取扱要領',
          url: 'https://www.pref.toyama.jp/documents/43056/r8kengai_youryou.pdf',
        },
        quote: 'また、富山県内でのツキノワグマの狩猟期間は、11月15日から翌年３月31日までである。',
      },
      {
        kind: 'other',
        species: ['イノシシ', 'ニホンジカ'],
        period: {
          from: '2025-11-01',
          to: '2028-10-31',
        },
        periodText: '令和7年11月1日から令和10年10月31日まで',
        area: '神通川東休猟区、洞山休猟区、五十里休猟区、速川休猟区、高坪休猟区、南山田休猟区、横山休猟区（特例休猟区）',
        methods: null,
        limit: null,
        source: {
          title: '休猟区及び特例休猟区の指定について',
          url: 'https://www.pref.toyama.jp/1709/kurashi/kankyoushizen/shizen/shuryou/2025kyuuryouku.html',
        },
        quote:
          '2特例休猟区の指定について 名称 区域 存続期間 第二種特定鳥獣の種類 神通川東休猟区 別紙図面に表示する区域 令和7年11月1日から 令和10年10月31日まで イノシシ ニホンジカ',
      },
    ],
    notes: ['特例休猟区では、イノシシ・ニホンジカに限り狩猟ができます。'],
  },
  {
    prefecture: '石川県',
    status: 'confirmed',
    season: 2026,
    checkedOn: '2026-09-24',
    overviewUrl: 'https://www.pref.ishikawa.lg.jp/sizen/syuryou/shuryoushatouroku-no-annai.html',
    rules: [
      {
        kind: 'extension',
        species: ['イノシシ', 'ニホンジカ'],
        period: {
          from: '2026-11-01',
          to: '2027-03-31',
        },
        periodText: '11月1日から3月31日',
        area: '',
        methods:
          '2月16日から2月末日については、わな猟と銃猟、11月1日から11月14日、3月1日から3月31日の期間は、わな猟と止めさしのための銃の使用に限ります。',
        limit: null,
        source: {
          title: '令和８年度 狩猟者登録手続きのご案内 | 石川県',
          url: 'https://www.pref.ishikawa.lg.jp/sizen/syuryou/shuryoushatouroku-no-annai.html',
        },
        quote:
          'イノシシ及びニホンジカ猟の狩猟期間：11月1日から3月31日（このうち、2月16日から2月末日については、わな猟と銃猟、11月1日から11月14日、3月1日から3月31日の期間は、わな猟と止めさしのための銃の使用に限ります。）',
      },
      {
        kind: 'prohibition',
        species: ['クロガモ'],
        period: {
          from: '2023-11-15',
          to: '2028-11-14',
        },
        periodText: '令和5年11月15日～令和10年11月14日',
        area: '石川県',
        methods: null,
        limit: null,
        source: {
          title: '狩猟制度の概要 | 石川県',
          url: 'https://www.pref.ishikawa.lg.jp/sizen/syuryou/r02shuryou-no-oshirase.html',
        },
        quote: '・石川県では、クロガモは捕獲できません。（令和5年11月15日～令和10年11月14日）',
      },
      {
        kind: 'prohibition',
        species: ['メスヤマドリ', 'メスキジ'],
        period: null,
        periodText: '現在',
        area: '全国',
        methods: null,
        limit: null,
        source: {
          title: '狩猟制度の概要 | 石川県',
          url: 'https://www.pref.ishikawa.lg.jp/sizen/syuryou/r02shuryou-no-oshirase.html',
        },
        quote: '・現在、全国でメスヤマドリ及びメスキジが捕獲できません。',
      },
      {
        kind: 'other',
        species: ['イノシシ', 'ニホンジカ'],
        period: null,
        periodText: '',
        area: '休猟区1か所（特例休猟区）',
        methods: null,
        limit: null,
        source: {
          title: '石川県におけるイノシシ及びニホンジカの狩猟期間延長について | 石川県',
          url: 'https://www.pref.ishikawa.lg.jp/sizen/syuryou/kikanentyou.html',
        },
        quote: 'ただし、休猟区1か所はすべて特例休猟区に指定されており、イノシシ及びニホンジカに限り狩猟が可能です。',
      },
      {
        kind: 'other',
        species: ['イノシシ', 'ニホンジカ'],
        period: null,
        periodText: '',
        area: '狩猟鳥獣（イノシシ・ニホンジカを除く）捕獲禁止区域　8か所　10,541ha',
        methods: null,
        limit: null,
        source: {
          title: '石川県におけるイノシシ及びニホンジカの狩猟期間延長について | 石川県',
          url: 'https://www.pref.ishikawa.lg.jp/sizen/syuryou/kikanentyou.html',
        },
        quote: '狩猟鳥獣（イノシシ・ニホンジカを除く）捕獲禁止区域では、イノシシ及びニホンジカに限り狩猟が可能です。',
      },
    ],
    notes: [
      '延長の区域は県内全域です（「狩猟期間延長について」、更新日2025年8月22日）。',
      '特例休猟区・捕獲禁止区域の2件は、令和7年度の期間を記載したページによります。',
      'メスヤマドリ・メスキジの捕獲禁止は全国の措置です（石川県独自の規制ではありません）。',
    ],
  },
  {
    prefecture: '福井県',
    status: 'confirmed',
    season: 2026,
    checkedOn: '2026-09-24',
    overviewUrl: 'https://www.pref.fukui.lg.jp/doc/shizen/syuryousyatourokur08.html',
    rules: [
      {
        kind: 'extension',
        species: ['ニホンジカ', 'イノシシ'],
        period: {
          from: '2026-11-01',
          to: '2027-03-31',
        },
        periodText: '11月1日から3月31日まで',
        area: '',
        methods:
          '11月1日から11月14日、2月16日から3月31日はわな猟のみとなります。銃の使用は、わな猟で捕獲されたニホンジカおよびイノシシの止めさしに限ります。',
        limit: null,
        source: {
          title: '令和８年度　狩猟者登録手続きのご案内 | 福井県ホームページ',
          url: 'https://www.pref.fukui.lg.jp/doc/shizen/syuryousyatourokur08.html',
        },
        quote:
          '※　ただし、ニホンジカおよびイノシシの狩猟期間は、11月1日から3月31日まで（ただし、11月1日から11月14日、2月16日から3月31日はわな猟のみとなります。銃の使用は、わな猟で捕獲されたニホンジカおよびイノシシの止めさしに限ります。）',
      },
    ],
    notes: [],
  },
  {
    prefecture: '山梨県',
    status: 'confirmed',
    season: 2026,
    checkedOn: '2026-09-24',
    overviewUrl: 'https://www.pref.yamanashi.jp/shizen/toroku.html',
    rules: [
      {
        kind: 'extension',
        species: ['ニホンジカ'],
        period: {
          from: '2026-11-15',
          to: '2027-03-15',
        },
        periodText: '11 月 15 日から 3 月 15 日まで',
        area: '',
        methods: null,
        limit: null,
        source: {
          title: '令和８年度 第３期山梨県第二種特定鳥獣（ニホンジカ）管理計画 年度別実施計画',
          url: 'https://www.pref.yamanashi.jp/documents/4655/r8shikakeikaku.pdf',
        },
        quote: '・狩猟期間は、昨年度同様、1 ヶ月延長し 11 月 15 日から 3 月 15 日まで',
      },
      {
        kind: 'bagLimit',
        species: ['ニホンジカ'],
        period: null,
        periodText: '令和８年度',
        area: '',
        methods: null,
        limit: '1 人 1 日あたりの捕獲頭数上限は、無制限',
        source: {
          title: '令和８年度 第３期山梨県第二種特定鳥獣（ニホンジカ）管理計画 年度別実施計画',
          url: 'https://www.pref.yamanashi.jp/documents/4655/r8shikakeikaku.pdf',
        },
        quote: '・1 人 1 日あたりの捕獲頭数上限は、無制限',
      },
      {
        kind: 'extension',
        species: ['イノシシ'],
        period: {
          from: '2026-11-15',
          to: '2027-03-15',
        },
        periodText: '１１月１５日から３月１５日',
        area: '',
        methods: null,
        limit: null,
        source: {
          title: '令和８年度 第３期山梨県第二種特定鳥獣（イノシシ）管理計画 年度別実施計画',
          url: 'https://www.pref.yamanashi.jp/documents/4655/r8inoshishikeikaku.pdf',
        },
        quote:
          'イノシシの狩猟期間については、引き続き１１月１５日から３月１５日とし、通常の狩猟期間を１か月間延長することとする。ただし、モニタリング調査等により期間延長の必要がないと判断された場合は中止する。',
      },
      {
        kind: 'bagLimit',
        species: ['ツキノワグマ'],
        period: null,
        periodText: '',
        area: '',
        methods: null,
        limit: '有害捕獲及び狩猟によるクマの捕獲頭数の上限を原則年４０頭',
        source: {
          title: 'クマの捕獲頭数制限について（お願い）',
          url: 'https://www.pref.yamanashi.jp/documents/68358/kuma.pdf',
        },
        quote:
          'ツキノワグマは狩猟獣ではありますが、山梨県で行った令和２年度ツキノワグマ生息等モニタリング調査で減少傾向にあったため、イノシシ・ツキノワグマ保護管理会議の意見等を踏まえて、有害捕獲及び狩猟によるクマの捕獲頭数の上限を原則年４０頭と変更しました。',
      },
    ],
    notes: [
      '延長と捕獲頭数は、令和8年度の年度別実施計画（ニホンジカ・イノシシ）によります。',
      'イノシシの延長は、モニタリング調査等により期間延長の必要がないと判断された場合は中止されます。',
      'クマの上限は有害捕獲と狩猟を合わせた県全体の年間上限で、1人1日の制限ではありません。出猟前に自然共生推進課または各林務環境事務所へクマ猟が可能か確認するよう求められています（「不可能」なら「クマ猟はしないでください」）。',
      '「メスジカの優先捕獲」は協力依頼です。',
    ],
  },
  {
    prefecture: '長野県',
    status: 'confirmed',
    season: 2026,
    checkedOn: '2026-09-24',
    overviewUrl: 'https://www.pref.nagano.lg.jp/yasei/syuryou_tekiseika.html',
    rules: [
      {
        kind: 'extension',
        species: ['ニホンジカ'],
        period: {
          from: '2026-11-15',
          to: '2027-03-15',
        },
        periodText: '11 月 15 日から 3 月 15 日までの期間',
        area: '県全域',
        methods: 'わな猟',
        limit: null,
        source: {
          title: '長野県第二種特定鳥獣管理計画（第６期ニホンジカ管理）計画書 本文',
          url: 'https://www.pref.nagano.lg.jp/yasei/sangyo/ringyo/choju/hogo/documents/honbun_nihonjika_6ki.pdf',
        },
        quote: '１ わな猟の狩猟期間の延長※1 わな猟の狩猟期間を 11 月 15 日から 3 月 15 日までの期間とする。',
      },
      {
        kind: 'extension',
        species: ['イノシシ'],
        period: {
          from: '2026-11-15',
          to: '2027-03-15',
        },
        periodText: '11 月 15 日から 3 月 15 日までの期間',
        area: '県全域',
        methods: 'わな猟',
        limit: null,
        source: {
          title: '長野県第二種特定鳥獣管理計画（第４期イノシシ管理）計画書 本文',
          url: 'https://www.pref.nagano.lg.jp/yasei/documents/01_nagano_inoshishi4ki_honbun.pdf',
        },
        quote: '１ わな猟の狩猟期間の延長 わな猟の狩猟期間を 11 月 15 日から 3 月 15 日までの期間とする。',
      },
    ],
    notes: [
      '延長は第二種特定鳥獣管理計画（第6期ニホンジカ：令和8年4月1日〜令和13年3月31日、第4期イノシシ：令和5年4月1日〜令和10年3月31日）の本文によります。',
      '第5期ツキノワグマ保護管理計画（一部変更 令和6年7月）は、八ヶ岳保護管理ユニットで「当面の間は、狩猟による捕獲を全面的に自粛することとし、関係者に要請する」としています。',
    ],
  },
  {
    prefecture: '岐阜県',
    status: 'confirmed',
    season: 2025,
    checkedOn: '2026-09-24',
    overviewUrl: 'https://www.pref.gifu.lg.jp/page/10885.html',
    rules: [
      {
        kind: 'extension',
        species: ['イノシシ', 'ニホンジカ'],
        period: {
          from: '2025-11-01',
          to: '2026-03-15',
        },
        periodText: '11月1日から3月15日',
        area: '',
        methods:
          '銃猟 11月1日から11月14日：わな猟のとめさしに限る。11月1日から11月14日、2月16日から3月15日のはこわな猟については、ツキノワグマが抜け出せる脱出口付であることが条件',
        limit: null,
        source: {
          title: '令和7年度の岐阜県内の狩猟について - 岐阜県公式ホームページ（自然環境課）',
          url: 'https://www.pref.gifu.lg.jp/page/10885.html',
        },
        quote:
          '狩猟期間を延長しています！ 11月1日から3月15日（イノシシとニホンジカに限り延長） ※11月1日から11月14日、2月16日から3月15日のはこわな猟については、ツキノワグマが抜け出せる脱出口付であることが条件となります。',
      },
    ],
    notes: [
      '11月1日から11月14日のその他可猟区での銃猟は、わな猟のとめさしに限ります（早見表）。',
      '2月16日から3月15日のわな猟は、特定猟具使用禁止区域（銃）とその他可猟区で「△」（はこわなは脱出口付き）です。',
    ],
  },
  {
    prefecture: '静岡県',
    status: 'confirmed',
    season: 2026,
    checkedOn: '2026-09-24',
    overviewUrl: 'https://www.pref.shizuoka.jp/kurashikankyo/shizenkankyo/wild/1017690.html',
    rules: [
      {
        kind: 'extension',
        species: ['ニホンジカ', 'イノシシ'],
        period: {
          from: '2026-11-01',
          to: '2027-03-15',
        },
        periodText: '令和８年 11 月１日～令和９年３月 15 日',
        area: '静岡県全域',
        methods: '銃・わな',
        limit: null,
        source: {
          title: 'ニホンジカとイノシシの狩猟期間の延長',
          url: 'https://www.pref.shizuoka.jp/_res/projects/default_project/_page_/001/017/690/08entyo.pdf',
        },
        quote:
          '１ 対象鳥獣 ニホンジカ・イノシシ ２ 狩猟期間 令和８年 11 月１日～令和９年３月 15 日 （ニホンジカ・イノシシ以外の鳥獣は、11 月 15 日～２月 15 日） ３ 区域 静岡県全域 ４ 可能猟法 銃・わな',
      },
      {
        kind: 'bagLimit',
        species: ['ニホンジカ'],
        period: null,
        periodText: '令和８年度',
        area: '',
        methods: '銃猟、わな猟とも',
        limit: '１日当たりの捕獲頭数は無制限',
        source: {
          title: '令和８年度の狩猟に関するお知らせ',
          url: 'https://www.pref.shizuoka.jp/_res/projects/default_project/_page_/001/017/690/08syuryo1.pdf',
        },
        quote: 'ニホンジカの「１日当たりの捕獲頭数」は無制限です。',
      },
      {
        kind: 'prohibition',
        species: ['メスキジ', 'メスヤマドリ'],
        period: {
          from: '2022-09-15',
          to: '2027-09-14',
        },
        periodText: '令和４年９月１５日～令和９年９月１４日の５年間',
        area: '全国',
        methods: null,
        limit: null,
        source: {
          title: '令和８年度の狩猟に関するお知らせ',
          url: 'https://www.pref.shizuoka.jp/_res/projects/default_project/_page_/001/017/690/08syuryo1.pdf',
        },
        quote:
          '「メスキジ、メスヤマドリ」の狩猟禁止 令和４年９月１５日～令和９年９月１４日の５年間、全国で狩猟による捕獲が禁止されています。',
      },
    ],
    notes: [
      'キジ・ヤマドリの禁止は雌のみで、全国の措置です（静岡県独自の規制ではありません）。',
      '「静岡県内では、ツキノワグマの狩猟は自粛扱いとなっています。」令和９年１月 17 日（ガンカモ一斉調査の基準日）は、カモ類の狩猟の自粛が求められています。',
    ],
  },
  {
    prefecture: '愛知県',
    status: 'confirmed',
    season: 2025,
    checkedOn: '2026-09-24',
    overviewUrl: 'https://www.pref.aichi.jp/soshiki/shizen/shuryou.html',
    rules: [
      {
        kind: 'extension',
        species: ['イノシシ'],
        period: {
          from: '2025-11-15',
          to: '2026-03-15',
        },
        periodText: '2026年3月15日（日曜日）まで',
        area: '県内全域',
        methods: null,
        limit: null,
        source: {
          title: '狩猟について - 愛知県',
          url: 'https://www.pref.aichi.jp/soshiki/shizen/shuryou.html',
        },
        quote:
          '1　狩猟期間 2025年11月15日（土曜日）から2026年2月15日（日曜日）まで なお、イノシシ及びニホンジカの狩猟期間の延長区域（※）においては、2026年3月15日（日曜日）まで ※延長区域（イノシシ） 県内全域',
      },
      {
        kind: 'extension',
        species: ['ニホンジカ'],
        period: {
          from: '2025-11-15',
          to: '2026-03-15',
        },
        periodText: '2026年3月15日（日曜日）まで',
        area: '18市町村 名古屋市、豊橋市、岡崎市、瀬戸市、春日井市、豊川市、豊田市、蒲郡市、犬山市、小牧市、新城市、尾張旭市、日進市、長久手市、幸田町、設楽町、東栄町、豊根村',
        methods: null,
        limit: null,
        source: {
          title: '狩猟について - 愛知県',
          url: 'https://www.pref.aichi.jp/soshiki/shizen/shuryou.html',
        },
        quote:
          '1　狩猟期間 2025年11月15日（土曜日）から2026年2月15日（日曜日）まで なお、イノシシ及びニホンジカの狩猟期間の延長区域（※）においては、2026年3月15日（日曜日）まで ※延長区域（イノシシ） 県内全域 ※延長区域（ニホンジカ） 18市町村 名古屋市、豊橋市、岡崎市、瀬戸市、春日井市、豊川市、豊田市、蒲郡市、犬山市、小牧市、新城市、尾張旭市、日進市、長久手市、幸田町、設楽町、東栄町、豊根村',
      },
    ],
    notes: [
      '豚熱の陽性エリアでイノシシを捕獲した者は、陰性エリアでの全ての狩猟の自粛が求められています。',
      'ツキノワグマのページ（2026年9月15日更新）は「本県では、狩猟者に対してクマの狩猟の自粛をお願いしております。」としています。',
    ],
  },
  {
    prefecture: '三重県',
    status: 'confirmed',
    season: 2026,
    checkedOn: '2026-09-24',
    overviewUrl: 'https://www.pref.mie.lg.jp/SHINRIN/HP/mori/000126727.htm',
    rules: [
      {
        kind: 'extension',
        species: ['ニホンジカ'],
        period: {
          from: '2026-11-01',
          to: '2027-03-15',
        },
        periodText: '11 月１日から３月 15 日まで',
        area: '',
        methods: null,
        limit: null,
        source: {
          title: '第二種特定鳥獣管理計画（ニホンジカ）（第５期）',
          url: 'https://www.pref.mie.lg.jp/common/content/001006443.pdf',
        },
        quote: '第４期計画と同様、狩猟期間を 11 月１日から３月 15 日までとし、捕獲圧を上げることとする。',
      },
      {
        kind: 'extension',
        species: ['イノシシ'],
        period: {
          from: '2026-11-01',
          to: '2027-03-15',
        },
        periodText: '11 月１日から３月 15 日まで',
        area: '',
        methods: null,
        limit: null,
        source: {
          title: '第二種特定鳥獣管理計画（イノシシ）（第４期）',
          url: 'https://www.pref.mie.lg.jp/common/content/001006444.pdf',
        },
        quote: '第３期計画から引き続き、狩猟期間を 11 月１日から３月 15 日までとし、捕獲圧を高めることとする。',
      },
    ],
    notes: [
      '延長は、計画期間 令和4年4月1日から令和9年3月31日までの第二種特定鳥獣管理計画（ニホンジカ第5期・イノシシ第4期）の本文によります。区域・猟法の条件の記載はありません。',
    ],
  },
];
