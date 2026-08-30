# ADR-0004: Versioned Competition Rule Packs

## Status

Accepted

## Date

2026-08-29

## Context

Saika Lane and Saika Director previously duplicated course-of-fire values. A rule revision could therefore change
timers, scoring, ranking, verification, and result publication inconsistently. Application-specific models also differ:
Lane manages a local session state machine, while Director manages multi-Lane control and official-result workflows.

## Decision

Store rule authority and optional capabilities in the application-neutral `@sasakiuri/saika-rules` workspace.
Each pack has a stable versioned ID, effective dates, and rule references. Each application owns a one-way adapter
from a Rule Pack into its existing competition definition. UI, Electron, transport, persistence, and application
aggregates are prohibited from the shared package.

Policies that are not yet represented by a Rule Pack remain injected fallbacks. Unsupported capabilities are not
silently simulated. In particular, 10m Final definitions may be consumed by Director while Lane MQTT Final control
remains disabled.

Operational effects remain behind application-owned ports. For example, Director adapts command warning points into
an independent reminder scheduler and emits semantic events to a visual notification sink. Rule Packs do not own
system timers, audio, UI, or transport messages.

## Consequences

### Positive

- ISSF 10m Air Qualification values have one source while Lane and Director remain independently evolvable.
- A future rules edition can be added alongside the existing pack and selected by effective date.
- Existing local/JRSF definitions need no forced migration.

### Negative

- Persisting a Rule Pack selection directly on an event is a separate future migration if multiple editions of the
  same event must coexist in one installed application.
