import { BaseError } from './base';

/**
 * Resource not found error
 */
export class NotFoundError extends BaseError {
  constructor(
    public readonly resource: string,
    public readonly resourceId?: string,
    cause?: unknown,
  ) {
    const message = resourceId ? `${resource} with id "${resourceId}" not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, cause, { resource, resourceId });
  }

  getUserMessage(): string {
    return `${this.resource}が見つかりませんでした。`;
  }
}

/**
 * Validation error with field information
 */
export class ValidationError extends BaseError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly constraints?: Record<string, string>,
    cause?: unknown,
  ) {
    super(message, 'VALIDATION_ERROR', 400, cause, { field, constraints });
  }

  getUserMessage(): string {
    return this.message;
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends BaseError {
  constructor(message: string = '認証が必要です', cause?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', 401, cause);
  }

  getUserMessage(): string {
    return 'ログインが必要です。';
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends BaseError {
  constructor(message: string = 'アクセス権限がありません', cause?: unknown) {
    super(message, 'AUTHORIZATION_ERROR', 403, cause);
  }

  getUserMessage(): string {
    return 'この操作を行う権限がありません。';
  }
}
