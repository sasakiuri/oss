// SPDX-License-Identifier: MIT
/** Fail-closed Cloudflare Access JWT verification with Web Crypto; no local bypass. */
import type { Clock } from "./domain.ts";
import { clock as systemClock } from "./domain.ts";
import { UserError } from "./errors.ts";
import { fetchBytes } from "./net/http.ts";
import type { FetchBytes } from "./net/types.ts";
import { hostnameOf, urlsplit } from "./net/url.ts";
import { isRecord, strip } from "./text.ts";

export const CONFIG_NAMES = [
  "NILAY_PUBLIC_ORIGIN",
  "CF_ACCESS_TEAM_DOMAIN",
  "CF_ACCESS_AUD",
  "CF_ACCESS_ALLOWED_EMAILS",
] as const;
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const DOMAIN = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`);
const TEAM = new RegExp(`^${LABEL}\\.cloudflareaccess\\.com$`);
const MAX_JWKS = 131072;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const FETCH_SITES = new Set(["none", "same-origin", "same-site"]);
const NAVIGATION_METHODS = new Set(["GET", "HEAD"]);

type Json = Record<string, unknown>;
interface RsaKey {
  kty: "RSA";
  n: string;
  e: string;
}

function decode64(value: string): Uint8Array {
  if (value.length % 4 === 1) throw new Error("Invalid base64url");
  const binary = atob(
    value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "="),
  );
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Parse a JSON object; numbers written with a fraction or exponent become NaN so they fail integer checks. */
function jsonObject(bytes: Uint8Array): Json | null {
  const text = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: false,
  }).decode(bytes);
  const value: unknown = JSON.parse(
    text,
    (_key: string, item: unknown, context?: { source?: string }) =>
      typeof item === "number" &&
      context?.source !== undefined &&
      !/^-?(?:0|[1-9][0-9]*)$/.test(context.source)
        ? Number.NaN
        : item,
  );
  return isRecord(value) ? value : null;
}

/** Empty arrays and objects count as empty claims. */
function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return Boolean(value);
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function email(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[\x00-\x7f]*$/.test(value) ||
    value.includes("*")
  )
    return null;
  if (!/^[A-Za-z0-9.!#$%&'+/=?^_`{|}~-]+@[A-Za-z0-9.-]+$/.test(value))
    return null;
  const [local = "", domain = ""] = value.split("@");
  if (
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  )
    return null;
  return DOMAIN.test(domain.toLowerCase()) ? value.toLowerCase() : null;
}

function bitLength(bytes: Uint8Array): number {
  const start = bytes.findIndex((byte) => byte !== 0);
  if (start < 0) return 0;
  return (bytes.length - start - 1) * 8 + (32 - Math.clz32(bytes[start] ?? 0));
}

async function verifyRsa(
  key: RsaKey,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  const imported = await crypto.subtle.importKey(
    "jwk",
    { ...key, alg: "RS256", ext: true },
    algorithm,
    false,
    ["verify"],
  );
  return crypto.subtle.verify(algorithm, imported, signature, message);
}

export class Access {
  readonly origin: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly emails: ReadonlySet<string>;
  private readonly clock: Clock;
  private readonly fetcher: FetchBytes;
  private keys = new Map<string, RsaKey>();
  private expires = 0;
  private lastAttempt = Number.NEGATIVE_INFINITY;
  private refreshing: Promise<void> | null = null;

  constructor(
    config: Record<string, string>,
    options: { clock?: Clock; fetcher?: FetchBytes } = {},
  ) {
    const values = CONFIG_NAMES.map((name) => config[name] ?? "");
    if (!values.every((value) => typeof value === "string" && strip(value)))
      throw new UserError("Cloudflare Access の4項目を設定してください");
    const [origin = "", team = "", audience = "", emails = ""] = values;
    let canonical = false;
    try {
      const parts = urlsplit(origin);
      const name = hostnameOf(parts) ?? "";
      // Equality with the bare host also excludes userinfo, ports and upper case.
      canonical =
        parts.scheme === "https" &&
        !parts.path &&
        !parts.query &&
        !parts.fragment &&
        name.length <= 253 &&
        origin === `https://${name}` &&
        DOMAIN.test(name);
    } catch {
      canonical = false;
    }
    if (!canonical)
      throw new UserError(
        "NILAY_PUBLIC_ORIGIN に HTTPS origin を指定してください",
      );
    if (!TEAM.test(team))
      throw new UserError("CF_ACCESS_TEAM_DOMAIN が不正です");
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(audience))
      throw new UserError("CF_ACCESS_AUD が不正です");
    const allowed = emails.split(",").map((value) => email(strip(value)));
    if (!allowed.length || allowed.includes(null))
      throw new UserError("許可するメールアドレスを明示してください");
    this.origin = origin;
    this.issuer = `https://${team}`;
    this.audience = audience;
    this.emails = new Set(allowed as string[]);
    this.clock = options.clock ?? systemClock;
    this.fetcher = options.fetcher ?? fetchBytes;
  }

  async allowed(
    url: string,
    method: string,
    headers: Headers | Record<string, string>,
  ): Promise<boolean> {
    try {
      const request =
        headers instanceof Headers ? headers : new Headers(headers);
      const parts = urlsplit(url);
      if (`${parts.scheme}://${parts.netloc}` !== this.origin) return false;
      const origin = request.get("origin");
      if (origin !== null && origin !== this.origin) return false;
      if (!SAFE_METHODS.has(method.toUpperCase()) && origin !== this.origin)
        return false;
      const site = request.get("sec-fetch-site");
      // The Access login redirects back cross-site, so only a top-level document read may arrive that way.
      if (
        site !== null &&
        !FETCH_SITES.has(site) &&
        !(
          site === "cross-site" &&
          NAVIGATION_METHODS.has(method.toUpperCase()) &&
          request.get("sec-fetch-mode") === "navigate" &&
          request.get("sec-fetch-dest") === "document"
        )
      )
        return false;
      const token = request.get("cf-access-jwt-assertion") ?? "";
      if (
        token.length > 16384 ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
      )
        return false;
      const [head = "", payload = "", signature = ""] = token.split(".");
      const header = jsonObject(decode64(head));
      const claims = jsonObject(decode64(payload));
      if (!header || !claims) return false;
      const kid = header.kid;
      if (
        header.alg !== "RS256" ||
        truthy(header.crit) ||
        typeof kid !== "string" ||
        kid.length < 1 ||
        kid.length > 256
      )
        return false;
      const audiences =
        typeof claims.aud === "string" ? [claims.aud] : claims.aud;
      const now = this.clock();
      const { exp, iat, nbf, sub } = claims;
      if (
        claims.iss !== this.issuer ||
        !Array.isArray(audiences) ||
        !audiences.includes(this.audience) ||
        !audiences.every((item) => typeof item === "string") ||
        !integer(exp) ||
        !integer(iat) ||
        !(iat <= now && now < exp) ||
        exp <= iat ||
        ("nbf" in claims && (!integer(nbf) || nbf > now)) ||
        typeof sub !== "string" ||
        !strip(sub) ||
        ("type" in claims && claims.type !== "app") ||
        "common_name" in claims ||
        "service_token_id" in claims ||
        truthy(claims.service_token_status) ||
        !this.emails.has(email(claims.email) ?? "")
      ) {
        return false;
      }
      const selected = await this.key(kid);
      if (
        !selected ||
        !(await verifyRsa(
          selected.key,
          new TextEncoder().encode(`${head}.${payload}`),
          decode64(signature),
        ))
      )
        return false;
      // Waiting for a shared refresh or Web Crypto must not extend validity.
      // Capture the selected key's expiry, not a later refresh's expiry.
      const verifiedAt = this.clock();
      return (
        iat <= verifiedAt &&
        verifiedAt < exp &&
        (!("nbf" in claims) || (integer(nbf) && nbf <= verifiedAt)) &&
        verifiedAt < selected.expires
      );
    } catch {
      // Never echo credentials, claims or remote error bodies.
      return false;
    }
  }

  private cachedKey(kid: string): { key: RsaKey; expires: number } | null {
    const key = this.keys.get(kid);
    return key && this.clock() < this.expires
      ? { key, expires: this.expires }
      : null;
  }

  /** Signing keys are cached for an hour; cache misses share one throttled refresh. */
  private async key(
    kid: string,
  ): Promise<{ key: RsaKey; expires: number } | null> {
    const cached = this.cachedKey(kid);
    if (cached) return cached;
    if (!this.refreshing) {
      const now = this.clock();
      if (now - this.lastAttempt < 60) return null;
      this.lastAttempt = now;
      // One owner clears the promise on both success and failure. Waiters
      // must join before the throttle check and independently resolve their kid.
      this.refreshing = this.refreshKeys().finally(() => {
        this.refreshing = null;
      });
    }
    await this.refreshing;
    return this.cachedKey(kid);
  }

  private async refreshKeys(): Promise<void> {
    const url = `${this.issuer}/cdn-cgi/access/certs`;
    const result = await this.fetcher(url, {
      timeout: 5,
      maxBytes: MAX_JWKS,
      beforeRedirect: () => {
        throw new Error("Access key redirects are not allowed");
      },
    });
    if (result.url !== url || result.data.byteLength > MAX_JWKS) return;
    const entries = jsonObject(result.data)?.keys;
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 32)
      return;
    const keys = new Map<string, RsaKey>();
    for (const entry of entries) {
      if (!isRecord(entry)) return;
      if (
        entry.kty !== "RSA" ||
        ("alg" in entry && entry.alg !== "RS256") ||
        ("use" in entry && entry.use !== "sig")
      )
        continue;
      const { kid: name, n, e } = entry;
      const ops = entry.key_ops;
      if (
        typeof name !== "string" ||
        name.length < 1 ||
        name.length > 256 ||
        keys.has(name) ||
        "d" in entry ||
        typeof n !== "string" ||
        n.length < 1 ||
        n.length > 2048 ||
        typeof e !== "string" ||
        e.length < 1 ||
        e.length > 16 ||
        ("key_ops" in entry &&
          !(Array.isArray(ops) && ops.length === 1 && ops[0] === "verify"))
      ) {
        return;
      }
      const bits = bitLength(decode64(n));
      if (bits < 2048 || bits > 8192) return;
      keys.set(name, { kty: "RSA", n, e });
    }
    if (!keys.size) return;
    this.keys = keys;
    this.expires = this.clock() + 3600;
  }
}
