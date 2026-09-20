import { z } from 'zod';

import { ValidationError } from '@/lib/errors';

/**
 * Runtime validation for API responses
 *
 * Validates data against Zod schemas and provides type-safe results
 */

/**
 * Validate data against a Zod schema
 * @throws ValidationError if validation fails
 */
export function validateResponse<T>(schema: z.ZodSchema<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    throw new ValidationError(
      `Invalid response from ${context}`,
      undefined,
      Object.fromEntries(issues.map((i) => [i.path || 'root', i.message])),
    );
  }

  return result.data;
}

/**
 * Safe validation that returns Result type instead of throwing
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: z.ZodError<T> } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}

/**
 * Partial validation - validates only present fields
 * Useful for patch operations
 */
export function validatePartial<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  data: unknown,
  context: string,
): Partial<z.infer<T>> {
  const partialSchema = schema.partial();
  return validateResponse(partialSchema, data, context);
}
