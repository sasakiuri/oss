// SPDX-License-Identifier: MIT

const JST_OFFSET_MS = 9 * 3600 * 1000;

function pad2(value) {
  return String(value).padStart(2, "0");
}

/** Japan Standard Time (no DST) wall clock in 24-hour form, independent of the browser zone. */
function jstClock(epochMs, includeTime, includeSeconds = false) {
  const jst = new Date(epochMs + JST_OFFSET_MS);
  const day = `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`;
  if (!includeTime) return day;
  const seconds = includeSeconds ? `:${pad2(jst.getUTCSeconds())}` : "";
  return `${day} ${pad2(jst.getUTCHours())}:${pad2(jst.getUTCMinutes())}${seconds} JST`;
}

export function dateText(value, includeTime = false) {
  if (!value) return "日時不明";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "日時不明";
  return jstClock(time, includeTime);
}

// A URL is kept verbatim; otherwise an ISO date-time with an explicit zone,
// not glued to other date, URL or identifier characters.
const MESSAGE_TIME =
  /(https?:\/\/\S+)|(?<![\w/.:+-])(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})(?![\w:+-]|\.\d)/g;

/** Server text with stored UTC ISO timestamps rewritten as JST; anything invalid stays as is. */
export function messageText(text) {
  if (typeof text !== "string") return text;
  return text.replace(
    MESSAGE_TIME,
    (match, url, y, mo, d, h, mi, s, fraction, zone) => {
      if (url) return match;
      const [year, month, day, hour, minute, second] = [
        y,
        mo,
        d,
        h,
        mi,
        s || "0",
      ].map(Number);
      const [zoneHour, zoneMinute] =
        zone === "Z" ? [0, 0] : zone.slice(1).split(":").map(Number);
      if (
        hour > 23 ||
        minute > 59 ||
        second > 59 ||
        zoneHour > 23 ||
        zoneMinute > 59
      )
        return match;
      const local = Date.UTC(year, month - 1, day, hour, minute, second);
      const check = new Date(local);
      if (
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
      )
        return match;
      const offset =
        (zoneHour * 60 + zoneMinute) * 60000 * (zone.startsWith("-") ? -1 : 1);
      const fractionMs = fraction
        ? Math.floor(Number(`0${fraction}`) * 1000)
        : 0;
      return jstClock(local - offset + fractionMs, true, s !== undefined);
    },
  );
}

export function shortDate(article) {
  return article.publishedAt
    ? dateText(article.publishedAt)
    : `${dateText(article.discoveredAt)} 収集`;
}
