// SPDX-License-Identifier: MIT
export interface BufferPost {
  id: string;
  channelId: string;
  channelService: "twitter";
  text: string;
  status:
    "draft" | "error" | "needs_approval" | "scheduled" | "sending" | "sent";
  externalLink?: unknown;
}

/** Remote publishing operations required by the durable publication workflow. */
export interface PublishingClient {
  readonly channel: string;
  verifyAccount(): Promise<void>;
  post(text: string): Promise<BufferPost>;
  getPost(id: string, text: string, channelId?: string): Promise<BufferPost>;
}
