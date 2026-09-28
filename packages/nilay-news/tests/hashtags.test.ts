// SPDX-License-Identifier: MIT
import { describe, expect, test } from "vitest";

import sources from "../sources.json" with { type: "json" };
import { hashtags } from "../src/hashtags.ts";

const CEEK = "CEEK｜狩猟・銃・射撃・ジビエ";
const YAHOO = "Yahoo!ニュース｜地域";
const YAHOO_URL = `https://news.yahoo.co.jp/articles/${"a".repeat(40)}`;
const ROUNDUP = {
  sourceName: "鳥獣ニュース",
  excerpt:
    "鳥獣ニュース(2026年 9月21日) で紹介されたリンク（リンク先の本文・公開日は未取得）",
  metadata: {
    roundupUrl: "https://roundup.example.com/2026/09/1.html",
    roundupTitle: "鳥獣ニュース(2026年 9月21日)",
  },
};
const TAG = /^#[\p{L}\p{M}\p{N}_]+$/u;

describe("ordered publisher, region and topic tags", () => {
  test.each([
    [
      "newspaper from a CEEK headline",
      {
        sourceName: CEEK,
        url: "https://www.kochinews.co.jp/article/detail/1047753",
        title:
          "牛串や煮込みに舌鼓!お肉どっぷりフェスタ 9/27まで高知市 (高知新聞)",
        excerpt: "... 県内産のブランド肉やジビエの料理を楽しむ",
        topic: "ジビエ",
        analysisStatus: "done" as const,
      },
      ["#高知新聞", "#高知県", "#高知市", "#ジビエ"],
    ],
    [
      "broadcaster from a Yahoo headline",
      {
        sourceName: YAHOO,
        url: YAHOO_URL,
        title:
          "東北道下り線でシカとみられる動物と接触する事故 乗用車など5台絡む 宮城・栗原市(tbc東北放送)",
      },
      ["#tbc東北放送", "#宮城県", "#栗原市", "#事件事故", "#シカ"],
    ],
    [
      "ministry from its configured source",
      {
        sourceName: "環境省｜報道発表",
        url: "https://www.env.go.jp/press/press_05540.html",
        title:
          "令和８年度市街地等におけるクマ対策に係る技術導入実証事業の公募について",
        topic: "制度・行政",
        analysisStatus: "done" as const,
      },
      ["#環境省", "#クマ", "#鳥獣被害対策"],
    ],
    [
      "association from its configured source",
      {
        sourceName: "日本ライフル射撃協会｜お知らせ",
        url: "https://www.riflesports.jp/2026/09/77421/",
        title: "JRSF認定D級コーチ資格取得講習会について（2026年9月27日開催）",
        topic: "射撃競技",
        analysisStatus: "done" as const,
      },
      ["#日本ライフル射撃協会", "#射撃競技"],
    ],
    [
      "ministry in charge of an e-Gov consultation",
      {
        sourceName: "e-Gov｜パブコメ募集",
        url: "https://public-comment.e-gov.go.jp/pcm/detail?CLASSNAME=PCMMSTDETAIL&id=1",
        title:
          "鳥獣の保護及び管理並びに狩猟の適正化に関する法律施行規則の一部を改正する省令案に関する意見募集",
        metadata: { caseId: "1", status: "受付中", agency: "環境省自然環境局" },
      },
      ["#環境省", "#狩猟", "#パブコメ"],
    ],
    [
      "site of a roundup link, whose synthetic excerpt is ignored",
      {
        ...ROUNDUP,
        url: "https://www.fnn.jp/articles/-/1114023",
        title:
          "広島・三次市議会 深刻 クマ連日出没 １軒の農園だけでナシ５０００個以上被害か…対策強化求め緊急決議",
      },
      [
        "#FNNプライムオンライン",
        "#広島県",
        "#三次市",
        "#クマ",
        "#鳥獣被害対策",
      ],
    ],
    [
      "Google News publisher suffix",
      {
        sourceName: "Google ニュース｜狩猟・鳥獣・ジビエ",
        url: "https://news.google.com/rss/articles/CBMi?oc=5",
        title: "宮城・加美町でイノシシ捕獲 - 河北新報",
        excerpt: "宮城・加美町でイノシシ捕獲  河北新報",
      },
      ["#河北新報", "#宮城県", "#加美町", "#イノシシ", "#鳥獣被害対策"],
    ],
  ])("%s", (_name, article, expected) => {
    expect(hashtags(article)).toEqual(expected);
  });

  test("every configured source is either a publisher or an aggregator", () => {
    const publishers = Object.fromEntries(
      sources.map((source) => [
        source.id,
        hashtags({
          sourceName: source.name,
          url: source.url,
          title: "お知らせ",
        }),
      ]),
    );
    expect(publishers).toEqual({
      "google-1": [],
      "google-2": [],
      "ceek-1": [],
      "ceek-2": [],
      "ceek-3": [],
      "tyoujuu-blog": [],
      kanpo: ["#官報"],
      "egov-comments": [],
      "egov-results": [],
      "npa-notifications": ["#警察庁"],
      "env-news": ["#環境省"],
      "env-press": ["#環境省"],
      "maff-press": ["#農林水産省"],
      "rinya-press": ["#林野庁"],
      "npa-bills": ["#警察庁"],
      "env-bills": ["#環境省"],
      "mof-tax": ["#財務省"],
      "mof-bills": ["#財務省"],
      "yahoo-domestic": [],
      "yahoo-local": [],
      "yahoo-science": [],
      "riflesports-news": ["#日本ライフル射撃協会"],
      "clay-shooting-news": ["#日本クレー射撃協会"],
      "gibier-news": ["#日本ジビエ振興協会"],
    });
  });
});

describe("publisher", () => {
  const publisher = (title: string, url = YAHOO_URL, sourceName = YAHOO) =>
    hashtags({ title, url, sourceName })[0] ?? null;

  test.each([
    ["見出し(TBS NEWS DIG Powered by JNN)", "#TBSNEWSDIG"],
    ["見出し(テレビ朝日系（ANN）)", "#ANN"],
    ["見出し(メ〜テレ（名古屋テレビ）)", "#名古屋テレビ"],
    ["見出し(Abema TIMES)", "#ABEMATIMES"],
    ["見出し(ＹＢＳ山梨放送)", "#YBS山梨放送"],
    ["見出し(共同通信)", "#共同通信"],
    ["見出し(NHK)", "#NHK"],
    ["見出し(ABEMA)", "#ABEMA"],
  ])("attribution %j", (title, expected) => {
    expect(publisher(title)).toBe(expected);
  });

  test.each([
    ["a note", "見出し(写真)", YAHOO_URL, YAHOO],
    [
      "a portal's own label",
      "見出し(Yahoo!ニュース オリジナル THE PAGE)",
      YAHOO_URL,
      YAHOO,
    ],
    [
      "punctuation in the name",
      "見出し (日刊SPA!)",
      "https://nikkan-spa.jp/1",
      CEEK,
    ],
    [
      "a mention or hashtag",
      "見出し (@evil #tag)",
      "https://a.example.jp/1",
      CEEK,
    ],
    [
      "a Yahoo link without attribution",
      "新製品の発売",
      YAHOO_URL,
      "鳥獣ニュース",
    ],
    [
      "an unknown site",
      "新製品の発売",
      "https://shuchi.php.co.jp/article/1",
      "鳥獣ニュース",
    ],
    [
      "a lookalike host",
      "新製品の発売",
      "https://evilnhk.or.jp/news/1",
      "鳥獣ニュース",
    ],
    [
      "a host only prefixed by a known one",
      "新製品の発売",
      "https://nhk.or.jp.evil.test/1",
      "鳥獣ニュース",
    ],
    [
      "credentials before a known host",
      "新製品の発売",
      "https://nhk.or.jp@evil.test/1",
      "鳥獣ニュース",
    ],
    [
      "a press release on a news site",
      "新製品の発売",
      "https://www.jiji.com/jc/article?k=1&g=prt",
      "鳥獣ニュース",
    ],
    [
      "a label outside an aggregator feed",
      "総会の開催(臨時)",
      "https://a.example.jp/1",
      "鳥獣ニュース",
    ],
    ["an unrecognized label", "見出し(Forbes JAPAN)", YAHOO_URL, YAHOO],
    [
      "a long arbitrary suffix",
      "見出し(これは記事の補足説明であり出典の表記ではありません)",
      YAHOO_URL,
      YAHOO,
    ],
    [
      "an aggregator's own name",
      "新製品の発売",
      "https://news.google.com/rss/articles/x",
      "Google ニュース｜狩猟",
    ],
  ])("none for %s", (_name, title, url, sourceName) => {
    expect(hashtags({ title, url, sourceName })).toEqual([]);
  });

  test("a known site is identified by its host or a subdomain", () => {
    expect(
      publisher("クマ出没", "https://www3.nhk.or.jp/news/1", "鳥獣ニュース"),
    ).toBe("#NHK");
    expect(
      publisher(
        "クマ出没",
        "https://www.jiji.com/jc/article?k=1",
        "鳥獣ニュース",
      ),
    ).toBe("#時事通信");
  });

  test("a parenthesized phrase that is not an outlet stays evidence", () => {
    expect(
      hashtags({
        title: "狩猟免許試験（受験者向け）",
        url: YAHOO_URL,
        sourceName: YAHOO,
      }),
    ).toEqual(["#狩猟"]);
    expect(
      hashtags({
        title: "説明会（北海道の猟友会向け）",
        url: YAHOO_URL,
        sourceName: YAHOO,
      }),
    ).toEqual(["#北海道", "#狩猟"]);
    expect(
      hashtags({
        title: "クマ出没（北海道）",
        url: YAHOO_URL,
        sourceName: YAHOO,
      }),
    ).toEqual(["#北海道", "#クマ"]);
  });

  test("explicit attribution outranks the site's network brand", () => {
    expect(
      publisher(
        "見出し (北海道文化放送)",
        "https://www.fnn.jp/articles/-/1",
        CEEK,
      ),
    ).toBe("#北海道文化放送");
  });

  test("untrusted source names and agencies must be one token", () => {
    expect(
      hashtags({ title: "お知らせ", sourceName: "悪い #名前｜x" }),
    ).toEqual([]);
    for (const agency of ["警察庁、環境省", "@evil省", "#環境省"])
      expect(
        hashtags({
          title: "お知らせ",
          sourceName: "e-Gov｜パブコメ募集",
          metadata: { agency },
        }),
      ).toEqual([]);
    const tags = hashtags({
      title: "クマ出没 (悪意\u202eテレビ\u0000)",
      url: "https://a.example.jp/1",
      sourceName: CEEK,
      excerpt: "https://evil.example/ @x #y",
    });
    expect(tags).toEqual(["#クマ"]);
  });

  test.each([123, null, ["環境省"], { name: "環境省" }])(
    "a non-string imported agency %j gives no publisher",
    (agency) => {
      const article = {
        title: "お知らせ",
        sourceName: "e-Gov｜パブコメ募集",
        metadata: { agency },
      } as unknown as Parameters<typeof hashtags>[0];
      expect(hashtags(article)).toEqual([]);
    },
  );
});

describe("regions", () => {
  const places = (title: string, excerpt = "") =>
    hashtags({ title, excerpt }).filter(
      (tag) =>
        !["#クマ", "#イノシシ", "#サル", "#事件事故", "#鳥獣被害対策"].includes(
          tag,
        ),
    );

  test.each([
    ["Hokkaido and a town", "正面衝突〈北海道音更町〉", ["#北海道", "#音更町"]],
    [
      "a prefecture, district and town",
      "岩手県上閉伊郡大槌町の林野火災",
      ["#岩手県", "#大槌町"],
    ],
    [
      "a leading bare prefecture",
      "神奈川 温泉街にサル 湯河原町で被害",
      ["#神奈川県", "#湯河原町"],
    ],
    [
      "a bare prefecture joined to a city",
      "広島・三次市議会が決議",
      ["#広島県", "#三次市"],
    ],
    ["a trailing bare prefecture", "全線で運転再開 山梨", ["#山梨県"]],
    ["a hiragana town", "せたな町でヒグマ目撃", ["#北海道", "#せたな町"]],
    ["the longest name", "北上市で説明会", ["#岩手県", "#北上市"]],
    [
      "the longest name before a shorter one",
      "東村山市で説明会",
      ["#東京都", "#東村山市"],
    ],
    ["a designated city's ward", "札幌市中央区でクマ", ["#北海道", "#札幌市"]],
    [
      "small ke spelled either way",
      "茅ケ崎市で説明会",
      ["#神奈川県", "#茅ヶ崎市"],
    ],
    [
      "a city of the stated prefecture",
      "広島県府中市でイノシシ",
      ["#広島県", "#府中市"],
    ],
    ["an ambiguous city alone", "府中市でイノシシ", ["#府中市"]],
    ["an ambiguous town alone", "森町でクマ", ["#森町"]],
    ["a shared ward name alone", "北区で説明会", []],
    ["two prefectures", "千葉県と神奈川県で被害", ["#千葉県", "#神奈川県"]],
    [
      "two possible parents of a city",
      "東京都と広島県府中市でクマを目撃",
      ["#東京都", "#広島県"],
    ],
    [
      "Tokyo and a city after its name",
      "東京都町田市で説明会",
      ["#東京都", "#町田市"],
    ],
    ["a university name", "東京都市大学が研究", []],
    ["a newspaper name", "北海道新聞の調べで判明", []],
    ["a bare name inside a phrase", "京都の大学生が博物館", []],
    ["a two-character name inside a word", "新栄町の商店街", []],
    ["a reference point", "台風は那覇市の東約140kmを北上", []],
    [
      "a bare prefecture after a dash",
      "「Tokyo Tokyo Delicious Museum」に出展——東京・お台場で国産ジビエをPR",
      ["#東京都", "#ジビエ"],
    ],
    ["a bare prefecture after a colon", "速報：長野 クマ目撃", ["#長野県"]],
    ["a surname", "福島さんが講演", []],
    ["a surname with a title", "千葉氏が就任", []],
    ["a common spelling of 塩竈", "宮城・塩釜市でクマ", ["#宮城県", "#塩竈市"]],
    ["another spelling of 塩竈", "塩竃市でクマ", ["#宮城県", "#塩竈市"]],
  ])("%s", (_name, title, expected) => {
    expect(places(title)).toEqual(expected);
  });

  test("an excerpt adds a municipality of the headline's only prefecture", () => {
    expect(places("北海道でクマを目撃", "札幌市の公園で目撃された。")).toEqual([
      "#北海道",
      "#札幌市",
    ]);
    expect(places("北海道でクマを目撃", "青森市でも目撃された。")).toEqual([
      "#北海道",
    ]);
    expect(places("北海道でクマを目撃", "福島県伊達市で目撃された。")).toEqual([
      "#北海道",
    ]);
    expect(places("東京都でクマを目撃", "広島県府中市で目撃された。")).toEqual([
      "#東京都",
    ]);
    expect(places("北海道でクマを目撃", "... 札幌市の公園で")).toEqual([
      "#北海道",
    ]);
    expect(
      hashtags({
        ...ROUNDUP,
        title: "北海道でクマを目撃",
        excerpt: "札幌市で目撃。",
      }),
    ).toEqual(["#北海道", "#クマ"]);
    expect(
      hashtags({
        title: "北海道でクマを目撃 (札幌市民新聞)",
        excerpt: "札幌市民新聞によると。",
        url: "https://a.example.jp/1",
        sourceName: CEEK,
      }),
    ).toEqual(["#札幌市民新聞", "#北海道", "#クマ"]);
  });

  test("an excerpt adds full names only when the headline has none", () => {
    expect(
      places("能登の被災地を視察", "11年ぶりに石川県で開催された。"),
    ).toEqual(["#石川県"]);
    expect(places("高知市でフェスタ", "北海道の町でも開催。")).toEqual([
      "#高知県",
      "#高知市",
    ]);
    expect(places("大会の結果", "... 北海道の選手")).toEqual([]);
    expect(places("大会の結果", "宮城 の選手")).toEqual([]);
  });

  test("attribution names never supply a place", () => {
    for (const title of [
      "クマが出没 (北海道新聞)",
      "全線で運転再開 (HTB北海道ニュース)",
    ])
      expect(
        hashtags({ title, url: "https://a.example.jp/1", sourceName: CEEK }),
      ).not.toContain("#北海道");
    expect(
      hashtags({ title: "総会の開催", sourceName: "静岡県猟友会｜お知らせ" }),
    ).toEqual(["#静岡県猟友会"]);
    expect(hashtags({ title: "見出し(北海道)" })).toEqual(["#北海道"]);
    expect(
      hashtags({
        ...ROUNDUP,
        title: "ニュース一覧",
        url: "https://a.example.jp/1",
      }),
    ).toEqual([]);
  });
});

describe("topics", () => {
  const topics = (article: Parameters<typeof hashtags>[0]) => hashtags(article);

  test("a stale analysis and body do not supply tags", () => {
    expect(
      topics({ title: "お知らせ", topic: "ジビエ", analysisStatus: "pending" }),
    ).toEqual([]);
    expect(
      topics({ title: "お知らせ", topic: "ジビエ", analysisStatus: "done" }),
    ).toEqual(["#ジビエ"]);
    const withBody = { title: "お知らせ", body: "クマ" } as Parameters<
      typeof hashtags
    >[0];
    expect(topics(withBody)).toEqual([]);
  });

  test.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
    "an unknown stored topic %j gives no tag",
    (topic) => {
      expect(
        topics({ title: "お知らせ", topic, analysisStatus: "done" }),
      ).toEqual([]);
    },
  );

  test("a non-string stored topic gives no tag", () => {
    const article = {
      title: "お知らせ",
      topic: ["ジビエ"],
      analysisStatus: "done",
    } as unknown as Parameters<typeof hashtags>[0];
    expect(topics(article)).toEqual([]);
  });

  test("at most two topics after the source and places, without duplicates", () => {
    expect(
      topics({
        title: "和歌山・有田川町でクマに襲われけが 猟友会が駆除",
        excerpt: "クマに襲われた。",
        topic: "鳥獣被害・管理",
        analysisStatus: "done",
      }),
    ).toEqual(["#和歌山県", "#有田川町", "#事件事故", "#クマ"]);
    expect(
      topics({
        title: "国産ジビエをPR",
        topic: "ジビエ",
        analysisStatus: "done",
      }),
    ).toEqual(["#ジビエ"]);
  });

  test("the headline outranks the excerpt", () => {
    expect(
      topics({ title: "射撃大会の結果", excerpt: "会場近くでクマ出没。" }),
    ).toEqual(["#射撃競技", "#クマ"]);
    expect(
      topics({
        title: "新作ゲーム発売",
        excerpt: "... 貯め込んでしまうハンターも",
      }),
    ).toEqual([]);
  });

  test.each([
    ["猟銃事件で逮捕", ["#事件事故", "#狩猟"]],
    ["捕獲したシカを有効活用 獣皮で財布", ["#シカ", "#野生鳥獣活用"]],
    ["シカを地域資源として活用", ["#シカ", "#野生鳥獣活用"]],
    ["シカの解体見学", ["#シカ", "#野生鳥獣活用"]],
    ["鳥獣利活用の取り組み", ["#野生鳥獣活用"]],
    ["熊本県でデータを活用", ["#熊本県"]],
    ["鹿児島県の公共施設を有効活用", ["#鹿児島県"]],
    ["家屋の解体見学", []],
    ["和牛の食肉処理施設", []],
    ["クマ対策にAIを活用", ["#クマ", "#鳥獣被害対策"]],
    ["ゴキブリ駆除の新技術", []],
    ["マルウェアを駆除", []],
    ["農作物の獣害防止へ電気柵", ["#鳥獣被害対策"]],
    ["法案の意見募集", ["#パブコメ", "#制度改正"]],
    ["狩猟免許試験", ["#狩猟"]],
    ["熊が出没", ["#クマ"]],
    ["鹿の捕獲", ["#シカ", "#鳥獣被害対策"]],
    ["熊本県の狩猟免許試験", ["#熊本県", "#狩猟"]],
    ["鹿児島県の射撃大会", ["#鹿児島県", "#射撃競技"]],
    ["猪名川町で会議", ["#兵庫県", "#猪名川町"]],
    ["ニホンカモシカの報告例増", []],
    ["シカゴで開幕", []],
    ["クマタカとクマゼミの観察会", []],
    ["モンスターハンターの新作", []],
    ["プラスチックハンターが活躍", []],
    ["元狩猟採集民の映像", []],
    ["原発事故時の計画", []],
  ])("%j", (title, expected) => {
    expect(topics({ title })).toEqual(expected);
  });

  test("an association's name is not a topic", () => {
    expect(
      topics({
        title: "日本ジビエ振興協会 総会のお知らせ",
        sourceName: "日本ジビエ振興協会｜お知らせ",
      }),
    ).toEqual(["#日本ジビエ振興協会"]);
    expect(
      topics({
        title: "日本ライフル射撃協会 理事会",
        sourceName: "日本ライフル射撃協会｜お知らせ",
      }),
    ).toEqual(["#日本ライフル射撃協会"]);
  });

  test("every tag is a single valid token", () => {
    for (const title of [
      "猟銃・散弾銃の事件、事故！",
      "北海道・札幌市で「クマ」出没？ (テレビ・北海道)",
      "#タグ @someone https://example.net/ $X",
    ])
      for (const tag of hashtags({
        title,
        sourceName: CEEK,
        url: "https://a.example.jp/1",
      }))
        expect(tag).toMatch(TAG);
  });
});
