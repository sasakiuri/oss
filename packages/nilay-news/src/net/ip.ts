// SPDX-License-Identifier: MIT
/** Strict IP literal parsing and IANA special-purpose (not globally reachable) ranges. */

type IpAddress = { version: 4; value: number } | { version: 6; value: bigint };

function parseOctet(part: string): number {
  if (!/^[0-9]{1,3}$/.test(part) || (part !== "0" && part.startsWith("0"))) {
    throw new Error("Invalid IPv4 octet");
  }
  const value = Number(part);
  if (value > 255) throw new Error("Invalid IPv4 octet");
  return value;
}

function parseIpv4(text: string): number | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  try {
    return parts.reduce((total, part) => total * 256 + parseOctet(part), 0);
  } catch {
    return null;
  }
}

function parseHextet(part: string): bigint {
  if (!/^[0-9a-fA-F]{1,4}$/.test(part)) throw new Error("Invalid IPv6 hextet");
  return BigInt(`0x${part}`);
}

export function parseIpv6(input: string): bigint | null {
  if (input.includes("/")) return null;
  const scope = input.indexOf("%");
  if (scope >= 0) {
    const zone = input.slice(scope + 1);
    if (!zone || zone.includes("%")) return null;
  }
  const text = scope >= 0 ? input.slice(0, scope) : input;
  try {
    const parts = text.split(":");
    if (parts.length < 3) return null;
    const last = parts.at(-1) ?? "";
    if (last.includes(".")) {
      const v4 = parseIpv4(last);
      if (v4 === null) return null;
      parts.pop();
      parts.push(
        ((v4 >>> 16) & 0xffff).toString(16),
        (v4 & 0xffff).toString(16),
      );
    }
    if (parts.length > 9) return null;
    let skip: number | null = null;
    for (let index = 1; index < parts.length - 1; index += 1) {
      if (!parts[index]) {
        if (skip !== null) return null;
        skip = index;
      }
    }
    let high: number;
    let low: number;
    let skipped: number;
    if (skip !== null) {
      high = skip;
      low = parts.length - skip - 1;
      if (!parts[0]) {
        high -= 1;
        if (high) return null;
      }
      if (!parts.at(-1)) {
        low -= 1;
        if (low) return null;
      }
      skipped = 8 - (high + low);
      if (skipped < 1) return null;
    } else {
      if (parts.length !== 8 || !parts[0] || !parts.at(-1)) return null;
      high = parts.length;
      low = 0;
      skipped = 0;
    }
    let value = 0n;
    for (let index = 0; index < high; index += 1)
      value = (value << 16n) | parseHextet(parts[index] ?? "");
    value <<= 16n * BigInt(skipped);
    for (let index = parts.length - low; index < parts.length; index += 1) {
      value = (value << 16n) | parseHextet(parts[index] ?? "");
    }
    return value;
  } catch {
    return null;
  }
}

export function parseIp(text: string): IpAddress | null {
  const v4 = parseIpv4(text);
  if (v4 !== null) return { version: 4, value: v4 };
  const v6 = parseIpv6(text);
  return v6 === null ? null : { version: 6, value: v6 };
}

type Network4 = readonly [number, number];
type Network6 = readonly [bigint, number];

function v4(cidr: string): Network4 {
  const [address = "", bits = "32"] = cidr.split("/");
  const value = parseIpv4(address);
  if (value === null) throw new Error("Invalid network");
  return [value, Number(bits)];
}

function v6(cidr: string): Network6 {
  const [address = "", bits = "128"] = cidr.split("/");
  const value = parseIpv6(address);
  if (value === null) throw new Error("Invalid network");
  return [value, Number(bits)];
}

const PRIVATE_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.0.170/31",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "240.0.0.0/4",
  "255.255.255.255/32",
].map(v4);
const PRIVATE_V4_EXCEPTIONS = ["192.0.0.9/32", "192.0.0.10/32"].map(v4);
const SHARED_V4 = v4("100.64.0.0/10");
const PRIVATE_V6 = [
  "::1/128",
  "::/128",
  "::ffff:0:0/96",
  "64:ff9b:1::/48",
  "100::/64",
  "2001::/23",
  "2001:db8::/32",
  "2002::/16",
  "3fff::/20",
  "fc00::/7",
  "fe80::/10",
].map(v6);
const PRIVATE_V6_EXCEPTIONS = [
  "2001:1::1/128",
  "2001:1::2/128",
  "2001:3::/32",
  "2001:4:112::/48",
  "2001:20::/28",
  "2001:30::/28",
].map(v6);

function inV4(value: number, [network, bits]: Network4): boolean {
  if (bits === 0) return true;
  const shift = 32 - bits;
  return Math.floor(value / 2 ** shift) === Math.floor(network / 2 ** shift);
}

function inV6(value: bigint, [network, bits]: Network6): boolean {
  const shift = BigInt(128 - bits);
  return value >> shift === network >> shift;
}

function v4Private(value: number): boolean {
  return (
    PRIVATE_V4.some((net) => inV4(value, net)) &&
    PRIVATE_V4_EXCEPTIONS.every((net) => !inV4(value, net))
  );
}

function v4Global(value: number): boolean {
  return !inV4(value, SHARED_V4) && !v4Private(value);
}

/** Globally reachable per the IANA special-purpose registries; mapped IPv4 uses IPv4 rules. */
export function isGlobal(address: IpAddress): boolean {
  if (address.version === 4) return v4Global(address.value);
  if (address.value >> 32n === 0xffffn)
    return v4Global(Number(address.value & 0xffffffffn));
  return !(
    PRIVATE_V6.some((net) => inV6(address.value, net)) &&
    PRIVATE_V6_EXCEPTIONS.every((net) => !inV6(address.value, net))
  );
}
