# ADR-0008: Director Renderer State and View Boundaries

## Status

Proposed (implemented locally)

## Date

2026-09-10

## Context

The suite already uses feature modules, explicit composition, ports and adapters, CQRS and shared wire contracts.
Director's competition control and interruption record screens still combined state synchronization, command
workflows, recovery checks and large forms in single components. Changing one concern required reviewing unrelated
operations. A scope-key check protected interruption queries, but not mutations or multiple visits to the same scope.
Older responses could overwrite current records, and an operation from a departed workspace could change selection,
loading state or error messages in the newly selected workspace.

## Decision

Retain the existing modular monolith and React/Zustand stack. Separate renderer responsibilities within the two
features using focused hooks, explicit component props and pure presentation policies. Add no framework or generic
repository abstraction. Keep IPC schemas, MQTT messages, persistence formats and main-process competition authority
unchanged.

### Competition control

| Owner                                              | Responsibility                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `CompetitionControlScreen`                         | Compose feature panels, coordinate display revisions and pass state/actions                  |
| `useMqttControlSnapshot`                           | Query and subscribe to broker projections; own request ordering and cleanup                  |
| `useCompetitionEvidence`                           | Query selected-competition evidence, filter and deduplicate live events                      |
| `useCompetitionSelection`                          | Reconcile selected competition, Lane membership and assignment target with snapshots         |
| `useCompetitionCommands`                           | Confirm and execute operations, report outcomes, refresh projections and retain result links |
| `LaneManagementPanel`                              | Display discovery and assignment controls; own checkbox indeterminate state                  |
| `LaneAttentionSignals`                             | Display Lane-owned assistance and incident signals                                           |
| `CompetitionRunPanel` / `CompetitionEvidencePanel` | Display phase controls, pending operations and review evidence                               |

The hooks do not import view components, even for types. `ChampionshipResultContext` comes directly from the
persistent store that owns it. Display panels receive typed subsets of selection and command state, and invoke
callbacks instead of importing IPC services. Child feature panels retain their own established application workflows.

A snapshot request is accepted only if it is the newest request, no newer live update has arrived, and its hook
is still active. Unmount invalidates pending queries, unsubscribes events and prevents later refresh callbacks from
starting another request. Evidence queries have independent request and live-event versions and are invalidated on
unmount. These are projection lifetime guarantees; they do not cancel an already dispatched main-process command.

### Interruption records

`RangeInterruptionsPanel` composes the record list, creation form and `InterruptionDetail`.
`useRangeInterruptionCases` owns queries, record selection, saving state and mutation recovery. Each scope visit has
a distinct lifetime object. Switching from A to B and back to A cannot revive work from the first visit. Loading a
new scope clears the old records. Request sequence numbers prevent an older refresh from replacing a newer result.

Mutations check their scope lifetime before changing selection, reloading, reporting errors or clearing saving state.
Overlapping mutation calls in the same lifetime are rejected before the second operation runs. The originating
operation can still complete in the main process after leaving the panel. Returning to its scope queries persisted
state again. The hook does not undo completed operations.

A failed Lane/ledger workflow reloads the ledger before presenting its error for retry: a successful append and its
acknowledgement cannot be assumed to share a transaction. Creation and detail forms close only when their mutation
returns success for the current lifetime.

Form components own their fields and payload construction. `InterruptionDetail` coordinates Lane/range workflows
through the existing workflow ports. `interruptionRecoveryState` owns pure checks for pending target batches,
qualification recovery settlement and decision supersession. `interruptionPresentationTypes` holds contracts shared
by the panel, detail and forms; no child imports the parent panel. These checks guide UI availability; the existing
main-process domain/application guards remain authoritative.

### Enforcement and extension

Dependency-cruiser rejects direct IPC/store dependencies from the extracted competition views, dependencies from
state hooks to views, dependencies from pure planning/recovery helpers to renderer runtime code, and dependencies
from interruption children to their parent panel. Type-only dependencies participate in these checks.

For a new competition operation, add the IPC call, confirmation and result handling to `useCompetitionCommands`,
then expose a callback to its control. For new live data, place query/event ordering and cleanup with its owning
hook. Keep pure selection and readiness helpers independent of IPC services. For a new interruption entry, extend
its focused form and existing workflow; put recovery availability checks in `interruptionRecoveryState`.

Keep screen tests for user-visible control behavior. Test asynchronous hooks with deferred responses and the
in-memory event bus to cover out-of-order completion, live updates, scope changes, unmount and Strict Mode effect
replay. Test command/ledger recovery without a broker or Electron process.

## Consequences

The two parent screens now primarily compose their features. Form changes, synchronization changes and recovery
policy changes have separate implementation locations. The project gains explicit props and more small modules;
those local contracts must evolve with each feature. Command confirmation and result cleanup stay in one workflow
hook because they share selection, notifications and persistent result context. This decision does not impose a
file-size limit or claim that unrelated screens have adopted these boundaries.
