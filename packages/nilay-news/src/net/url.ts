// SPDX-License-Identifier: MIT
/**
 * RFC 3986 style URL splitting, joining and quoting with the exact semantics the
 * collectors were specified against. WHATWG `URL` is deliberately not used for
 * validation: it silently repairs inputs (backslashes, missing slashes, numeric
 * hosts) which must be rejected here.
 */
import { isGlobal, parseIp, parseIpv6 } from "./ip.ts";

class UrlError extends Error {}

interface RawSplit {
  scheme: string | null;
  netloc: string | null;
  path: string;
  query: string | null;
  fragment: string | null;
}

export interface SplitUrl {
  scheme: string;
  netloc: string;
  path: string;
  query: string;
  fragment: string;
}

function partition(
  value: string,
  separator: string,
): [string, boolean, string] {
  const index = value.indexOf(separator);
  return index < 0
    ? [value, false, ""]
    : [value.slice(0, index), true, value.slice(index + separator.length)];
}

function rpartition(
  value: string,
  separator: string,
): [string, boolean, string] {
  const index = value.lastIndexOf(separator);
  return index < 0
    ? ["", false, value]
    : [value.slice(0, index), true, value.slice(index + separator.length)];
}

function checkBracketedNetloc(netloc: string): void {
  const hostAndPort = rpartition(netloc, "@")[2];
  const [before, open, bracketed] = partition(hostAndPort, "[");
  let hostname: string;
  if (open) {
    if (before) throw new UrlError("Invalid IPv6 URL");
    const [host, , port] = partition(bracketed, "]");
    if (port && !port.startsWith(":")) throw new UrlError("Invalid IPv6 URL");
    hostname = host;
  } else {
    hostname = partition(hostAndPort, ":")[0];
  }
  if (/^[vV]/.test(hostname)) {
    if (!/^[vV][a-fA-F0-9]+\.[^\n]+$/.test(hostname))
      throw new UrlError("IPvFuture address is invalid");
  } else if (parseIpv6(hostname) === null) {
    throw new UrlError("Invalid bracketed host");
  }
}

function checkNetloc(netloc: string | null): void {
  if (!netloc || /^[\x00-\x7f]*$/.test(netloc)) return;
  const plain = netloc.replace(/[@:#?]/g, "");
  const normalized = plain.normalize("NFKC");
  if (plain === normalized) return;
  if (/[/?#@:]/.test(normalized))
    throw new UrlError("Invalid netloc characters under NFKC");
}

function splitRaw(input: string): RawSplit {
  let url = input.replace(/^[\x00-\x20]+/, "").replace(/[\t\r\n]/g, "");
  let scheme: string | null = null;
  let netloc: string | null = null;
  let query: string | null = null;
  let fragment: string | null = null;
  const colon = url.indexOf(":");
  if (
    colon > 0 &&
    /^[A-Za-z]/.test(url) &&
    /^[A-Za-z0-9+.-]+$/.test(url.slice(0, colon))
  ) {
    scheme = url.slice(0, colon).toLowerCase();
    url = url.slice(colon + 1);
  }
  if (url.startsWith("//")) {
    let end = url.length;
    for (const delimiter of "/?#") {
      const index = url.indexOf(delimiter, 2);
      if (index >= 0) end = Math.min(end, index);
    }
    netloc = url.slice(2, end);
    url = url.slice(end);
    if (netloc.includes("[") !== netloc.includes("]"))
      throw new UrlError("Invalid IPv6 URL");
    if (netloc.includes("[")) checkBracketedNetloc(netloc);
  }
  if (url.includes("#")) [url, , fragment] = partition(url, "#");
  if (url.includes("?")) [url, , query] = partition(url, "?");
  checkNetloc(netloc);
  return { scheme, netloc, path: url, query, fragment };
}

/** Split a URL; throws for malformed bracketed hosts like the original parser. */
export function urlsplit(url: string): SplitUrl {
  const raw = splitRaw(url);
  return {
    scheme: raw.scheme ?? "",
    netloc: raw.netloc ?? "",
    path: raw.path,
    query: raw.query ?? "",
    fragment: raw.fragment ?? "",
  };
}

export function userinfo(netloc: string): [string | null, string | null] {
  const [info, found] = rpartition(netloc, "@");
  if (!found) return [null, null];
  const [username, hasPassword, password] = partition(info, ":");
  return [username, hasPassword ? password : null];
}

function hostinfo(netloc: string): [string, string | null] {
  const host = rpartition(netloc, "@")[2];
  const [, open, bracketed] = partition(host, "[");
  let hostname: string;
  let port: string;
  if (open) {
    const [inner, , rest] = partition(bracketed, "]");
    hostname = inner;
    port = partition(rest, ":")[2];
  } else {
    [hostname, , port] = partition(host, ":");
  }
  return [hostname, port || null];
}

/** Lower-cased host name, or null when the URL has none. */
export function hostnameOf(parts: SplitUrl): string | null {
  const hostname = hostinfo(parts.netloc)[0];
  if (!hostname) return null;
  const [name, percent, zone] = partition(hostname, "%");
  return name.toLowerCase() + (percent ? `%${zone}` : "");
}

/** Numeric port, or null; throws for a non-numeric or out-of-range port. */
export function portOf(parts: SplitUrl): number | null {
  const port = hostinfo(parts.netloc)[1];
  if (port === null) return null;
  if (!/^[0-9]+$/.test(port))
    throw new UrlError("Port could not be cast to integer");
  const value = Number(port);
  if (value > 65535) throw new UrlError("Port out of range 0-65535");
  return value;
}

/** Host name of an arbitrary string, or an empty string for unparsable input. */
export function hostname(url: string): string {
  try {
    return hostnameOf(urlsplit(url)) ?? "";
  } catch {
    return "";
  }
}

function unsplit(
  scheme: string | null,
  netloc: string | null,
  path: string,
  query: string | null,
  fragment: string | null,
): string {
  let url = path;
  if (netloc !== null) {
    if (url && !url.startsWith("/")) url = `/${url}`;
    url = `//${netloc}${url}`;
  } else if (url.startsWith("//")) {
    url = `//${url}`;
  }
  if (scheme) url = `${scheme}:${url}`;
  if (query !== null) url = `${url}?${query}`;
  if (fragment !== null) url = `${url}#${fragment}`;
  return url;
}

const USES_RELATIVE = new Set([
  "",
  "ftp",
  "http",
  "gopher",
  "nntp",
  "imap",
  "wais",
  "file",
  "https",
  "shttp",
  "mms",
  "prospero",
  "rtsp",
  "rtsps",
  "rtspu",
  "sftp",
  "svn",
  "svn+ssh",
  "ws",
  "wss",
]);
const USES_NETLOC = new Set([
  "",
  "ftp",
  "http",
  "gopher",
  "nntp",
  "telnet",
  "imap",
  "wais",
  "file",
  "mms",
  "https",
  "shttp",
  "snews",
  "prospero",
  "rtsp",
  "rtsps",
  "rtspu",
  "rsync",
  "svn",
  "svn+ssh",
  "sftp",
  "nfs",
  "git",
  "git+ssh",
  "ws",
  "wss",
  "itms-services",
]);

/** Resolve a reference against a base URL using RFC 3986 dot-segment removal. */
export function urljoin(base: string, url: string): string {
  if (!base) return url;
  if (!url) return base;
  const b = splitRaw(base);
  const r = splitRaw(url);
  const scheme = r.scheme ?? b.scheme;
  if (scheme !== b.scheme || (scheme && !USES_RELATIVE.has(scheme))) return url;
  let netloc = r.netloc;
  if (!scheme || USES_NETLOC.has(scheme)) {
    if (r.netloc) return unsplit(scheme, r.netloc, r.path, r.query, r.fragment);
    netloc = b.netloc;
  }
  if (!r.path) {
    let query = r.query;
    let fragment = r.fragment;
    if (query === null) {
      query = b.query;
      if (fragment === null) fragment = b.fragment;
    }
    return unsplit(scheme, netloc, b.path, query, fragment);
  }
  const baseParts = b.path.split("/");
  if (baseParts.at(-1) !== "") baseParts.pop();
  let segments: string[];
  if (r.path.startsWith("/")) {
    segments = r.path.split("/");
  } else {
    segments = [...baseParts, ...r.path.split("/")];
    if (segments.length > 2)
      segments = [
        segments[0] ?? "",
        ...segments.slice(1, -1).filter(Boolean),
        segments.at(-1) ?? "",
      ];
  }
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "..") resolved.pop();
    else if (segment !== ".") resolved.push(segment);
  }
  if (segments.at(-1) === "." || segments.at(-1) === "..") resolved.push("");
  return unsplit(
    scheme,
    netloc,
    resolved.join("/") || "/",
    r.query,
    r.fragment,
  );
}

const ALWAYS_SAFE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-~";
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const encoder = new TextEncoder();

/** Percent-encode UTF-8 bytes except unreserved characters and `safe`. */
export function quote(value: string, safe = "/"): string {
  if (LONE_SURROGATE.test(value)) throw new UrlError("Invalid Unicode text");
  const allowed = new Set(ALWAYS_SAFE + safe);
  let result = "";
  for (const byte of encoder.encode(value)) {
    const char = String.fromCharCode(byte);
    result +=
      byte < 128 && allowed.has(char)
        ? char
        : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return result;
}

function quotePlus(value: string, safe = ""): string {
  if (!value.includes(" ")) return quote(value, safe);
  return quote(value, `${safe} `).replaceAll(" ", "+");
}

const HEX_PAIR = /^[0-9a-fA-F]{2}$/;
const decoder = new TextDecoder();

function unquoteAscii(value: string): string {
  const pieces = value.split("%");
  if (pieces.length === 1) return value;
  const bytes: number[] = [];
  const push = (text: string) => {
    for (let index = 0; index < text.length; index += 1)
      bytes.push(text.charCodeAt(index));
  };
  push(pieces[0] ?? "");
  for (const piece of pieces.slice(1)) {
    const pair = piece.slice(0, 2);
    if (HEX_PAIR.test(pair)) {
      bytes.push(Number.parseInt(pair, 16));
      push(piece.slice(2));
    } else {
      push(`%${piece}`);
    }
  }
  return decoder.decode(new Uint8Array(bytes));
}

/** Decode percent escapes in ASCII runs as UTF-8, replacing invalid sequences. */
export function unquote(value: string): string {
  if (!value.includes("%")) return value;
  return value.replace(/[\x00-\x7f]+/g, unquoteAscii);
}

function unquotePlus(value: string): string {
  return unquote(value.replaceAll("+", " "));
}

function parseQsl(query: string, keepBlank = false): [string, string][] {
  if (!query) return [];
  const result: [string, string][] = [];
  for (const field of query.split("&")) {
    if (!field) continue;
    const [name, , value] = partition(field, "=");
    if (value || keepBlank)
      result.push([unquotePlus(name), unquotePlus(value)]);
  }
  return result;
}

/** First value of each parameter, ignoring blank values. */
export function parseQs(query: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [name, value] of parseQsl(query)) {
    const values = result.get(name);
    if (values) values.push(value);
    else result.set(name, [value]);
  }
  return result;
}

export function queryValue(query: string, name: string): string | undefined {
  return parseQs(query).get(name)?.[0];
}

export function urlencode(pairs: Iterable<readonly [string, string]>): string {
  return [...pairs]
    .map(([name, value]) => `${quotePlus(name)}=${quotePlus(value)}`)
    .join("&");
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TRACKING = new Set(["fbclid", "gclid", "dclid", "msclkid"]);

function asciiHost(host: string): string {
  if (/^[\x00-\x7f]*$/.test(host)) {
    const labels = host.split(".");
    if (
      labels.slice(0, -1).some((label) => !label) ||
      labels.some((label) => label.length >= 64)
    ) {
      throw new UrlError("Invalid label");
    }
    return host;
  }
  const converted = new URL(`http://${host}/`).hostname;
  if (!/^[\x00-\x7f]*$/.test(converted))
    throw new UrlError("Invalid internationalized host");
  return converted;
}

/**
 * Normalize an article or source URL; null for anything but a public HTTP(S)
 * host. Source requests are further limited to configured hosts elsewhere.
 */
export function canonicalUrl(input: unknown): string | null {
  if (typeof input !== "string" || [...input].length > 8192) return null;
  const url = input.trim();
  if (/[\x00-\x20\x7f\\]/.test(url)) return null;
  try {
    const parts = urlsplit(url);
    const scheme = parts.scheme.toLowerCase();
    const name = hostnameOf(parts);
    if ((scheme !== "http" && scheme !== "https") || !name) return null;
    const [username, password] = userinfo(parts.netloc);
    if (username !== null || password !== null) return null;
    let host = asciiHost(name.replace(/\.+$/, "")).toLowerCase();
    if (
      host.includes("%") ||
      host === "localhost" ||
      /\.(?:localhost|local|internal)$/.test(host)
    )
      return null;
    const address = parseIp(host);
    if (address === null) {
      // WHATWG URL parses a host ending in a numeric label (`0x7f.1`) as IPv4.
      if (!host.includes(".") || /(?:^|\.)(?:[0-9]+|0x[0-9a-f]*)$/.test(host))
        return null;
      if (host.split(".").some((label) => !LABEL.test(label))) return null;
    } else {
      if (!isGlobal(address)) return null;
      if (address.version === 6) host = `[${host}]`;
    }
    const port = portOf(parts);
    if (port !== null && port !== 80 && port !== 443) return null;
    if (
      port !== null &&
      !(
        (scheme === "http" && port === 80) ||
        (scheme === "https" && port === 443)
      )
    ) {
      host = `${host}:${port}`;
    }
    const yahooArticle =
      host === "news.yahoo.co.jp" &&
      /^\/articles\/[a-f0-9]{40}$/.test(parts.path);
    const query = parseQsl(parts.query, true).filter(([key, value]) => {
      const lower = key.toLowerCase();
      return (
        !lower.startsWith("utm_") &&
        !TRACKING.has(lower) &&
        !(yahooArticle && key === "source" && value === "rss")
      );
    });
    const path = quote(parts.path || "/", "/%:@!$&'()*+,;=-._~");
    const encoded = urlencode(query);
    return `${scheme}://${host}${path}${encoded ? `?${encoded}` : ""}`;
  } catch {
    return null;
  }
}
