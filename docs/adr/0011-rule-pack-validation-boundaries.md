# ADR-0011: Rule Pack Validation Boundaries

## Status

Proposed (implemented locally)

## Date

2026-09-10

## Context

Lane and Director use the same versioned Rule Packs for competition setup, scoring,
timed-target programs and official commands. `RulePack.ts` had grown to 1,153 lines,
combining the public type contracts, definition factory, scalar checks and validation
of relationships between capabilities. Adding a capability required navigating
unrelated validation code. The package's independence from application code was
documented but had no dependency-cruiser check of its own.

Rule Pack identities are persisted and exchanged between applications. Refactoring
must preserve canonical content, identity fingerprints, validation order and error
messages. Validation must complete before the caller's definition is frozen.

## Decision

Continue the modular monolith and shared rule authority described in
[ADR-0004](0004-versioned-rule-packs.md). Keep public type contracts in `RulePack.ts`
and retain its `defineRulePack` export as a compatibility facade. Move the factory
and its focused validators into `validation/`:

| Component        | Responsibility                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `defineRulePack` | Validate identity and authority, order capability checks, then deeply freeze the original definition       |
| `courseOfFire`   | Validate stages and series, including their agreement with ranking totals                                  |
| `ranking`        | Validate Final checkpoints, countback references and result projection prerequisites                       |
| `commands`       | Validate timing, script branches, participant selection and references to course series and timed programs |
| `adjudication`   | Validate firing-window review metadata and Final incident consequences                                     |
| `timedTarget`    | Validate exposures, program references and recovery policies                                               |
| `primitives`     | Validate text, dates and scalar integer constraints                                                        |

The factory keeps an explicit, ordered sequence of calls. Existing EST complaint
and qualification malfunction validators remain their capability's authority.
Validators can read related capabilities from the supplied definition; they do not
load a concrete edition, normalize data, freeze objects or call the factory.
The existing identical positive-seconds and positive-integer checks share one
implementation with the same error text.

Dependency-cruiser rejects dependencies outside this package's source, validation
imports of edition catalogs or the public index, and runtime imports from validators
back to the definition factory. Type-only references to the public contracts remain
valid. Scalar helpers cannot import capability code. The workspace `depcruise` task
participates in the existing CI and consumer task graph.

## Extension and Validation

Add a capability's type contract and validation to its owning responsibility. Add
the validator to the factory's explicit sequence when introducing a new boundary.
Exercise it through `defineRulePack`, including invalid references to other
capabilities, so tests cover composition as well as individual constraints.

Compatibility tests record the identity of every shipped pack, verify that a cloned
definition is returned unchanged and deeply frozen, and check that rejected inputs
retain their content and remain unfrozen. The legacy import path and validation
precedence are covered. Fingerprint snapshots must change only with an intentional
rule-content change; updating them is not a routine refactoring step.

## Consequences

Capability validation can evolve independently while the public definition and
import paths remain stable. Cross-capability relationships stay visible in focused
validators. This adds internal files, but no runtime dependency, registry, schema
version or application migration. Edition data and competition rules are unchanged.
