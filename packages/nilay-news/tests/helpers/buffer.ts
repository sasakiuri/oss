// SPDX-License-Identifier: MIT
import type { Mock, vi } from "vitest";

import type {
  BufferPost,
  PublishingClient,
} from "../../src/publishing/types.ts";

export function channel(changes: Record<string, unknown> = {}) {
  return {
    id: "channel-123",
    name: "@NilayNews",
    service: "twitter",
    allowedActions: ["scheduleUpdates", "readUpdates"],
    isDisconnected: false,
    isLocked: false,
    isQueuePaused: false,
    linkShortening: { isEnabled: false },
    ...changes,
  };
}

export function limit(changes: Record<string, unknown> = {}) {
  return {
    channelId: "channel-123",
    isAtLimit: false,
    limit: 100,
    scheduled: 99,
    ...changes,
  };
}

/** A verified account with room for one more post today. */
export function account(
  changes: Record<string, unknown> = {},
  limits: unknown = [limit()],
): { data: Record<string, unknown> } {
  return { data: { channel: channel(changes), dailyPostingLimits: limits } };
}

/** Configure the identity once for tests of delayed or fixture-specific remote posts. */
export function postFixture(
  identity: Pick<
    BufferPost,
    "id" | "channelId" | "channelService" | "externalLink"
  >,
  defaultStatus: BufferPost["status"] = "sent",
) {
  return (text: string, status = defaultStatus): BufferPost => ({
    ...identity,
    text,
    status,
  });
}

export function remotePost(
  text = "本文",
  status: BufferPost["status"] = "sent",
  changes: Record<string, unknown> = {},
): BufferPost {
  return {
    id: "buffer-123",
    channelId: "channel-123",
    channelService: "twitter",
    text,
    status,
    externalLink: "https://x.com/NilayNews/status/123",
    ...changes,
  } as BufferPost;
}

export interface FakePublishingClient extends PublishingClient {
  channel: string;
  verifyAccount: Mock<PublishingClient["verifyAccount"]>;
  post: Mock<PublishingClient["post"]>;
  getPost: Mock<PublishingClient["getPost"]>;
}

/** Mock creation is injected so pure Buffer fixtures also bundle into test Workers. */
export function fakePublishingClient(
  mock: typeof vi.fn,
  channelId = "channel-123",
  post: ((text: string) => BufferPost) | null = remotePost,
): FakePublishingClient {
  return {
    channel: channelId,
    verifyAccount: post
      ? mock<PublishingClient["verifyAccount"]>(async () => undefined)
      : mock<PublishingClient["verifyAccount"]>(),
    post: post
      ? mock<PublishingClient["post"]>(async (text) => post(text))
      : mock<PublishingClient["post"]>(),
    getPost: post
      ? mock<PublishingClient["getPost"]>(async (_id, text) => post(text))
      : mock<PublishingClient["getPost"]>(),
  };
}
