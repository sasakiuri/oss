// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { TopicSubscription, type TopicSubscriptionPolicy } from '@/main/modules/mqtt/application/TopicSubscription';

function createClient() {
  const calls: string[] = [];
  const removeListener = vi.fn(() => calls.push('removeListener'));
  const client = {
    subscribe: vi.fn(async (topic: string) => {
      calls.push(`subscribe ${topic}`);
    }),
    unsubscribe: vi.fn(async (topic: string) => {
      calls.push(`unsubscribe ${topic}`);
    }),
    onMessage: vi.fn(() => {
      calls.push('onMessage');
      return removeListener;
    }),
    isConnected: vi.fn(() => true),
  };
  return { calls, client };
}

const listenFirst: TopicSubscriptionPolicy = { listenBeforeSubscribe: true, unsubscribeErrors: 'ignore' };
const subscribeFirst: TopicSubscriptionPolicy = {
  listenBeforeSubscribe: false,
  unsubscribeErrors: 'rethrow-while-connected',
};

describe('TopicSubscription', () => {
  it.each([
    [listenFirst, ['onMessage', 'subscribe a/b']],
    [subscribeFirst, ['subscribe a/b', 'onMessage']],
  ])('registers the listener in the policy order (%o)', async (policy, expected) => {
    const { calls, client } = createClient();
    await new TopicSubscription(client, policy).open('a/b', vi.fn());
    expect(calls).toEqual(expected);
    expect(client.subscribe).toHaveBeenCalledWith('a/b', 1);
  });

  it('removes the listener before unsubscribing, and closes only once', async () => {
    const { calls, client } = createClient();
    const subscription = new TopicSubscription(client, subscribeFirst);
    await subscription.open('a/b', vi.fn());
    calls.length = 0;
    await subscription.close();
    await subscription.close();
    expect(calls).toEqual(['removeListener', 'unsubscribe a/b']);
  });

  it('keeps the topic after a failed SUBSCRIBE without a listener when subscribing first', async () => {
    const { calls, client } = createClient();
    client.subscribe.mockRejectedValueOnce(new Error('subscribe failed'));
    const subscription = new TopicSubscription(client, subscribeFirst);
    await expect(subscription.open('a/b', vi.fn())).rejects.toThrow('subscribe failed');
    await subscription.close();
    expect(calls).toEqual(['unsubscribe a/b']);
  });

  it('propagates an UNSUBSCRIBE failure while connected and keeps the topic for a retry', async () => {
    const { client } = createClient();
    const subscription = new TopicSubscription(client, subscribeFirst);
    await subscription.open('a/b', vi.fn());
    client.unsubscribe.mockRejectedValueOnce(new Error('unsubscribe failed'));
    await expect(subscription.close()).rejects.toThrow('unsubscribe failed');
    await subscription.close();
    expect(client.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('ignores an UNSUBSCRIBE failure after disconnecting', async () => {
    const { client } = createClient();
    const subscription = new TopicSubscription(client, subscribeFirst);
    await subscription.open('a/b', vi.fn());
    client.unsubscribe.mockRejectedValueOnce(new Error('unsubscribe failed'));
    client.isConnected.mockReturnValue(false);
    await expect(subscription.close()).resolves.toBeUndefined();
    await subscription.close();
    expect(client.unsubscribe).toHaveBeenCalledOnce();
  });

  it('ignores every UNSUBSCRIBE failure under the ignore policy', async () => {
    const { client } = createClient();
    const subscription = new TopicSubscription(client, listenFirst);
    await subscription.open('a/b', vi.fn());
    client.unsubscribe.mockRejectedValueOnce(new Error('unsubscribe failed'));
    await expect(subscription.close()).resolves.toBeUndefined();
    await subscription.close();
    expect(client.unsubscribe).toHaveBeenCalledOnce();
  });
});
