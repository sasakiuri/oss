# ADR-0013: Lane Settings Document Boundaries

## Status

Proposed (implemented locally)

## Date

2026-09-10

## Context

Lane's `AppSettingsStore` combined file persistence and recovery with normalization,
historical device migrations, identity allocation, and the existing electron-store
projection. A field or device migration required navigating file I/O and storage
synchronization, and callers imported the store contract from infrastructure.

These operations have different reasons to change. Their ordering is significant:
normalizing a historical device ID can lose the information needed to migrate its
preferences, and replacing a document must retain the installed Lane identity.

## Decision

Retain the modular monolith and existing settings API. Separate three owners:

- `application/SettingsDocument.ts` contains deterministic field normalization,
  historical device transformations and DTO projection helpers. It consumes only
  shared contracts and does not read storage, generate identities or log errors.
- `infra/LegacySettingsBridge.ts` owns the existing electron-store reads, partial
  document completion and projection writes. It has no filesystem responsibility.
- `infra/AppSettingsStore.ts` remains the public facade and JSON persistence owner.
  It coordinates normalization, Lane identity allocation, file recovery and the
  projection. `application/IAppSettingsStore.ts` defines the consumer-owned port.

This extraction preserves the existing recovery and synchronization policy; it
introduces no additional fallback or alternate storage format.

### Ordering and identity

Loading first completes older document sections, then prefers the normalized
draft Lane ID, the valid mirrored legacy ID, and finally a new UUID. Completion
can preserve `mqtt.settings.laneId` when the separate `mqtt.laneId` key is absent
and the document does not override it. Replacement first obtains the persisted
identity, then the valid mirrored identity, before considering the draft ID.
Allocation stays in the facade.

Raw `BP216` detection precedes canonical device normalization so its associated
rifle preferences can be migrated together. Partial connection completion copies
USB identity only when the saved port, manufacturer and explicit device ID agree.
Saving a connection preserves the existing rules for clearing omitted device IDs
and retaining USB identifiers on an unchanged port/manufacturer.

User preference projection preserves the distinction between omitted defaults and
explicitly saved values. JSON is written before projection synchronization;
`saveUserPreferences` retains its final explicit preference write. Corrupted file
backup, logging, error codes and wrapping stay with the persistence owner.

### Extension and validation

Add field transformations to the pure document module and cover their observable
input/output behavior. Storage reads and writes belong to the bridge or facade;
consumers depend on `IAppSettingsStore`, not bridge internals. Do not cache a
normalized connection before applying transformations that depend on its raw ID.

Dependency-cruiser restricts the document module and port to shared IPC contracts
within the source graph. Existing store and startup tests cover migration,
partial documents, stable identity, corruption recovery and auto-connect. Focused
normalization tests cover immutability, repeated normalization, identity ownership
and explicit defaults.

## Consequences

Settings transformations can be tested without a filesystem or storage mock.
Persistence, projection and normalization can evolve independently while their
ordering remains visible in the facade. This adds two focused modules but does
not add a framework, new storage backend or compatibility layer.
