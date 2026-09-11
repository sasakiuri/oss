# ADR-0004: Versioned competition rules

Lane and Director need matching scoring and course-of-fire definitions while
using different session, control and result models. Shared Rule Packs identify
rules by authority, edition and content fingerprint; each application adapts the
capabilities it supports.

Keeping device control, clocks, storage and UI outside Rule Packs lets the
applications use the same rules without sharing their state machines. The cost is
separate adapter validation: a valid Rule Pack does not guarantee that an
application supports every capability. Fingerprints must remain stable for stored
records and exchanged messages unless the rule content changes.

See [shared competition rules](../../ARCHITECTURE.md#shared-competition-rules) for
validation and compatibility requirements.
