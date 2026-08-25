// Contract system core
export {
  defineContract,
  defineEvent,
  defineEventContract,
  command,
  query,
  // Common schemas
  IpcErrorSchema,
  CommandResponseSchema,
  queryResponseSchema,
  commandWithDataSchema,
  commandDataResponseSchema,
  // Types
  type IpcErrorDto,
  type CommandResponseDto,
  type ProcedureDef,
  type EventDef,
  type Contract,
  type EventContract,
  type ProcedureMap,
  type EventMap,
  // Inference utilities
  type InferInput,
  type InferOutput,
  type InferEventPayload,
  type InferBridge,
  type InferEventBridge,
  type InferHandlers,
} from './defineContract';

// All contracts
export * from './contracts';
