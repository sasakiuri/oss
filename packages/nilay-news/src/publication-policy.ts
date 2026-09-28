// SPDX-License-Identifier: MIT
/**
 * Minimum spacing between automatic posting rounds: the first round after
 * enabling, and each round after the previous one opened. A round posts
 * every candidate at its opening, one post per article, one after another.
 * An idle scheduler reserves nothing, so fresh news opens a round as soon as
 * it is due.
 */
export const POST_INTERVAL_SECONDS = 60 * 60;

/** Japan Standard Time is UTC+9 all year, without daylight saving time. */
export const POST_WINDOW_UTC_OFFSET_SECONDS = 9 * 60 * 60;
/** The daily window in which a new automatic post may be sent, 06:00 inclusive. */
export const POST_WINDOW_START_SECONDS = 6 * 60 * 60;
/** The end of the daily window, 23:00 exclusive. */
export const POST_WINDOW_END_SECONDS = 23 * 60 * 60;
/** How the posting window is shown to people. */
export const POST_WINDOW_LABEL = "06:00〜23:00 JST（23:00以降送信なし）";

const DAY_SECONDS = 24 * 60 * 60;

function secondOfJstDay(at: number): number {
  if (!Number.isFinite(at))
    throw new RangeError("投稿時刻の判定に不正な時刻が渡されました");
  const local = (at + POST_WINDOW_UTC_OFFSET_SECONDS) % DAY_SECONDS;
  return local < 0 ? local + DAY_SECONDS : local;
}

/**
 * Whether an automatic post may be sent at `at` (epoch seconds): from 06:00
 * up to, but not including, 23:00 JST. Only sending a new post is limited;
 * confirming an already submitted post is not.
 */
export function isPostingTime(at: number): boolean {
  const second = secondOfJstDay(at);
  return (
    second >= POST_WINDOW_START_SECONDS && second < POST_WINDOW_END_SECONDS
  );
}

/** The earliest time at or after `at` (epoch seconds) when a new automatic post may be sent. */
export function nextPostingAt(at: number): number {
  const second = secondOfJstDay(at);
  if (second < POST_WINDOW_START_SECONDS)
    return at + POST_WINDOW_START_SECONDS - second;
  if (second < POST_WINDOW_END_SECONDS) return at;
  return at + DAY_SECONDS - second + POST_WINDOW_START_SECONDS;
}
