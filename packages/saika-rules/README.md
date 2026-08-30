# @sasakiuri/saika-rules

Application-neutral, versioned competition rule packs used by Saika Lane and Saika Director.

Each capability is optional. Consumers adapt only the capabilities they support, so target scoring,
course-of-fire control, ranking, verification, and publication can evolve independently.

The package contains no Electron, renderer, persistence, MQTT, or application-domain imports. A Rule Pack identifies
its authority, edition, effective range, and rule references. Saika Lane and Saika Director convert it through their
own `competitionTypeFromRulePack` adapters and keep unsupported capabilities outside their local state machines.
Command-sequence capabilities express call-to-line and target-visibility lead times, setup allowances, reminder points,
and reset pauses without prescribing a UI, clock, acknowledgement workflow, or transport message.
Firing-window review capabilities identify rule-defined intervals and Jury guidance without prescribing timestamp
selection, clock tolerance, persistence, notifications, or an automatic scoring decision.

The initial packs cover ISSF 10m Air Rifle and Air Pistol Qualification and Final under Edition 2025,
Second Print 07/2026, effective 1 July 2026. Qualification publication includes the ten-minute score-protest window;
Final deliberately does not reuse it because Finals score protests follow different rules.
