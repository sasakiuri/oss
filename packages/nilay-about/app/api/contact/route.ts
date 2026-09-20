import { NextResponse } from 'next/server';

import { checkRateLimit, getClientIp, rateLimitPresets } from '@/lib/api/rate-limit';
import { env } from '@/lib/env';
import { createRequestLogger } from '@/lib/logging';
import { contactFormSchema } from '@/lib/schemas';
// Import directly to avoid loading DOMPurify in serverless environment
import { sanitizeForSlack } from '@/lib/security/sanitize-logging';

export async function POST(request: Request) {
  const log = createRequestLogger(request);

  try {
    // Rate limiting check
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(clientIp, rateLimitPresets.contact);

    if (!rateLimit.allowed) {
      log.warn('Rate limit exceeded', { clientIp, resetIn: rateLimit.resetIn });
      return NextResponse.json(
        {
          hasError: true,
          errorMessage: `送信回数の制限に達しました。${Math.ceil(rateLimit.resetIn / 1000)}秒後に再度お試しください。`,
          uuid: '',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          },
        },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      log.warn('Invalid JSON in request body', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return NextResponse.json(
        {
          hasError: true,
          errorMessage: 'リクエストの形式が不正です。',
          uuid: '',
        },
        { status: 400 },
      );
    }

    const result = contactFormSchema.safeParse(body);

    if (!result.success) {
      log.warn('Invalid request body', {
        errors: result.error.flatten(),
      });
      return NextResponse.json(
        {
          hasError: true,
          errorMessage: '入力内容に誤りがあります。',
          uuid: '',
        },
        { status: 400 },
      );
    }

    // Check webhook URL configuration
    const webhookUrl = env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      log.error('SLACK_WEBHOOK_URL is not configured');
      return NextResponse.json(
        {
          hasError: true,
          errorMessage: 'サーバー設定エラーです。管理者にお問い合わせください。',
          uuid: '',
        },
        { status: 500 },
      );
    }

    const data = result.data;
    const uuid = crypto.randomUUID();

    // Slack mrkdwn injection防止のためユーザー入力をサニタイズ
    const sanitizedTitle = sanitizeForSlack(data.title);
    const sanitizedMessage = sanitizeForSlack(data.message);
    const sanitizedEmail = data.email ? sanitizeForSlack(data.email) : null;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `お問い合わせ: ${sanitizedTitle}`,
          emoji: false,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'plain_text',
            text: `返信希望: ${data.requiresReply ? 'はい' : 'いいえ'}`,
            emoji: false,
          },
          {
            type: 'plain_text',
            text: `Eメール: ${sanitizedEmail || '（未入力）'}`,
            emoji: false,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'plain_text',
          text: `お問い合わせ内容:\n${sanitizedMessage}`,
          emoji: false,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'plain_text',
            text: `お問い合わせ番号: ${uuid}`,
            emoji: false,
          },
        ],
      },
    ];

    // Slack webhook with timeout (10 seconds)
    const WEBHOOK_TIMEOUT_MS = 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ blocks }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // AbortError の場合はタイムアウト
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        log.error('Slack webhook request timed out', fetchError, {
          timeoutMs: WEBHOOK_TIMEOUT_MS,
        });
        return NextResponse.json(
          {
            hasError: true,
            errorMessage: '外部サービスへの接続がタイムアウトしました。しばらく時間をおいてから再度お試しください。',
            uuid: '',
          },
          { status: 504 },
        );
      }

      // その他のネットワークエラー
      log.error(
        'Slack webhook request failed',
        fetchError instanceof Error ? fetchError : new Error(String(fetchError)),
      );
      return NextResponse.json(
        {
          hasError: true,
          errorMessage: '外部サービスへの接続に失敗しました。しばらく時間をおいてから再度お試しください。',
          uuid: '',
        },
        { status: 502 },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      log.error('Slack webhook request failed', undefined, {
        status: response.status,
      });
      return NextResponse.json(
        {
          hasError: true,
          errorMessage: '送信に失敗しました。しばらく時間をおいてから再度お試しください。',
          uuid: '',
        },
        { status: 500 },
      );
    }

    log.info('Contact message sent successfully', { uuid });
    return NextResponse.json({
      hasError: false,
      errorMessage: '',
      uuid,
    });
  } catch (error) {
    log.error('Unexpected error in contact API', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      {
        hasError: true,
        errorMessage: '送信に失敗しました。しばらく時間をおいてから再度お試しください。',
        uuid: '',
      },
      { status: 500 },
    );
  }
}
