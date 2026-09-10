# ADR-0007: MQTT Lifecycle Ownership and Lane Command Processing

## Status

Proposed (implemented locally)

## Date

2026-09-09

## Context

After ADR-0006, Director still owned broker subscription recovery, clock approvals, heartbeat deadlines and
competition expiry retries inside its competition coordinator. Each has a separate lifetime and failure boundary.
Lane repeated command validation, authorization, deduplication and acknowledgement handling in three handlers.
Its application layer also imported the transport interface from infrastructure, weakening dependency direction.

The suite already has modular monoliths, explicit composition, ports and adapters, CQRS and shared wire schemas.
The maintenance problem is responsibility ownership within these boundaries. Replacing the framework or introducing
separately deployed services would add migration and operational work without addressing that ownership.

## Decision

Keep the existing architecture and refine the MQTT application components. Preserve competition workflows, queue
keys, IPC contracts, MQTT topics, payload schemas and storage formats. Each stateful collaborator owns its cleanup;
the coordinator connects those lifetimes through explicit callbacks.

### Director

| Component                    | Ownership                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `DirectorMqttService`        | Ordered competition, membership, firing, recovery and result-cleanup workflows         |
| `DirectorMqttConnection`     | Transport listeners, broker identity, readiness after subscriptions, reconnect retries |
| `DirectorLaneReadiness`      | Current capability checks, clock-probe validation and broker-scoped clock assessments  |
| `LaneHardwareMonitor`        | Per-Lane heartbeat deadlines and offline projection of expired reports                 |
| `CompetitionExpiryScheduler` | Competition deadlines, expiry publication retries and cancellation of obsolete work    |
| `DirectorMqttState`          | Shared broker projections and correlated final-snapshot waits, as defined in ADR-0006  |

Connection readiness becomes true only after all subscriptions complete. A connection epoch prevents late automatic
reconnect work from marking a disconnected session ready. Failed reconnect subscriptions retry with bounded delay;
the first failure is reported without repeating the same error on every retry. Explicit disconnect removes listeners
and stops command and timer work even if the transport's graceful close fails. The module's `RuntimeOperationGate`
continues to serialize explicit broker transitions with application controls.

Clock quality is re-evaluated when read, so a previously good sample can expire. Replacing the clock policy or resetting
the broker session invalidates cached samples. Capability checks read the current Lane projection and the current
policies rather than caching start approvals. Heartbeat expiry preserves the report's original publication timestamp.

Expiry scheduling still runs through the competition operation queue. An expiry retains its original deadline until
both the Lane acknowledgement batch and retained-state cleanup succeed. A pending timer replacement suppresses the
previous timer's expiry. Stopping the scheduler invalidates queued and in-flight publication callbacks with a generation
counter: callbacks from a stopped generation cannot begin retained cleanup or schedule another retry after their
expiry publication completes. This does not retract a network message or retained-state write already started,
or cancel unrelated competition operations.

### Lane

`domain/IMqttClientService.ts` defines the transport port; `infra/MqttClientService.ts` implements it. The command
idempotency guard belongs beside application command processing and has no dependency on a concrete MQTT client.

`LaneCommandProcessor` handles the common receive sequence:

1. Capture receipt time, parse JSON and resolve an own entry in the handler's schema registry.
2. Validate the command envelope and assess issuer authorization.
3. Reject duplicate command IDs using the shared guard.
4. Run optional command preparation, including targeted broadcast selection and clock-drift checks.
5. Publish the executing acknowledgement, execute the command and publish the terminal acknowledgement.

`LaneTier1CommandHandler`, `BroadcastCommandHandler` and `PerLaneCommandHandler` retain topic routing, subscription
lifetimes and their competition-specific operations. They provide schemas, preparation and execution callbacks to the
processor. Receipt time reaches the clock-probe handler unchanged. Authorization and command warnings are combined
in the completion acknowledgement; operation-specific response data is preserved.

Malformed JSON remains ignored. Invalid JSON values such as `null` produce validation errors without dereferencing
them. Prototype member names are treated as unknown actions. Only string command IDs are echoed on invalid requests,
and acknowledgement errors contain the protocol's code and message fields rather than internal error metadata.
Acknowledgement publication failures remain logged without interrupting command execution. Duplicate deliveries and
untargeted broadcasts retain their existing acknowledgement behavior.

### Enforcement and extension

Dependency-cruiser prohibits MQTT application imports from MQTT infrastructure and registration in both applications,
including type-only imports. Director's focused collaborators cannot import `DirectorMqttService`; Lane's processor
and guard cannot import their command handlers. Lane no longer suppresses a historical circular dependency, because
the current source graph passes without that exception.

For a new Lane command, extend the shared protocol and the appropriate handler's typed schema registry and execution
logic. Add preparation only for checks that must precede the executing acknowledgement. Keep common receive behavior
in `LaneCommandProcessor`, and place a workflow with its own state or lifetime in a focused collaborator.

For a Director policy or timer change, modify its owning component and test the affected failure boundary. Keep service
and module integration tests to verify ordering and composition. The existing queues remain responsible for ordering;
the focused components do not introduce competing queues.

## Consequences

Competition code no longer owns reconnect, heartbeat or clock-approval bookkeeping. Lane's receive policy has one
implementation, so new commands inherit the same validation and acknowledgement behavior. Fake transports and clocks
exercise reconnect failures, stale callbacks, expiry retries, missing capability reports and malformed commands without
starting Electron or a broker.

The application contains more small files and explicit callbacks. Competition coordination remains substantial because
its operations share ordered state; this decision does not split it by an arbitrary size threshold. The protocol package
continues to contain application-neutral contracts rather than application-specific lifecycle abstractions.
