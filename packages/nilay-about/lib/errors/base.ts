/**
 * Base error class with structured error information
 */
export interface ErrorContext {
  readonly code: string;
  readonly statusCode: number;
  readonly timestamp: Date;
  readonly requestId?: string;
  readonly metadata?: Record<string, unknown>;
}

export abstract class BaseError extends Error {
  public readonly context: ErrorContext;
  public readonly cause?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    cause?: unknown,
    metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;
    this.context = {
      code,
      statusCode,
      timestamp: new Date(),
      metadata,
    };

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging/API responses
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.context.code,
      statusCode: this.context.statusCode,
      timestamp: this.context.timestamp.toISOString(),
      metadata: this.context.metadata,
      stack: this.stack,
    };
  }

  /**
   * User-friendly message for display
   */
  abstract getUserMessage(): string;
}

/**
 * Type guard for BaseError
 */
export function isBaseError(error: unknown): error is BaseError {
  return error instanceof BaseError;
}

/**
 * Extract user-friendly message from any error
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (isBaseError(error)) {
    return error.getUserMessage();
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '予期しないエラーが発生しました';
}

/**
 * Extract error code from any error
 */
export function getErrorCode(error: unknown): string {
  if (isBaseError(error)) {
    return error.context.code;
  }
  return 'UNKNOWN_ERROR';
}
