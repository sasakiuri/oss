import 'server-only';

import { sanitizeForSlack } from '@/lib/security/sanitize-logging';
import { RequestError } from '@/lib/server/http';

import type { ContactFormData } from '../schema';

import type { DeliverContact } from './handler';

const plainText = (text: string) => ({ type: 'plain_text' as const, text, emoji: false });

// Split before escaping so entities and surrogate pairs cannot be cut between blocks.
function sections(text: string) {
  const chunks: string[] = [];
  let chunk = '';
  for (const character of text) {
    const escaped = sanitizeForSlack(character);
    if (chunk.length + escaped.length > 3000) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += escaped;
  }
  if (chunk) chunks.push(chunk);
  return chunks.map((value) => ({ type: 'section', text: plainText(value) }));
}

/** Slack section text allows 3000 characters; headers allow only 150. */
export function createContactPayload(data: ContactFormData, id: string) {
  return {
    blocks: [
      { type: 'header', text: plainText('お問い合わせ') },
      ...sections(`タイトル: ${data.title}`),
      ...sections(`返信希望: ${data.requiresReply ? 'はい' : 'いいえ'}\nEメール: ${data.email || '（未入力）'}`),
      ...sections(`お問い合わせ内容:\n${data.message}`),
      { type: 'context', elements: [plainText(`お問い合わせ番号: ${id}`)] },
    ],
  };
}

export function createSlackDelivery(options: {
  getWebhookUrl: () => string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): DeliverContact {
  return async (data, id) => {
    const url = options.getWebhookUrl();
    if (!url) throw new RequestError(500, 'サーバー設定エラーです。管理者にお問い合わせください。');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    try {
      const response = await (options.fetch ?? fetch)(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createContactPayload(data, id)),
        signal: controller.signal,
      });
      if (!response.ok) throw new RequestError(502, '送信に失敗しました。しばらく時間をおいてから再度お試しください。');
    } catch (error) {
      if (error instanceof RequestError) throw error;
      if (controller.signal.aborted) throw new RequestError(504, '外部サービスへの接続がタイムアウトしました。');
      throw new RequestError(502, '外部サービスへの接続に失敗しました。');
    } finally {
      clearTimeout(timeout);
    }
  };
}
