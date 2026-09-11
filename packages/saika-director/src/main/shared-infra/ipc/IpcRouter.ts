import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Contract, ProcedureMap, InferHandlers } from '@/shared/ipc/defineContract';
import { toIpcError } from './toIpcError';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { Logger } from '@/shared/utils/Logger';
import type { CommandResponse, IpcError } from '@/shared/ipc/contracts';
import type { IpcInvocationMiddleware } from './IpcInvocationMiddleware';

const logger = Logger.create('IpcRouter');

/** Query error response shape (matches existing QueryErrorResponse) */
interface QueryErrorResponse {
  success: false;
  data: null;
  error: IpcError;
}

/**
 * Auto-registers `ipcMain.handle` calls from a Contract + handler mapping.
 *
 * Responsibilities:
 * - Zod input validation
 * - Error wrapping (CommandResponse / QueryResponse format)
 * - Duplicate channel detection
 * - Logging
 */
export class IpcRouter {
  private registeredChannels = new Set<string>();
  constructor(private readonly middleware?: IpcInvocationMiddleware) {}

  /**
   * Register all procedures from a contract with their handlers.
   */
  register<C extends Contract<string, ProcedureMap>>(contract: C, handlers: InferHandlers<C>): void {
    for (const key of Object.keys(contract.procedures)) {
      const channel = contract.channels[key as keyof typeof contract.channels] as string;
      const proc = contract.procedures[key]!;
      const handler = handlers[key as keyof typeof handlers] as (...args: unknown[]) => Promise<unknown>;

      if (!handler) {
        throw new Error(`IpcRouter: missing handler for procedure "${key}" in contract "${contract.namespace}"`);
      }

      if (this.registeredChannels.has(channel)) {
        logger.error(`Duplicate channel registration: "${channel}"`);
        throw new Error(`IpcRouter: duplicate channel registration: "${channel}"`);
      }
      this.registeredChannels.add(channel);

      const isVoidInput = proc.input instanceof z.ZodVoid;
      const isQuery = proc.kind === 'query';

      ipcMain.handle(channel, async (event, payload) => {
        const invoke = (next: () => Promise<unknown>) =>
          this.middleware
            ? this.middleware.invoke(
                { namespace: contract.namespace, operation: key, kind: proc.kind, senderId: event.sender.id },
                next,
              )
            : next();
        // 1. Validate input (skip for z.void())
        if (!isVoidInput) {
          const parseResult = proc.input.safeParse(payload);
          if (!parseResult.success) {
            const zodErrors = parseResult.error.issues
              .map((issue: z.ZodIssue) => `${issue.path.join('.')}: ${issue.message}`)
              .join(', ');
            const errorMessage = `[${key}] ${ErrorCatalog.IPC.INVALID_PAYLOAD.message}: ${zodErrors}`;

            logger.warn(`Validation failed for "${channel}"`, {
              operation: key,
              errors: zodErrors,
            });

            const validationError: IpcError = {
              code: ErrorCatalog.IPC.INVALID_PAYLOAD.code,
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
                proc.output,
                key,
                true,
              );
            }
            return this.validateOutput(
              { success: false, error: validationError } satisfies CommandResponse,
              proc.output,
              key,
              false,
            );
          }

          // 2. Call handler with validated data, wrap result/error
          if (isQuery) {
            return this.wrapQuery(() => invoke(() => handler(parseResult.data, event)), key, proc.output);
          }
          return this.wrapCommand(() => invoke(() => handler(parseResult.data, event)), key, proc.output);
        }

        // Void input — call handler with no args
        if (isQuery) {
          return this.wrapQuery(() => invoke(() => handler(event)), key, proc.output);
        }
        return this.wrapCommand(() => invoke(() => handler(event)), key, proc.output);
      });
    }
  }

  /**
   * Wrap a handler's result in command response format:
   * success → { success: true, data?: result }
   * failure → { success: false, error: ... }
   */
  private async wrapCommand(
    fn: () => Promise<unknown>,
    operationName: string,
    outputSchema: z.ZodTypeAny,
  ): Promise<unknown> {
    try {
      const result = await fn();
      return this.validateOutput({ success: true, data: result }, outputSchema, operationName, false);
    } catch (err) {
      logger.logError('Command failed', err, { operation: operationName });
      return this.validateOutput(
        {
          success: false,
          error: toIpcError(err, { operation: operationName }),
        },
        outputSchema,
        operationName,
        false,
      );
    }
  }

  /**
   * Wrap a handler's result in query response format:
   * success → { success: true, data: result }
   * failure → { success: false, data: null, error: ... }
   */
  private async wrapQuery<T>(
    fn: () => Promise<T>,
    operationName: string,
    outputSchema: z.ZodTypeAny,
  ): Promise<unknown> {
    try {
      const result = await fn();
      return this.validateOutput({ success: true, data: result }, outputSchema, operationName, true);
    } catch (err) {
      logger.logError('Query failed', err, { operation: operationName });
      return this.validateOutput(
        {
          success: false,
          data: null,
          error: toIpcError(err, { operation: operationName }),
        },
        outputSchema,
        operationName,
        true,
      );
    }
  }

  private validateOutput(response: unknown, schema: z.ZodTypeAny, operationName: string, isQuery: boolean): unknown {
    const parseResult = schema.safeParse(response);
    if (parseResult.success) return parseResult.data;

    const validationErrors = parseResult.error.issues.map((issue: z.ZodIssue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    logger.error('IPC response validation failed', {
      operation: operationName,
      validationErrors,
    });
    const error: IpcError = {
      code: ErrorCatalog.IPC.INVALID_RESPONSE.code,
      message: `[${operationName}] ${ErrorCatalog.IPC.INVALID_RESPONSE.message}`,
      metadata: {
        context: operationName,
        validationErrors,
      },
    };
    return isQuery ? { success: false, data: null, error } : { success: false, error };
  }
}
