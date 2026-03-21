// SPDX-License-Identifier: MIT
import { ipcMain } from 'electron';
import { z } from 'zod';

import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import type { Contract, InferHandlers, IpcErrorDto, ProcedureMap } from '@/shared/ipc/defineContract';

import { toIpcError } from './toIpcError';

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

/**
 * Auto-registers `ipcMain.handle` calls from a Contract + handler mapping.
 *
 * Responsibilities:
 * - Zod input validation
 * - Error wrapping (CommandResponse / QueryResponse format)
 * - Duplicate channel detection
 * - Logging via getLogger() singleton
 */
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
              return {
                success: false,
                data: null,
                error: validationError,
              } satisfies QueryErrorResponse;
            }
            return { success: false, error: validationError } satisfies CommandResponse;
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
    outputSchema?: z.ZodType,
  ): Promise<CommandResponse & { data?: unknown }> {
    try {
      const result = await fn();
      const response = { success: true as const, data: result };
      if (outputSchema) {
        const validated = outputSchema.safeParse(response);
        if (!validated.success) {
          const logger = getLogger();
          logger.error(`Output validation failed: ${operationName}`, 'main', {
            operation: operationName,
            errors: validated.error.issues.map((i: z.ZodIssue) => `${i.path.join('.')}: ${i.message}`).join(', '),
          });
        }
      }
      return response;
    } catch (err) {
      const logger = getLogger();
      logger.error(`Command failed: ${operationName}`, 'main', {
        operation: operationName,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: toIpcError(err, { operation: operationName }),
      };
    }
  }

  /**
   * Wrap a handler's result in query response format:
   * success -> { success: true, data: result }
   * failure -> { success: false, data: null, error: ... }
   */
  private async wrapQuery<T>(
    fn: () => Promise<T>,
    operationName: string,
    outputSchema?: z.ZodType,
  ): Promise<{ success: true; data: T } | QueryErrorResponse> {
    try {
      const result = await fn();
      const response = { success: true as const, data: result };
      if (outputSchema) {
        const validated = outputSchema.safeParse(response);
        if (!validated.success) {
          const logger = getLogger();
          logger.error(`Output validation failed: ${operationName}`, 'main', {
            operation: operationName,
            errors: validated.error.issues.map((i: z.ZodIssue) => `${i.path.join('.')}: ${i.message}`).join(', '),
          });
        }
      }
      return response;
    } catch (err) {
      const logger = getLogger();
      logger.error(`Query failed: ${operationName}`, 'main', {
        operation: operationName,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        data: null,
        error: toIpcError(err, { operation: operationName }),
      };
    }
  }
}
