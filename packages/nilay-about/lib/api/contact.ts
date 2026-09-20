import { NetworkError } from '@/lib/errors';
import { contactResponseSchema } from '@/lib/schemas';
import type { ContactFormData, ContactResponse } from '@/lib/schemas';

import type { ContactService } from './types';

/**
 * APIレスポンスエラー
 */
export class ApiResponseError extends NetworkError {
  constructor(
    message: string,
    url: string,
    public readonly httpStatus: number,
    cause?: unknown,
  ) {
    super(message, url, httpStatus, cause);
  }

  getUserMessage(): string {
    if (this.httpStatus === 429) {
      return 'リクエストが多すぎます。しばらくしてからお試しください。';
    }
    if (this.httpStatus >= 500) {
      return 'サーバーエラーが発生しました。しばらくしてからお試しください。';
    }
    if (this.httpStatus === 400) {
      return '入力内容に問題があります。内容を確認してください。';
    }
    return '通信エラーが発生しました。インターネット接続を確認してください。';
  }
}

/**
 * API Route経由のコンタクトサービス
 */
class ApiContactService implements ContactService {
  async send(data: ContactFormData): Promise<ContactResponse> {
    const url = '/api/contact';

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
    } catch (cause) {
      throw new NetworkError('お問い合わせの送信に失敗しました', url, undefined, cause);
    }

    // Check HTTP status before parsing response
    if (!response.ok) {
      let errorMessage = 'お問い合わせの送信に失敗しました';
      try {
        const errorBody = await response.json();
        // API側は hasError/errorMessage 形式を返すため、両形式に対応
        if (errorBody?.errorMessage) {
          errorMessage = errorBody.errorMessage;
        } else if (errorBody?.error) {
          errorMessage = errorBody.error;
        }
      } catch {
        // Ignore JSON parse errors for error responses
      }
      throw new ApiResponseError(errorMessage, url, response.status);
    }

    // Parse and validate response
    let rawResult: unknown;
    try {
      rawResult = await response.json();
    } catch (cause) {
      throw new NetworkError('レスポンスの解析に失敗しました', url, response.status, cause);
    }

    // Validate response schema
    const parseResult = contactResponseSchema.safeParse(rawResult);
    if (!parseResult.success) {
      throw new NetworkError('レスポンス形式が不正です', url, response.status, parseResult.error);
    }

    return parseResult.data;
  }
}

// Singleton instance
const contactService = new ApiContactService();

// Public API function (facade pattern)
export async function sendContactMessage(data: ContactFormData): Promise<ContactResponse> {
  return contactService.send(data);
}

// Export for testing and DI
export { contactService, ApiContactService };
export type { ContactService };
