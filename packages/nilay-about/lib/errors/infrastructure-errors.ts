import { BaseError } from './base';

/**
 * Network/HTTP error
 */
export class NetworkError extends BaseError {
  constructor(
    message: string = 'ネットワークエラーが発生しました',
    public readonly url?: string,
    public readonly httpStatus?: number,
    cause?: unknown,
  ) {
    super(message, 'NETWORK_ERROR', 503, cause, { url, httpStatus });
  }

  getUserMessage(): string {
    return '通信エラーが発生しました。インターネット接続を確認してください。';
  }
}

/**
 * External service error (Firebase, etc.)
 */
export class ExternalServiceError extends BaseError {
  constructor(
    public readonly serviceName: string,
    message?: string,
    cause?: unknown,
  ) {
    super(message || `External service error: ${serviceName}`, 'EXTERNAL_SERVICE_ERROR', 502, cause, { serviceName });
  }

  getUserMessage(): string {
    return 'サービスに一時的な問題が発生しています。しばらくしてからお試しください。';
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends BaseError {
  constructor(
    public readonly retryAfter?: number,
    cause?: unknown,
  ) {
    super('Rate limit exceeded', 'RATE_LIMIT_ERROR', 429, cause, { retryAfter });
  }

  getUserMessage(): string {
    return 'リクエストが多すぎます。しばらくしてからお試しください。';
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends BaseError {
  constructor(
    public readonly configKey: string,
    message?: string,
    cause?: unknown,
  ) {
    super(message || `Configuration error: ${configKey}`, 'CONFIGURATION_ERROR', 500, cause, { configKey });
  }

  getUserMessage(): string {
    return 'システム設定に問題があります。管理者にお問い合わせください。';
  }
}
