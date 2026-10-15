// SPDX-License-Identifier: MIT
// cspell:ignore garturlres Fbv4je wrb
import { utf8 } from "../../src/text.ts";

export const article = (id: string) =>
  `https://news.google.com/rss/articles/${id}`;

export const page = utf8(
  '<div data-n-a-ts="1700000000" data-n-a-sg="test-signature"></div>',
);

export function rpc(url = "https://example.org/story"): Uint8Array {
  return utf8(
    ")]}'\n\n123\n" +
      JSON.stringify([
        ["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", url])],
      ]) +
      "\n",
  );
}

export function legacy(url: string): string {
  const bytes = utf8(url);
  const prefix = [8, 19, 34];
  let size = bytes.length;
  while (size >= 128) {
    prefix.push((size & 127) | 128);
    size = Math.floor(size / 128);
  }
  prefix.push(size);
  return Buffer.from([...prefix, ...bytes, 0xd2, 1, 0]).toString("base64url");
}
