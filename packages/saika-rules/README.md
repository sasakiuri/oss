# @sasakiuri/saika-rules

Application-neutral, versioned competition rule packs used by Saika Lane and Saika Director.

Public type contracts live in `src/RulePack.ts`. `defineRulePack` delegates to focused validators under
`src/validation/` before freezing the definition; existing imports remain supported. Cross-capability checks use
the supplied pack without loading an edition catalog. Run `npm run test` for rule and compatibility tests and
`npm run depcruise` for dependency boundaries. See
[ADR-0011](../../docs/adr/0011-rule-pack-validation-boundaries.md) for extension guidance and fingerprint compatibility.

Core capabilities define the target, scoring, course of fire and ranking. Optional capabilities add verification,
publication, commands, recovery and other event-specific policies. Consumers adapt the capabilities they support,
so these responsibilities can evolve independently.

The package contains no Electron, renderer, persistence, MQTT, or application-domain imports. A Rule Pack identifies
its authority, edition, effective range, and rule references. Saika Lane and Saika Director convert it through their
own `competitionTypeFromRulePack` adapters and keep unsupported capabilities outside their local state machines.
Command-sequence capabilities express call-to-line and target-visibility lead times, setup allowances, reminder points,
and reset pauses without prescribing a UI, clock, acknowledgement workflow, or transport message.
Firing-window review capabilities identify rule-defined intervals and Jury guidance without prescribing timestamp
selection, clock tolerance, persistence, notifications, or an automatic scoring decision.
Qualification-malfunction capabilities separately describe human classification choices, claim limits, repair and
sighting rules, stage-specific repeat or completion treatments, scoring-form policy, and required records. They do not
classify an incident, authorize a Lane, or modify a score, so applications can compose them with different case,
transport, and publication workflows.

The initial packs cover ISSF 10m Air Rifle and Air Pistol Qualification and Final under Edition 2025,
Second Print 07/2026, effective 1 July 2026. Qualification publication includes the ten-minute score-protest window;
Final deliberately does not reuse it because Finals score protests follow different rules.
