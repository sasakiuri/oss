// SPDX-License-Identifier: MIT
/**
 * DomainError base class
 *
 * Base class for domain errors used throughout the application.
 * All domain-specific errors extend this class.
 *
 * Key features:
 * - Conforms to the standard error protocol via Error inheritance
 * - Manages error code, user message, and severity
 * - Supports metadata and cause error chaining
 * - Runtime immutability guaranteed via Object.freeze
 * - JSON conversion methods for logging, UI display, and debugging
 */
export abstract class DomainError extends Error {
  /**
   * Error code (e.g. SESSION_NOT_FOUND, VALIDATION_ERROR)
   */
  readonly code: string;

  /**
   * User-facing error message
   */
  readonly userMessage: string;

  /**
   * Error severity
   */
  readonly severity: 'error' | 'warning' | 'info';

  /**
   * Additional metadata associated with the error
   */
  readonly metadata?: Record<string, unknown>;

  /**
   * The originating error (for error chaining)
   */
  readonly cause?: Error;

  /**
   * Timestamp when the error occurred
   */
  readonly timestamp: Date;

  /**
   * Create a DomainError
   *
   * @param code - Error code
   * @param message - Developer-facing error message (English recommended)
   * @param userMessage - User-facing error message
   * @param severity - Error severity (default: 'error')
   * @param metadata - Additional metadata associated with the error
   * @param cause - The originating error
   */
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

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Return error information in JSON format
   *
   * Used for logging and debugging.
   *
   * @returns JSON representation of the error information
   */
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

  /**
   * Return a string for user-facing display
   *
   * Used when showing error messages in the UI.
   *
   * @returns User-facing error message
   */
  toUserDisplay(): string {
    return this.userMessage;
  }

  /**
   * Wrap a standard Error in a DomainError
   *
   * Used to convert errors from external libraries or the system into domain errors.
   *
   * @param error - The error to wrap
   * @param code - Error code
   * @param userMessage - User-facing error message
   * @returns DomainError instance
   */
  static wrap(error: Error, code: string, userMessage: string): DomainError {
    // If already a DomainError, return as-is
    if (error instanceof DomainError) {
      return error;
    }

    // Wrap the standard Error
    return new WrappedDomainError(code, error.message, userMessage, 'error', undefined, error);
  }

  /**
   * Deep-freeze an object
   *
   * Freezes nested objects and arrays as well to guarantee metadata immutability.
   *
   * @param obj - The object to freeze
   * @returns The frozen object
   */
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

/**
 * Internal DomainError implementation for the wrap() method
 */
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
