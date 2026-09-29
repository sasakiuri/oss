// SPDX-License-Identifier: MIT
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Access, CONFIG_NAMES } from "../src/access.ts";
import { UserError } from "../src/errors.ts";
import type { FetchBytes, FetchOptions } from "../src/net/types.ts";

const CONFIG = {
  NILAY_PUBLIC_ORIGIN: "https://news.example.com",
  CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
  CF_ACCESS_AUD: "test-audience",
  CF_ACCESS_ALLOWED_EMAILS: "admin@example.com",
};
const CERTS = "https://test.cloudflareaccess.com/cdn-cgi/access/certs";
const STATE = "https://news.example.com/api/state";
const encoder = new TextEncoder();
const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function segment(value: object | string): string {
  return base64url(
    encoder.encode(typeof value === "string" ? value : JSON.stringify(value)),
  );
}

async function keyPair(modulusLength = 2048): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { ...algorithm, modulusLength, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  );
}

async function publicJwk(
  pair: CryptoKeyPair,
  kid: string,
): Promise<Record<string, unknown>> {
  return {
    ...(await crypto.subtle.exportKey("jwk", pair.publicKey)),
    kid,
    alg: "RS256",
    use: "sig",
  };
}

let primary: CryptoKeyPair;
let rotated: CryptoKeyPair;
let small: CryptoKeyPair;

beforeAll(async () => {
  [primary, rotated, small] = await Promise.all([
    keyPair(),
    keyPair(),
    keyPair(1024),
  ]);
});

let now: number;
let keys: Record<string, unknown>[];
let fetches: [string, FetchOptions | undefined][];
let fetcher: FetchBytes;
let access: Access;

async function sign(
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> | string = {},
  pair = primary,
): Promise<string> {
  const head = segment(
    typeof header === "string"
      ? header
      : { alg: "RS256", kid: "fixture-key", typ: "JWT", ...header },
  );
  const payload = segment({
    iss: "https://test.cloudflareaccess.com",
    aud: ["test-audience"],
    sub: "admin",
    email: "admin@example.com",
    iat: 900,
    exp: 1200,
    ...claims,
  });
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      algorithm,
      pair.privateKey,
      encoder.encode(`${head}.${payload}`),
    ),
  );
  return `${head}.${payload}.${base64url(signature)}`;
}

async function allowed(
  token?: string,
  headers: Record<string, string> = {},
  url = STATE,
  method = "GET",
): Promise<boolean> {
  return access.allowed(url, method, {
    "cf-access-jwt-assertion": token ?? (await sign()),
    ...headers,
  });
}

beforeEach(async () => {
  now = 1000;
  keys = [await publicJwk(primary, "fixture-key")];
  fetches = [];
  fetcher = async (url, options) => {
    fetches.push([url, options]);
    return {
      data: encoder.encode(JSON.stringify({ keys })),
      url,
      contentType: "application/json",
    };
  };
  access = new Access(CONFIG, {
    fetcher: (url, options) => fetcher(url, options),
    clock: () => now,
  });
});

describe("Access", () => {
  it("exports the four required configuration names", () => {
    expect(CONFIG_NAMES).toEqual(Object.keys(CONFIG));
    expect(access.origin).toBe(CONFIG.NILAY_PUBLIC_ORIGIN);
  });

  it("verifies a real RS256 signature, caches keys and enforces same-origin writes", async () => {
    expect(await allowed()).toBe(true);
    expect(
      await allowed(
        undefined,
        { origin: CONFIG.NILAY_PUBLIC_ORIGIN },
        STATE,
        "POST",
      ),
    ).toBe(true);
    expect(await allowed(undefined, {}, STATE, "POST")).toBe(false);
    expect(
      await allowed(
        undefined,
        { origin: "https://else.example.com" },
        STATE,
        "POST",
      ),
    ).toBe(false);
    expect(
      await allowed(undefined, { origin: "https://else.example.com" }),
    ).toBe(false);
    expect(await allowed(undefined, { origin: "" })).toBe(false);
    expect(await allowed(undefined, { "sec-fetch-site": "same-origin" })).toBe(
      true,
    );
    expect(await allowed(undefined, { "sec-fetch-site": "cross-site" })).toBe(
      false,
    );
    expect(fetches).toHaveLength(1);
    const [url, options] = fetches[0] ?? [];
    expect([url, options?.timeout, options?.maxBytes]).toEqual([
      CERTS,
      5,
      131072,
    ]);
    expect(() => options?.beforeRedirect?.("https://evil.example")).toThrow();
  });

  describe("cross-site top-level navigation after the Access login redirect", () => {
    const NAVIGATION = {
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
    };

    it.each(["GET", "HEAD", "get"])(
      "accepts a signed %s document navigation",
      async (method) => {
        expect(await allowed(undefined, NAVIGATION, STATE, method)).toBe(true);
        expect(
          await allowed(
            undefined,
            { ...NAVIGATION, "sec-fetch-user": "?1" },
            "https://news.example.com/",
            method,
          ),
        ).toBe(true);
      },
    );

    it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
      "denies a cross-site %s even with a matching Origin and navigation metadata",
      async (method) => {
        expect(
          await allowed(
            undefined,
            { ...NAVIGATION, origin: CONFIG.NILAY_PUBLIC_ORIGIN },
            STATE,
            method,
          ),
        ).toBe(false);
      },
    );

    it.each<[string, Record<string, string>]>([
      ["a foreign Origin", { origin: "https://else.example.com" }],
      ["an opaque Origin", { origin: "null" }],
      ["an iframe", { "sec-fetch-dest": "iframe" }],
      ["a frame", { "sec-fetch-dest": "frame" }],
      ["an embed", { "sec-fetch-dest": "embed" }],
      ["an object", { "sec-fetch-dest": "object" }],
      ["a script", { "sec-fetch-dest": "script" }],
      ["an image", { "sec-fetch-dest": "image" }],
      ["an API fetch", { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" }],
      [
        "a no-cors fetch",
        { "sec-fetch-mode": "no-cors", "sec-fetch-dest": "empty" },
      ],
      ["a cors document", { "sec-fetch-mode": "cors" }],
      ["a same-origin mode", { "sec-fetch-mode": "same-origin" }],
      ["a websocket", { "sec-fetch-mode": "websocket" }],
      ["a missing mode", { "sec-fetch-mode": "" }],
      ["a missing destination", { "sec-fetch-dest": "" }],
      ["an uppercase mode", { "sec-fetch-mode": "Navigate" }],
      ["an unknown site", { "sec-fetch-site": "cross-origin" }],
    ])("denies a cross-site request with %s", async (_, change) => {
      const headers: Record<string, string> = { ...NAVIGATION, ...change };
      for (const [name, value] of Object.entries(change))
        if (!value) delete headers[name];
      expect(await allowed(undefined, headers)).toBe(false);
      expect(await allowed(undefined, headers, STATE, "HEAD")).toBe(false);
    });

    it("still requires a valid token for the allowed identity", async () => {
      expect(
        await access.allowed(STATE, "GET", {
          ...NAVIGATION,
          "cf-access-authenticated-user-email": "admin@example.com",
        }),
      ).toBe(false);
      const [head, payload] = (await sign()).split(".");
      for (const token of [
        `${head}.${payload}.${base64url(encoder.encode("forged"))}`,
        await sign({}, {}, rotated),
        await sign({ email: "other@example.com" }),
        await sign({ iss: "https://evil.cloudflareaccess.com" }),
        await sign({ aud: "other" }),
        await sign({ exp: 1000 }),
      ])
        expect(await allowed(token, NAVIGATION)).toBe(false);
    });
  });

  it("accepts a Headers object with case-insensitive names", async () => {
    const headers = new Headers({
      "CF-Access-Jwt-Assertion": await sign(),
      Origin: CONFIG.NILAY_PUBLIC_ORIGIN,
    });
    expect(await access.allowed(STATE, "delete", headers)).toBe(true);
  });

  it.each([
    "https://nilay-news.example.workers.dev/",
    "https://news.example.com.evil.org/",
    "http://news.example.com/",
    "https://news.example.com:443/",
    "https://user@news.example.com/",
  ])("denies the alternate endpoint %s", async (url) => {
    expect(await allowed(undefined, {}, url)).toBe(false);
  });

  it("denies forged identity headers and forged signatures", async () => {
    expect(
      await access.allowed(STATE, "GET", {
        "cf-access-authenticated-user-email": "admin@example.com",
      }),
    ).toBe(false);
    const [head, payload] = (await sign()).split(".");
    expect(
      await allowed(
        `${head}.${payload}.${base64url(encoder.encode("forged"))}`,
      ),
    ).toBe(false);
    const other = await sign({}, {}, rotated);
    expect(await allowed(other)).toBe(false);
    const tampered = await sign({ email: "other@example.com" });
    expect(
      await allowed(
        `${tampered.split(".").slice(0, 2).join(".")}.${(await sign()).split(".")[2]}`,
      ),
    ).toBe(false);
  });

  it.each([
    { iss: "https://evil.cloudflareaccess.com" },
    { aud: "other" },
    { aud: ["test-audience", 7] },
    { aud: null },
    { email: "other@example.com" },
    { email: "ADMIN@example.com.evil" },
    { exp: 1000 },
    { iat: 1001 },
    { nbf: 1001 },
    { exp: 900, iat: 900 },
    { sub: "" },
    { sub: "  " },
    { sub: 7 },
    { type: "service" },
    { type: null },
    { common_name: "service" },
    { service_token_id: "id" },
    { service_token_status: true },
    { exp: true },
    { iat: "900" },
    { nbf: "900" },
    { nbf: null },
  ])("denies the claims %j", async (change) => {
    expect(await allowed(await sign(change))).toBe(false);
  });

  it("accepts optional claims in their valid forms", async () => {
    expect(
      await allowed(
        await sign({
          aud: "test-audience",
          nbf: 1000,
          type: "app",
          email: "Admin@Example.com",
          service_token_status: false,
        }),
      ),
    ).toBe(true);
  });

  it("rejects integer claims written with a fraction or exponent", async () => {
    const payload =
      '{"iss":"https://test.cloudflareaccess.com","aud":"test-audience","sub":"admin","email":"admin@example.com","iat":900.0,"exp":12e2}';
    const head = segment({ alg: "RS256", kid: "fixture-key" });
    const body = segment(payload);
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        algorithm,
        primary.privateKey,
        encoder.encode(`${head}.${body}`),
      ),
    );
    expect(await allowed(`${head}.${body}.${base64url(signature)}`)).toBe(
      false,
    );
  });

  it.each([
    ["empty", () => Promise.resolve("")],
    ["three placeholders", () => Promise.resolve("a.b.c")],
    ["oversized", () => Promise.resolve("x".repeat(20000))],
    ["alg none", () => Promise.resolve("eyJhbGciOiJub25lIn0.e30.eA")],
    ["concatenated", async () => `${await sign()},${await sign()}`],
    ["HS256 header", () => sign({}, { alg: "HS256" })],
    ["crit header", () => sign({}, { crit: ["exp"] })],
    ["missing kid", () => sign({}, { kid: "" })],
    ["long kid", () => sign({}, { kid: "k".repeat(257) })],
    ["array header", () => sign({}, "[]")],
    ["bad base64 length", async () => `${(await sign()).split(".")[0]}.a.b`],
  ])("denies a malformed token (%s)", async (_, token) => {
    expect(await allowed(await token())).toBe(false);
  });

  it("never uses an expired key set when JWKS refresh fails", async () => {
    expect(await allowed()).toBe(true);
    now = 5000;
    fetcher = () => Promise.reject(new Error("private upstream response"));
    const token = await sign({ iat: 4900, exp: 5100 });
    expect(await allowed(token)).toBe(false);
    expect(await allowed(token)).toBe(false);
  });

  it("refreshes for a rotated key at most once a minute and caches for an hour", async () => {
    expect(await allowed()).toBe(true);
    keys = [await publicJwk(rotated, "rotated-key")];
    const token = await sign({ exp: 99999 }, { kid: "rotated-key" }, rotated);
    now = 1030;
    expect(await allowed(token)).toBe(false);
    expect(fetches).toHaveLength(1);
    now = 1060;
    expect(await allowed(token)).toBe(true);
    expect(fetches).toHaveLength(2);
    now = 1060 + 3599;
    expect(await allowed(token)).toBe(true);
    expect(fetches).toHaveLength(2);
    // The old key left the set with the rotation.
    expect(await allowed(await sign({ exp: 99999 }))).toBe(false);
  });

  it("refreshes once for concurrent unknown keys", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = fetcher;
    fetcher = async (url, options) => {
      await gate;
      return original(url, options);
    };
    const token = await sign();
    // Token checks are synchronous, so both calls reach the key lookup before the fetch settles.
    const pending = Promise.all([allowed(token), allowed(token)]);
    release();
    expect(await pending).toEqual([true, true]);
    expect(fetches).toHaveLength(1);
  });

  it.each<[string, () => Promise<Record<string, unknown>[] | object>, string?]>(
    [
      [
        "a redirected key URL",
        async () => ({ keys }),
        "https://test.cloudflareaccess.com/elsewhere",
      ],
      ["an empty key list", async () => ({ keys: [] })],
      [
        "too many keys",
        async () => ({ keys: Array.from({ length: 33 }, () => keys[0]) }),
      ],
      ["a non-object key", async () => ({ keys: [...keys, "key"] })],
      ["a private key", async () => ({ keys: [{ ...keys[0], d: "secret" }] })],
      ["a duplicate kid", async () => ({ keys: [keys[0], keys[0]] })],
      [
        "wrong key operations",
        async () => ({ keys: [{ ...keys[0], key_ops: ["sign"] }] }),
      ],
      [
        "a 1024-bit modulus",
        async () => ({ keys: [await publicJwk(small, "fixture-key")] }),
      ],
      [
        "an oversized exponent",
        async () => ({ keys: [{ ...keys[0], e: "A".repeat(17) }] }),
      ],
      [
        "only non-RSA keys",
        async () => ({ keys: [{ kty: "EC", kid: "fixture-key" }] }),
      ],
      ["a non-object document", async () => [keys]],
    ],
  )("rejects a JWKS with %s", async (_, document, finalUrl) => {
    const body = await document();
    fetcher = async (url) => ({
      data: encoder.encode(JSON.stringify(body)),
      url: finalUrl ?? url,
      contentType: "application/json",
    });
    expect(await allowed()).toBe(false);
  });

  it("skips signing keys for other algorithms or uses", async () => {
    keys = [
      { ...keys[0], kid: "enc", use: "enc" },
      { kty: "EC", kid: "ec" },
      ...keys,
    ];
    expect(await allowed()).toBe(true);
  });

  it("rejects an oversized JWKS body", async () => {
    fetcher = async (url) => ({
      data: new Uint8Array(131073),
      url,
      contentType: "application/json",
    });
    expect(await allowed()).toBe(false);
  });

  it("fails closed on internal errors without leaking them", async () => {
    const spy = vi
      .spyOn(crypto.subtle, "verify")
      .mockRejectedValueOnce(new Error("secret"));
    expect(await allowed()).toBe(false);
    spy.mockRestore();
  });

  it.each([
    {},
    { ...CONFIG, CF_ACCESS_AUD: "" },
    { ...CONFIG, CF_ACCESS_AUD: "bad audience" },
    { ...CONFIG, NILAY_PUBLIC_ORIGIN: "https://news.example.com/" },
    { ...CONFIG, NILAY_PUBLIC_ORIGIN: "https://News.example.com" },
    { ...CONFIG, NILAY_PUBLIC_ORIGIN: "https://news.example.com:443" },
    { ...CONFIG, NILAY_PUBLIC_ORIGIN: "http://news.example.com" },
    { ...CONFIG, NILAY_PUBLIC_ORIGIN: "https://user@news.example.com" },
    { ...CONFIG, NILAY_PUBLIC_ORIGIN: "https://localhost" },
    { ...CONFIG, CF_ACCESS_TEAM_DOMAIN: "test.example.com" },
    { ...CONFIG, CF_ACCESS_ALLOWED_EMAILS: "*@example.com" },
    { ...CONFIG, CF_ACCESS_ALLOWED_EMAILS: "admin@example.com," },
    { ...CONFIG, CF_ACCESS_ALLOWED_EMAILS: ".admin@example.com" },
  ])("requires canonical configuration %#", (config) => {
    expect(() => new Access(config)).toThrow(UserError);
  });

  it("accepts several allowed addresses", async () => {
    access = new Access(
      {
        ...CONFIG,
        CF_ACCESS_ALLOWED_EMAILS: "Admin@Example.com, editor@example.com",
      },
      { fetcher, clock: () => now },
    );
    expect(await allowed(await sign({ email: "editor@example.com" }))).toBe(
      true,
    );
    expect(await allowed()).toBe(true);
  });

  it("shares a cold refresh across many callers while selecting each kid independently", async () => {
    keys.push(await publicJwk(rotated, "rotated-key"));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = fetcher;
    let attempts = 0;
    fetcher = async (url, options) => {
      attempts += 1;
      await gate;
      return original(url, options);
    };
    const tokens = await Promise.all([
      sign(),
      sign({}, { kid: "rotated-key" }, rotated),
      sign({}, { kid: "missing-key" }),
      sign({}, {}, rotated),
    ]);
    const pending = Promise.all(
      Array.from({ length: 32 }, (_, index) => allowed(tokens[index % 4])),
    );
    expect(attempts).toBe(1);
    release();
    expect(await pending).toEqual(
      Array.from({ length: 32 }, (_, index) => index % 4 < 2),
    );
    expect(fetches).toHaveLength(1);
  });

  it.each(["rejected", "malformed"])(
    "clears a %s shared refresh without bypassing the retry throttle",
    async (failure) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = fetcher;
      let attempts = 0;
      fetcher = async (url) => {
        attempts += 1;
        await gate;
        if (failure === "rejected")
          throw new Error("private upstream response");
        return {
          data: encoder.encode('{"keys":[]}'),
          url,
          contentType: "application/json",
        };
      };
      const token = await sign();
      const pending = Promise.all([allowed(token), allowed(token)]);
      release();
      expect(await pending).toEqual([false, false]);
      expect(await allowed(token)).toBe(false);
      expect(attempts).toBe(1);
      fetcher = original;
      now = 1059;
      expect(await allowed(token)).toBe(false);
      expect(fetches).toHaveLength(0);
      now = 1060;
      expect(await Promise.all([allowed(token), allowed(token)])).toEqual([
        true,
        true,
      ]);
      expect(fetches).toHaveLength(1);
    },
  );

  it("shares an expired-key refresh and never falls back to the expired cache", async () => {
    const token = await sign({ exp: 99999 });
    expect(await allowed(token)).toBe(true);
    now = 4600;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = fetcher;
    fetcher = async () => {
      await gate;
      throw new Error("unavailable");
    };
    const pending = Promise.all([allowed(token), allowed(token)]);
    release();
    expect(await pending).toEqual([false, false]);
    expect(await allowed(token)).toBe(false);
    fetcher = original;
    now = 4660;
    expect(await Promise.all([allowed(token), allowed(token)])).toEqual([
      true,
      true,
    ]);
    expect(fetches).toHaveLength(2);
  });

  it("keeps a valid known key usable while an unknown kid refresh is pending", async () => {
    const known = await sign();
    expect(await allowed(known)).toBe(true);
    now = 1060;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = fetcher;
    fetcher = async (url, options) => {
      await gate;
      return original(url, options);
    };
    const pending = allowed(await sign({}, { kid: "unknown" }));
    expect(await allowed(known)).toBe(true);
    release();
    expect(await pending).toBe(false);
    expect(fetches).toHaveLength(2);
  });

  it("rechecks every waiting token's expiration after the shared refresh", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = fetcher;
    fetcher = async (url, options) => {
      await gate;
      return original(url, options);
    };
    const [valid, expiring] = await Promise.all([sign(), sign({ exp: 1001 })]);
    const pending = Promise.all([allowed(valid), allowed(expiring)]);
    now = 1001;
    release();
    expect(await pending).toEqual([true, false]);
    expect(fetches).toHaveLength(1);
  });

  it("does not extend an older selected key's expiry when a newer refresh completes", async () => {
    const token = await sign({ exp: 99999 });
    expect(await allowed(token)).toBe(true);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const verifying = new Promise<void>((resolve) => {
      started = resolve;
    });
    const spy = vi
      .spyOn(crypto.subtle, "verify")
      .mockImplementationOnce(async () => {
        started();
        await gate;
        return true;
      });
    try {
      const pending = allowed(token);
      await verifying;
      now = 4600;
      expect(await allowed(token)).toBe(true);
      release();
      expect(await pending).toBe(false);
      expect(fetches).toHaveLength(2);
    } finally {
      release();
      spy.mockRestore();
    }
  });

  it("rechecks not-before and issued-at after asynchronous verification", async () => {
    const token = await sign({ nbf: 1000 });
    const spy = vi
      .spyOn(crypto.subtle, "verify")
      .mockImplementationOnce(async () => {
        now = 999;
        return true;
      });
    try {
      expect(await allowed(token)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
