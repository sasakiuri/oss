# Architecture

Saika consists of three Electron applications, a documentation site, and shared
packages. Lane connects to targets and records shots. Director manages competitions
and coordinates Lane instances. Vista displays their data on audience monitors.

## Repository Structure

| Package          | Contents                                                     |
| ---------------- | ------------------------------------------------------------ |
| `saika-lane`     | Target connections, sessions, scoring, printing              |
| `saika-director` | Events, athletes, Lane control, adjudication, results        |
| `saika-vista`    | Audience windows and display PC management                   |
| `saika-docs`     | Japanese manuals and the Next.js documentation site          |
| `saika-protocol` | Shared message schemas and Vista transport                   |
| `saika-rules`    | Versioned competition definitions and validation             |
| `*-config`       | Shared lint, formatting, TypeScript, and Lighthouse settings |

npm workspaces links packages locally. Turborepo runs builds and checks according
to `turbo.json`. Changesets keeps Lane, Director, Vista, and Docs at the same
version; shared configuration packages have independent versions.

## Application Composition

Lane and Director construct services under `src/main/composition/`. Electron
entry points handle application and window events. Feature modules declare their
dependencies in a static catalog, which the module loader checks before registration.
Each feature has `domain/`, `application/`, and `infra/` directories:

- `domain/` defines competition objects, rules, and service interfaces.
- `application/` coordinates operations through those interfaces.
- `infra/` implements storage, device, and network access.

Lane's `createLaneServices` constructs shared instances; `createLaneApp` registers
features and restores state. `bindMainWindow` registers window controls, and
`bindCompetitionEvents` returns subscriptions to release at shutdown.

Director's `createContainer` combines service factories. `createAppRuntime` starts
and stops modules and event forwarding. Modules stop before infrastructure;
pending Lane repository writes finish before SQLite closes. Module registration
is not transactional, so a registration failure can leave partial side effects.

Dependency-cruiser checks import direction, including type-only imports. Feature
code uses service interfaces without importing application startup or concrete
network adapters. Run `npx turbo depcruise` to check these dependencies.

## Shared Competition Rules

`saika-rules` stores rule authority, edition, effective dates, references, and
capabilities for scoring, course of fire, ranking, commands, and adjudication.
It has no application, UI, transport, or persistence dependencies. Lane and
Director adapt supported capabilities into their own competition models;
local definitions can supply fallback policies.

`defineRulePack` validates references between capabilities before freezing a
definition. Validation reads the supplied pack without loading an edition catalog
or changing the input. Rejected inputs remain unchanged and unfrozen. Stored and
exchanged fingerprints identify rule content, so refactoring must preserve them.

## IPC and Renderer State

Lane and Director define process messages with Zod contracts under `shared/ipc/`.
Contracts supply channel names, input/output schemas, and TypeScript types:

1. `IpcRouter` validates requests and responses and registers main-process handlers.
2. Preload factories create typed invoke methods and event subscriptions.
3. Renderer services call the bridge and convert failed responses to `ServiceError`.

Lane uses `ContractEventForwarder` and Director uses `DomainEventForwarder` to
convert domain events to IPC payloads. Renderer hooks subscribe and update Zustand stores. Subscriptions
are removed when their owner stops or unmounts.

Contracts can be imported by all three processes without loading Electron services
or main-process code. The main process checks authorization separately from schema
validation.

Director state hooks discard query responses superseded by live events, newer
queries or a workspace change. Each visit has its own lifetime: returning to the
same selected ID must not revive a request from an earlier visit. Forms keep drafts
with their case and receive command callbacks from the owning hook. Leaving a screen
does not cancel a dispatched command; reopening it reads persisted state. A failed
refresh must not turn a successful command into a reported command failure.

## MQTT Control

`saika-protocol` supplies MQTT schemas, payload types, command validation, and topic
builders. Its portable modules depend on Zod and local contracts. Competition
policies remain in the applications and `saika-rules`.

| Director component           | Responsibility                                           |
| ---------------------------- | -------------------------------------------------------- |
| `mqtt.module.ts`             | Adapter construction, IPC registration, event forwarding |
| `DirectorMqttService`        | Membership, competition progress, recovery, cleanup      |
| `DirectorMqttConnection`     | Transport listeners, subscriptions, reconnects           |
| `DirectorLaneReadiness`      | Lane capabilities and expiring clock assessments         |
| `LaneHardwareMonitor`        | Heartbeat expiry                                         |
| `CompetitionExpiryScheduler` | Timer deadlines and expiry retries                       |
| `DirectorMqttReceiver`       | Payload validation and delivery routing                  |
| `DirectorMqttState`          | Lane state, shot history, final-snapshot waits           |
| `MqttCommandDispatcher`      | Publishing, acknowledgements, deadlines                  |

`KeyedOperationQueue` orders operations that share a competition or membership.
`RuntimeOperationGate` excludes broker changes while controls are running.
Recovery and interruption workflows share the competition queue. Safety STOP
and clearance use a separate safety queue, allowing STOP while a competition
command awaits acknowledgement. Queued operations read state when execution
begins, and batch commands retain individual Lane failures.

`DirectorMqttService` acquires queue keys before calling workflows; helpers must
not reacquire the same queue. A broker transition waits for previously submitted
controls, and later controls wait for that transition. Replacement invalidates
pending commands, clock assessments and expiry callbacks. Queue ordering does not
cancel work or retract a network write that has already started.

Lane's `LaneCommandProcessor` validates payloads and issuer authorization,
deduplicates commands, and sends acknowledgements. Tier1, broadcast, and per-Lane
handlers supply their schemas and competition operations. Transport listeners,
timers, and pending work belong to the active connection or competition lifetime.

Director requires non-empty outgoing issuer labels. Lane accepts legacy empty
labels through the command schema factory; sender authorization is a separate
check. Add message fields in the shared schema and test both endpoints. Optional
fields can preserve compatibility; incompatible messages need a protocol version
change. See the [MQTT specification](packages/saika-docs/lane/MQTT_DESIGN.md)
for topics, payloads, timing, and reconnect behavior.

## Target Data and Serial Timing

Lane processes target data in this order:

```text
Serial port → protocol session → data pipeline → device adapter
            → shot ingestion → session repository → events → UI / MQTT / logs
```

`USBDeviceDetector` enumerates ports; `USBConnectionLifecycle` opens, closes, and
reconnects them. `TargetProtocolRegistry` selects the device session. MT201 uses a
direct stream, BPT-216 uses delimited records, and RedDot handles initialization,
polling, and replies. `DataConversionService` passes accepted records to a device
adapter for coordinate and score conversion. `ShotIngestionHandler` serializes
recording; domain events then notify consumers. The immediate shot sound uses a
separate IPC notification.

`SerializedProtocolTimer` runs deadlines on the session's queue. It checks a
cancellation revision both when the timeout fires and when queued work starts,
then checks the session's current state. Clearing the native timeout alone cannot
cancel work already queued behind a serial write. Sessions own poll and response
timers, cancel them on shutdown or replacement, and check connection generation in
write callbacks because cancellation cannot retract an active write.

Device formats and verification limits are documented under
[Lane specifications](packages/saika-docs/lane/SPEC.md#動作環境と対応機器).

## Storage

Lane stores data in Electron's `userData` directory:

| File              | Contents                                                               |
| ----------------- | ---------------------------------------------------------------------- |
| `saika-lane.db`   | SQLite sessions, shots, scores, and related records                    |
| `settings.json`   | Application, device, user, and MQTT settings                           |
| `saika-lane.json` | electron-store compatibility settings and connection/competition state |

`SqliteDb` opens the connection and passes a migration catalog to `MigrationRunner`.
Schema creation, pending migrations and `user_version` updates commit in one
immediate transaction. A failure rolls back the whole upgrade and closes the
connection; newer unsupported versions are rejected. The write lock lasts for the
whole upgrade, so large conversions can delay startup.

Migrations have consecutive versions and do not manage transactions themselves.
Published SQL stays unchanged and independent of current feature code; repairs
use a new migration. Director has its own `schema_meta` migration runner.

Director stores evidence originals as content-addressed SQLite BLOBs alongside
their custody records. Database backups and recovery copies therefore retain
both. Backup inspection and restore application verify each referenced original's
size and SHA-256. Existing external originals are imported in the schema migration
transaction; missing or corrupt originals abort the migration without deleting
source files. Old backups containing custody records without originals are
rejected before replacing the current database.

`AppSettingsStore` owns file writes, recovery, and Lane identity allocation.
`SettingsDocument` normalizes fields and creates DTOs; `LegacySettingsBridge`
reads and synchronizes electron-store values. Device migrations inspect raw IDs
before normalization. Lane identity comes from the persisted JSON, then a valid
compatibility value, before the incoming document. Omitted preferences remain
distinct from saved defaults.

JSON writes finish before compatibility values are updated. These writes are not
one transaction; storage errors and recovery stay in the store, while document
transformations perform no I/O or identity allocation.

## Vista Display Data

Lane and Director expose optional, read-only display sources. Portable contracts
live at `@sasakiuri/saika-protocol/Vista`; the `vista-node` subpath contains Node
transport and discovery code and cannot be imported by renderers.

Lane supplies session histories; Director supplies assignments, standings, and
result snapshots. Vista uses the source's scores, rankings, publication state,
and target definitions. Sources provide complete snapshots so Vista can recover
missed updates after reconnecting.

Each display PC saves its screen configuration and snapshots. One operator PC
manages the local and paired displays. Settings, data synchronization, and rendering
acknowledgements are tracked separately. Saved displays remain available offline
and are rechecked against their source after reconnecting.

Pairing identifies sources and display PCs using secrets shown on each device.
Transport uses AES-256-GCM with identity and replay checks. Audience IPC is limited
to the selected display and rendering acknowledgement.

State changes are serialized and published after persistence. Unsupported document
versions or invalid settings prevent startup and leave the file intact. Saved
snapshots are validated individually so valid subjects remain usable; invalid
originals are retained. Restored results stay unconfirmed until the source responds.

See the [Vista guide](packages/saika-vista/README.md) for pairing, ports, startup,
and recovery. The [venue test requirements](packages/saika-docs/vista/REQUIREMENTS.md)
describe the pending 100-lane, 12-hour hardware validation.

## Security and Errors

Desktop renderer windows disable Node integration and use context isolation and
sandboxed preload scripts. Navigation and new windows are restricted. Renderer
code accesses local services through the declared IPC bridge.

Lane's domain errors carry a code, message, severity, and metadata.
`ErrorCatalog` creates errors from shared definitions. `toIpcError` serializes
them at the process boundary; production responses omit stack traces. Renderer
services expose the code and metadata through `ServiceError` for callers to handle.

## Documentation Site

Saika Docs renders Markdown with Next.js App Router. Document parsing, search,
components, and routes live in separate layers. The site supports server hosting
and static export, with sanitized Markdown, Japanese search, diagrams, and PDF
output. The [site development guide](docs/reference-nextjs.md) covers commands,
configuration, generated content, and deployment checks.

## Design Rationale

[Selected architecture decisions](docs/adr/README.md) explain the tradeoffs behind
shared IPC contracts, versioned rules, MQTT command ordering and spectator data.
