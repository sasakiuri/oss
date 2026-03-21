# ADR-0003: IPC Contract System

## Status

Accepted

## Date

2025-01-01

## Context

Electron's IPC mechanism (`ipcMain.handle` / `ipcRenderer.invoke`) is inherently untyped. Channel names are plain strings, and payloads are `any` on both sides. This creates several problems:

- Typos in channel names cause silent failures at runtime.
- Input/output shapes drift between main and renderer without compile-time detection.
- No runtime validation means malformed data crosses the process boundary undetected.
- The preload bridge (`contextBridge.exposeInMainWorld`) must be manually kept in sync with main-process handlers.

We considered code generation from Protocol Buffers or OpenAPI specs but rejected them as overly heavy for an in-process boundary. We also considered a simple shared TypeScript interface approach, which provides compile-time safety but lacks runtime validation.

## Decision

We implement a **Zod-based IPC contract system** with a `defineContract` / `defineEventContract` DSL that serves as the single source of truth for all IPC communication.

### Contract Definition (`shared/ipc/`)

Each domain has a contract file (e.g., `session.contract.ts`) that declares:

- **Procedures** via `command()` and `query()` helpers, each specifying Zod schemas for input and output.
- **Events** via `defineEvent()` with a Zod schema for the payload.
- Channel names are auto-generated from namespace + procedure name (e.g., `session:startSession`), with an optional override.

### Preload Bridge Generation (`preload/`)

- `createBridgeNamespace(contract)` auto-generates the preload API from a contract, mapping each procedure to an `ipcRenderer.invoke` call.
- `createEventBridge(eventContract)` auto-generates event subscription bridges with `ipcRenderer.on` / `removeListener`.
- The renderer consumes fully-typed bridge APIs via `InferBridge<C>` and `InferEventBridge<C>` utility types.

### Main-Process Routing (`shared-infra/ipc/`)

- `IpcRouter` registers handlers from contracts, automatically wrapping them with input validation (Zod parse), output validation, and error serialization.
- Handlers return raw domain values; the router wraps them into `CommandResponse` / `QueryResponse` envelopes.
- `ContractEventForwarder` pushes domain events to the renderer via contract-defined channels.

### Type Inference

The contract system exports inference utilities (`InferInput`, `InferOutput`, `InferHandlers`, `InferBridge`) so that handler implementations and renderer service calls are statically checked against the contract.

## Consequences

### Positive

- Full end-to-end type safety from renderer service call through preload bridge to main-process handler, all derived from a single contract definition.
- Runtime validation on both input and output at the IPC boundary catches bugs early and prevents corrupt data from propagating.
- Adding a new IPC channel requires only a contract entry; the preload bridge and router registration are automatic.
- Discriminated union response schemas (`success: true | false`) provide consistent error handling across all IPC calls.

### Negative

- Every IPC channel requires a Zod schema definition, adding upfront effort even for simple pass-through calls.
- Zod runtime validation adds a small performance overhead per IPC call (negligible for typical UI interaction rates).
- The contract DSL introduces project-specific abstractions that new contributors must learn.

## References

- [Zod documentation](https://zod.dev)
- [Electron IPC documentation](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [`defineContract.ts`](../../packages/saika-lane/src/shared/ipc/defineContract.ts)
