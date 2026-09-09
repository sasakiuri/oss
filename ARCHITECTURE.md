# Architecture

This document describes the high-level architecture of the `@sasakiuri/oss` monorepo.

## Repository Structure

The repository uses **npm workspaces** for dependency management and **Turborepo** for
build orchestration (caching, parallel task execution, dependency-aware pipelines).
**Changesets** versions Lane, Director and Docs as a fixed suite group; shared configuration packages retain
independent versions.

```
oss/
├── packages/
│   ├── saika-lane/             # Electron desktop app -- electronic target display
│   ├── saika-director/         # Electron desktop app -- multi-Lane competition control
│   ├── saika-protocol/         # Shared MQTT schemas and topic contracts
│   ├── saika-rules/            # Versioned, application-neutral competition Rule Packs
│   ├── saika-docs/             # Product specifications and interoperability references
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

## Shared Competition Rules

`@sasakiuri/saika-rules` is a pure-data boundary. It owns versioned authority metadata and optional capabilities for
target selection, scoring, course of fire, ranking, verification, publication, and commands. It does not depend on
either application. Lane and Director each own an adapter that maps only supported capabilities into their local
domain model. Local/JRSF competition definitions remain independent and can use injected fallback policies.

Director consumes optional command warning points through a timer-independent announcement scheduler. A policy
resolver supplies reminder points, a clock port owns scheduling, and a sink port emits semantic notifications. This
keeps visual prompts and any future audio adapter separate from scoring, Lane state, and MQTT commands.

Director separately adapts setup and reset timing into generic phase-start requirements. The renderer confirms their
stable IDs, the main-process guard checks the IDs at the IPC boundary, and only the existing phase command crosses
the Lane MQTT boundary. Local definitions can omit or replace requirements without changing the scheduler or Lane.

This dependency direction is one-way:

```text
saika-rules  <-  Lane adapter  <-  Lane domain/application
             <-  Director adapter  <-  Director domain/application
```

## Application Composition and MQTT Control

Lane and Director are independently deployed modular monoliths. Their Electron entry points delegate service
construction and lifecycle to explicit factories under `src/main/composition/`. A static module catalog declares
feature dependencies and is validated before registration. Shared wire schemas live in `saika-protocol`; shared
competition authority lives in `saika-rules`. See [ADR-0005](docs/adr/0005-application-composition-and-wire-contracts.md).

Director's MQTT feature separates competition coordination from communication and state bookkeeping:

| Component                                             | Responsibility                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `mqtt.module.ts`                                      | Construct adapters, register handlers, configure broker lifecycle and event forwarding     |
| `application/create*ControlHandlers.ts`               | Adapt IPC requests to competition, Final and safety-stop workflows                         |
| `application/DirectorMqttService.ts`                  | Coordinate membership, firing, recovery, timers and competition cleanup                    |
| `application/DirectorMqttConnection.ts`               | Own transport listeners, subscription readiness and reconnect retries                      |
| `application/DirectorLaneReadiness.ts`                | Evaluate current Lane capabilities and own expiring clock assessments                      |
| `application/LaneHardwareMonitor.ts`                  | Expire stale heartbeats without altering report timestamps                                 |
| `application/CompetitionExpiryScheduler.ts`           | Retry original timer deadlines and invalidate obsolete expiry work on session shutdown     |
| `application/DirectorMqttReceiver.ts`                 | Validate wire payloads and identities, route retained clears and deliveries                |
| `application/DirectorMqttState.ts`                    | Project broker-scoped Lane state, retain shot history and await correlated final snapshots |
| `application/MqttCommandDispatcher.ts`                | Publish commands, correlate acknowledgements and enforce deadlines                         |
| `domain/IMqttTransport.ts` / `infra/MqttTransport.ts` | Define the network port and implement the MQTT adapter                                     |

`KeyedOperationQueue` serializes operations sharing competition or membership resources. `RuntimeOperationGate`
coordinates concurrent controls with exclusive broker transitions. Dependency-cruiser enforces the application's
dependency on ports instead of MQTT adapters or registration code. See
[ADR-0006](docs/adr/0006-director-mqtt-application-boundaries.md) for ordering guarantees and extension guidance.

Director's `QualificationRecoveryCommands`, `RangeInterruptionCommands` and `RangeSafetyCommands` own focused
Lane-command workflows behind consumer-owned context interfaces and `DirectorCommandPort`. The service retains
queue acquisition: recovery and interruptions share the competition key, while safety STOP and clearance use their
independent safety key. Workflows read live state when their turn begins and preserve per-Lane failure outcomes.
See [ADR-0010](docs/adr/0010-director-command-workflow-boundaries.md) for ordering and extension guidance.

Lane's `application/commands/LaneCommandProcessor.ts` owns JSON/schema validation, issuer authorization,
deduplication and acknowledgements. Tier1, broadcast and per-Lane handlers supply their typed schema registries,
command preparation and competition operations. The MQTT port lives in `domain/IMqttClientService.ts`; the concrete
client remains in infrastructure. Both applications prohibit application dependencies on MQTT adapters, including
type-only imports. Lane's architecture check runs without a historical violation allowlist.

See [ADR-0007](docs/adr/0007-mqtt-lifecycle-and-command-processing.md) for lifecycle ownership, command extension
guidance and the guarantees around stale callbacks and command receipt.

## Director Renderer Boundaries

Director's competition screen composes focused display panels and four hooks: `useMqttControlSnapshot` owns broker
projection synchronization, `useCompetitionEvidence` owns selected-competition evidence, `useCompetitionSelection`
owns Lane/competition selection, and `useCompetitionCommands` owns confirmations, commands and result linkage.
The extracted display panels receive typed state and callbacks; they do not call IPC services directly.

Interruption records use `useRangeInterruptionCases` for query ordering, selection and mutation recovery. Each scope
visit owns a separate lifetime so obsolete queries or mutation completions cannot update a different workspace.
The parent panel composes individual forms and the detail workflow; pure recovery checks live in
`interruptionRecoveryState`. Main-process domain guards remain authoritative for all operations.

Dependency-cruiser enforces these boundaries, including type-only imports. See
[ADR-0008](docs/adr/0008-director-renderer-state-and-view-boundaries.md) for ownership, lifecycle guarantees and
extension guidance.

Target examinations follow the same ownership model: `useTargetExaminationCases` owns ordered queries and commands,
while a workspace keyed by scope and a detail keyed by case isolate form drafts. Forms submit typed callbacks;
`examinationPresentation` owns pure display policy. A pending command cannot undo a newer case selection, and a
departed workspace cannot refresh or close forms in the current visit. See
[ADR-0014](docs/adr/0014-target-examination-workspace-boundaries.md).

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
├── connection/     USB lifecycle, target protocol sessions, data pipeline
├── target/         Shot record parsing, coordinate conversion (adapters)
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
USBDeviceDetector ──► USBConnectionLifecycle
                              │
                              ▼
                    TargetProtocolRegistry
                    ┌─────────┼──────────┐
                    ▼         ▼          ▼
              MT201 direct  BPT-216   RedDot
              stream        framing   handshake/polling
                    │         │          │
                    └─────────┼──────────┘
                              ▼
                       USBDataPipeline
                    stream │      │ shot frame
                           ▼      │
                  SerialDataParser│
                           └──┬───┘
                              ▼
                  DataConversionService
                    ┌─────────┼──────────┐
                    ▼         ▼          ▼
                  MT201    BPT-216     DISAG ...
                  Adapter   Adapter     Adapter
                    └─────────┼──────────┘
                              ▼
                      Domain Shot object
                              │
                              ▼
                 USB data event (ShotData)
                              │
                              ▼
                    RecordShot command
                              │
                              ▼
                 Session aggregate + repository
                              │
                              ▼
                  TypedEventBus (ShotRecorded)
                              │
                              ├──► Competition
                              ├──► MQTT
                              ├──► ShotLog
                              └──► Renderer (via IPC)
```

Key stages:

1. **Detection** -- `USBDeviceDetector` enumerates serial ports.
2. **Connection** -- `USBConnectionLifecycle` owns only OS port open/close and reconnection.
3. **Protocol** -- `TargetProtocolRegistry` selects the hardware contract. MT-201 keeps the established direct stream; BPT-216 delimits terminal records; RedDot owns initialization, polling, and replies.
4. **Parsing** -- Direct streams use `SerialDataParser`; framed protocols pass accepted shot frames directly to `USBDataPipeline`.
5. **Adaptation** -- `DataConversionService` routes data to the device adapter, which creates domain `Shot` objects.
6. **Recording** -- The USB `data` event is serialized by `ShotIngestionHandler`, which dispatches `RecordShot`; the session aggregate creates and persists the recorded shot.
7. **Distribution** -- The `TypedEventBus` broadcasts `ShotRecorded`; competition, MQTT, shot logging, and the renderer IPC forwarder react independently. The low-latency `shotReceived` sound signal is a separate direct IPC path, not a domain event.

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

Three persistence paths serve different access patterns:

| Path                | Implementation   | Data                                                          |
| ------------------- | ---------------- | ------------------------------------------------------------- |
| **saika-lane.db**   | better-sqlite3   | Time-series data (sessions, shot history, scores)             |
| **settings.json**   | AppSettingsStore | Canonical application, device, user, and MQTT settings        |
| **saika-lane.json** | electron-store   | Compatibility settings, connection history, competition state |

**SQLite** is used when data requires querying -- session repositories persist
shots and scores with indexed lookups. The database file lives at
`{userData}/saika-lane.db`.

Lane's `SqliteDb.ts` owns connection setup and closes the handle if initialization fails. An explicit migration
catalog separates historical SQL from `MigrationRunner`, which applies all pending changes and `user_version`
updates in one immediate transaction. Versions 0 through 19 retain their existing upgrade results; unsupported newer
databases are rejected. Migration definitions are independent of current feature code. Director keeps its separate
`schema_meta` runner and compatibility policy. See
[ADR-0009](docs/adr/0009-lane-database-migration-boundaries.md).

**AppSettingsStore** owns the canonical settings document. Its application-owned port exposes settings operations,
`SettingsDocument` contains deterministic normalization and DTO projections, and `LegacySettingsBridge` owns the
existing electron-store completion/synchronization policy. File recovery, identity generation and write ordering
stay in the facade. See [ADR-0013](docs/adr/0013-lane-settings-document-boundaries.md). **electron-store**
provides key-value persistence for compatibility settings, connection history,
and competition state through `LocalStorageAdapter`, which implements
`ILocalStorage`.

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
