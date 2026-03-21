# Architecture

This document describes the high-level architecture of the `@sasakiuri/oss` monorepo.

## Repository Structure

The repository uses **npm workspaces** for dependency management and **Turborepo** for
build orchestration (caching, parallel task execution, dependency-aware pipelines).
**Changesets** handles independent versioning per package.

```
oss/
├── packages/
│   ├── saika-lane/             # Electron desktop app -- electronic target display
│   ├── eslint-config/          # @sasakiuri/eslint-config
│   ├── prettier-config/        # @sasakiuri/prettier-config
│   ├── stylelint-config/       # @sasakiuri/stylelint-config
│   └── typescript-config/      # @sasakiuri/typescript-config
├── docs/adr/                   # Architecture Decision Records
├── turbo.json                  # Turborepo pipeline definition
└── package.json                # Root workspace configuration
```

The shared configuration packages are consumed by `saika-lane` (and any future
application packages) as regular npm dependencies, linked locally via workspaces.

## Saika Lane Architecture

Saika Lane is a desktop application for electronic target hit-point display,
supporting multiple manufacturers (Kohto/MT201, SIUS, Meyton, DISAG, custom).

### Architectural Patterns

The main process combines several patterns:

- **Clean Architecture** -- business logic has zero dependency on Electron or I/O.
- **Domain-Driven Design** -- each module owns its domain model (entities, value objects, repositories).
- **CQRS** -- token-based `CommandBus` / `QueryBus` separate writes from reads.
- **Event-Driven** -- `TypedEventBus` decouples modules via strongly-typed domain events.
- **Hexagonal (Ports & Adapters)** -- external systems (USB, MQTT, storage) sit behind interfaces.

### Module Map

Each feature module contains `domain/`, `application/`, `infra/` layers and a
`*.module.ts` entry point for lifecycle registration.

```
modules/
├── session/        Session aggregation, scoring, series management
├── connection/     USB serial lifecycle, device detection, data pipeline
├── target/         Manufacturer protocol parsing, coordinate conversion (adapters)
├── competition/    5-phase state machine, timer, discipline rules
├── mqtt/           Broker connectivity, command/event pub-sub, RPC
├── report/         Score sheet generation, print window
└── settings/       Persistent user/device configuration
```

Cross-cutting infrastructure lives in `shared-infra/`:

```
shared-infra/
├── cqrs/           CommandBus, QueryBus, LoggingMiddleware
├── events/         TypedEventBus, core event definitions
├── ipc/            IpcRouter, ContractEventForwarder
├── logging/        Winston logger, IPC log forwarding
└── module/         ModuleLoader (declarative module lifecycle)
```

## Process Model

Saika Lane follows the standard Electron three-process split:

```
┌──────────────────────────────────────────────────────────┐
│  Renderer Process                                        │
│  React 19 + Zustand + Tailwind CSS                       │
│  presentation/ (screens, components, hooks, stores)      │
│  services/     (IPC wrapper layer, createServiceMethod)  │
├──────────────────────────────────────────────────────────┤
│  Preload Script                                          │
│  createBridge()      -- auto-generates invoke wrappers   │
│  createEventBridge() -- auto-generates event listeners   │
├──────────────────────────────────────────────────────────┤
│  IPC Contract Layer  (shared/ipc/)                       │
│  Zod schemas = single source of truth                    │
│  defineContract() / defineEventContract() DSL            │
├──────────────────────────────────────────────────────────┤
│  Main Process                                            │
│  IpcRouter registers handlers from contracts             │
│  Feature Modules (session, connection, target, ...)      │
│  Shared Infrastructure (CQRS, EventBus, Logging)         │
└──────────────────────────────────────────────────────────┘
```

### IPC Contract System

All IPC communication is defined via Zod-based contracts in `shared/ipc/contracts/`.
Each contract declares procedures (`command()` / `query()`) and events
(`defineEvent()`) with input/output schemas. From a single contract definition:

1. **Main process** -- `IpcRouter` auto-registers handlers with input/output validation.
2. **Preload** -- `createBridge()` auto-generates typed `ipcRenderer.invoke` wrappers.
3. **Renderer** -- services consume fully-typed bridge APIs; `InferBridge<C>` provides static checking.

This eliminates manual channel-name management and ensures end-to-end type safety
with runtime validation at the process boundary.

#### Preload Bridge Generation

Two factory functions in `preload/` turn contract definitions into renderer-callable APIs:

- **`createBridgeNamespace(contract)`** -- iterates `contract.procedures`, inspects each
  procedure's input schema (`instanceof z.ZodVoid`), and emits either a zero-arg or
  single-arg function that calls `ipcRenderer.invoke(channel, payload)`.
  The return type is `InferBridge<C>`, so the renderer gets full static type checking.

- **`createEventBridge(contract)`** -- iterates `contract.events` and creates subscribe
  functions per event key. Each subscribe function registers an `ipcRenderer.on(channel, handler)`
  listener and returns an unsubscribe function (`ipcRenderer.removeListener`).

```
defineContract()              defineEventContract()
       │                              │
       ▼                              ▼
createBridgeNamespace()       createEventBridge()
       │                              │
       ▼                              ▼
{ method: (input) =>          { event: (cb) =>
  ipcRenderer.invoke(ch) }     ipcRenderer.on(ch, cb);
                                return () => removeListener() }
```

## Renderer Service Layer

The renderer consumes preload bridge APIs through a **service layer**
(`renderer/services/`) that provides unified error handling. Four factory
functions in `createServiceMethod.ts` cover all IPC call shapes:

| Factory                   | Input | Return | Use case              |
| ------------------------- | ----- | ------ | --------------------- |
| `createServiceMethod`     | yes   | `T`    | Query with params     |
| `createVoidServiceMethod` | no    | `T`    | Parameterless query   |
| `createCommandMethod`     | yes   | `void` | Command with params   |
| `createVoidCommandMethod` | no    | `void` | Parameterless command |

All four follow the same pattern:

1. Call the bridge function (which calls `ipcRenderer.invoke`).
2. Inspect `response.success`.
3. On failure, convert `response.error` (`IpcErrorDto`) into a `ServiceError` and throw.
4. On success, return `response.data` (or void for command variants).

This ensures every IPC call in the renderer has consistent error semantics --
callers always catch `ServiceError` with a `code`, `message`, and optional `metadata`.

## Data Flow

Shot data flows from hardware to UI through the following pipeline:

```
USB Serial Port
      │
      ▼
USBDeviceDetector ──► USBConnectionLifecycle ──► USBDataPipeline
                                                      │
                                                      ▼
                                          SerialDataParser (dispatcher)
                                                      │
                                          ┌───────────┼───────────┐
                                          ▼           ▼           ▼
                                    KohtoFormat  SiusFormat  MeytonFormat ...
                                    Parser       Parser      Parser
                                          │           │           │
                                          └───────────┼───────────┘
                                                      ▼
                                          DataConversionService
                                                      │
                                          ┌───────────┼───────────┐
                                          ▼           ▼           ▼
                                    MT201        Sius        Meyton  ...
                                    Adapter      Adapter     Adapter
                                          │           │           │
                                          └───────────┼───────────┘
                                                      ▼
                                              Domain Shot object
                                                      │
                                                      ▼
                                    TypedEventBus (shot:received event)
                                          ┌───────────┼───────────┐
                                          ▼           ▼           ▼
                                    Session       MQTT        Renderer
                                    Module        Module      (via IPC)
```

Key stages:

1. **Detection** -- `USBDeviceDetector` enumerates serial ports.
2. **Connection** -- `USBConnectionLifecycle` manages open/close; `USBDataPipeline` buffers incoming bytes.
3. **Parsing** -- `SerialDataParser` dispatches to manufacturer-specific parsers (Strategy pattern).
4. **Adaptation** -- `DataConversionService` routes parsed data to the correct adapter, which converts raw coordinates into domain `Shot` objects.
5. **Distribution** -- The `TypedEventBus` broadcasts shot events; subscriber modules (session, MQTT, renderer) react independently.

### Event Flow: Main to Renderer

Domain events originating in the main process are forwarded to the renderer
via `ContractEventForwarder`:

```
Main Process                              Renderer Process
─────────────                             ────────────────
TypedEventBus                             createEventBridge()
     │  domain event fires                     │
     ▼                                         │
ContractEventForwarder                         │
     │  subscribes to EventBus                 │
     │  transforms domain event → DTO          │
     │  calls mainWindow.webContents.send()     │
     │  using eventsContract channel name       │
     ▼                                         ▼
─── IPC (eventsContract channels) ──────► ipcRenderer.on(channel)
                                               │
                                               ▼
                                          callback → Zustand store update
```

The forwarder maps 14 domain event types to contract channels (e.g.
`ShotRecorded` to `event:shotRecorded`, `ConnectionEstablished` /
`ConnectionLost` to `event:connectionStatusChanged`). Each mapping includes a
transform function that converts domain objects into serializable DTOs.
Cleanup is handled by `stop()`, which removes all subscriptions.

## State Management

### CQRS Tokens

All command and query tokens are centrally defined in
`main/composition/tokens.ts`. Each token uses phantom types for type-safe
dispatch via `CommandBus.execute(token, input)` and
`QueryBus.execute(token, input)`.

```typescript
// Phantom-typed token creation
export const StartSessionToken =
  defineCommand<StartSessionInput>("StartSession");
export const GetSessionScoreToken = defineQuery<
  GetSessionScoreInput,
  SessionScoreDto
>("GetSessionScore");
```

**Commands (14 tokens):**

| Token                  | Domain      |
| ---------------------- | ----------- |
| `StartSession`         | session     |
| `RecordShot`           | session     |
| `SwitchMode`           | session     |
| `ResetSession`         | session     |
| `ConnectToTarget`      | connection  |
| `DisconnectFromTarget` | connection  |
| `StartCompetition`     | competition |
| `StartStage`           | competition |
| `StartNextSeries`      | competition |
| `AdvanceStage`         | competition |
| `EndStage`             | competition |
| `FinishCompetition`    | competition |
| `AssignAthlete`        | competition |
| `OpenPrintWindow`      | report      |

**Queries (5 tokens):**

| Token                 | Domain      |
| --------------------- | ----------- |
| `GetSessionScore`     | session     |
| `GetShotHistory`      | session     |
| `GetCompetitionState` | competition |
| `GetCompetitionTypes` | competition |
| `GetScoreSheet`       | report      |

### Zustand Stores

The renderer maintains five Zustand stores, each responsible for a single
concern. Stores are updated by IPC event subscription hooks that listen to
`createEventBridge` callbacks.

| Store                 | Responsibility                                              |
| --------------------- | ----------------------------------------------------------- |
| `useConnectionStore`  | Connection status, port name, manufacturer, device ID       |
| `useSessionStore`     | Session ID, mode, discipline, shots, scores, device info    |
| `useCompetitionStore` | Phase (5-value state machine), stage/series progress, timer |
| `useMqttStore`        | MQTT connection status, settings, error state               |
| `useLogStore`         | Log entries (capped at 1000), auto-scroll preference        |

## Application Startup Sequence

The `initializeApplication()` function in `main.ts` boots the entire
application stack in a strict dependency order:

```
app.whenReady()
      │
      ▼
createWindow()                 ← BrowserWindow with security hardening
      │
      ▼
initializeApplication(window)
      │
      ├─ 1. initializeLogger()           Winston logger + IPC log forwarding
      ├─ 2. Infrastructure instances      LocalStorageAdapter, TypedEventBus,
      │                                   SqliteDb, repositories, AdapterRegistry,
      │                                   USBConnectionManager, PrintWindowService
      ├─ 3. CommandBus + QueryBus         + CommandLoggingMiddleware
      │                                   + QueryLoggingMiddleware
      ├─ 4. IpcRouter                     Channel registration engine
      ├─ 5. ModuleLoader.load()           7 modules in order:
      │      target → session → connection → settings →
      │      competition → report → mqtt
      ├─ 6. windowContract handlers       Fullscreen, minimize, maximize, close
      ├─ 7. ContractEventForwarder.start() Domain events → renderer forwarding
      └─ 8. scheduleAutoConnect()         On renderer did-finish-load:
                                           read saved ConnectionSettings,
                                           execute ConnectToTargetToken
```

## Storage Architecture

Two storage engines serve different access patterns:

| Engine                    | Library        | Data                                      |
| ------------------------- | -------------- | ----------------------------------------- |
| **SQLite**                | better-sqlite3 | Time-series data (shot history, scores)   |
| **electron-store (JSON)** | electron-store | Configuration (connection settings, etc.) |

**SQLite** is used when data requires querying -- session repositories persist
shots and scores with indexed lookups. The database file lives at
`{userData}/saika-lane.db`.

**electron-store** is used for key-value configuration (connection settings,
MQTT settings, competition state). It serializes to a JSON file and is accessed
through the `LocalStorageAdapter` which implements `ILocalStorage`.

## Security Model

The application enforces a strict security posture in `createWindow()`:

- **`nodeIntegration: false`** -- renderer has no access to Node.js APIs.
- **`contextIsolation: true`** -- preload and renderer run in separate JavaScript contexts.
- **`sandbox: true`** -- preload script runs in a sandboxed process.
- **`will-navigate` handler** -- blocks navigation to any URL that is not
  `file://` or the Vite dev server URL. External URL navigation is silently
  prevented via `event.preventDefault()`.
- **`setWindowOpenHandler(() => { action: 'deny' })`** -- all new window
  creation requests are denied.
- **IPC error sanitization** -- `toIpcError()` strips stack traces in
  production builds (`app.isPackaged`), exposing only error codes and safe
  messages to the renderer.

## Error Handling Strategy

### DomainError and ErrorCatalog

All domain errors extend the abstract `DomainError` class
(`shared/errors/DomainError.ts`), which provides:

- `code` -- machine-readable error identifier (e.g. `SESSION_NOT_FOUND`).
- `message` -- developer-facing detail (English).
- `userMessage` -- user-facing message (localizable).
- `severity` -- `'error' | 'warning' | 'info'`.
- `metadata` -- arbitrary context, deep-frozen for immutability.
- `cause` -- error chaining support.
- `Object.freeze(this)` -- runtime immutability of the error instance.

`ErrorCatalog` (`shared/errors/ErrorCatalog.ts`) aggregates eight domain-specific
catalogs (Session, Connection, Storage, Infra, Target, Competition, Report, MQTT)
into a single `ReadonlyMap<ErrorCode, ErrorDefinition>`. Errors are created via
`ErrorCatalog.createError(code, metadata?, cause?)`, which resolves the definition,
interpolates `{{template}}` variables in messages, and returns a `CatalogError`
(concrete `DomainError` subclass).

### IPC Error Propagation

Errors cross the process boundary through a structured pipeline:

```
Main Process Handler
      │ throws DomainError / Error
      ▼
IpcRouter.wrapCommand() / wrapQuery()
      │ catches error
      ▼
toIpcError(err)
      │ DomainError → { code, message, metadata }
      │ generic Error → { code: 'UNKNOWN_ERROR', message }
      │ stack included only in dev (app.isPackaged === false)
      ▼
IPC transport (CommandResponse / QueryResponse)
      │ { success: false, error: IpcErrorDto }
      ▼
createServiceMethod() / createCommandMethod()
      │ inspects response.success
      │ converts IpcErrorDto → ServiceError
      ▼
Renderer code catches ServiceError
      │ .code, .message, .metadata
```

This ensures that domain error semantics (`code`, `metadata`) are preserved
across the process boundary while preventing information leakage in
production builds.

## Key Design Decisions

Detailed rationale is captured in Architecture Decision Records:

| ADR                                                | Decision                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [ADR-0001](docs/adr/0001-monorepo-toolchain.md)    | npm workspaces + Turborepo + Changesets for monorepo management                          |
| [ADR-0002](docs/adr/0002-electron-architecture.md) | Clean Architecture + DDD + CQRS + Event-driven + Hexagonal, organized by feature modules |
| [ADR-0003](docs/adr/0003-ipc-contract-system.md)   | Zod-based IPC contract system with auto-generated preload bridges                        |

## Technology Stack

| Category              | Technology                                   |
| --------------------- | -------------------------------------------- |
| Desktop framework     | Electron                                     |
| UI framework          | React 19                                     |
| State management      | Zustand                                      |
| Language              | TypeScript 5                                 |
| Styling               | Tailwind CSS                                 |
| USB communication     | serialport                                   |
| Local storage         | electron-store, better-sqlite3               |
| MQTT                  | mqtt                                         |
| Logging               | winston                                      |
| Build tool            | Vite                                         |
| Test framework        | Vitest                                       |
| Linter                | ESLint 9                                     |
| Formatter             | Prettier 3                                   |
| Monorepo orchestrator | Turborepo                                    |
| Package manager       | npm workspaces                               |
| Versioning            | Changesets                                   |
| CI quality            | syncpack, commitlint, knip, licensee, cspell |
