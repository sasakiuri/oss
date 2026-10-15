// SPDX-License-Identifier: MIT
import { isRecord } from "../text.ts";

import { PostError } from "./errors.ts";
import type { BufferPost } from "./types.ts";

const POST_STATUSES = new Set([
  "draft",
  "error",
  "needs_approval",
  "scheduled",
  "sending",
  "sent",
]);

function matchesPost(
  post: unknown,
  text: string,
  channelId: string,
  postId?: string,
): post is BufferPost {
  return (
    isRecord(post) &&
    typeof post.id === "string" &&
    /^[A-Za-z0-9_-]{1,200}$/.test(post.id) &&
    (postId === undefined || post.id === postId) &&
    post.channelId === channelId &&
    post.channelService === "twitter" &&
    post.text === text &&
    typeof post.status === "string" &&
    POST_STATUSES.has(post.status)
  );
}

/** Accept a post only when its complete publication identity is verified. */
export function validatePost(
  post: unknown,
  text: string,
  channelId: string,
  postId?: string,
): BufferPost {
  if (!matchesPost(post, text, channelId, postId)) {
    throw new PostError(
      "Buffer の投稿 ID・投稿先・本文・状態を照合できません。Buffer と X を確認してください",
      true,
    );
  }
  return post;
}

/** X status id from a known X URL only; untrusted remote links are never shown. */
export function xPostId(post: BufferPost): string | null {
  const link = post.externalLink ?? "";
  if (typeof link !== "string") return null;
  return (
    /^https:\/\/(?:x\.com|twitter\.com)\/(?:NilayNews|i\/web)\/status\/([0-9]{1,30})\/?$/i.exec(
      link,
    )?.[1] ?? null
  );
}
