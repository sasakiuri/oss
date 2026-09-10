# ADR-0010: Director Command Workflow Boundaries

## Status

Proposed (implemented locally)

## Date

2026-09-10

## Context

[ADR-0006](0006-director-mqtt-application-boundaries.md) and
[ADR-0007](0007-mqtt-lifecycle-and-command-processing.md) separated MQTT connection,
receipt, state, acknowledgements and timer lifecycles. The competition coordinator
still contained distinct families of Lane commands, mixing recovery validation
and range interruption operations with membership, retained timer intent and
competition cleanup.

These command families have their own validation and failure behavior. Moving
queue ownership into each family, however, would allow commands for the same
competition to race or introduce nested acquisition of the same queue key.

## Decision

Keep the modular monolith, the existing public `DirectorMqttService` API and one
shared operation queue. Extract focused application workflows:

| Component                       | Responsibility                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `QualificationRecoveryCommands` | Validate the current recovery context, preserve retry timing, and publish start, cancel, apply and settlement commands |
| `RangeInterruptionCommands`     | Pause and resume individual Lanes or a selected range, validate every target, and coordinate a shared restart time     |
| `RangeSafetyCommands`           | Validate known Lanes and publish competition-independent safety STOP and explicit clearance commands                   |
| `DirectorCommandPort`           | Expose command identity creation and connected publication without granting ownership of the transport or dispatcher   |
| `createLaneCommandFailure`      | Preserve a consistent per-Lane failure result for membership, interruption and safety batches                          |

Workflows declare the narrow context interfaces they consume. The coordinator
supplies live state access, readiness and membership guards, logging and result
callbacks through explicit closures. They do not import the coordinator, its
state implementation, network adapter, runtime readiness owner or operation queue.
They store no Lane snapshots or pending commands.

### Ordering and behavior

The public facade acquires the appropriate queue key before calling a workflow.
Qualification recovery and interruption commands share the competition key with
ordinary competition operations. Validation therefore runs against the state at
execution time, including changes received while a command was waiting.

Safety operations retain their separate `range-safety` key: STOP can be published
while a competition command awaits acknowledgement, while a subsequent clearance
waits for the preceding safety operation. The module's existing runtime transition
gate continues to coordinate broker changes.

Range operations deduplicate Lane IDs and validate all targets before fan-out.
Timer resume checks all clocks before sending and uses one scheduled restart
instant for the batch. Individual failures retain their Lane result and error code
without discarding successful outcomes. Command identity, issuer handling,
acknowledgement topics, timeouts and mutable service callbacks remain unchanged.

The coordinator retains membership, competition phase progression, retained timer
intent, final snapshot collection and cleanup because those workflows coordinate
shared competition state and publication order.

### Extension and validation

Add Lane-command behavior to its owning workflow and add new context operations
only when that workflow needs them. Keep queue acquisition in the facade; a
workflow must not call the facade recursively or create an independent queue for
the same competition. Extend the shared wire schema only when the protocol changes.

Dependency-cruiser forbids reverse imports to the coordinator and direct workflow
dependencies on queue, state, connection, readiness and dispatch owners. Unit tests
exercise partial batch failures, target validation and synchronized restart times
through ports. Service tests verify that a queued recovery sees updated Lane
state, failure releases subsequent operations, safety STOP can proceed during an
outstanding competition command, and clearance retains its ordering.

## Consequences

Recovery, range interruption and safety command changes can be reviewed and tested
without navigating unrelated competition lifecycle operations. Existing callers
and wire formats continue to work through the same facade.

Explicit ports add wiring in the coordinator. This is intentional: the shared
state and scheduling owners remain visible, and extracted workflows cannot
silently acquire competing lifecycles.
