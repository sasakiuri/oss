# ADR-0012: Serial Protocol Deadline Ownership

## Status

Proposed (implemented locally)

## Date

2026-09-10

## Context

The RedDot connection session serializes probe, initialization, polling and frame
acknowledgements on one operation queue. Each deadline repeated clock management,
generation checks, queue entry and error forwarding. Clearing a native timeout is
insufficient once its callback has enqueued work behind another serial operation.
That queued work must also be invalidated when a response arrives or a session stops.

## Decision

Introduce `SerializedProtocolTimer` in the USB adapter layer. Each instance owns one
replaceable deadline and its cancellation revision. It receives a clock port and the
session's existing serialization function. It never creates a second queue or knows
about a concrete device, serial port, protocol state or Electron.

The RedDot session owns separate poll and response timer instances. The response
timer serves the mutually exclusive probe, target-type acknowledgement, fallback
settling and normal response deadlines. The session continues to own all protocol
transitions, initialization readiness, receipt sequences, write/drain behavior,
failure reporting and the session generation.

A scheduled operation supplies a live state guard, its work and an error callback.
When the native timeout fires, the timer verifies its revision before enqueueing.
When the queued operation begins, it verifies the revision again and evaluates the
session's current generation and expected state. Cancelling or replacing a deadline
invalidates queued work even if the native timer has already fired.

Cancellation does not retract a write already started. Existing generation checks
in write/drain callbacks continue to prevent late completions from advancing a
stopped session. Timeout durations, warning codes, public session/clock interfaces,
device bytes, frame acknowledgement order and initialization fallback behavior remain
compatible. The timer has no imports; dependency-cruiser enforces that boundary.

## Extension and Validation

New deadlines using this mechanism must share the owning session's queue and supply
a live guard. Cancel timers during shutdown and whenever a state transition replaces
their intent. Do not cache a state approval at scheduling time.

Timer tests cover delayed queue execution, cancellation and replacement after expiry,
late clock delivery, live-state changes, independent deadlines and synchronous or
asynchronous failures. RedDot session tests exercise responses and shots racing an
expired deadline, the interval after a response timeout, cancellation during drain,
restarts, initialization fallback and failure handling. USB lifecycle and scanner
tests cover the surrounding adapter integration.

## Consequences

Deadline cancellation has one implementation and an explicit lifetime. Protocol
methods express the transition caused by a timeout without repeating its scheduling
mechanics. The timer is available to other serial adapters when they need the same
queue semantics. Adapters with different timing needs retain their own behavior.
No additional runtime dependency or protocol change is introduced.
