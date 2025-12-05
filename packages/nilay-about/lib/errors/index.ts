// Re-export all error types
export * from "./base";
export * from "./domain-errors";
export * from "./infrastructure-errors";

// Legacy compatibility exports
import { BaseError, isBaseError, getUserFriendlyMessage } from "./base";
import { NotFoundError, ValidationError } from "./domain-errors";
import { NetworkError } from "./infrastructure-errors";

/** @deprecated Use BaseError instead */
export class AppError extends BaseError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    cause?: unknown
  ) {
    super(message, code, statusCode, cause);
  }

  getUserMessage(): string {
    return this.message;
  }
}

/** @deprecated Use isBaseError instead */
export function isAppError(error: unknown): error is BaseError {
  return isBaseError(error);
}

/** @deprecated Use getUserFriendlyMessage instead */
export function getErrorMessage(error: unknown): string {
  return getUserFriendlyMessage(error);
}

// Re-export commonly used classes for convenience
export { NotFoundError, ValidationError, NetworkError };
