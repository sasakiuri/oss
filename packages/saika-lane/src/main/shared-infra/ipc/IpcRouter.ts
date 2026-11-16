// SPDX-License-Identifier: MIT
import type { Contract, InferHandlers, IpcErrorDto, ProcedureMap } from '@sasakiuri/saika-ipc';
import { toIpcError } from '@sasakiuri/saika-ipc/main';
import { ipcMain } from 'electron';
import { z } from 'zod';

import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { isDomainError } from '@/shared/errors/isDomainError';

/** Command response shape */
interface CommandResponse {
  success: boolean;
  error?: IpcErrorDto;
}

/** Query error response shape */
interface QueryErrorResponse {
  success: false;
  data: null;
  error: IpcErrorDto;
}

/** Validation error code constant */
const VALIDATION_ERROR_CODE = 'VALIDATION_ERROR';

/** Type-safe Object.keys for known-shape objects */
function typedKeys<T extends object>(obj: T): (keyof T & string)[] {
  return Object.keys(obj) as (keyof T & string)[];
}

/** Registers IPC handlers with Zod validation, response wrapping, and duplicate-channel checks. */
export class IpcRouter {
  private registeredChannels = new Set<string>();

  /**
   * Register all procedures from a contract with their handlers.
   */
  register<C extends Contract<string, ProcedureMap>>(contract: C, handlers: InferHandlers<C>): void {
    for (const key of typedKeys(contract.procedures)) {
      const channel = contract.channels[key]!;
      const proc = contract.procedures[key]!;
      const handler = handlers[key] as (...args: unknown[]) => Promise<unknown>;

      // Fail-fast: handler must exist for every procedure in the contract
      if (!handler) {
        throw ErrorCatalog.createError('IPC_HANDLER_MISSING', {
          detail: `Missing handler for procedure "${key}" in contract "${contract.namespace}"`,
        });
      }

      // Duplicate channel detection
      if (this.registeredChannels.has(channel)) {
        const logger = getLogger();
        logger.error(`Duplicate channel registration: "${channel}"`);
        throw ErrorCatalog.createError('IPC_DUPLICATE_CHANNEL', {
          detail: `Duplicate channel registration: "${channel}"`,
        });
      }
      this.registeredChannels.add(channel);

      // Zod v4: use instanceof z.ZodVoid (NOT _def.typeName)
      const isVoidInput = proc.input instanceof z.ZodVoid;
      const isQuery = proc.kind === 'query';

      const outputSchema = proc.output;

      ipcMain.handle(channel, async (event, payload) => {
        const logger = getLogger();

        // 1. Validate input (skip for z.void())
        if (!isVoidInput) {
          const parseResult = proc.input.safeParse(payload);
          if (!parseResult.success) {
            const zodErrors = parseResult.error.issues
              .map((issue: z.ZodIssue) => `${issue.path.join('.')}: ${issue.message}`)
              .join(', ');
            const errorMessage = `[${key}] Invalid IPC payload: ${zodErrors}`;

            logger.warn(`Validation failed for "${channel}"`, 'main', {
              operation: key,
              errors: zodErrors,
            });

            const validationError: IpcErrorDto = {
              code: VALIDATION_ERROR_CODE,
              message: errorMessage,
              metadata: {
                context: key,
                validationErrors: parseResult.error.issues.map((issue: z.ZodIssue) => ({
                  path: issue.path.join('.'),
                  message: issue.message,
                })),
              },
            };

            if (isQuery) {
              return this.validateOutput(
                { success: false, data: null, error: validationError } satisfies QueryErrorResponse,
                outputSchema,
                key,
                true,
              );
            }
            return this.validateOutput(
              { success: false, error: validationError } satisfies CommandResponse,
              outputSchema,
              key,
              false,
            );
          }

          // 2. Call handler with validated data, wrap result/error
          if (isQuery) {
            return this.wrapQuery(() => handler(parseResult.data, event), key, outputSchema);
          }
          return this.wrapCommand(() => handler(parseResult.data, event), key, outputSchema);
        }

        // Void input -- call handler with no args
        if (isQuery) {
          return this.wrapQuery(() => handler(event), key, outputSchema);
        }
        return this.wrapCommand(() => handler(event), key, outputSchema);
      });
    }
  }

  /**
   * Wrap a handler's result in command response format:
   * success -> { success: true, data?: result }
   * failure -> { success: false, error: ... }
   */
  private async wrapCommand(
    fn: () => Promise<unknown>,
    operationName: string,
    outputSchema: z.ZodType,
  ): Promise<unknown> {
    try {
      const result = await fn();
      return this.validateOutput({ success: true, data: result }, outputSchema, operationName, false);
    } catch (err) {
      const logger = getLogger();
      logger.error(`Command failed: ${operationName}`, 'main', {
        operation: operationName,
        error: err instanceof Error ? err.message : String(err),
      });
      return this.validateOutput(
        {
          success: false,
          error: toIpcError(err, { isDomainError, metadata: { operation: operationName } }),
        } satisfies CommandResponse,
        outputSchema,
        operationName,
        false,
      );
    }
  }

  /**
   * Wrap a handler's result in query response format:
   * success -> { success: true, data: result }
   * failure -> { success: false, data: null, error: ... }
   */
  private async wrapQuery(
    fn: () => Promise<unknown>,
    operationName: string,
    outputSchema: z.ZodType,
  ): Promise<unknown> {
    try {
      const result = await fn();
      return this.validateOutput({ success: true, data: result }, outputSchema, operationName, true);
    } catch (err) {
      const logger = getLogger();
      logger.error(`Query failed: ${operationName}`, 'main', {
        operation: operationName,
        error: err instanceof Error ? err.message : String(err),
      });
      return this.validateOutput(
        {
          success: false,
          data: null,
          error: toIpcError(err, { isDomainError, metadata: { operation: operationName } }),
        } satisfies QueryErrorResponse,
        outputSchema,
        operationName,
        true,
      );
    }
  }

  /**
   * Lets a response reach the renderer only when it matches the contract. A response that does not is logged and
   * replaced by an IPC_INVALID_RESPONSE error; a valid one is sent as the handler built it.
   */
  private validateOutput(response: unknown, schema: z.ZodType, operationName: string, isQuery: boolean): unknown {
    const validated = schema.safeParse(response);
    if (validated.success) return response;

    const validationErrors = validated.error.issues.map((issue: z.ZodIssue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    getLogger().error(`Output validation failed: ${operationName}`, 'main', {
      operation: operationName,
      errors: validationErrors.map(({ path, message }) => `${path}: ${message}`).join(', '),
    });
    const invalid = ErrorCatalog.createError('IPC_INVALID_RESPONSE');
    const error: IpcErrorDto = {
      code: invalid.code,
      message: `[${operationName}] ${invalid.message}`,
      metadata: { context: operationName, validationErrors },
    };
    return isQuery
      ? ({ success: false, data: null, error } satisfies QueryErrorResponse)
      : ({ success: false, error } satisfies CommandResponse);
  }
}
