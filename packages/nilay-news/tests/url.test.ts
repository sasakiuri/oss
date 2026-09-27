// SPDX-License-Identifier: MIT
import { describe, expect, test } from "vitest";

import { isGlobal, parseIp } from "../src/net/ip.ts";
import {
  canonicalUrl,
  hostname,
  parseQs,
  portOf,
  quote,
  unquote,
  urlencode,
  urljoin,
  urlsplit,
} from "../src/net/url.ts";

describe("canonicalUrl", () => {
  test.each([
    [
      "HTTPS://Example.COM:443/news?id=45&item=a&item=b&fbclid=x&utm_medium=rss#section",
      "https://example.com/news?id=45&item=a&item=b",
    ],
    ["https://example.com/記事", "https://example.com/%E8%A8%98%E4%BA%8B"],
    ["https://example.com/?q=a+b&feed=1", "https://example.com/?q=a+b&feed=1"],
    [
      "https://example.com/?a=1&a=2&UTM_x=3&gclid=1",
      "https://example.com/?a=1&a=2",
    ],
    ["https://example.com/a?b#c", "https://example.com/a?b="],
    [
      "https://example.com/%zz?a=%E3%81%82&b=",
      "https://example.com/%zz?a=%E3%81%82&b=",
    ],
    ["https://example.com/it's(1)", "https://example.com/it's(1)"],
    ["HTTP://Example.com", "http://example.com/"],
    ["https://EXAMPLE.com./a/../b", "https://example.com/a/../b"],
    ["http://example.com:443/", "http://example.com:443/"],
    [
      "https://例え.jp/パス?q=値",
      "https://xn--r8jz45g.jp/%E3%83%91%E3%82%B9?q=%E5%80%A4",
    ],
    ["https://ｅｘａｍｐｌｅ.com/", "https://example.com/"],
    ["https://[2001:4860:4860::8888]/", "https://[2001:4860:4860::8888]/"],
  ])("%s → %s", (input, expected) => {
    expect(canonicalUrl(input)).toBe(expected);
  });

  test("Yahoo RSS tracking merges with the plain article URL only", () => {
    const article = `https://news.yahoo.co.jp/articles/${"a".repeat(40)}`;
    expect(canonicalUrl(`${article}?source=rss&utm_medium=feed`)).toBe(article);
    expect(canonicalUrl(`${article}?source=research`)).toBe(
      `${article}?source=research`,
    );
    expect(canonicalUrl("https://example.com/article?source=rss")).toBe(
      "https://example.com/article?source=rss",
    );
  });

  test.each([
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://localhost/",
    "http://foo.local/",
    "http://svc.internal/",
    "http://127.0.0.1/",
    "http://127.1/",
    "http://10.1.1.1/",
    "http://100.64.0.1/",
    "http://169.254.169.254/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://[::1",
    "https://user:secret@example.com/",
    "https://example.com:9000/",
    "https://example.com:0/",
    "https://example.com:bad/",
    "http://2130706433/",
    "https://example.com/\nheader",
    "https://example.com\t/a",
    "https://exa mple.com/",
    "https://bad_host.com/",
    "https://-bad.example/",
    "https://a..example/",
    "https://xn--.com/",
    "https://ex%61mple.com/",
    "https://example.com\\@127.0.0.1/",
    "https://example.com＠evil.com/",
    "https://１２７.０.０.１/",
    `https://example.com/${"a".repeat(8192)}`,
    null,
    42,
  ])("non-public or malformed %j is rejected", (input) => {
    expect(canonicalUrl(input)).toBeNull();
  });

  test.each([
    "http://0x7f.1/",
    "http://1.2.3.0x4/",
    "http://example.0x10/",
    "http://a.b.c.08/",
  ])("%s, which WHATWG URL reads as an IPv4 address, is rejected", (input) => {
    expect(canonicalUrl(input)).toBeNull();
  });
});

describe("urljoin", () => {
  test.each([
    ["https://a.example/x/y", "//evil.example/p", "https://evil.example/p"],
    ["https://a.example/x/y", "https:z", "https://a.example/x/z"],
    ["https://a.example/x/y", "../../../z", "https://a.example/z"],
    ["https://a.example/x/y", "?q=1", "https://a.example/x/y?q=1"],
    ["https://a.example/x/y?a=1#f", "#g", "https://a.example/x/y?a=1#g"],
    ["https://a.example/x/y", "javascript:alert(1)", "javascript:alert(1)"],
    ["https://a.example/x/y", " /z", "https://a.example/z"],
    ["https://a.example/x/y", "/a/./b/../c/.", "https://a.example/a/c/"],
  ])("%s + %s", (base, reference, expected) => {
    expect(urljoin(base, reference)).toBe(expected);
  });

  test.each([
    [
      "https://a.example/x/y",
      "\\\\evil.example/",
      "https://a.example/x/\\\\evil.example/",
    ],
    [
      "https://a.example/x/y",
      "/\\evil.example",
      "https://a.example/\\evil.example",
    ],
  ])(
    "backslashes are not repaired into another host: %s + %s",
    (base, reference, joined) => {
      expect(urljoin(base, reference)).toBe(joined);
      expect(canonicalUrl(joined)).toBeNull();
    },
  );
});

describe("URL parts", () => {
  test("split, host and port", () => {
    expect(urlsplit("HTTPS://User@Example.COM:8443/p?q=1#f")).toEqual({
      scheme: "https",
      netloc: "User@Example.COM:8443",
      path: "/p",
      query: "q=1",
      fragment: "f",
    });
    expect(hostname("https://Example.COM/")).toBe("example.com");
    expect(hostname("https://[::1")).toBe("");
    expect(portOf(urlsplit("https://example.com:443/"))).toBe(443);
    expect(() => portOf(urlsplit("https://example.com:99999/"))).toThrow();
    expect(() => urlsplit("https://[bad]/")).toThrow();
  });

  test("query parsing, quoting and encoding", () => {
    expect([...parseQs("a=1&b=&a=2&c=%E9%B3%A5+x")]).toEqual([
      ["a", ["1", "2"]],
      ["c", ["鳥 x"]],
    ]);
    expect(quote("a b/鳥")).toBe("a%20b/%E9%B3%A5");
    expect(unquote("%E9%B3%A5%zz%")).toBe("鳥%zz%");
    expect(
      urlencode([
        ["keyword", "鳥獣 x"],
        ["Page", "1"],
      ]),
    ).toBe("keyword=%E9%B3%A5%E7%8D%A3+x&Page=1");
  });
});

describe("IP ranges", () => {
  test.each([
    ["8.8.8.8", true],
    ["192.0.0.9", true],
    ["2001:4860:4860::8888", true],
    ["10.0.0.1", false],
    ["172.31.255.255", false],
    ["192.168.1.1", false],
    ["198.18.0.1", false],
    ["::ffff:10.0.0.1", false],
    ["fc00::1", false],
    ["2001:db8::1", false],
  ])("%s global: %s", (address, expected) => {
    const parsed = parseIp(address);
    expect(parsed).not.toBeNull();
    expect(parsed && isGlobal(parsed)).toBe(expected);
  });

  test.each([
    "01.2.3.4",
    "1.2.3",
    "256.1.1.1",
    "1::2::3",
    "fe80::1%",
    "::1/128",
  ])("%s is not an IP literal", (address) => {
    expect(parseIp(address)).toBeNull();
  });
});
