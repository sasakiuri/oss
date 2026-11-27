import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import type { Contract, ProcedureDef, ProcedureMap, InferHandlers, IpcErrorDto } from '@sasakiuri/saika-ipc';
import { toIpcError } from '@sasakiuri/saika-ipc/main';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { Logger } from '@/shared/logging';
import { isDomainError } from '@/shared/utils/typeGuards';
import type { IpcInvocationMiddleware } from './IpcInvocationMiddleware';

const logger = Logger.create('IpcRouter');

type ProcedureKind = ProcedureDef['kind'];

/** The Electron invocation a handler receives as its last argument. */
export function ipcInvokeEvent(event: unknown): IpcMainInvokeEvent {
  return event as IpcMainInvokeEvent;
}

/** A failed response: queries also carry `data: null`. */
function failure(kind: ProcedureKind, error: IpcErrorDto) {
  return kind === 'query' ? { success: false, data: null, error } : { success: false, error };
}

/**
 * Registers contract handlers with input/output validation and error responses.
 * Duplicate channels are rejected.
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

      ipcMain.handle(channel, async (event, payload) => {
        const invoke = (next: () => Promise<unknown>) =>
          this.middleware
            ? this.middleware.invoke(
                { namespace: contract.namespace, operation: key, kind: proc.kind, senderId: event.sender.id },
                next,
              )
            : next();
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

            const validationError: IpcErrorDto = {
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

            return this.validateOutput(failure(proc.kind, validationError), proc.output, key, proc.kind);
          }

          return this.wrap(() => invoke(() => handler(parseResult.data, event)), key, proc.output, proc.kind);
        }

        // Void input — call handler with no args
        return this.wrap(() => invoke(() => handler(event)), key, proc.output, proc.kind);
      });
    }
  }

  /**
   * Wrap a handler's result in the response format of its kind:
   * success → { success: true, data: result }
   * failure → { success: false, error } for a command, { success: false, data: null, error } for a query
   */
  private async wrap(
    fn: () => Promise<unknown>,
    operationName: string,
    outputSchema: z.ZodTypeAny,
    kind: ProcedureKind,
  ): Promise<unknown> {
    try {
      const result = await fn();
      return this.validateOutput({ success: true, data: result }, outputSchema, operationName, kind);
    } catch (err) {
      logger.logError(kind === 'query' ? 'Query failed' : 'Command failed', err, { operation: operationName });
      return this.validateOutput(
        failure(kind, toIpcError(err, { isDomainError, metadata: { operation: operationName } })),
        outputSchema,
        operationName,
        kind,
      );
    }
  }

  private validateOutput(response: unknown, schema: z.ZodTypeAny, operationName: string, kind: ProcedureKind): unknown {
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
    const error: IpcErrorDto = {
      code: ErrorCatalog.IPC.INVALID_RESPONSE.code,
      message: `[${operationName}] ${ErrorCatalog.IPC.INVALID_RESPONSE.message}`,
      metadata: {
        context: operationName,
        validationErrors,
      },
    };
    return failure(kind, error);
  }
}
