/**
 * Type-safe success/failure utility that requires callers to handle returned errors.
 */

/**
 * Successful result.
 */
export interface Ok<T> {
  readonly success: true;
  readonly data: T;
}

/**
 * Failed result.
 */
export interface Err<E> {
  readonly success: false;
  readonly error: E;
}

/**
 * Discriminated union representing either success (Ok) or failure (Err).
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Result factories and utilities.
 */
export const Result = {
  /**
   * Creates a successful result.
   */
  ok<T>(data: T): Ok<T> {
    return { success: true, data };
  },

  /**
   * Creates a failed result.
   */
  err<E>(error: E): Err<E> {
    return { success: false, error };
  },

  /**
   * Checks whether a value is a Result.
   */
  isResult<T, E>(value: unknown): value is Result<T, E> {
    return (
      typeof value === 'object' &&
      value !== null &&
      'success' in value &&
      typeof (value as Result<T, E>).success === 'boolean'
    );
  },

  /**
   * Checks whether a Result is successful.
   */
  isOk<T, E>(result: Result<T, E>): result is Ok<T> {
    return result.success === true;
  },

  /**
   * Checks whether a Result is a failure.
   */
  isErr<T, E>(result: Result<T, E>): result is Err<E> {
    return result.success === false;
  },

  /**
   * Maps the value only on success.
   */
  map<T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
    if (result.success) {
      return Result.ok(fn(result.data));
    }
    return result;
  },

  /**
   * Maps the error only on failure.
   */
  mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
    if (!result.success) {
      return Result.err(fn(result.error));
    }
    return result;
  },

  /**
   * Applies a Result-returning function only on success.
   */
  flatMap<T, U, E>(result: Result<T, E>, fn: (data: T) => Result<U, E>): Result<U, E> {
    if (result.success) {
      return fn(result.data);
    }
    return result;
  },

  /**
   * Returns the successful value or a default.
   */
  unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    if (result.success) {
      return result.data;
    }
    return defaultValue;
  },

  /**
   * Returns the successful value, throwing on failure.
   * @throws Error when the result is a failure.
   */
  unwrap<T, E>(result: Result<T, E>): T {
    if (result.success) {
      return result.data;
    }
    throw result.error instanceof Error ? result.error : new Error(String(result.error));
  },

  /**
   * Returns the error value, throwing on success.
   * @throws Error when the result is successful.
   */
  unwrapErr<T, E>(result: Result<T, E>): E {
    if (!result.success) {
      return result.error;
    }
    throw new Error('Called unwrapErr on Ok value');
  },

  /**
   * Converts a Promise<T> to a Promise<Result<T, E>>.
   */
  async fromPromise<T, E = Error>(promise: Promise<T>, errorMapper?: (error: unknown) => E): Promise<Result<T, E>> {
    try {
      const data = await promise;
      return Result.ok(data);
    } catch (error) {
      if (errorMapper) {
        return Result.err(errorMapper(error));
      }
      return Result.err(error as E);
    }
  },

  /**
   * Wraps a function result in a Result.
   */
  tryCatch<T, E = Error>(fn: () => T, errorMapper?: (error: unknown) => E): Result<T, E> {
    try {
      const data = fn();
      return Result.ok(data);
    } catch (error) {
      if (errorMapper) {
        return Result.err(errorMapper(error));
      }
      return Result.err(error as E);
    }
  },
} as const;

/**
 * Parse error details.
 */
export interface ParseError {
  readonly code: string;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

/**
 * Creates a ParseError.
 */
export function createParseError(code: string, message: string, context?: Record<string, unknown>): ParseError {
  return { code, message, context };
}
