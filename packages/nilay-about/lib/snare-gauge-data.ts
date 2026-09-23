/**
 * How each prefecture relaxes the loop-diameter limit of Enforcement Regulation art. 10(3)(ix)
 * for hunting with snares, as published by the prefecture itself.
 *
 * The relaxations are made under Act art. 14 through each prefecture's management plan for a
 * designated species. The public notices themselves were not read, so every case rests on the
 * prefecture's own guidance page or plan, quoted as published and checked on SNARE_DATA_CHECKED_ON.
 * Each case carries the quotes that back it, so its limit, species, area and period can be traced
 * to what the prefecture wrote. Area wording is shown and never evaluated: the tool does not decide
 * whether a place falls inside a listed area.
 */

export const SNARE_DATA_CHECKED_ON = '2026-09-23';

export type SnareGameSpecies = 'boar' | 'deer';

export interface SnareSource {
  title: string;
  /** Every source is linked: a prefecture whose documents could not be fetched is marked unconfirmed instead. */
  url: string;
  /** Verbatim from the source, shortened only at sentence boundaries. Whitespace may differ. */
  quote?: string;
}

/** A dated range, both days included, as ISO dates in Japan Standard Time. */
export interface SnareDateRange {
  from: string;
  to: string;
}

export interface SnareRelaxationCase {
  species: readonly SnareGameSpecies[];
  /** The loop limit in this case, in millimetres. Null when the diameter limit is lifted. */
  limitMm: number | null;
  /** The area, in the prefecture's words where it gives one. */
  area: string;
  /**
   * The words of the area as they stand in the quotes of `evidence`. Null only where the quoted
   * text sets no area, which `area` then says in so many words.
   */
  areaQuote: string | null;
  /** The quotes this case rests on. Its limit, species, area and period are all in these. */
  evidence: readonly SnareSource[];
  /** When the case applies within the hunting season, in the prefecture's words. */
  period?: string;
  /** The same period as dated ranges, for the years the documents cover. Outside them it does not apply. */
  periodRanges?: readonly SnareDateRange[];
  /** True when the period is set anew each year, so no date in the data can decide it. */
  periodUndetermined?: boolean;
  /** Set when the prefecture's own documents disagree on this case; the text says how. */
  disputed?: string;
  /** Anything else the prefecture attaches to the case. */
  conditions?: readonly string[];
}

export type SnarePrefectureStatus = 'relaxed' | 'none' | 'unconfirmed';

export interface SnarePrefectureRule {
  code: string;
  name: string;
  nameEn: string;
  status: SnarePrefectureStatus;
  /**
   * For `none`: the species the sources say are held to 12 cm. Left out when they cover both.
   * A species not listed is shown as unconfirmed.
   */
  confirmedNoneFor?: readonly SnareGameSpecies[];
  cases: readonly SnareRelaxationCase[];
  /**
   * The last day the documents cover, as an ISO date: the end of the plan, or of the season a
   * yearly notice is for. Null when none is published.
   */
  validUntil: string | null;
  notes: readonly string[];
  /** Further documents on the prefecture as a whole, beyond the quotes of each case. */
  sources: readonly SnareSource[];
}

const UNCONFIRMED_NOTE =
  '資料で緩和の有無を確認できませんでした。法令の基準で表示します。狩猟者登録をする都道府県の案内で確かめてください。';

const NONE_NOTE =
  '確認した県の狩猟案内・管理計画では、狩猟でのくくりわなの輪の直径の緩和の記載を確認できませんでした。法令の基準で表示します。';

export const SNARE_PREFECTURE_RULES: readonly SnarePrefectureRule[] = [
  {
    code: 'hokkaido',
    name: '北海道',
    nameEn: 'Hokkaido',
    status: 'unconfirmed',
    cases: [],
    validUntil: null,
    notes: [UNCONFIRMED_NOTE],
    sources: [],
  },
  {
    code: 'aomori',
    name: '青森県',
    nameEn: 'Aomori',
    status: 'none',
    cases: [],
    validUntil: null,
    notes: [NONE_NOTE],
    sources: [
      {
        title: '青森県「第13次青森県鳥獣保護管理事業計画等について」',
        url: 'https://www.pref.aomori.lg.jp/soshiki/kankyo/shizen/kakushuchoujuukeikaku.html',
      },
    ],
  },
  {
    code: 'iwate',
    name: '岩手県',
    nameEn: 'Iwate',
    status: 'none',
    cases: [],
    validUntil: null,
    notes: [NONE_NOTE],
    sources: [
      {
        title: '岩手県「令和8年度岩手県における狩猟者登録の取扱い」',
        url: 'https://www.pref.iwate.jp/kurashikankyou/shizen/yasei/shuryou/1005508.html',
      },
    ],
  },
  {
    code: 'miyagi',
    name: '宮城県',
    nameEn: 'Miyagi',
    status: 'none',
    cases: [],
    validUntil: null,
    notes: [NONE_NOTE],
    sources: [
      { title: '宮城県「狩猟におけるルール」', url: 'https://www.pref.miyagi.jp/soshiki/sizenhogo/syuryourule.html' },
    ],
  },
  {
    code: 'akita',
    name: '秋田県',
    nameEn: 'Akita',
    status: 'none',
    cases: [],
    validUntil: null,
    notes: [NONE_NOTE],
    sources: [
      {
        title: '秋田県「令和７年度に秋田県内で狩猟をされる皆さまへ」',
        url: 'https://www.pref.akita.lg.jp/pages/archive/84844',
      },
    ],
  },
  {
    code: 'yamagata',
    name: '山形県',
    nameEn: 'Yamagata',
    status: 'none',
    cases: [],
    validUntil: null,
    notes: [NONE_NOTE],
    sources: [
      {
        title: '山形県「狩猟に伴う事故防止及び違法捕獲等の防止について」',
        url: 'https://www.pref.yamagata.jp/050011/kurashi/shizen/seibutsu/about_hunting/hunter_manners.html',
      },
    ],
  },
  {
    code: 'fukushima',
    name: '福島県',
    nameEn: 'Fukushima',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: 150,
        area: '阿武隈川以東の地域',
        areaQuote: '阿武隈川以東の地域',
        evidence: [
          {
            title: '福島県イノシシ管理計画（第4期）令和8年度実施計画',
            url: 'https://www.pref.fukushima.lg.jp/uploaded/life/886203_2609017_misc.pdf',
            quote:
              '阿武隈川以東の地域については、ツキノワグマの錯誤捕獲の可能性が低いことから、 引き続きイノシシの狩猟について、くくりわなの輪の直径の制限を 12 ㎝から 15 ㎝に緩和する。',
          },
        ],
      },
    ],
    validUntil: '2029-03-31',
    notes: ['阿武隈川以東でもツキノワグマの出現が見られるとして、生息状況に応じて緩和の廃止を検討するとしています。'],
    sources: [
      {
        title: '福島県イノシシ管理計画（第4期）（計画期間 令和6年4月1日から令和11年3月31日まで）',
        url: 'https://www.pref.fukushima.lg.jp/uploaded/life/886203_2608985_misc.pdf',
      },
    ],
  },
  {
    code: 'ibaraki',
    name: '茨城県',
    nameEn: 'Ibaraki',
    status: 'relaxed',
    cases: [
      {
        species: ['boar', 'deer'],
        limitMm: null,
        area: '県内全域',
        areaQuote: '県内全域',
        evidence: [
          {
            title: '茨城県「イノシシ・二ホンジカ猟の特例について」',
            url: 'https://www.pref.ibaraki.jp/seikatsukankyo/shizen/shizen/inoshishiryou.html',
            quote:
              '禁止猟法の一部解除…輪の直径が12センチメートル以上のくくりわなも使用可能になります。特例の期間 令和4年4月1日から令和9年3月31日まで 特例適用の範囲 県内全域',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: [
      '狩猟期間の延長の説明の中で「ツキノワグマの出没があった時は、くくりわなを撤去してください。」としています。',
    ],
    sources: [],
  },
  {
    code: 'tochigi',
    name: '栃木県',
    nameEn: 'Tochigi',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '一部地域（県の区域図では宇都宮市、真岡市、大田原市、さくら市、那須烏山市、益子町、茂木町、市貝町、芳賀町、高根沢町、那珂川町、小山市、下野市、上三川町、壬生町、野木町の16市町）',
        areaQuote: '一部地域',
        evidence: [
          {
            title: '栃木県「狩猟における安全確保、法令遵守の徹底について」',
            url: 'https://www.pref.tochigi.lg.jp/d04/eco/shizenkankyou/shizen/annzennkakuho-houreisonnsyu.html',
            quote:
              'ただし、一部地域（PDF：372KB）では、イノシシを捕獲するためにくくりわなを使用する場合、輪の直径が12センチを超えるものを使用することができます。',
          },
          {
            title:
              '栃木県「ニホンジカ・イノシシ狩猟期間延長区域／ニホンジカ・イノシシ捕獲に係るくくりわなの直径12cm規制解除区域」図（画像のみ）',
            url: 'https://www.pref.tochigi.lg.jp/d04/eco/shizenkankyou/shizen/documents/20260525105256.pdf',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '一部地域（県の区域図では宇都宮市、真岡市、大田原市、さくら市、那須烏山市、益子町、茂木町、市貝町、芳賀町、高根沢町、那珂川町、小山市、下野市、上三川町、壬生町、野木町の16市町）',
        areaQuote: '一部地域',
        evidence: [
          {
            title: '栃木県「狩猟における安全確保、法令遵守の徹底について」',
            url: 'https://www.pref.tochigi.lg.jp/d04/eco/shizenkankyou/shizen/annzennkakuho-houreisonnsyu.html',
            quote:
              'ただし、一部地域（PDF：372KB）では、イノシシを捕獲するためにくくりわなを使用する場合、輪の直径が12センチを超えるものを使用することができます。',
          },
          {
            title:
              '栃木県「ニホンジカ・イノシシ狩猟期間延長区域／ニホンジカ・イノシシ捕獲に係るくくりわなの直径12cm規制解除区域」図（画像のみ）',
            url: 'https://www.pref.tochigi.lg.jp/d04/eco/shizenkankyou/shizen/documents/20260525105256.pdf',
          },
        ],
        disputed:
          '県の案内文は「イノシシを捕獲するため」としていますが、区域図の表題は「ニホンジカ・イノシシ捕獲に係るくくりわなの直径12cm規制解除区域」です。資料が食い違うため、ニホンジカには当てはめず法令の基準で表示します。県に確かめてください。',
      },
    ],
    validUntil: null,
    notes: [],
    sources: [],
  },
  {
    code: 'gunma',
    name: '群馬県',
    nameEn: 'Gunma',
    status: 'none',
    cases: [],
    validUntil: null,
    notes: [NONE_NOTE],
    sources: [{ title: '群馬県「群馬県における狩猟のルール」', url: 'https://www.pref.gunma.jp/page/7144.html' }],
  },
  {
    code: 'saitama',
    name: '埼玉県',
    nameEn: 'Saitama',
    status: 'none',
    cases: [],
    validUntil: null,
    notes: [NONE_NOTE],
    sources: [
      {
        title: '埼玉県「埼玉県第二種特定鳥獣管理計画（イノシシ・ニホンジカ）」',
        url: 'https://www.pref.saitama.lg.jp/a0508/tyouzyu/tokutei.html',
      },
    ],
  },
  {
    code: 'chiba',
    name: '千葉県',
    nameEn: 'Chiba',
    status: 'relaxed',
    cases: [
      {
        species: ['boar', 'deer'],
        limitMm: 150,
        area: '県内（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '千葉県「イノシシ及びニホンジカの狩猟規制緩和のお知らせ」',
            url: 'http://www.pref.chiba.lg.jp/shizen/choujuu/syuryou/h29henkouten.html',
            quote:
              '千葉県では、イノシシ及びニホンジカについては、平成29年度の狩猟期より、足くくりわなに限り、直径が15cm以下のものについて使用を認めることとなりました。',
          },
        ],
        conditions: ['足くくりわなに限る'],
      },
    ],
    validUntil: null,
    notes: [],
    sources: [],
  },
  {
    code: 'tokyo',
    name: '東京都',
    nameEn: 'Tokyo',
    status: 'none',
    cases: [],
    validUntil: null,
    notes: [NONE_NOTE],
    sources: [
      {
        title: '東京都環境局「狩猟規制の緩和」（シカの狩猟期間の延長のみ）',
        url: 'https://www.kankyo.metro.tokyo.lg.jp/nature/animals_plants/deer/shooter',
      },
    ],
  },
  {
    code: 'kanagawa',
    name: '神奈川県',
    nameEn: 'Kanagawa',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '横浜市、川崎市、相模原市（緑区を除く）、横須賀市、鎌倉市、藤沢市、茅ヶ崎市、逗子市、三浦市、大和市、海老名市、座間市、綾瀬市、葉山町、寒川町、大磯町、二宮町のうち、鳥獣の保護及び管理並びに狩猟の適正化に関する法律第11条第1項に基づく狩猟可能区域',
        areaQuote:
          '横浜市、川崎市、相模原市（緑区を除く）、横須賀市、鎌倉市、藤沢市、茅ヶ崎市、逗子市、三浦市、大和市、海老名市、座間市、綾瀬市、葉山町、寒川町、大磯町、二宮町のうち、鳥獣の保護及び管理並びに狩猟の適正化に関する法律第11条第1項に基づく狩猟可能区域',
        evidence: [
          {
            title:
              '神奈川県「ニホンジカ及びイノシシの狩猟期間の延長及びイノシシに係るくくりわなの径の規制解除について」',
            url: 'https://www.pref.kanagawa.jp/docs/t4i/cnt/f986/documents/tokurei.html',
            quote:
              '猟法の禁止の一部を解除する区域 横浜市、川崎市、相模原市（緑区を除く）、横須賀市、鎌倉市、藤沢市、茅ヶ崎市、逗子市、三浦市、大和市、海老名市、座間市、綾瀬市、葉山町、寒川町、大磯町、二宮町のうち、鳥獣の保護及び管理並びに狩猟の適正化に関する法律第11条第1項に基づく狩猟可能区域 猟法の禁止の解除の内容 くくりわなの輪の直径が12センチメートルを超えるものを使用する方法を可とする。猟法の禁止の一部を解除する期間 令和5年11月15日から令和9年2月28日まで',
          },
        ],
      },
    ],
    validUntil: '2027-02-28',
    notes: [],
    sources: [],
  },
  {
    code: 'niigata',
    name: '新潟県',
    nameEn: 'Niigata',
    status: 'unconfirmed',
    cases: [],
    validUntil: null,
    notes: [UNCONFIRMED_NOTE],
    sources: [],
  },
  {
    code: 'toyama',
    name: '富山県',
    nameEn: 'Toyama',
    status: 'none',
    cases: [],
    validUntil: null,
    notes: [NONE_NOTE],
    sources: [
      {
        title: '富山県「狩猟をするには-安全狩猟のために-」',
        url: 'https://www.pref.toyama.jp/1709/kurashi/kankyoushizen/shizen/shuryou/anzenshuryou.html',
      },
    ],
  },
  {
    code: 'ishikawa',
    name: '石川県',
    nameEn: 'Ishikawa',
    status: 'none',
    cases: [],
    validUntil: null,
    notes: [NONE_NOTE],
    sources: [
      {
        title: '石川県「狩猟制度の概要」',
        url: 'https://www.pref.ishikawa.lg.jp/sizen/syuryou/r02shuryou-no-oshirase.html',
      },
    ],
  },
  {
    code: 'fukui',
    name: '福井県',
    nameEn: 'Fukui',
    status: 'none',
    cases: [],
    // The end of the fifth deer plan (1 April 2022 to 31 March 2027), the only source for 'none'.
    validUntil: '2027-03-31',
    notes: [
      'ニホンジカ管理計画は、くくりわなを設置する際は 12 cm 規制を徹底するとしています。イノシシについては資料で確認できていないため、未確認として法令の基準で表示します。',
    ],
    sources: [
      {
        title:
          '第５期 福井県第二種特定鳥獣管理計画（ニホンジカ）（計画の期間 令和4年（2022年）4月1日から令和9年（2027年）3月31日まで）',
        url: 'https://www.pref.fukui.lg.jp/doc/021500/tokuteikeikaku/tokutei_d/fil/5th_deer.pdf',
        quote: 'また、くくりわなを設置する際は、12 ㎝規制を徹底するとともに、以下の措置を徹底する。',
      },
    ],
    confirmedNoneFor: ['deer'],
  },
  {
    code: 'yamanashi',
    name: '山梨県',
    nameEn: 'Yamanashi',
    status: 'relaxed',
    cases: [
      {
        species: ['boar', 'deer'],
        limitMm: 200,
        area: '県内（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '山梨県「令和8年度狩猟者登録について」',
            url: 'https://www.pref.yamanashi.jp/shizen/toroku.html',
            quote:
              'ニホンジカまたはイノシシを捕獲するために使用するくくりわなの輪の直径は12センチメートル以下としていますが、ツキノワグマが冬眠に入るであろう時期から狩猟が終了する時期までの期間に限り20センチメートル以下に緩和します。令和8年度の情報は10月中に更新します。',
          },
        ],
        period: 'ツキノワグマが冬眠に入るであろう時期から狩猟が終了する時期まで（開始時期は毎年、狩猟期前に決定）',
        periodUndetermined: true,
      },
    ],
    validUntil: '2027-03-31',
    notes: [
      '根拠は令和8年度狩猟者登録の案内で、同じページに「令和8年度の情報は10月中に更新します」とあります。令和8年度の末日（2027-03-31）を過ぎたら期限切れとして扱います。',
      '期間外は法令の 12 cm 以下が適用されます。今年度の開始時期は県の案内で確かめてください。',
    ],
    sources: [],
  },
  {
    code: 'nagano',
    name: '長野県',
    nameEn: 'Nagano',
    status: 'relaxed',
    cases: [
      {
        species: ['deer'],
        limitMm: null,
        area: '県全域',
        areaQuote: '県全域',
        evidence: [
          {
            title: '長野県第二種特定鳥獣管理計画（第6期ニホンジカ管理）本文（計画期間 令和8年4月〜令和13年3月）',
            url: 'https://www.pref.nagano.lg.jp/yasei/sangyo/ringyo/choju/hogo/documents/honbun_nihonjika_6ki.pdf',
            quote:
              '県全域 ２ くくりわなの径（12 ㎝以下）の規制の解除※2 ツキノワグマの冬眠期にあたる 12 月 15 日から翌年 3 月 15 日までは、くくりわなの径（12cm 以下）の規制を解除する。',
          },
        ],
        period: '12月15日から翌年3月15日まで（計画期間の各狩猟期）',
        periodRanges: [
          { from: '2026-12-15', to: '2027-03-15' },
          { from: '2027-12-15', to: '2028-03-15' },
          { from: '2028-12-15', to: '2029-03-15' },
          { from: '2029-12-15', to: '2030-03-15' },
          { from: '2030-12-15', to: '2031-03-15' },
        ],
      },
    ],
    validUntil: '2031-03-31',
    notes: ['ニホンジカ管理計画の措置です。期間外は法令の 12 cm 以下が適用されます。'],
    sources: [],
  },
  {
    code: 'gifu',
    name: '岐阜県',
    nameEn: 'Gifu',
    status: 'none',
    cases: [],
    // The end of the third boar plan (1 April 2025 to 31 March 2030), the only source for 'none'.
    validUntil: '2030-03-31',
    notes: [
      'イノシシ管理計画は、くくりわなの径の制限を解除する区域は設けないとしています。ニホンジカについては資料で確認できていないため、未確認として法令の基準で表示します。',
    ],
    sources: [
      {
        title:
          '岐阜県 第二種特定鳥獣管理計画（イノシシ）第3期（計画期間 2025(令和７)年４月１日から2030(令和12)年３月31日まで）',
        url: 'https://www.pref.gifu.lg.jp/uploaded/attachment/440864.pdf',
        quote:
          'ほぼ県全域においてツキノワグマが目撃されていることから、錯誤捕獲を防止するため、くくりわなの径の制限を解除する区域は設けないこととする。',
      },
    ],
    confirmedNoneFor: ['boar'],
  },
  {
    code: 'shizuoka',
    name: '静岡県',
    nameEn: 'Shizuoka',
    status: 'relaxed',
    cases: [
      {
        species: ['boar', 'deer'],
        limitMm: null,
        area: '県内全域',
        areaQuote: '県内全域',
        evidence: [
          {
            title: '静岡県「令和8年度狩猟者登録」（「くくりわな」の輪の径12cm規制の一部緩和の表）',
            url: 'https://www.pref.shizuoka.jp/kurashikankyo/shizenkankyo/wild/1017690.html',
            quote:
              '(2)ニホンジカ又はイノシシを捕獲する場合 「くくりわな」の輪の径12cm規制の一部緩和 時期 区域 規制の有無 1月1日～2月28日 県内全域 規制なし（12cm超使用可能） 11月1日～12月31日及び3月1日～3月15日 東名高速道路(第一東海自動車道)より南側（海側） 規制なし（12cm超使用可能） 11月1日～12月31日及び3月1日～3月15日 東名高速道路(第一東海自動車道)より北側（山側） 規制あり（12cm超使用禁止）',
          },
        ],
        period: '1月1日～2月28日（令和8年度の狩猟期）',
        periodRanges: [{ from: '2027-01-01', to: '2027-02-28' }],
      },
      {
        species: ['boar', 'deer'],
        limitMm: null,
        area: '東名高速道路(第一東海自動車道)より南側（海側）',
        areaQuote: '東名高速道路(第一東海自動車道)より南側（海側）',
        evidence: [
          {
            title: '静岡県「令和8年度狩猟者登録」（「くくりわな」の輪の径12cm規制の一部緩和の表）',
            url: 'https://www.pref.shizuoka.jp/kurashikankyo/shizenkankyo/wild/1017690.html',
            quote:
              '(2)ニホンジカ又はイノシシを捕獲する場合 「くくりわな」の輪の径12cm規制の一部緩和 時期 区域 規制の有無 1月1日～2月28日 県内全域 規制なし（12cm超使用可能） 11月1日～12月31日及び3月1日～3月15日 東名高速道路(第一東海自動車道)より南側（海側） 規制なし（12cm超使用可能） 11月1日～12月31日及び3月1日～3月15日 東名高速道路(第一東海自動車道)より北側（山側） 規制あり（12cm超使用禁止）',
          },
        ],
        period: '11月1日～12月31日及び3月1日～3月15日（令和8年度の狩猟期）',
        periodRanges: [
          { from: '2026-11-01', to: '2026-12-31' },
          { from: '2027-03-01', to: '2027-03-15' },
        ],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '県内全域',
        areaQuote: '県内全域',
        evidence: [
          {
            title: '静岡県「令和8年度狩猟者登録」',
            url: 'https://www.pref.shizuoka.jp/kurashikankyo/shizenkankyo/wild/1017690.html',
            quote:
              'なお、上の表に関わらず、ニホンジカを捕獲する目的で、ニホンジカ以外の鳥獣の錯誤捕獲を予防する仕様のものを使用する場合は、狩猟期間を通じて県内全域で輪の径が12cm超のくくりわなを使用することができます。',
          },
          {
            title: '静岡県「令和8年度狩猟者登録」（ニホンジカとイノシシの狩猟期間の延長）',
            url: 'https://www.pref.shizuoka.jp/kurashikankyo/shizenkankyo/wild/1017690.html',
            quote: '延長期間 令和8年11月1日（日曜日）から令和9年3月15日（月曜日）',
          },
        ],
        period: '狩猟期間を通じて（令和8年度：令和8年11月1日から令和9年3月15日まで）',
        periodRanges: [{ from: '2026-11-01', to: '2027-03-15' }],
        conditions: ['ニホンジカを捕獲する目的で、ニホンジカ以外の鳥獣の錯誤捕獲を予防する仕様のものを使用する場合'],
      },
    ],
    validUntil: '2027-03-15',
    notes: [
      '根拠は令和8年度狩猟者登録の案内です。延長後の狩猟期間の終わり（令和9年3月15日）を過ぎたら期限切れとして扱います。',
      '表の期間外や東名高速道路より北側（山側）の 11月1日～12月31日及び3月1日～3月15日は、法令の 12 cm 以下です。',
    ],
    sources: [
      {
        title: '静岡県「令和8年度狩猟者登録」（ニホンジカとイノシシの狩猟期間の延長）',
        url: 'https://www.pref.shizuoka.jp/kurashikankyo/shizenkankyo/wild/1017690.html',
        quote: '延長期間 令和8年11月1日（日曜日）から令和9年3月15日（月曜日）',
      },
    ],
  },
  {
    code: 'aichi',
    name: '愛知県',
    nameEn: 'Aichi',
    status: 'unconfirmed',
    cases: [],
    validUntil: null,
    notes: [
      '県の案内は購入時にわなの規格を確かめるよう呼びかけるもので、緩和の有無は資料で確認できませんでした。法令の基準で表示します。',
    ],
    sources: [
      {
        title: '愛知県「出猟時に注意するポイント」',
        url: 'https://www.pref.aichi.jp/soshiki/shizen/syuryoutyuui.html',
        quote:
          'くくりわなについては、口径が12cmを超えるもの（有害捕獲用等）も販売されていますので、購入時にはわなの規格をよく確認しましょう。',
      },
    ],
  },
  {
    code: 'mie',
    name: '三重県',
    nameEn: 'Mie',
    status: 'none',
    cases: [],
    validUntil: null,
    notes: [NONE_NOTE],
    sources: [
      {
        title: '三重県「三重県で狩猟をされる狩猟者の皆様へ」',
        url: 'https://www.pref.mie.lg.jp/common/content/001103614.pdf',
        quote:
          'ツキノワグマの錯誤捕獲を防止するため、平成 30 年度から三重県内すべての地域において、くくりわなの輪の直径が 12cm を超えるものの使用が禁止になっていますのでご注意ください。',
      },
    ],
  },
  {
    code: 'shiga',
    name: '滋賀県',
    nameEn: 'Shiga',
    status: 'none',
    cases: [],
    validUntil: null,
    notes: [NONE_NOTE],
    sources: [
      { title: '滋賀県「野生鳥獣の保護管理の推進・狩猟の適正化」', url: 'https://www.pref.shiga.lg.jp/dg00/3576.html' },
    ],
  },
  {
    code: 'kyoto',
    name: '京都府',
    nameEn: 'Kyoto',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '京都市（北区、左京区及び右京区を除く。）、宇治市、城陽市、向日市、長岡京市、八幡市、京田辺市、木津川市、大山崎町、久御山町、井手町、宇治田原町、笠置町、和束町、精華町、南山城村',
        areaQuote:
          '京都市（北区、左京区及び右京区を除く。）、宇治市、城陽市、向日市、長岡京市、八幡市、京田辺市、木津川市、大山崎町、久御山町、井手町、宇治田原町、笠置町、和束町、精華町、南山城村',
        evidence: [
          {
            title: '京都府 第二種特定鳥獣管理計画（イノシシ）令和8年度事業実施計画',
            url: 'https://www.pref.kyoto.jp/choujyu/documents/boar.pdf',
            quote:
              '・くくりわなの輪の直径に関する制限（12cm）を一部地域で解除 制限解除地域：京都市（北区、左京区及び右京区を除く。）、宇治市、城陽市、向日市、長岡京市、八幡市、京田辺市、木津川市、大山崎町、久御山町、井手町、宇治田原町、笠置町、和束町、精華町、南山城村',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '京都市（北区、左京区及び右京区を除く。）、宇治市、城陽市、向日市、長岡京市、八幡市、京田辺市、木津川市、大山崎町、久御山町、井手町、宇治田原町、笠置町、和束町、精華町、南山城村',
        areaQuote:
          '京都市（北区、左京区及び右京区を除く。）、宇治市、城陽市、向日市、長岡京市、八幡市、京田辺市、木津川市、大山崎町、久御山町、井手町、宇治田原町、笠置町、和束町、精華町、南山城村',
        evidence: [
          {
            title: '京都府 第二種特定鳥獣管理計画（ニホンジカ）令和8年度事業実施計画',
            url: 'https://www.pref.kyoto.jp/choujyu/documents/deer.pdf',
            quote:
              'ツキノワグマが生息していない地域においては、直径 12cm までのくくりわなの制限を解除する。 制限解除地域：京都市（北区、左京区及び右京区を除く。）、宇治市、城陽市、向日市、長岡京市、八幡市、京田辺市、木津川市、大山崎町、久御山町、井手町、宇治田原町、笠置町、和束町、精華町、南山城村',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: ['上記以外の地域では法令の 12 cm 以下が適用されます。'],
    sources: [],
  },
  {
    code: 'osaka',
    name: '大阪府',
    nameEn: 'Osaka',
    status: 'relaxed',
    cases: [
      {
        species: ['boar', 'deer'],
        limitMm: null,
        area: '府内（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '大阪府「狩猟の規制・お知らせ」',
            url: 'https://www.pref.osaka.lg.jp/o120140/doubutu/yaseidoubutu/syuryo_kisei.html',
            quote: '大阪府では、シカ及びイノシシを狩猟で捕獲する場合は、直径12cmを越えるくくりワナを使用できます。',
          },
        ],
        conditions: ['ツキノワグマの出没が確認された場合は、くくりわなの使用を控える'],
      },
    ],
    validUntil: '2027-03-31',
    notes: [],
    sources: [
      {
        title: '大阪府「大阪府イノシシ第二種鳥獣管理計画について」',
        url: 'https://www.pref.osaka.lg.jp/o120140/doubutu/yaseidoubutu/inosisi.html',
      },
    ],
  },
  {
    code: 'hyogo',
    name: '兵庫県',
    nameEn: 'Hyogo',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '淡路地域3市、姫路市家島町',
        areaQuote: '淡路地域3市、姫路市家島町',
        evidence: [
          {
            title: '兵庫県「狩猟者の方へお知らせ」',
            url: 'https://web.pref.hyogo.lg.jp/nk20/info.html',
            quote:
              '兵庫県本州部ではくくりわなの輪の直径を12cm以下としていますが、淡路地域3市、姫路市家島町でのくくりわなの輪の直径の制限解除をしています。',
          },
          {
            title: '兵庫県 第3期イノシシ管理計画 令和8年度事業実施計画',
            url: 'https://web.pref.hyogo.lg.jp/nk27/documents/r8inosisi_hontai.pdf',
            quote: '直径 12cm を超えるくくりわなの使用制限を解除する（淡路地域と姫路市家島町のみ）。',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '淡路地域3市、姫路市家島町',
        areaQuote: '淡路地域3市、姫路市家島町',
        evidence: [
          {
            title: '兵庫県「狩猟者の方へお知らせ」',
            url: 'https://web.pref.hyogo.lg.jp/nk20/info.html',
            quote:
              '兵庫県本州部ではくくりわなの輪の直径を12cm以下としていますが、淡路地域3市、姫路市家島町でのくくりわなの輪の直径の制限解除をしています。',
          },
          {
            title: '兵庫県 第3期ニホンジカ管理計画 令和8年度事業実施計画',
            url: 'https://web.pref.hyogo.lg.jp/nk27/documents/r8nihonzika_hontai.pdf',
            quote: '直径 12cm を超えるくくりわなの使用制限を解除する(淡路地域、姫路市家島町のみ)。',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: ['本州部では法令の 12 cm 以下が適用されます。'],
    sources: [],
  },
  {
    code: 'nara',
    name: '奈良県',
    nameEn: 'Nara',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '計画の図 8-1 の区域（ツキノワグマの保護管理重点地域には適用しない）',
        areaQuote: 'ツキノワグマの保護管理重点地域には適用しない',
        evidence: [
          {
            title: '奈良県イノシシ第二種特定鳥獣管理計画（第5次）（第2回変更）',
            url: 'https://www.pref.nara.lg.jp/documents/7945/20260224152735.pdf',
            quote:
              'くくりわなについて輪の直径が 12cm 以内とする猟法で定められている制限の解除を継続する。なお、同制限の解除は、ツキノワグマ地域個体群保全の目的から、ツキノワグマの保護管理重点地域には適用しない',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '【対象地域】 奈良市 大和高田市 大和郡山市 天理市 橿原市 桜井市 五條市（吉野川以北） 御所市 生駒市 香芝市 葛城市 宇陀市 山添村 平群町 三郷町 斑鳩町 安堵町 川西町 三宅町 田原本町 曽爾村 御杖村 高取町 明日香村 上牧町 王寺町 広陵町 河合町 大淀町',
        areaQuote:
          '奈良市 大和高田市 大和郡山市 天理市 橿原市 桜井市 五條市（吉野川以北） 御所市 生駒市 香芝市 葛城市 宇陀市 山添村 平群町 三郷町 斑鳩町 安堵町 川西町 三宅町 田原本町 曽爾村 御杖村 高取町 明日香村 上牧町 王寺町 広陵町 河合町 大淀町',
        evidence: [
          {
            title: '奈良県ニホンジカ第二種特定鳥獣管理計画（第7次）（第1回変更）',
            url: 'https://www.pref.nara.lg.jp/documents/7945/20260224152733_1.pdf',
            quote:
              'くくりわなについて輪の直径が 12cm 以内とする猟法で定められている制限の解除を継続する。なお、同制限の解除は、ツキノワグマ地域個体群保全の目的から、ツキノワグマの保護管理重点地域には適用しない（図 8－1） 。 【対象地域】 奈良市 大和高田市 大和郡山市 天理市 橿原市 桜井市 五條市（吉野川以北） 御所市 生駒市 香芝市 葛城市 宇陀市 山添村 平群町 三郷町 斑鳩町 安堵町 川西町 三宅町 田原本町 曽爾村 御杖村 高取町 明日香村 上牧町 王寺町 広陵町 河合町 大淀町',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: ['令和6年10月の計画変更で、解除の区域から吉野町（吉野川以北）が除かれています。'],
    sources: [],
  },
  {
    code: 'wakayama',
    name: '和歌山県',
    nameEn: 'Wakayama',
    status: 'relaxed',
    cases: [
      {
        species: ['boar', 'deer'],
        limitMm: null,
        area: 'ツキノワグマ生息地を除く地区',
        areaQuote: 'ツキノワグマ生息地を除く地区',
        evidence: [
          {
            title: '和歌山県「狩猟の規制・ルール」',
            url: 'https://www.pref.wakayama.lg.jp/prefg/072000/d00216578.html',
            quote:
              '和歌山県では、ツキノワグマ生息地を除く地区に限り、イノシシ及びニホンジカを捕獲するために、注意看板を設置すれば、輪の直径が12cmを超えるくくりわなの使用を可とします。',
          },
        ],
        conditions: ['注意看板を設置すること'],
      },
    ],
    validUntil: '2027-03-31',
    notes: [],
    sources: [
      {
        title: '和歌山県 第二種特定鳥獣管理計画（イノシシ）第6期',
        url: 'https://www.pref.wakayama.lg.jp/prefg/072000/23kousin/d00216365_d/fil/inokeikaku.pdf',
      },
    ],
  },
  {
    code: 'tottori',
    name: '鳥取県',
    nameEn: 'Tottori',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '計画の区域（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '鳥取県第二種特定鳥獣（イノシシ）管理計画',
            url: 'https://www.pref.tottori.lg.jp/secure/312452/R04inoshishikanrikeikakuR04.pdf',
            quote: 'イノシシの狩猟において、くくりわなの輪の径の直径が 12 センチメートルを超えるものの使用を認める。',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '計画の区域（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '鳥取県第二種特定鳥獣（ニホンジカ）管理計画',
            url: 'https://www.pref.tottori.lg.jp/secure/312452/R04nihonzikakanrikeikakuR04.pdf',
            quote: 'シカの狩猟において、くくりわなの輪の直径が 12 センチメートルを超えるものの使用を認める。',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: ['クマの生息地域での錯誤捕獲には、ツキノワグマ管理計画に基づいて対応するとしています。'],
    sources: [],
  },
  {
    code: 'shimane',
    name: '島根県',
    nameEn: 'Shimane',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: 150,
        area: '島根県全域（ただし、隠岐地域及び国指定鳥獣保護区の区域を除く）（計画の管理区域）',
        areaQuote: '島根県全域（ただし、隠岐地域及び国指定鳥獣保護区の区域を除く）',
        evidence: [
          {
            title: '島根県 第二種特定鳥獣（イノシシ）管理計画',
            url: 'https://www.pref.shimane.lg.jp/industry/norin/choujyu_taisaku/chojuhogo.data/inosisi.pdf',
            quote: '４ 特定鳥獣の管理が行われる区域 島根県全域（ただし、隠岐地域及び国指定鳥獣保護区の区域を除く）',
          },
          {
            title: '島根県 第二種特定鳥獣（イノシシ）管理計画',
            url: 'https://www.pref.shimane.lg.jp/industry/norin/choujyu_taisaku/chojuhogo.data/inosisi.pdf',
            quote: 'の直径 15cm を超えるくくりわなの使用」に制限を一部解除する。',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: 150,
        area: '湖北地域と中国山地地域（計画はこの 2 地域での捕獲圧の強化としてこの措置を記載）。出雲北山地域では狩猟での捕獲を行わず、個体数の調整捕獲を実施するとしています。',
        areaQuote: '中国山地地域',
        evidence: [
          {
            title: '島根県 第二種特定鳥獣（ニホンジカ）管理計画',
            url: 'https://www.pref.shimane.lg.jp/industry/norin/choujyu_taisaku/chojuhogo.data/sika.pdf',
            quote:
              '特に湖北地域では被害対策を講じても農林業被害が発生している状況にあることや、中国山地地域でも、生息域の拡大や個体数が増加傾向にあることから、さらに捕獲圧を強め個体数を減少させる対策が必要である。 このため法に基づく禁止猟法である「輪の直径 12cm を超えるくくりわなの使用」を「輪の直径 15cm を超えるくくりわなの使用」に制限を一部解除する。',
          },
          {
            title: '島根県 第二種特定鳥獣（ニホンジカ）管理計画',
            url: 'https://www.pref.shimane.lg.jp/industry/norin/choujyu_taisaku/chojuhogo.data/sika.pdf',
            quote:
              '出雲北山地域においては、ニホンジカ捕獲禁止区域（～R4 年 10 月 31 日）を設定しており、管理目標頭数を定めて頭数管理を実施して行く。このため狩猟での捕獲を行わず、個体数の調整捕獲を実施する。',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: [],
    sources: [
      {
        title: '島根県 特定計画の概要',
        url: 'https://www.pref.shimane.lg.jp/industry/norin/choujyu_taisaku/chojuhogo.data/tokutei_gaiyou.pdf',
        quote: '狩猟によるくくりわなの輪の直径の制限を 12cm 以下から 15cm 以下に変更',
      },
    ],
  },
  {
    code: 'okayama',
    name: '岡山県',
    nameEn: 'Okayama',
    status: 'relaxed',
    cases: [
      {
        species: ['boar', 'deer'],
        limitMm: 150,
        area: '県内（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '岡山県「狩猟の適正化について（猟法に関する制限など）」',
            url: 'https://www.pref.okayama.jp/page/584993.html',
            quote:
              '岡山県では、イノシシ及びニホンジカを捕獲するために設置するくくりわなについては、輪の直径が15cm以下まで使用できるよう緩和しています。',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: [],
    sources: [
      {
        title: '岡山県 第6期 第二種特定鳥獣（イノシシ）管理計画',
        url: 'https://www.pref.okayama.jp/uploaded/life/799999_7506332_misc.pdf',
        quote: 'くくりわなの輪の直径に関する規制を 15 ㎝以下に緩和する。',
      },
    ],
  },
  {
    code: 'hiroshima',
    name: '広島県',
    nameEn: 'Hiroshima',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '県内（引用した記載に区域の限定なし）。ただし、くくりわなの架設が禁止されている区域を除く',
        areaQuote: null,
        evidence: [
          {
            title: '広島県「広島県で狩猟される皆さんへ【令和８年度】」',
            url: 'https://www.pref.hiroshima.lg.jp/uploaded/life/1147800_9815288_misc.pdf',
            quote:
              'イノシシ及び廿日市市宮島町を除くシカの捕獲に限り、くくりわなの輪の直径が１２ｃｍを超えるものの使用を可',
          },
          {
            title: '広島県「網猟・わな猟の皆様へ（お知らせとお願い）」',
            url: 'https://www.pref.hiroshima.lg.jp/uploaded/life/1147800_9815290_misc.pdf',
            quote:
              '次の区域は、くくりわなの架設が禁止されていますので、鳥獣保護区位置図により確認してください。 広島市安佐北区の一部、広島市佐伯区湯来町の一部、廿日市市吉和、安芸太田町一円、北広島町の一部',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '廿日市市宮島町を除く県内。ただし、くくりわなの架設が禁止されている区域を除く',
        areaQuote: '廿日市市宮島町を除く',
        evidence: [
          {
            title: '広島県「広島県で狩猟される皆さんへ【令和８年度】」',
            url: 'https://www.pref.hiroshima.lg.jp/uploaded/life/1147800_9815288_misc.pdf',
            quote:
              'イノシシ及び廿日市市宮島町を除くシカの捕獲に限り、くくりわなの輪の直径が１２ｃｍを超えるものの使用を可',
          },
          {
            title: '広島県「網猟・わな猟の皆様へ（お知らせとお願い）」',
            url: 'https://www.pref.hiroshima.lg.jp/uploaded/life/1147800_9815290_misc.pdf',
            quote:
              '次の区域は、くくりわなの架設が禁止されていますので、鳥獣保護区位置図により確認してください。 広島市安佐北区の一部、広島市佐伯区湯来町の一部、廿日市市吉和、安芸太田町一円、北広島町の一部',
          },
        ],
      },
    ],
    validUntil: null,
    notes: [
      '次の区域はくくりわなの架設そのものが禁止されています：広島市安佐北区の一部、広島市佐伯区湯来町の一部、廿日市市吉和、安芸太田町一円、北広島町の一部（鳥獣保護区位置図で確認）。',
    ],
    sources: [],
  },
  {
    code: 'yamaguchi',
    name: '山口県',
    nameEn: 'Yamaguchi',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: 150,
        area: '山口県全域',
        areaQuote: '山口県全域',
        evidence: [
          {
            title: '山口県 第5期 第二種特定鳥獣（イノシシ）管理計画',
            url: 'https://www.pref.yamaguchi.lg.jp/uploaded/attachment/110826.pdf',
            quote: '４ 管理を行う区域 山口県全域とする。',
          },
          {
            title: '山口県 第5期 第二種特定鳥獣（イノシシ）管理計画',
            url: 'https://www.pref.yamaguchi.lg.jp/uploaded/attachment/110826.pdf',
            quote: '法が定める 12cm 以内から 15cm 以内に緩和する。',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: 150,
        area: '山口県全域',
        areaQuote: '山口県全域',
        evidence: [
          {
            title: '山口県 第5期 第二種特定鳥獣（ニホンジカ）管理計画',
            url: 'https://www.pref.yamaguchi.lg.jp/uploaded/attachment/110825.pdf',
            quote: '４ 管理を行う区域 山口県全域とする。',
          },
          {
            title: '山口県 第5期 第二種特定鳥獣（ニホンジカ）管理計画',
            url: 'https://www.pref.yamaguchi.lg.jp/uploaded/attachment/110825.pdf',
            quote: '法が定める1 2㎝以内から1 5㎝以内に緩和する。',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: [
      'ツキノワグマの恒常的生息区域で出没が頻繁に見られる地域では、くくりわなを撤去するか輪の直径を 12 cm 以内とするよう指導するとしています。',
    ],
    sources: [],
  },
  {
    code: 'tokushima',
    name: '徳島県',
    nameEn: 'Tokushima',
    status: 'relaxed',
    cases: [
      {
        species: ['boar', 'deer'],
        limitMm: null,
        area: 'ツキノワグマ生息地を除く（解除していない場所は鳥獣保護区等位置図で確認）',
        areaQuote: 'ツキノワグマ生息地を除',
        evidence: [
          {
            title: '徳島県「狩猟者のみなさまへ」',
            url: 'https://www.pref.tokushima.lg.jp/ippannokata/kurashi/shizen/7314041',
            quote:
              '輪の最小内径（楕円形の場合は短い方の内径）が12cmを超えるくくりわなは使用禁止となっていますが、徳島県では、第二種特定鳥獣管理計画（ニホンジカ適正管理計画及びイノシシ適正管理計画）により、ツキノワグマ生息地を除き、規制を解除しています。',
          },
        ],
      },
    ],
    validUntil: null,
    notes: [],
    sources: [],
  },
  {
    code: 'kagawa',
    name: '香川県',
    nameEn: 'Kagawa',
    status: 'relaxed',
    cases: [
      {
        species: ['boar', 'deer'],
        limitMm: null,
        area: '香川県内',
        areaQuote: '香川県内',
        evidence: [
          {
            title: '香川県「香川県で狩猟をされる皆さんへ」',
            url: 'https://www.pref.kagawa.lg.jp/documents/58379/ryuiten.pdf',
            quote:
              'なお、香川県内でイノシシ及びニホンジカを捕獲する場合、足くくりわなに限定して、①の輪の直径 12 センチメートル以内の制限を令和９年３月 31 日まで解除しています。',
          },
        ],
        conditions: ['足くくりわなに限る'],
      },
    ],
    validUntil: '2027-03-31',
    notes: ['小豆郡一円ではニホンジカの狩猟による捕獲が禁止されています。'],
    sources: [],
  },
  {
    code: 'ehime',
    name: '愛媛県',
    nameEn: 'Ehime',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '計画の区域（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '第5次愛媛県イノシシ適正管理計画',
            url: 'https://www.pref.ehime.jp/uploaded/attachment/95555.pdf',
            quote: 'イノシシについては、輪の直径が 12cm を超えるくくりわなによる狩猟を認める。',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '計画の区域（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '第4次愛媛県ニホンジカ適正管理計画',
            url: 'https://www.pref.ehime.jp/uploaded/attachment/95557.pdf',
            quote: 'シカについては、輪の直径が 12cm を超えるくくりわなによる狩猟を認める。',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: [],
    sources: [],
  },
  {
    code: 'kochi',
    name: '高知県',
    nameEn: 'Kochi',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: 'ツキノワグマの生息地域を除く（計画の図 12 の区域）',
        areaQuote: 'ツキノワグマの生息地域を除',
        evidence: [
          {
            title: '第5期 高知県第二種特定鳥獣（イノシシ）管理計画',
            url: 'https://www.pref.kochi.lg.jp/doc/2022033100074/file_contents/file_inoshishikeikaku.pdf',
            quote:
              'イノシシについては、輪の直径が 12cm を越えるくくりわなによる狩猟を認めることとします。ただしツキノワグマの生息地域を除きます（図 12）。',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: 'ツキノワグマの生息地域を除く（計画の図 18 の区域）',
        areaQuote: 'ツキノワグマの生息地域を除',
        evidence: [
          {
            title: '第5期 高知県第二種特定鳥獣（ニホンジカ）管理計画',
            url: 'https://www.pref.kochi.lg.jp/doc/2022033100074/file_contents/file_nihonjikakeikaku.pdf',
            quote:
              'シカについては、輪の直径が 12cm を越えるくくりわなによる狩猟を認めることとします。ただしツキノワグマの生息地域を除きます（図 18）',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: [],
    sources: [],
  },
  {
    code: 'fukuoka',
    name: '福岡県',
    nameEn: 'Fukuoka',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '計画の区域（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '福岡県第二種特定鳥獣（イノシシ）管理計画（第7期）',
            url: 'https://www.pref.fukuoka.lg.jp/uploaded/life/674008_61639184_misc.pdf',
            quote:
              'イノシシについて、輪の直径が 12 センチメートルを超えるくくりわなによる捕獲を認めることとする。ただし、架設の際には、事故がないよう架設場所等十分に配慮するものとする。',
          },
        ],
        conditions: ['架設の際には、事故がないよう架設場所等に十分配慮する'],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '計画の区域（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '福岡県第二種特定鳥獣（シカ）管理計画（第6期）',
            url: 'https://www.pref.fukuoka.lg.jp/uploaded/life/674008_61639189_misc.pdf',
            quote:
              'ニホンジカについて、輪の直径が 12 センチメートルを超えるくくりわなによる捕獲を認めることとする。ただし、架設の際には、事故がないよう架設場所等十分に配慮するものとする。',
          },
        ],
        conditions: ['架設の際には、事故がないよう架設場所等に十分配慮する'],
      },
    ],
    validUntil: '2027-03-31',
    notes: [],
    sources: [],
  },
  {
    code: 'saga',
    name: '佐賀県',
    nameEn: 'Saga',
    status: 'relaxed',
    cases: [
      {
        species: ['boar', 'deer'],
        limitMm: null,
        area: '県内（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '佐賀県「狩猟における注意点」',
            url: 'https://www.pref.saga.lg.jp/kiji00319401/index.html',
            quote:
              'くくりわなは、締め付け防止金具が装着されていないもの、よりもどしが装着されていないもの、ワイヤーの直径が4mm未満であるものは使用禁止です。 ※佐賀県はくくりわなの輪の直径が12cm以内とする制限を解除しています。',
          },
        ],
      },
    ],
    validUntil: null,
    notes: [
      '県の案内は獣種を書いていません。よりもどし・ワイヤー 4 mm の基準（イノシシ・ニホンジカに係る基準）と並べて記載されているため、イノシシ・ニホンジカについて表示しています。',
    ],
    sources: [],
  },
  {
    code: 'nagasaki',
    name: '長崎県',
    nameEn: 'Nagasaki',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '計画の区域（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '長崎県 第二種特定鳥獣（イノシシ）管理計画',
            url: 'https://www.pref.nagasaki.jp/uploads/2022/03/1648516515.pdf',
            quote:
              'イノシシについては、輪の直径が12㎝を超えるくくりわなによる狩猟が全国的に禁止されているが、これを認めることとする。',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '計画の区域（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '長崎県 第二種特定鳥獣（ニホンジカ）管理計画',
            url: 'https://www.pref.nagasaki.jp/uploads/2022/03/1648516539.pdf',
            quote:
              'シカについては、輪の直径が12㎝を超えるくくりわなによる狩猟が全国的に禁止されているが、これを認めることとする。',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: [],
    sources: [],
  },
  {
    code: 'kumamoto',
    name: '熊本県',
    nameEn: 'Kumamoto',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '計画の区域（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '熊本県 第二種特定鳥獣管理計画（イノシシ）第4期',
            url: 'https://www.pref.kumamoto.jp/uploaded/attachment/176104.pdf',
            quote: '輪の直径が１２ｃｍを超える「くくりわな」による狩猟の規制を解除する。',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '計画の区域（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '熊本県 第二種特定鳥獣管理計画（ニホンジカ）第6期',
            url: 'https://www.pref.kumamoto.jp/uploaded/attachment/299383.pdf',
            quote: '輪の直径が１２ｃｍを超える「くくりわな」による狩猟の規制を解除する。',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: [],
    sources: [],
  },
  {
    code: 'oita',
    name: '大分県',
    nameEn: 'Oita',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '計画の区域（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '大分県 第二種特定鳥獣（イノシシ）管理計画（第3期）',
            url: 'https://www.pref.oita.jp/uploaded/attachment/2136680.pdf',
            quote: '輪の直径が１２ｃｍを超えるくくりわなによるイノシシの捕獲を可能とする',
          },
        ],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '計画の区域（引用した記載に区域の限定なし）',
        areaQuote: null,
        evidence: [
          {
            title: '大分県 第二種特定鳥獣（ニホンジカ）管理計画（第3期）',
            url: 'https://www.pref.oita.jp/uploaded/attachment/2136678.pdf',
            quote: '輪の直径が１２ｃｍを超えるくくりわなによるニホンジカの捕獲を可能とする',
          },
        ],
      },
    ],
    validUntil: '2027-03-31',
    notes: [],
    sources: [],
  },
  {
    code: 'miyazaki',
    name: '宮崎県',
    nameEn: 'Miyazaki',
    status: 'relaxed',
    cases: [
      {
        species: ['boar'],
        limitMm: null,
        area: '県内全域',
        areaQuote: '県内全域',
        evidence: [
          {
            title: '宮崎県第二種特定鳥獣（イノシシ）管理計画',
            url: 'https://www.pref.miyazaki.lg.jp/documents/67222/67222_20220303152519-1.pdf',
            quote:
              'イノシシ等の捕獲をするため、くくりわなを使用する方法のうち輪の直径が12㎝を超えるものは禁止猟法となっているが、イノシシについて、足くくりわなに限りこの規制を解除する。対象とする区域は、県内全域とする。',
          },
        ],
        conditions: ['足くくりわなに限る'],
      },
      {
        species: ['deer'],
        limitMm: null,
        area: '県内全域',
        areaQuote: '県内全域',
        evidence: [
          {
            title: '宮崎県第二種特定鳥獣（ニホンジカ）管理計画',
            url: 'https://www.pref.miyazaki.lg.jp/documents/67222/67222_20220303152423-1.pdf',
            quote:
              'シカ等の捕獲をするため、くくりわなを使用する方法のうち輪の直径が12㎝を超えるものは禁止猟法となっているが、シカについて、足くくりわなに限りこの規制を解除する。対象とする区域は、県内全域とする。',
          },
        ],
        conditions: ['足くくりわなに限る'],
      },
    ],
    validUntil: '2027-03-31',
    notes: [],
    sources: [],
  },
  {
    code: 'kagoshima',
    name: '鹿児島県',
    nameEn: 'Kagoshima',
    status: 'relaxed',
    cases: [
      {
        species: ['boar', 'deer'],
        limitMm: null,
        area: '第二種特定鳥獣管理計画の対象地域（イノシシは一部の島を除く県内、ニホンジカは出水山地などの計画地域、ヤクシカは屋久島）',
        areaQuote: '第二種特定鳥獣管理計画の対象地域',
        evidence: [
          {
            title: '鹿児島県「第二種特定鳥獣（イノシシ，ニホンジカ，ヤクシカ）管理計画を策定しました」',
            url: 'https://www.pref.kagoshima.jp/ad04/dainisyutokuteityoujyuukanrikeikaku.html',
            quote:
              '輪の直径が12センチメートルを越えるくくりわなによる捕獲を認める。また，「締め付け防止金具」を装着したくくりわなの制限を解除し，「締め付け防止機能」を装備したくくりわなの使用を認める。 【注意事項】 上記の規制緩和は，第二種特定鳥獣管理計画の対象地域において，対象となる鳥獣（イノシシ，ニホンジカ，ヤクシカ）を狩猟により捕獲する場合のみに適用されるもの',
          },
        ],
        conditions: ['「締め付け防止金具」に代えて「締め付け防止機能」を装備したくくりわなも使用できる'],
      },
    ],
    validUntil: '2027-03-31',
    notes: [],
    sources: [],
  },
  {
    code: 'okinawa',
    name: '沖縄県',
    nameEn: 'Okinawa',
    status: 'unconfirmed',
    cases: [],
    validUntil: null,
    notes: [UNCONFIRMED_NOTE],
    sources: [],
  },
];
