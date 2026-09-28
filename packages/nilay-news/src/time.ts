// SPDX-License-Identifier: MIT
/** Timestamp formats stored in D1 and shown by the UI, plus bounded date parsers. */

const JST_OFFSET = 9 * 3600;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

interface Fields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  micro: number;
}

function fieldsOf(epochSeconds: number): Fields | null {
  let whole = Math.floor(epochSeconds);
  let micro = Math.round((epochSeconds - whole) * 1e6);
  if (micro >= 1e6) {
    whole += 1;
    micro = 0;
  }
  const date = new Date(whole * 1000);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 1 || year > 9999) return null;
  return {
    year,
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    micro,
  };
}

function format(fields: Fields, micro: boolean): string {
  const base = `${pad(fields.year, 4)}-${pad(fields.month)}-${pad(fields.day)}T${pad(fields.hour)}:${pad(fields.minute)}:${pad(fields.second)}`;
  return micro && fields.micro ? `${base}.${pad(fields.micro, 6)}` : base;
}

/** UTC second-precision timestamp with a `+00:00` suffix, as used for stored records. */
export function isoSeconds(epochSeconds: number): string {
  const fields = fieldsOf(epochSeconds);
  if (!fields) throw new RangeError("Timestamp out of range");
  return `${format(fields, false)}+00:00`;
}

/** UTC timestamp with a `Z` suffix; microseconds only when present. */
function isoZ(epochSeconds: number): string | null {
  const fields = fieldsOf(epochSeconds);
  return fields ? `${format(fields, true)}Z` : null;
}

function epoch(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number | null {
  if (
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return null;
  return date.getTime() / 1000;
}

function isoInput(value: string): number | null {
  const match =
    /^(\d{4})-?(\d{2})-?(\d{2}).(\d{2})(?::?(\d{2})(?::?(\d{2})(?:[.,](\d+))?)?)?(?:([+-])(\d{2})(?::?(\d{2})(?::?(\d{2})(?:\.(\d{1,6}))?)?)?)$/u.exec(
      value,
    );
  if (!match) return null;
  const [
    ,
    y,
    mo,
    d,
    h,
    mi = "0",
    s = "0",
    fraction = "",
    sign,
    oh = "0",
    om = "0",
    os = "0",
    offsetFraction = "",
  ] = match;
  const base = epoch(
    Number(y),
    Number(mo),
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
  if (base === null || Number(om) > 59 || Number(os) > 59) return null;
  const offset =
    (Number(oh) * 3600 +
      Number(om) * 60 +
      Number(os) +
      Number(`0.${offsetFraction || "0"}`)) *
    (sign === "-" ? -1 : 1);
  if (Math.abs(offset) >= 86400) return null;
  return base + Number(`0.${fraction.slice(0, 6) || "0"}`) - offset;
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const ZONES: Record<string, number> = {
  UT: 0,
  UTC: 0,
  GMT: 0,
  Z: 0,
  AST: -400,
  ADT: -300,
  EST: -500,
  EDT: -400,
  CST: -600,
  CDT: -500,
  MST: -700,
  MDT: -600,
  PST: -800,
  PDT: -700,
};

function integer(text: string): number | null {
  const trimmed = text.trim();
  return /^[+-]?\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** RFC 2822 date; null when invalid or when the zone is unknown or `-0000`. */
function rfc2822(input: string): number | null {
  let data = input.split(/\s+/).filter(Boolean);
  if (!data.length) return null;
  const first = data[0] ?? "";
  if (first.endsWith(",") || DAYS.includes(first.toLowerCase())) data.shift();
  else if (first.includes(","))
    data[0] = first.slice(first.lastIndexOf(",") + 1);
  if (data.length === 3) {
    const pieces = (data[0] ?? "").split("-");
    if (pieces.length === 3) data = [...pieces, ...data.slice(1)];
  }
  if (data.length === 4) {
    const last = data[3] ?? "";
    let index = last.indexOf("+");
    if (index === -1) index = last.indexOf("-");
    if (index > 0)
      data = [...data.slice(0, 3), last.slice(0, index), last.slice(index)];
    else data.push("");
  }
  if (data.length < 5) return null;
  let [dd = "", mm = "", yy = "", tm = "", tz = ""] = data;
  if (!(dd && mm && yy)) return null;
  mm = mm.toLowerCase();
  if (!MONTHS.includes(mm)) {
    [dd, mm] = [mm, dd.toLowerCase()];
    if (!MONTHS.includes(mm)) return null;
  }
  let month = MONTHS.indexOf(mm) + 1;
  if (month > 12) month -= 12;
  if (dd.endsWith(",")) dd = dd.slice(0, -1);
  if (yy.indexOf(":") > 0) [yy, tm] = [tm, yy];
  if (yy.endsWith(",")) {
    yy = yy.slice(0, -1);
    if (!yy) return null;
  }
  if (!/^\d/.test(yy)) [yy, tz] = [tz, yy];
  if (tm.endsWith(",")) tm = tm.slice(0, -1);
  let time = tm.split(":");
  if (time.length === 1 && (time[0] ?? "").includes("."))
    time = (time[0] ?? "").split(".");
  if (time.length === 2) time.push("0");
  if (time.length !== 3) return null;
  const numbers = [yy, dd, ...time]
    .map(integer)
    .filter((value) => value !== null);
  if (numbers.length !== 5) return null;
  const [short = 0, day = 0, hour = 0, minute = 0, second = 0] = numbers;
  const year = short < 100 ? short + (short > 68 ? 1900 : 2000) : short;
  const zone = tz.toUpperCase();
  let offset: number | null =
    zone in ZONES ? (ZONES[zone] ?? null) : integer(zone);
  if (offset === 0 && zone.startsWith("-")) offset = null;
  if (offset === null) return null;
  const sign = offset < 0 ? -1 : 1;
  const absolute = Math.abs(offset);
  const seconds =
    sign * (Math.floor(absolute / 100) * 3600 + (absolute % 100) * 60);
  if (Math.abs(seconds) >= 86400 || hour < 0 || minute < 0 || second < 0)
    return null;
  const base = epoch(year, month, day, hour, minute, second);
  return base === null ? null : base - seconds;
}

/** Feed publication time as `...Z`; a date without a time zone is ambiguous and ignored. */
export function feedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  const parsed = isoInput(text.replaceAll("Z", "+00:00")) ?? rfc2822(text);
  return parsed === null ? null : isoZ(parsed);
}

/** Parse a Japanese calendar date (Gregorian, Reiwa, or Heisei) at JST midnight. */
export function japaneseDate(
  input: string,
  knownYear: number | null = null,
): [string | null, number | null] {
  const text = input.normalize("NFKC");
  let year = knownYear;
  const yearMatch = /(?:(20\d{2})年|(令和|平成)(元|\d+)年)/.exec(text);
  if (yearMatch) {
    year = yearMatch[1]
      ? Number(yearMatch[1])
      : (yearMatch[2] === "令和" ? 2018 : 1988) +
        (yearMatch[3] === "元" ? 1 : Number(yearMatch[3]));
  }
  const dayMatch = /(\d{1,2})月\s*(\d{1,2})日/.exec(text);
  const numeric = /^\s*(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\s*$/.exec(text);
  let local: number | null;
  if (numeric) {
    local = epoch(
      Number(numeric[1]),
      Number(numeric[2]),
      Number(numeric[3]),
      0,
      0,
      0,
    );
    if (local === null) return [null, year];
    year = Number(numeric[1]);
  } else if (dayMatch && year) {
    local = epoch(year, Number(dayMatch[1]), Number(dayMatch[2]), 0, 0, 0);
  } else {
    return [null, year];
  }
  return local === null ? [null, year] : [isoZ(local - JST_OFFSET), year];
}

/** Add a JST wall-clock hours and minutes to a date parsed by japaneseDate. */
export function withJstTime(
  stamp: string,
  hour: number,
  minute: number,
): string | null {
  const midnightUtc = Date.parse(stamp) / 1000;
  const local = midnightUtc + JST_OFFSET;
  const dayStart = local - (((local % 86400) + 86400) % 86400);
  if (hour > 23 || minute > 59) return null;
  return isoZ(dayStart + hour * 3600 + minute * 60 - JST_OFFSET);
}

/** Human-readable JST wall-clock time for messages, e.g. `2026/9/28 09:05:07 JST`. */
export function formatJst(epochSeconds: number): string {
  const fields = fieldsOf(Math.floor(epochSeconds) + JST_OFFSET);
  if (!fields) throw new RangeError("Timestamp out of range");
  return `${fields.year}/${fields.month}/${fields.day} ${pad(fields.hour)}:${pad(fields.minute)}:${pad(fields.second)} JST`;
}
