// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { UserError } from "../src/errors.ts";
import { parseDocument, textOf } from "../src/html/tree.ts";
import { parseQs, urlsplit } from "../src/net/url.ts";
import { PDF_NOTE } from "../src/sources/bills.ts";
import { loadSources } from "../src/sources/config.ts";
import { detailUrl, ORIGIN } from "../src/sources/egov.ts";
import { plain } from "../src/sources/feed.ts";
import { collectSource } from "../src/sources/index.ts";
import type {
  Collection,
  FetchResult,
  SourceConfig,
  SourceFetch,
} from "../src/sources/types.ts";
import { utf8 } from "../src/text.ts";
import { allText, parseXml, XmlError } from "../src/xml.ts";

const FIXTURES = new URL("fixtures/", import.meta.url);
const read = (name: string) =>
  new Uint8Array(readFileSync(new URL(`${name}.html`, FIXTURES)));
const text = (data: Uint8Array) => new TextDecoder().decode(data);

/** Invalid configurations are deliberately outside the SourceConfig type. */
function untyped(source: Record<string, unknown>): SourceConfig {
  return source as unknown as SourceConfig;
}

function config(
  kind: SourceConfig["kind"],
  url: string,
  options: Partial<SourceConfig> = {},
): SourceConfig {
  return {
    id: "test",
    name: "収集テスト",
    description: "テスト",
    url,
    kind,
    enabled: true,
    ...options,
  };
}

type Response = Uint8Array | string | Error | FetchResult;

/** A fetch replaying fixed responses and recording requested URLs. */
function replay(
  route: (url: string) => Response | undefined,
  contentType = "text/html",
) {
  const calls: string[] = [];
  const fetch: SourceFetch = async (url) => {
    calls.push(url);
    const response = route(url);
    if (response === undefined) throw new Error(`unexpected fetch ${url}`);
    if (response instanceof Error) throw response;
    if (typeof response === "string")
      return { data: utf8(response), url, contentType };
    if (response instanceof Uint8Array)
      return { data: response, url, contentType };
    return response;
  };
  return { fetch, calls };
}

const forbidden: SourceFetch = () => {
  throw new Error("must not fetch");
};

/** Acquisition problems, as opposed to expected coverage notes. */
const alerts = (result: Collection) =>
  result.warnings.filter((warning) => !result.notes.includes(warning));

describe("RSS and Atom", () => {
  const collect = async (body: string | Uint8Array, maxItems?: number) =>
    (
      await collectSource(
        config("rss", "https://example.com/feed", maxItems ? { maxItems } : {}),
        replay(() => body, "application/rss+xml").fetch,
      )
    ).items;

  test("CDATA, dates and tracking parameters", async () => {
    expect(
      await collect(`<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0"><channel><title>ニュース</title><item>
        <title><![CDATA[クマ出没 &amp; 対策]]></title>
        <link>https://example.com/news?id=17&amp;utm_source=rss#top</link>
        <description><![CDATA[<p>市が<b>対策</b>を発表。</p><script>alert(1)</script><p>続報です。</p>]]></description>
        <pubDate>Sun, 27 Sep 2026 09:30:00 +0900</pubDate>
        </item></channel></rss>`),
    ).toEqual([
      {
        title: "クマ出没 & 対策",
        url: "https://example.com/news?id=17",
        excerpt: "市が対策を発表。 続報です。",
        publishedAt: "2026-09-27T00:30:00Z",
      },
    ]);
  });

  test("Atom alternate link and published date", async () => {
    const [item] =
      await collect(`<feed xmlns="http://www.w3.org/2005/Atom"><entry>
        <title>狩猟者向けのお知らせ</title><link rel="self" href="https://example.com/atom/1"/>
        <link rel="alternate" href="/news/1"/><summary type="html">&lt;p&gt;講習会の案内&lt;/p&gt;</summary>
        <published>2026-09-26T23:00:00+09:00</published><updated>2026-09-27T03:00:00Z</updated>
        </entry></feed>`);
    expect(item).toMatchObject({
      url: "https://example.com/news/1",
      excerpt: "講習会の案内",
      publishedAt: "2026-09-26T14:00:00Z",
    });
  });

  test("RDF with a Dublin Core date", async () => {
    const [item] =
      await collect(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <item><title>鳥獣被害の統計を公表</title><link>https://example.com/1</link><dc:date>2026-09-27T12:00:00+09:00</dc:date></item></rdf:RDF>`);
    expect(item?.publishedAt).toBe("2026-09-27T03:00:00Z");
  });

  test.each(["invalid", "2026-09-27T12:00:00", "2026-99-99", ""])(
    "invalid or missing date %j stays unknown",
    async (date) => {
      const [item] = await collect(
        `<rss><channel><item><title>Title</title><link>https://example.com/1</link><pubDate>${date}</pubDate></item></channel></rss>`,
      );
      expect(item?.publishedAt).toBeNull();
    },
  );

  test("guid is a link only when it is a permalink", async () => {
    expect(
      (
        await collect(
          "<rss><channel><item><title>Title</title><guid>https://example.com/1</guid></item></channel></rss>",
        )
      )[0]?.url,
    ).toBe("https://example.com/1");
    await expect(
      collect(
        '<rss><channel><item><title>Title</title><guid isPermaLink="false">https://example.com/1</guid></item></channel></rss>',
      ),
    ).rejects.toThrow("RSS/Atom に取得可能な記事リンクがありません");
  });

  test("duplicate and unsafe links are dropped", async () => {
    const rows = [
      "https://example.com/1?utm_source=a",
      "javascript:alert(1)",
      "https://example.com/1",
      "http://127.0.0.1/admin",
    ]
      .map((url) => `<item><title>Title</title><link>${url}</link></item>`)
      .join("");
    expect(await collect(`<rss><channel>${rows}</channel></rss>`)).toHaveLength(
      1,
    );
  });

  test.each([
    ["<rss>", "RSS/Atom を解析できません"],
    ["<html><body>Login</body></html>", "別形式のページ"],
    ["<rss/>", "channel がありません"],
    ['<!DOCTYPE rss [<!ENTITY x "news">]><rss><channel/></rss>', "DTD"],
    ["<!doctype rss><rss><channel/></rss>", "DTD"],
    [
      "<rss><channel><item><title>&nbsp;</title></item></channel></rss>",
      "RSS/Atom を解析できません",
    ],
    ["<rss><channel><x:item/></channel></rss>", "RSS/Atom を解析できません"],
    ["<rss></rss><rss></rss>", "RSS/Atom を解析できません"],
  ])("malformed or non-feed %j is an explicit error", async (body, message) => {
    await expect(collect(body)).rejects.toThrow(message);
  });

  test("a DTD hidden by UTF-16 NUL bytes is still rejected", async () => {
    const body = '<!DOCTYPE rss [<!ENTITY x "news">]><rss/>';
    const data = new Uint8Array([
      0xff,
      0xfe,
      ...[...body].flatMap((char) => [char.charCodeAt(0), 0]),
    ]);
    await expect(collect(data)).rejects.toThrow("DTD");
  });

  test("a valid empty feed has no results", async () => {
    expect(
      await collect(
        "<rss><channel><title>Zero results</title></channel></rss>",
      ),
    ).toEqual([]);
  });

  test("item and text limits", async () => {
    const row = (index: number) =>
      `<item><title>${"猟".repeat(700)}</title><link>https://example.com/${index}</link><description>${"文".repeat(2000)}</description></item>`;
    const items = await collect(
      `<rss><channel>${Array.from({ length: 110 }, (_, index) => row(index)).join("")}</channel></rss>`,
    );
    expect(items).toHaveLength(100);
    expect(items[0]?.title).toHaveLength(500);
    expect(items[0]?.excerpt).toHaveLength(1500);
    expect(
      await collect(
        `<rss><channel>${row(1)}${row(2)}${row(3)}</channel></rss>`,
        2,
      ),
    ).toHaveLength(2);
  });

  test("declared legacy encodings are decoded", async () => {
    const body = new Uint8Array([
      ...utf8(
        '<?xml version="1.0" encoding="Shift_JIS"?><rss><channel><item><title>',
      ),
      0x83,
      0x4e,
      0x83,
      0x7d, // クマ
      ...utf8(
        "</title><link>https://example.com/1</link></item></channel></rss>",
      ),
    ]);
    expect((await collect(body))[0]?.title).toBe("クマ");
  });
});

describe("XML and HTML primitives", () => {
  test("namespaces, CDATA and character references build a plain tree", () => {
    const root = parseXml(
      utf8(
        '<a xmlns:x="urn:x" x:k="1" k="2">t&#x41;<![CDATA[<b>]]><x:c>d</x:c></a>',
      ),
    );
    expect(root.name).toBe("a");
    expect([...root.attrs]).toEqual([
      ["{urn:x}k", "1"],
      ["k", "2"],
    ]);
    expect(allText(root)).toBe("tA<b>d");
  });

  test.each([
    "<a>",
    "<a></b>",
    "<a>&unknown;</a>",
    '<a b="1" b="2"/>',
    "<a>\u0001</a>",
    "text",
    '<?xml version="1.0"?>',
  ])("malformed XML %j is rejected", (xml) => {
    expect(() => parseXml(utf8(xml))).toThrow(XmlError);
  });

  test("invalid UTF-8 is rejected", () => {
    expect(() =>
      parseXml(
        new Uint8Array([0x3c, 0x61, 0x3e, 0xff, 0x3c, 0x2f, 0x61, 0x3e]),
      ),
    ).toThrow(XmlError);
  });

  test("plain text drops scripts, keeps block breaks and decodes references", () => {
    expect(
      plain(
        "<p>AT&amp;T</p><script>x</script><div>a<br>b</div><style>p{}</style>&lt;tag&gt;",
        100,
      ),
    ).toBe("AT&T a b <tag>");
    expect(plain("a".repeat(10), 3)).toBe("aaa");
  });

  test("documents omit hidden subtrees and close unclosed elements", () => {
    const root = parseDocument(
      "<main><nav><p>menu</p></nav><p>one<p>two</main><footer>x",
      new Set(["nav", "footer"]),
    );
    expect(textOf(root)).toBe("one two");
    expect(root.children).toHaveLength(1);
  });
});

describe("HTML headline pages", () => {
  const collect = async (body: string, allowedPathPattern: string) =>
    (
      await collectSource(
        config("html", "https://example.com/feed", { allowedPathPattern }),
        replay(() => body, "text/html; charset=utf-8").fetch,
      )
    ).items;

  test("navigation, duplicates, other hosts and heading dates", async () => {
    const items = await collect(
      `<html><nav><a href="/press/123.html">メニューにある記事リンク</a></nav>
        <h2>2026年9月27日発表</h2><a href="/press/234.html?utm_source=menu">クマ出没への対策を発表しました</a>
        <a href="/press/234.html">同じ記事への重複するリンクです</a>
        <a href="https://other.example.com/press/111.html">外部のプレスリリースの記事です</a>
        <a href="/about/index.html">環境省の組織についての紹介です</a>
        <h2>2026年9月26日発表</h2><a href="/press/235.html">鳥獣保護の計画を更新しました</a></html>`,
      "^/press/\\d+\\.html",
    );
    expect(items).toEqual([
      {
        title: "クマ出没への対策を発表しました",
        url: "https://example.com/press/234.html",
        excerpt: "",
        publishedAt: "2026-09-26T15:00:00Z",
      },
      {
        title: "鳥獣保護の計画を更新しました",
        url: "https://example.com/press/235.html",
        excerpt: "",
        publishedAt: "2026-09-25T15:00:00Z",
      },
    ]);
  });

  test("Japanese-era year heading and a month/day label", async () => {
    const items = await collect(
      '<h2>令和8年9月分</h2><p>9月25日</p><dl><dt>基本政策</dt><dd><a href="./rural/260925.html">鳥獣被害の防止に関する方針を発表</a></dd></dl>',
      "^/rural/",
    );
    expect(items[0]?.publishedAt).toBe("2026-09-24T15:00:00Z");
  });

  test("a table row date does not leak into the next row", async () => {
    const items = await collect(
      `<table><tr><td>令和８年９月２５日</td><td><a href="/laws/1.pdf">猟銃に関する新しい通達の発表</a></td></tr>
        <tr><td>日付不明</td><td><a href="/laws/2.pdf">猟銃に関する別の通達の発表</a></td></tr></table>`,
      "^/laws/",
    );
    expect(items.map((item) => item.publishedAt)).toEqual([
      "2026-09-24T15:00:00Z",
      null,
    ]);
  });

  test("short titles and the PDF label are not headlines", async () => {
    const items = await collect(
      '<a href="/n/1">短い</a><a href="/n/2">通達の発表についてPDFファイルを開く</a>',
      "^/n/",
    );
    expect(items.map((item) => item.title)).toEqual(["通達の発表について"]);
  });

  test("an unexpected page is an error", async () => {
    await expect(
      collect("<html><h1>メンテナンス中</h1></html>", "^/news/"),
    ).rejects.toThrow("見出し");
  });

  test("declared charset is honoured and invalid bytes are an error", async () => {
    const source = config("html", "https://example.org/list", {
      allowedPathPattern: "^/article",
    });
    // Japanese characters in Shift_JIS, then ASCII.
    const sjis = new Uint8Array([
      ...utf8('<a href="/article">'),
      0x83,
      0x4e,
      0x83,
      0x7d,
      ...utf8(" sighting headline</a>"),
    ]);
    const result = await collectSource(
      source,
      replay(() => ({
        data: sjis,
        url: source.url,
        contentType: "text/html; charset=shift_jis",
      })).fetch,
    );
    expect(result.items[0]?.title).toBe("クマ sighting headline");
    const meta = new Uint8Array([...utf8('<meta charset="cp932">'), ...sjis]);
    expect(
      (await collectSource(source, replay(() => meta).fetch)).items,
    ).toHaveLength(1);
    await expect(
      collectSource(source, replay(() => sjis).fetch),
    ).rejects.toThrow("文字コード");
  });

  test("non-HTML, oversized and unsafe redirects are errors", async () => {
    const source = config("html", "https://example.org/list", {
      allowedPathPattern: "^/article",
    });
    const body = '<a href="/article">対象となるニュースの見出し</a>';
    await expect(
      collectSource(
        source,
        replay(() => ({
          data: utf8(body),
          url: source.url,
          contentType: "application/pdf",
        })).fetch,
      ),
    ).rejects.toThrow("別形式");
    await expect(
      collectSource(source, replay(() => new Uint8Array(5_000_001)).fetch),
    ).rejects.toThrow("5 MB");
    await expect(
      collectSource(
        source,
        replay(() => ({
          data: utf8(body),
          url: "http://127.0.0.1/",
          contentType: "text/html",
        })).fetch,
      ),
    ).rejects.toThrow("転送先");
  });
});

describe("source kinds", () => {
  test("gazette collection is always disabled and blocked sources are never fetched", async () => {
    await expect(
      collectSource(config("kanpo", "https://www.kanpo.go.jp/"), forbidden),
    ).rejects.toThrow("官報の自動収集は停止しています");
    await expect(
      collectSource(
        config("rss", "https://example.org/rss", {
          collectionBlocked: "robots stop",
        }),
        forbidden,
      ),
    ).rejects.toThrow("robots stop");
    await expect(
      collectSource(
        untyped({ kind: "ftp", url: "https://example.org/" }),
        forbidden,
      ),
    ).rejects.toThrow("未対応の収集形式です");
  });

  test("RSS and HTML collections carry no coverage warnings", async () => {
    const result = await collectSource(
      config("rss", "https://example.org/rss"),
      replay(
        () =>
          "<rss><channel><item><title>Test</title><link>https://example.org/article</link></item></channel></rss>",
      ).fetch,
    );
    expect(result).toEqual({
      items: [
        {
          title: "Test",
          url: "https://example.org/article",
          excerpt: "",
          publishedAt: null,
        },
      ],
      warnings: [],
      notes: [],
    });
  });
});

describe("RSS roundup links", () => {
  const FEED = "https://roundup.example.com/feeds/posts/default?alt=rss";
  const roundup = new Uint8Array(
    readFileSync(new URL("roundup-feed.xml", FIXTURES)),
  );
  const collect = (
    body: string | Uint8Array,
    options: Partial<SourceConfig> = {},
  ) =>
    collectSource(
      config("rss", FEED, { feedContent: "links", ...options }),
      replay(() => body, "application/rss+xml").fetch,
    );
  const rss = (description: string) =>
    `<rss version="2.0"><channel><item><title>まとめ</title>
    <link>https://roundup.example.com/2026/09/1.html</link>
    <description><![CDATA[${description}]]></description></item></channel></rss>`;

  test("each external link is an item titled by its own headline", async () => {
    const result = await collect(roundup);
    expect(result.warnings).toEqual([]);
    expect(result.items.map(({ title, url }) => [title, url])).toEqual([
      [
        "静岡 山から人里へ…ニホンカモシカの報告例増",
        "https://news.example.jp/article/1",
      ],
      [
        "長野 登山中にクマの親子と遭遇",
        "https://news.yahoo.co.jp/articles/3cc4bfea28bf4ab82b9da68fff4987d9596475bf",
      ],
      // No headline of its own: neither the previous headline nor "（共同）".
      ["https://paper.example.jp/a/2", "https://paper.example.jp/a/2"],
      ["福井 有害獣を狩猟し加工する企業", "https://paper.example.jp/a/3"],
      ["北海道 ヒグマ計画を改定", "https://www.hokkaido.example.jp/article/4/"],
      ["埼玉 けもの相談所がクマ対策講座", "https://news.example.jp/article/5"],
    ]);
  });

  test("the roundup is attribution only, not the article date", async () => {
    const { items } = await collect(roundup);
    expect(items.some((item) => item.url.includes("roundup.example.com"))).toBe(
      false,
    );
    // The repeated link keeps the newest roundup's headline and attribution.
    expect(items[0]).toEqual({
      title: "静岡 山から人里へ…ニホンカモシカの報告例増",
      url: "https://news.example.jp/article/1",
      excerpt:
        "鳥獣ニュース(2026年 9月28日) で紹介されたリンク（リンク先の本文・公開日は未取得）",
      publishedAt: null,
      metadata: {
        roundupUrl: "https://roundup.example.com/2026/09/2026-928.html",
        roundupTitle: "鳥獣ニュース(2026年 9月28日)",
        roundupPublishedAt: "2026-09-27T15:30:00Z",
      },
    });
    expect(items.at(-1)?.metadata?.roundupUrl).toBe(
      "https://roundup.example.com/2026/09/2026-927.html",
    );
  });

  test("maxItems bounds individual links with a coverage note", async () => {
    const result = await collect(roundup, { maxItems: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.warnings).toEqual([
      "記事リンク 6 件のうち新しい投稿から 2 件だけ取得しました",
    ]);
    expect(alerts(result)).toEqual([]);
  });

  test("headlines never carry over between links or blocks", async () => {
    const { items } = await collect(
      rss(`<p>本日のニュース</p><ul>
        <li><a href="https://a.example.jp/1">https://a.example.jp/1</a></li>
        <li><a href="https://a.example.jp/2">https://a.example.jp/2</a> 続報</li>
        <li>見出しと同じ行 <a href="https://a.example.jp/3">https://a.example.jp/3</a></li>
        <li>https://a.example.jp/4) 補足</li>
        <li>見出し https://roundup.example.com/x http://127.0.0.1/ https://a.example.jp/5</li></ul>`),
    );
    expect(items.map(({ title, url }) => [title, url])).toEqual([
      ["本日のニュース", "https://a.example.jp/1"],
      ["https://a.example.jp/2", "https://a.example.jp/2"],
      ["見出しと同じ行", "https://a.example.jp/3"],
      ["https://a.example.jp/4", "https://a.example.jp/4"],
      ["見出し", "https://a.example.jp/5"],
    ]);
  });

  test("malformed URLs are skipped without losing other links", async () => {
    const result = await collect(
      rss(`<div>壊れたリンク</div><a href="https://[invalid/">https://[invalid/</a>
        <div>見出し一</div><a href="https://a.example.jp/1">https://a.example.jp/1</a>
        <div>見出し二 https://[bad/x https://a.example.jp/2</div>`).replace(
        "</channel>",
        `<item><title>壊れた投稿</title><link>https://[broken/</link>
        <description><![CDATA[<a href="https://a.example.jp/3">https://a.example.jp/3</a>]]></description></item></channel>`,
      ),
    );
    expect(result.items.map(({ title, url }) => [title, url])).toEqual([
      ["見出し一", "https://a.example.jp/1"],
      ["見出し二", "https://a.example.jp/2"],
    ]);
    expect(alerts(result)).toEqual([
      "1 件の投稿から記事リンクを抽出できませんでした。本文の構成を確認してください",
    ]);
  });

  test("a roundup without external links is an error, not an item", async () => {
    await expect(
      collect(rss(`<div>鳥獣ニュース</div><a href="/about">about</a>`)),
    ).rejects.toThrow("記事リンクを抽出できません");
    const partial = await collect(
      rss(
        `<div>見出し</div><a href="https://a.example.jp/1">https://a.example.jp/1</a>`,
      ).replace(
        "</channel>",
        "<item><title>空</title><link>https://roundup.example.com/2</link><description>休刊</description></item></channel>",
      ),
    );
    expect(partial.items.map((item) => item.title)).toEqual(["見出し"]);
    expect(alerts(partial)).toEqual([
      "1 件の投稿から記事リンクを抽出できませんでした。本文の構成を確認してください",
    ]);
  });

  test("without the option a roundup stays one feed entry", async () => {
    const { items } = await collectSource(
      config("rss", FEED),
      replay(() => roundup, "application/rss+xml").fetch,
    );
    expect(items.map((item) => item.url)).toEqual([
      "https://roundup.example.com/2026/09/2026-928.html",
      "https://roundup.example.com/2026/09/2026-927.html",
    ]);
    expect(items[0]?.metadata).toBeUndefined();
  });
});

describe("source configuration", () => {
  const good = {
    id: "test",
    name: "Test",
    description: "Test feed",
    url: "https://example.com/feed",
    kind: "rss",
    enabled: true,
  };

  test("the bundled configuration", async () => {
    const sources = loadSources(
      JSON.parse(
        readFileSync(new URL("../sources.json", import.meta.url), "utf8"),
      ),
    );
    expect(sources).toHaveLength(24);
    expect(sources.filter((source) => source.kind === "rss")).toHaveLength(12);
    const byId = new Map(sources.map((source) => [source.id, source]));
    for (const id of [
      "env-news",
      "npa-bills",
      "env-bills",
      "mof-bills",
      "mof-tax",
      "yahoo-domestic",
      "yahoo-local",
      "yahoo-science",
      "riflesports-news",
      "clay-shooting-news",
      "gibier-news",
    ]) {
      expect(byId.get(id)?.enabled).toBe(true);
    }
    expect(byId.get("tyoujuu-blog")).toMatchObject({
      kind: "rss",
      enabled: true,
      feedContent: "links",
      maxItems: 100,
      minCollectionMinutes: 1440,
    });
    expect(byId.get("kanpo")).toMatchObject({
      enabled: false,
      minCollectionMinutes: 1440,
    });
    expect(byId.get("kanpo")?.collectionBlocked).toBeTruthy();
    expect(
      sources.filter((source) => source.feedContent).map((source) => source.id),
    ).toEqual(["tyoujuu-blog"]);
    expect(
      sources.some((source) => source.enabled && source.kind === "html"),
    ).toBe(true);
    expect(
      sources.some((source) => {
        const { hostname } = new URL(source.url);
        return hostname === "nifty.com" || hostname.endsWith(".nifty.com");
      }),
    ).toBe(false);
  });

  test.each([
    [[good, good]],
    [[{ ...good, url: "http://localhost/" }]],
    [[{ ...good, enabled: "yes" }]],
    [[{ ...good, maxItems: 101 }]],
    [[{ ...good, feedContent: "entries" }]],
    [[{ ...good, feedContent: true }]],
    [
      [
        {
          ...good,
          kind: "html",
          allowedPathPattern: "^/news/",
          feedContent: "links",
        },
      ],
    ],
    [[{ ...good, kind: "html" }]],
    [[{ ...good, kind: "html", allowedPathPattern: "^(" }]],
    [[{ ...good, kind: "bills", agency: "env" }]],
    [[{ ...good, kind: "bills", agency: [] }]],
    [
      [
        {
          ...good,
          kind: "bills",
          agency: "env",
          url: "https://www.env.go.jp/info/hoan/",
          maxSessions: 4,
        },
      ],
    ],
    [
      [
        {
          ...good,
          kind: "bills",
          agency: "mof",
          url: "https://www.mof.go.jp/about_mof/bills/",
          maxDetails: true,
        },
      ],
    ],
    [{}],
    [[]],
  ])("invalid configuration %j", (value) => {
    expect(() => loadSources(value)).toThrow(UserError);
  });
});

const BILL_URLS = {
  npa: "https://www.npa.go.jp/laws/kokkai/index.html",
  env: "https://www.env.go.jp/info/hoan/",
  mof: "https://www.mof.go.jp/about_mof/bills/",
  "mof-tax": "https://www.mof.go.jp/tax_policy/tax_reform/outline/",
} as const;
type Agency = keyof typeof BILL_URLS;

function billSource(
  agency: Agency,
  options: Record<string, unknown> = {},
): SourceConfig {
  return untyped({ ...config("bills", BILL_URLS[agency]), agency, ...options });
}

function billFetch(agency: Agency, overrides: Record<string, Response> = {}) {
  const session = text(read("bills-mof-session"));
  const pages: Record<string, Response> = {
    [BILL_URLS[agency]]: read(
      agency === "mof-tax" ? "bills-tax" : `bills-${agency}`,
    ),
    "https://www.env.go.jp/info/hoan/index2.html": read("bills-env-archive"),
    "https://www.env.go.jp/press/press_03182.html": read("bills-env-detail"),
    "https://www.env.go.jp/press/press_04458.html": read("bills-env-detail"),
    "https://www.mof.go.jp/about_mof/bills/221diet/index.html": session,
    "https://www.mof.go.jp/about_mof/bills/221diet/st080220g.html":
      read("bills-mof-detail"),
    "https://www.mof.go.jp/about_mof/bills/217diet/index.html": session
      .replaceAll("221", "217")
      .replaceAll("080220", "070204"),
    "https://www.mof.go.jp/about_mof/bills/217diet/st070204g.html":
      read("bills-mof-detail"),
    ...overrides,
  };
  return replay((url) => pages[url]);
}

async function bills(
  agency: Agency,
  options: Record<string, unknown> = {},
  overrides: Record<string, Response> = {},
) {
  const { fetch, calls } = billFetch(agency, overrides);
  const result = await collectSource(billSource(agency, options), fetch);
  expect(calls.some((url) => url.toLowerCase().endsWith(".pdf"))).toBe(false);
  return { ...result, calls };
}

describe("official bill indexes", () => {
  test("NPA rows have dates and separate, stable identities", async () => {
    const { items, calls } = await bills("npa");
    expect(calls).toEqual([BILL_URLS.npa]);
    expect(items.map((item) => item.sourceKey)).toEqual([
      "bill:npa:221:6acf47077b50e55e40fb",
      "bill:npa:221:9698ac0653e46498e6ef",
      "bill:npa:219:487416ed0ad6e37937e6",
    ]);
    expect(items[0]?.publishedAt).toBe("2026-04-02T15:00:00Z");
    expect(items[0]?.metadata?.session).toBe("第221回国会");
    expect(items[2]?.metadata?.session).toBe("第219回国会");
    expect(items[0]?.url).toBe(items[1]?.url);
    expect(items[0]?.title).not.toBe("要綱（63KB）");
    expect(items[1]?.attachments).toHaveLength(1);
    expect(items[0]?.contentError).toContain("PDF");
  });

  test("the environment archive uses the actual heading, not a wrong fragment", async () => {
    const { items, calls, warnings, notes } = await bills("env");
    expect(items).toHaveLength(2);
    expect(calls).toHaveLength(4);
    expect(calls.join(" ")).not.toContain("#213");
    expect(items[1]?.title).toContain("狩猟");
    expect(items[1]?.metadata?.session).toBe("第217回国会");
    expect(items[0]).toMatchObject({
      publishedAt: "2026-03-05T15:00:00Z",
      metadata: { contentStatus: "detail" },
    });
    expect(items[0]?.body).toContain("クマ対策");
    expect(items[0]?.body).not.toContain("担当者氏名");
    expect(items[0]?.attachments).toHaveLength(2);
    expect(items[0]?.metadata?.bodyScopeNote).toContain("PDF");
    expect(notes).toContain(PDF_NOTE);
    expect(warnings).toEqual(notes);
  });

  test("an empty latest session does not pull in older sessions", async () => {
    const extra = (agency: Agency) =>
      text(read(`bills-${agency}`)).replace(
        "<h2>第221回",
        "<h2>第222回国会</h2><p>法案なし</p><h2>第221回",
      );
    const npa = await bills(
      "npa",
      { maxDetails: 0 },
      { [BILL_URLS.npa]: extra("npa") },
    );
    expect(npa.items).toHaveLength(2);
    expect(
      npa.items.every((item) => item.metadata?.session === "第221回国会"),
    ).toBe(true);
    expect(alerts(npa).some((warning) => warning.includes("第222回"))).toBe(
      true,
    );
    const env = await bills(
      "env",
      { maxDetails: 0 },
      { [BILL_URLS.env]: extra("env") },
    );
    expect(env.items).toHaveLength(1);
    expect(env.calls).toEqual([BILL_URLS.env]);
    expect(alerts(env).some((warning) => warning.includes("第222回"))).toBe(
      true,
    );
  });

  test("the detail budget keeps listings and marks missing details", async () => {
    const { items, calls, notes } = await bills("env", { maxDetails: 1 });
    expect(calls).toHaveLength(3);
    expect(items).toHaveLength(2);
    expect(items[1]?.body).toBe("");
    expect(items[1]?.contentError).toContain("取得上限");
    expect(notes.some((warning) => warning.includes("残り 1 件"))).toBe(true);
  });

  test("a detail failure is an alert and keeps the listing", async () => {
    const result = await bills(
      "env",
      { maxSessions: 1 },
      { "https://www.env.go.jp/press/press_03182.html": new Error("HTTP 503") },
    );
    expect(result.items).toHaveLength(1);
    expect(result.calls).toHaveLength(2);
    expect(result.items[0]?.contentError).toContain("503");
    expect(result.items[0]?.metadata?.contentStatus).toBe("listing");
    expect(alerts(result).some((warning) => warning.includes("HTTP 503"))).toBe(
      true,
    );
    expect(result.notes.some((warning) => warning.includes("503"))).toBe(false);
  });

  test("a missing archive is visible and never substitutes an older session", async () => {
    const result = await bills(
      "env",
      { maxDetails: 0 },
      {
        "https://www.env.go.jp/info/hoan/index2.html":
          "<main><h2>Nothing</h2></main>",
      },
    );
    expect(result.items).toHaveLength(1);
    expect(
      alerts(result).some((warning) => warning.includes("指定国会回次")),
    ).toBe(true);
  });

  test("MOF names, dates, status, materials and summary", async () => {
    const { items, calls } = await bills("mof");
    expect(items.map((item) => item.sourceKey)).toEqual([
      "bill:mof:221:60cddd18e694f54d3013",
      "bill:mof:217:60cddd18e694f54d3013",
    ]);
    expect(calls).toHaveLength(5);
    const [item] = items;
    expect(item).toMatchObject({
      title: "所得税法等の一部を改正する法律案",
      publishedAt: "2026-02-19T15:00:00Z",
      metadata: {
        submissionDate: "令和8年 2月20日",
        enactmentDate: "令和８年３月31日",
        effectiveDate: "令和８年４月１日",
        status: "成立（公式索引掲載）",
        session: "第221回国会",
      },
    });
    expect(item?.attachments).toHaveLength(4);
    expect(item?.url.endsWith("st080220g.html")).toBe(true);
    expect(item?.body).toContain("趣旨・概要");
    expect(item?.body).not.toContain("color: red");
    expect(item?.body).not.toContain("フッター");
  });

  test("a failed MOF session is visible", async () => {
    const result = await bills(
      "mof",
      { maxDetails: 0 },
      {
        "https://www.mof.go.jp/about_mof/bills/221diet/index.html": new Error(
          "HTTP 503",
        ),
      },
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.metadata?.session).toBe("第217回国会");
    expect(
      alerts(result).some(
        (warning) => warning.includes("第221回") && warning.includes("503"),
      ),
    ).toBe(true);
  });

  test("adding an overview link does not change the bill identity", async () => {
    const pdfOnly = text(read("bills-mof-session")).replace(
      '<a href="./st080220g.html">',
      '<a href="./st080220g.pdf">',
    );
    const before = await bills(
      "mof",
      { maxSessions: 1, maxDetails: 0 },
      { "https://www.mof.go.jp/about_mof/bills/221diet/index.html": pdfOnly },
    );
    const after = await bills("mof", { maxSessions: 1, maxDetails: 0 });
    expect(before.items[0]?.sourceKey).toBe(after.items[0]?.sourceKey);
    expect(before.items[0]?.url).not.toBe(after.items[0]?.url);
  });

  test("tax outlines group HTML and PDF and never invent a publication date", async () => {
    const { items, calls } = await bills("mof-tax");
    expect(calls).toHaveLength(1);
    expect(items.map((item) => item.title)).toEqual([
      "令和９年度税制改正要望",
      "2026年度 税制改正の大綱",
      expect.any(String),
    ]);
    expect(items[0]?.metadata?.fiscalYear).toBe("2027");
    expect(items.map((item) => item.attachments?.length)).toEqual([
      expect.any(Number),
      2,
      3,
    ]);
    expect(
      items.every(
        (item) =>
          item.publishedAt === null &&
          !["HTML", "PDF", "概要"].includes(item.title),
      ),
    ).toBe(true);
  });

  test("the item limit applies before detail requests", async () => {
    const { items, calls, notes } = await bills("env", { maxItems: 1 });
    expect(items).toHaveLength(1);
    expect(calls).toHaveLength(3);
    expect(notes.some((warning) => warning.includes("対象 2 件"))).toBe(true);
  });

  test("official hosts, redirects and limits are checked before use", async () => {
    await expect(
      collectSource(
        billSource("env", { url: "https://example.org/info/hoan/" }),
        forbidden,
      ),
    ).rejects.toThrow(UserError);
    await expect(
      collectSource(billSource("env", { agency: "constructor" }), forbidden),
    ).rejects.toThrow("省庁設定");
    for (const options of [
      { maxSessions: 0 },
      { maxDetails: 31 },
      { maxItems: true },
      { maxItems: null },
    ]) {
      await expect(
        collectSource(billSource("npa", options), forbidden),
      ).rejects.toThrow("取得上限の範囲外");
    }
    const redirect = replay(() => ({
      data: read("bills-env"),
      url: "https://example.org/",
      contentType: "text/html",
    }));
    await expect(
      collectSource(billSource("env"), redirect.fetch),
    ).rejects.toThrow("転送先");
  });

  test.each([
    [
      {
        data: utf8("%PDF-1.7"),
        url: BILL_URLS.npa,
        contentType: "application/pdf",
      },
      "形式",
    ],
    [
      {
        data: utf8("<html>Unrelated page</html>"),
        url: BILL_URLS.npa,
        contentType: "text/html",
      },
      "抽出できません",
    ],
    [
      {
        data: new Uint8Array([0xff, 0xfe, 0x00]),
        url: BILL_URLS.npa,
        contentType: "text/html",
      },
      "HTML を解析できません",
    ],
  ])(
    "bad formats and empty indexes are errors (%#)",
    async (response, message) => {
      await expect(
        collectSource(billSource("npa"), replay(() => response).fetch),
      ).rejects.toThrow(message);
    },
  );
});

function egovSource(
  mode = "0",
  options: Record<string, unknown> = {},
): SourceConfig {
  return untyped({
    ...config(
      "egov",
      `${ORIGIN}/servlet/Public?CLASSNAME=PCMMSTLIST&Mode=${mode}`,
    ),
    maxItems: 2,
    maxDetails: 1,
    ...options,
  });
}

function egovFetch(
  pages: Record<number, Response> = { 1: read("egov-list") },
  detail: Response = read("egov-detail"),
) {
  return replay((url) => {
    const query = parseQs(urlsplit(url).query);
    return query.get("CLASSNAME")?.[0] === "PCMMSTLIST"
      ? pages[Number(query.get("Page")?.[0] ?? 1)]
      : detail;
  }, "text/html; charset=UTF-8");
}

async function egov(
  options: Record<string, unknown> = {},
  pages?: Record<number, Response>,
  detail?: Response,
  mode = "0",
) {
  const { fetch, calls } = egovFetch(pages, detail);
  return { ...(await collectSource(egovSource(mode, options), fetch)), calls };
}

const page = (url: string | undefined) => parseQs(urlsplit(url ?? "").query);
const OLD_TITLE =
  "建築基準法施行令の一部を改正する政令の施行に伴う関係告示等の制定及び改正案に関する意見募集";
const CARD = '<div class="egovui-link-area-cursor"';

describe("e-Gov public comments", () => {
  test("a recruitment listing and detail", async () => {
    const { items, calls, notes } = await egov();
    expect(calls).toHaveLength(2);
    expect(items).toHaveLength(2);
    const [item] = items;
    expect(item).toMatchObject({
      publishedAt: "2026-09-25T15:00:00Z",
      contentError: "",
      metadata: {
        caseId: "155260722",
        status: "募集中",
        agency: "国土交通省",
        deadlineAt: "2026-10-26T08:00:00Z",
        openedAt: "2026-09-26T08:00:00Z",
        contentStatus: "detail",
      },
    });
    expect(item?.attachments).toHaveLength(3);
    expect(item?.attachments?.[1]).toEqual({
      title: "案文",
      url: `${ORIGIN}/pcm/download?seqNo=0000321443`,
    });
    expect(item?.body).toContain("根拠法令条項：建築基準法");
    expect(item?.body).not.toContain("意見入力へ");
    expect(items[1]?.metadata?.contentStatus).toBe("listing");
    expect(items[1]?.contentError).toContain("詳細ページ未取得");
    expect(notes.some((warning) => warning.includes("全過去案件"))).toBe(true);
    expect(notes.some((warning) => warning.includes("残り 1 件"))).toBe(true);
  });

  test("result publication uses the result date and endpoint", async () => {
    const { items, calls } = await egov(
      { maxItems: 1 },
      { 1: read("egov-results") },
      read("egov-result-detail"),
      "1",
    );
    expect(items[0]).toMatchObject({
      url: `${ORIGIN}/servlet/Public?CLASSNAME=PCM1040&id=410080057&Mode=1`,
      publishedAt: "2026-09-24T15:00:00Z",
      metadata: { status: "結果公示", enactmentDate: "2026年10月1日" },
    });
    expect(items[0]?.body).toContain("意見公募手続は実施しませんでした");
    expect(items[0]?.attachments).toHaveLength(1);
    expect(page(calls[0]).get("sortItem")).toEqual(["1"]);
  });

  test("paging collects beyond the first page without an unbounded crawl", async () => {
    const { items, calls, notes } = await egov(
      { maxItems: 3, maxDetails: 0 },
      { 1: read("egov-list"), 2: read("egov-page2") },
    );
    expect(items).toHaveLength(3);
    expect(new Set(items.map((item) => item.url)).size).toBe(3);
    expect(calls).toHaveLength(2);
    expect(page(calls[1]).get("Page")).toEqual(["2"]);
    expect(notes.some((warning) => warning.includes("全過去案件"))).toBe(true);
  });

  test("a repeated page stops and is visible", async () => {
    const result = await egov(
      { maxItems: 10, maxDetails: 0 },
      { 1: read("egov-list"), 2: read("egov-list") },
    );
    expect(result.calls).toHaveLength(2);
    expect(result.items).toHaveLength(2);
    expect(
      alerts(result).some((warning) => warning.includes("ページ送り")),
    ).toBe(true);
  });

  test("the page cap", async () => {
    const { items, calls, notes } = await egov({
      maxItems: 10,
      maxDetails: 0,
      maxPages: 1,
    });
    expect(calls).toHaveLength(1);
    expect(items).toHaveLength(2);
    expect(notes.some((warning) => warning.includes("1 ページまで"))).toBe(
      true,
    );
  });

  test("a partial listing failure keeps collected items", async () => {
    const result = await egov(
      { maxItems: 10, maxDetails: 0 },
      { 1: read("egov-list"), 2: new Error("HTTP 503") },
    );
    expect(result.items).toHaveLength(2);
    expect(
      alerts(result).some(
        (warning) => warning.includes("2 ページ目") && warning.includes("503"),
      ),
    ).toBe(true);
  });

  test("a detail failure keeps the listing with a visible error", async () => {
    const result = await egov({}, undefined, new Error("HTTP 503"));
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.metadata?.contentStatus).toBe("error");
    expect(result.items[0]?.contentError).toContain("503");
    expect(
      alerts(result).some((warning) => warning.includes("詳細ページ 1 件")),
    ).toBe(true);
  });

  test("subject keywords get the detail budget before newer unrelated items", async () => {
    const listing = text(read("egov-list")).replace(
      OLD_TITLE,
      "鳥獣保護管理法の施行規則の改正に関する意見募集",
    );
    const { items, calls } = await egov(
      {},
      { 1: listing },
      text(read("egov-detail")).replaceAll("155260722", "155260723"),
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("id=155260723");
    expect(
      items.map((item) => [
        item.metadata?.caseId,
        item.metadata?.contentStatus,
      ]),
    ).toEqual([
      ["155260722", "listing"],
      ["155260723", "detail"],
    ]);
  });

  test("configured detail keywords replace the defaults; invalid entries are ignored", async () => {
    const { calls } = await egov(
      { detailKeywords: ["告示", 42, " "] },
      undefined,
      text(read("egov-detail")).replaceAll("155260722", "155260723"),
    );
    expect(calls[1]).toContain("id=155260723");
  });

  test("duplicate cards keep the first item and fill the limit from the next page", async () => {
    const listing = text(read("egov-list"));
    const first = listing.indexOf(CARD);
    const second = listing.indexOf(CARD, first + 1);
    const duplicate = listing
      .slice(first, second)
      .replace("募集中", "締切済み")
      .replace("国土交通省", "後続カードの省庁");
    const { items, calls, notes } = await egov(
      { maxItems: 3 },
      {
        1: listing.replace("</main>", `${duplicate}</main>`),
        2: read("egov-page2"),
      },
    );
    expect(items).toHaveLength(3);
    expect(new Set(items.map((item) => item.url)).size).toBe(3);
    expect(calls).toHaveLength(3);
    expect(page(calls[1]).get("Page")).toEqual(["2"]);
    expect(items[0]).toMatchObject({
      contentError: "",
      metadata: {
        caseId: "155260722",
        status: "募集中",
        agency: "国土交通省",
        contentStatus: "detail",
      },
    });
    expect(items[0]?.body).toContain("根拠法令条項：建築基準法");
    expect(notes.some((warning) => warning.includes("最新 3 件"))).toBe(true);
    expect(notes.some((warning) => warning.includes("残り 2 件"))).toBe(true);
  });

  test("duplicate cards do not exhaust the detail budget", async () => {
    const listing = text(read("egov-list"));
    const first = listing.indexOf(CARD);
    const second = listing.indexOf(CARD, first + 1);
    const { items, calls } = await egov(
      { maxDetails: 2 },
      {
        1:
          listing.slice(0, second) +
          listing.slice(first, second) +
          listing.slice(second),
      },
    );
    expect(items).toHaveLength(2);
    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain("id=155260722");
    expect(calls[2]).toContain("id=155260723");
  });

  test("a detail page for another case is rejected", async () => {
    const { items } = await egov({}, undefined, read("egov-result-detail"));
    expect(items[0]?.contentError).toContain("案件番号が一致しません");
    expect(items[0]).not.toHaveProperty("body");
  });

  test("malicious listing links are excluded and never fetched", async () => {
    const data = text(read("egov-list")).replace(
      "/pcm/detail?",
      "https://evil.example/pcm/detail?",
    );
    const result = await egov({ maxItems: 1, maxDetails: 0 }, { 1: data });
    expect(result.items[0]?.metadata?.caseId).toBe("155260723");
    expect(result.calls).toHaveLength(1);
    expect(alerts(result).some((warning) => warning.includes("除外"))).toBe(
      true,
    );
  });

  test.each([
    "javascript:alert(1)",
    "http://127.0.0.1/pcm/detail?CLASSNAME=PCMMSTDETAIL&id=155260722",
    "https://public-comment.e-gov.go.jp.evil.example/pcm/detail?CLASSNAME=PCMMSTDETAIL&id=155260722",
    `${ORIGIN}/pcm/2010?CLASSNAME=PCMMSTDETAIL&id=155260722`,
    `${ORIGIN}/pcm/detail?CLASSNAME=PCMMSTDETAIL&id=12345`,
  ])("detail URL %s is rejected", (url) => {
    expect(detailUrl(url)).toBeNull();
  });

  test("official HTTP detail links are upgraded to one canonical HTTPS form", () => {
    expect(
      detailUrl(
        "http://public-comment.e-gov.go.jp/pcm/detail?id=155260722&CLASSNAME=PCMMSTDETAIL&utm_source=x",
      ),
    ).toBe(
      `${ORIGIN}/servlet/Public?CLASSNAME=PCMMSTDETAIL&id=155260722&Mode=0`,
    );
  });

  test("unsafe attachments are omitted", async () => {
    const detail = text(read("egov-detail"))
      .replace("/pcm/download?seqNo=0000321442", "javascript:alert(1)")
      .replace(
        "/pcm/download?seqNo=0000321443",
        "http://127.0.0.1/private.pdf",
      );
    const { items } = await egov({}, undefined, detail);
    expect(items[0]?.attachments).toEqual([
      { title: "概要", url: expect.any(String) },
    ]);
  });

  test.each(["<html>Maintenance</html>", "<html>100 items / 100件</html>"])(
    "a changed page %j does not succeed silently",
    async (body) => {
      await expect(egov({}, { 1: body })).rejects.toThrow(
        "案件一覧を抽出できません",
      );
    },
  );

  test("an explicit empty listing", async () => {
    expect(
      await egov({}, { 1: "<html><main>0件</main></html>" }),
    ).toMatchObject({ items: [], warnings: [], notes: [] });
  });

  test("redirects and configured URLs outside the official host are rejected", async () => {
    const redirect = replay(() => ({
      data: read("egov-list"),
      url: "https://evil.example/list",
      contentType: "text/html",
    }));
    await expect(collectSource(egovSource(), redirect.fetch)).rejects.toThrow(
      "公式ドメイン",
    );
    await expect(
      collectSource(config("egov", "https://evil.example/list"), forbidden),
    ).rejects.toThrow("公式案件一覧");
    await expect(
      collectSource(
        config("egov", `${ORIGIN}/servlet/Public?CLASSNAME=PCMMSTLIST&Mode=2`),
        forbidden,
      ),
    ).rejects.toThrow("Mode");
  });

  test("the search scope is preserved", async () => {
    const { fetch, calls } = egovFetch();
    const source = egovSource("0", { maxDetails: 0 });
    await collectSource(
      {
        ...source,
        url: `${source.url}&keyword=%E9%B3%A5%E7%8D%A3&keywordOr=1&Husho=195&Page=9`,
      },
      fetch,
    );
    const query = page(calls[0]);
    expect([
      query.get("keyword"),
      query.get("Husho"),
      query.get("dspcnt"),
      query.get("Page"),
    ]).toEqual([["鳥獣"], ["195"], ["100"], ["1"]]);
  });
});
