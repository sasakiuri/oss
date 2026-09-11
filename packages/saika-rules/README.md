# @sasakiuri/saika-rules

Versioned competition definitions shared by Saika Lane and Saika Director. Each
Rule Pack identifies its authority, edition, effective dates and rule references.

Core capabilities define targets, scoring, courses of fire and ranking. Optional
capabilities cover verification, publication, command sequences, recovery and
malfunction procedures. They describe rule requirements; the applications choose
which capabilities to support and implement the controls, clocks, storage and UI.
Officials remain responsible for classifying incidents and authorizing firing and
score changes.

Public types are in `src/RulePack.ts`. `defineRulePack` validates a supplied pack
and its capability references before freezing it. The package has no application
or transport dependencies. Lane and Director use their own
`competitionTypeFromRulePack` adapters. See
[shared competition rules](../../ARCHITECTURE.md#shared-competition-rules) for
validation and fingerprint compatibility.

The ISSF 10m Air Rifle and Air Pistol Qualification and Final definitions use
Edition 2025, Second Print 07/2026, effective 1 July 2026. Qualification includes
the ten-minute score-protest window; Final uses its own score-protest rules.

From this package, run `npm test` for rule and compatibility tests and
`npm run depcruise` for dependency checks.
