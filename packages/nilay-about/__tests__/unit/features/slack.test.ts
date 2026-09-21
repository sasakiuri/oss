import { afterEach, describe, expect, it, vi } from 'vitest';

import { createContactPayload, createSlackDelivery } from '@/features/contact/server/slack';
import { sanitizeForSlack } from '@/lib/security/sanitize-logging';

const data = { title: 'Question', message: 'Message', requiresReply: false };
afterEach(() => vi.useRealTimers());

describe('Slack adapter', () => {
  it('keeps the full maximum-length input within Slack block limits after escaping', () => {
    const message = '&<>@😀'.repeat(333);
    const payload = createContactPayload({ ...data, title: '&'.repeat(200), message }, 'tracking-id');
    const sections = payload.blocks.filter((block) => block.type === 'section');
    const text = sections.map((block) => ('text' in block ? (block.text?.text ?? '') : '')).join('');
    expect(text).toContain(sanitizeForSlack(message));
    const blocksWithText = payload.blocks.flatMap((block) =>
      'text' in block && block.text ? [{ text: block.text, limit: block.type === 'header' ? 150 : 3000 }] : [],
    );
    for (const block of blocksWithText) {
      expect(block.text.type).toBe('plain_text');
      expect(block.text.text.length).toBeLessThanOrEqual(block.limit);
    }
    expect(text).not.toContain('@channel');
  });

  it('posts one payload without exposing the webhook in errors', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('ok'));
    await createSlackDelivery({ getWebhookUrl: () => 'https://example.test/private', fetch })(data, 'id');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://example.test/private', expect.objectContaining({ method: 'POST' }));
  });

  it('fails explicitly when the webhook is unconfigured', async () => {
    const fetch = vi.fn();
    await expect(createSlackDelivery({ getWebhookUrl: () => undefined, fetch })(data, 'id')).rejects.toMatchObject({
      status: 500,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps a rejected response to a gateway error', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('invalid_blocks', { status: 400 }));
    await expect(
      createSlackDelivery({ getWebhookUrl: () => 'https://example.test', fetch })(data, 'id'),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('maps transport failures without returning private details', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('private webhook token'));
    await expect(
      createSlackDelivery({ getWebhookUrl: () => 'https://example.test', fetch })(data, 'id'),
    ).rejects.toMatchObject({ status: 502, message: '外部サービスへの接続に失敗しました。' });
  });

  it('aborts the network request on timeout and clears the timer', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const promise = createSlackDelivery({ getWebhookUrl: () => 'https://example.test', fetch, timeoutMs: 50 })(
      data,
      'id',
    );
    await Promise.all([expect(promise).rejects.toMatchObject({ status: 504 }), vi.advanceTimersByTimeAsync(50)]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
