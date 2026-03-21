// SPDX-License-Identifier: MIT
/**
 * IPC Contract System
 *
 * Type-safe contract definitions for Electron IPC communication.
 * This file is shared between main / preload / renderer -- it MUST NOT
 * import anything from `src/main/` or Electron runtime modules.
 *
 * Only dependency: zod
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Common Zod schemas
// ---------------------------------------------------------------------------

export const IpcErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type IpcErrorDto = z.infer<typeof IpcErrorSchema>;

export const CommandResponseSchema = z.object({
  success: z.boolean(),
  error: IpcErrorSchema.optional(),
});

export type CommandResponseDto = z.infer<typeof CommandResponseSchema>;

/**
 * Build a discriminated-union response schema for queries.
 *
 * Success: `{ success: true, data: T }`
 * Failure: `{ success: false, data: null, error: IpcError }`
 */
export function queryResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data: dataSchema }),
    z.object({ success: z.literal(false), data: z.null(), error: IpcErrorSchema }),
  ]);
}

/**
 * Build a command response schema that optionally carries data.
 *
 * `{ success: boolean, data?: T, error?: IpcError }`
 */
export function commandWithDataSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: IpcErrorSchema.optional(),
  });
}

/**
 * Build a discriminated-union response schema for commands that return data.
 *
 * Success: `{ success: true, data: T }`
 * Failure: `{ success: false, error: IpcError }`
 */
export function commandDataResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data: dataSchema }),
    z.object({ success: z.literal(false), error: IpcErrorSchema }),
  ]);
}

// ---------------------------------------------------------------------------
// Procedure definitions (command / query)
// ---------------------------------------------------------------------------

export interface ProcedureDef<I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly kind: 'command' | 'query';
  readonly input: I;
  readonly output: O;
  readonly channelOverride?: string;
}

interface ProcedureOptions {
  /** Override the auto-generated channel name */
  channel?: string;
}

// -- command() overloads -----------------------------------------------------

/**
 * Define a command procedure WITH input.
 */
export function command<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  input: I,
  output: O,
  options?: ProcedureOptions,
): ProcedureDef<I, O>;

/**
 * Define a command procedure WITHOUT input (defaults to `z.void()`).
 */
export function command<O extends z.ZodTypeAny>(output: O, options?: ProcedureOptions): ProcedureDef<z.ZodVoid, O>;

export function command(...args: unknown[]): ProcedureDef {
  return buildProcedure('command', args);
}

// -- query() overloads -------------------------------------------------------

/**
 * Define a query procedure WITH input.
 */
export function query<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  input: I,
  output: O,
  options?: ProcedureOptions,
): ProcedureDef<I, O>;

/**
 * Define a query procedure WITHOUT input (defaults to `z.void()`).
 */
export function query<O extends z.ZodTypeAny>(output: O, options?: ProcedureOptions): ProcedureDef<z.ZodVoid, O>;

export function query(...args: unknown[]): ProcedureDef {
  return buildProcedure('query', args);
}

// -- shared builder ----------------------------------------------------------

function buildProcedure(kind: 'command' | 'query', args: unknown[]): ProcedureDef {
  // Two-arg form: (input, output) or (output, options?)
  // Three-arg form: (input, output, options)

  if (args.length >= 2 && args[1] instanceof z.ZodType) {
    // (input, output) or (input, output, options)
    const input = args[0] as z.ZodTypeAny;
    const output = args[1] as z.ZodTypeAny;
    const options = args[2] as ProcedureOptions | undefined;
    return { kind, input, output, channelOverride: options?.channel };
  }

  // Single-arg form: (output) or (output, options?)
  const output = args[0] as z.ZodTypeAny;
  const options = args[1] as ProcedureOptions | undefined;
  return { kind, input: z.void(), output, channelOverride: options?.channel };
}

// ---------------------------------------------------------------------------
// Event definitions
// ---------------------------------------------------------------------------

export interface EventDef<T extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly kind: 'event';
  readonly schema: T;
  readonly channelOverride?: string;
}

interface EventOptions {
  channel?: string;
}

export function defineEvent<T extends z.ZodTypeAny>(schema: T, options?: EventOptions): EventDef<T> {
  return { kind: 'event', schema, channelOverride: options?.channel };
}

// ---------------------------------------------------------------------------
// Contract (command / query namespace)
// ---------------------------------------------------------------------------

/** A map of procedure names to ProcedureDef */
export type ProcedureMap = Record<string, ProcedureDef>;

/** Derive the channel map type from a procedure map */
type ChannelMap<P extends ProcedureMap> = { readonly [K in keyof P]: string };

export interface Contract<NS extends string, P extends ProcedureMap> {
  readonly namespace: NS;
  readonly procedures: P;
  readonly channels: ChannelMap<P>;
}

export function defineContract<NS extends string, P extends ProcedureMap>(
  namespace: NS,
  procedures: P,
): Contract<NS, P> {
  const channels = {} as Record<string, string>;

  for (const key of Object.keys(procedures)) {
    const proc = procedures[key]!;
    channels[key] = proc.channelOverride ?? `${namespace}:${key}`;
  }

  return {
    namespace,
    procedures,
    channels: channels as ChannelMap<P>,
  };
}

// ---------------------------------------------------------------------------
// Event Contract
// ---------------------------------------------------------------------------

export type EventMap = Record<string, EventDef>;

type EventChannelMap<E extends EventMap> = { readonly [K in keyof E]: string };

export interface EventContract<NS extends string, E extends EventMap> {
  readonly namespace: NS;
  readonly events: E;
  readonly channels: EventChannelMap<E>;
}

export function defineEventContract<NS extends string, E extends EventMap>(
  namespace: NS,
  events: E,
): EventContract<NS, E> {
  const channels = {} as Record<string, string>;

  for (const key of Object.keys(events)) {
    const evt = events[key]!;
    channels[key] = evt.channelOverride ?? `${namespace}:${key}`;
  }

  return {
    namespace,
    events,
    channels: channels as EventChannelMap<E>,
  };
}

// ---------------------------------------------------------------------------
// Type inference utilities
// ---------------------------------------------------------------------------

/** Infer the parsed input type of a procedure */
export type InferInput<P> = P extends ProcedureDef<infer I, z.ZodTypeAny> ? z.infer<I> : never;

/** Infer the parsed output type of a procedure */
export type InferOutput<P> = P extends ProcedureDef<z.ZodTypeAny, infer O> ? z.infer<O> : never;

/** Infer the parsed payload type of an event */
export type InferEventPayload<E> = E extends EventDef<infer T> ? z.infer<T> : never;

/**
 * Generate the client-side (renderer -> preload) bridge API type.
 *
 * - Procedures with `z.void()` input produce `() => Promise<Output>`
 * - Procedures with input produce `(input: Input) => Promise<Output>`
 */
export type InferBridge<C extends Contract<string, ProcedureMap>> = {
  [K in keyof C['procedures']]: C['procedures'][K]['input'] extends z.ZodVoid
    ? () => Promise<InferOutput<C['procedures'][K]>>
    : (input: InferInput<C['procedures'][K]>) => Promise<InferOutput<C['procedures'][K]>>;
};

/**
 * Generate the event subscription bridge type for the renderer.
 *
 * Each event becomes `(callback: (data: Payload) => void) => () => void`
 * (subscribe returns an unsubscribe function).
 */
export type InferEventBridge<C extends EventContract<string, EventMap>> = {
  [K in keyof C['events']]: (callback: (data: InferEventPayload<C['events'][K]>) => void) => () => void;
};

/**
 * Generate the handler map type for the main-process IpcRouter.
 *
 * Handlers return raw domain values (not the wrapped IPC response).
 * The IpcRouter wraps results into CommandResponse / QueryResponse format
 * automatically via wrapCommand / wrapQuery.
 *
 * - Procedures with `z.void()` input produce `() => Promise<unknown>`
 * - Procedures with input produce `(input: Input) => Promise<unknown>`
 */
export type InferHandlers<C extends Contract<string, ProcedureMap>> = {
  [K in keyof C['procedures']]: C['procedures'][K]['input'] extends z.ZodVoid
    ? (event?: unknown) => Promise<unknown>
    : (input: InferInput<C['procedures'][K]>, event?: unknown) => Promise<unknown>;
};
