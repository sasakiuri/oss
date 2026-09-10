# ADR-0014: Target Examination Workspace Boundaries

## Status

Proposed (implemented locally)

## Date

2026-09-10

## Context

The target-examination panel owned list queries, mutations, selection, forms and
display policy in one component. Forms retained their local fields when another
case was selected, so a draft intended for one case could be submitted for the
next. An initial list could also finish after case creation and overwrite the
newer list. Scope-string checks did not order requests within a workspace visit.

[ADR-0008](0008-director-renderer-state-and-view-boundaries.md) established explicit
renderer state ownership for competition controls and interruption records. The
same separation is appropriate here without introducing a generic ledger framework.

## Decision

Keep the feature local and divide it into four responsibilities:

- `useTargetExaminationCases` owns service calls, query ordering, mutation
  exclusion, record selection, loading/saving flags and errors.
- `TargetExaminationsPanel` composes a workspace keyed by scope. `CaseDetail` is
  keyed by case ID and owns which case form is open. Changing case discards its
  unsaved draft; returning to it creates a fresh form.
- Creation, evidence, action and scope-link forms construct typed payloads and
  call `TargetExaminationCommands` callbacks. They have no service or store imports.
- `examinationPresentation` owns pure labels, options, rule defaults and scope
  deduplication. Shared view/command types live outside the parent component.

`EvidenceFilesPanel` retains its separate file-custody service and local state.
It is mounted inside the keyed case detail, independently of examination decisions.
The main-process service continues to validate all authoritative state transitions.

### Asynchronous guarantees

Each scope visit has its own lifetime. A new query invalidates older responses;
starting a mutation also invalidates outstanding queries. Effect cleanup
invalidates the visit, including discarded Strict Mode effects. A completed
command from a departed visit neither reloads records nor changes current errors,
selection, saving state or forms.

Only one examination mutation is submitted at a time per active workspace. After
success the list is refreshed. A selection made while the command was pending is
preserved. Forms close after an accepted command success; a command failure
refreshes the authoritative list, exposes the command error, releases the pending
state and retains the draft for retry. A failed refresh after a successful command
remains visible as a query error; the successful command is not reported as failed.

These are renderer ownership guarantees, not cancellation of an already submitted
IPC operation. Backend commands can still complete after the user leaves a scope.

### Extension and validation

Add commands to the hook and expose typed callbacks through the local contract.
Keep query/command state independent of views and put case draft state under its
case key. Do not let forms update parent selection or saving flags directly.

Dependency-cruiser prevents view imports of services/stores, state imports of
views, pure policy imports of runtime code, and forms importing their workspace
or state hook. Deferred-response tests cover query ordering, repeated scope
visits, Strict Mode, unmount, duplicate submission, selection changes and failure
recovery. Screen tests reproduce draft isolation and late initial queries, and
retain existing create, evidence-hold and archive workflows.

## Consequences

New fields and display changes no longer require changes to asynchronous state
management. Case and workspace lifetimes are explicit and independently testable.
The feature uses more focused files, while existing IPC payloads, domain rules,
archive behavior and preferred open-case selection remain unchanged.
