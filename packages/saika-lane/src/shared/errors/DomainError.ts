// SPDX-License-Identifier: MIT
/** Immutable error with a code, user message, severity, metadata, and optional cause. */
export abstract class DomainError extends Error {
  /**
   * Error code (e.g. SESSION_NOT_FOUND, VALIDATION_ERROR)
   */
  readonly code: string;

  /**
   * User-facing error message
   */
  readonly userMessage: string;

  readonly severity: 'error' | 'warning' | 'info';

  readonly metadata?: Record<string, unknown>;

  /**
   * The originating error (for error chaining)
   */
  readonly cause?: Error;

  readonly timestamp: Date;

  /** message is for logs; userMessage is for display. */
  constructor(
    code: string,
    message: string,
    userMessage: string,
    severity: 'error' | 'warning' | 'info' = 'error',
    metadata?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(message);

    // Standard setup for Error inheritance
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === 'function') {
      try {
        Error.captureStackTrace(this, this.constructor);
      } catch {
        // captureStackTrace may fail in some environments such as jsdom
        // Fallback: get stack from standard Error
        this.stack = new Error(message).stack;
      }
    } else {
      // Environments where captureStackTrace is not available (e.g. browser)
      this.stack = new Error(message).stack;
    }

    this.code = code;
    this.userMessage = userMessage;
    this.severity = severity;
    this.metadata = metadata ? this.deepFreeze(metadata) : undefined;
    this.cause = cause;
    this.timestamp = new Date();

    Object.freeze(this);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      metadata: this.metadata,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
            stack: this.cause.stack ?? undefined,
          }
        : undefined,
    };
  }

  toUserDisplay(): string {
    return this.userMessage;
  }

  /** Preserves an existing DomainError; otherwise wraps the error as its cause. */
  static wrap(error: Error, code: string, userMessage: string): DomainError {
    // If already a DomainError, return as-is
    if (error instanceof DomainError) {
      return error;
    }

    // Wrap the standard Error
    return new WrappedDomainError(code, error.message, userMessage, 'error', undefined, error);
  }

  private deepFreeze<T>(obj: T): T {
    // Return primitive types as-is
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // For arrays
    if (Array.isArray(obj)) {
      obj.forEach((item) => this.deepFreeze(item));
      return Object.freeze(obj);
    }

    // For objects
    Object.keys(obj).forEach((key) => {
      const value = (obj as Record<string, unknown>)[key];
      if (typeof value === 'object' && value !== null) {
        this.deepFreeze(value);
      }
    });

    return Object.freeze(obj);
  }
}

class WrappedDomainError extends DomainError {
  constructor(
    code: string,
    message: string,
    userMessage: string,
    severity: 'error' | 'warning' | 'info' = 'error',
    metadata?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(code, message, userMessage, severity, metadata, cause);
  }
}
