# ADR-0009: Lane Database Migration Boundaries

## Status

Proposed (implemented locally; pending review)

## Date

2026-09-10

## Context

Lane's `SqliteDb.ts` combined connection ownership, its unversioned session schema,
19 schema migrations and version bookkeeping. Most early migrations committed
before updating `PRAGMA user_version`, allowing a failure between those operations
to leave the version behind the stored data. A later failure could also leave an
upgrade partially applied, and initialization errors left the connection open.

Director already has an explicit migration catalog. Its `schema_meta` version
history and legacy reset policy differ from Lane's `user_version` history, so
sharing a migration runner would couple two distinct storage contracts.

## Decision

Retain SQLite and each application's existing version history. Refine Lane's
storage infrastructure into three responsibilities:

- `SqliteDb.ts` opens the database, configures WAL and foreign keys, runs migrations,
  and transfers connection ownership to its caller only after success. It closes
  the connection before propagating initialization failures.
- `migrations/MigrationRunner.ts` validates the catalog, reads the stored version,
  initializes the session schema and applies pending migrations. It rejects a
  database newer than the supported catalog or a negative stored version.
- `migrations/index.ts` explicitly registers named, consecutive migrations.
  Numbered files contain the historical SQL and data transformations;
  `SessionSchema.ts` retains the original unversioned bootstrap schema.

The runner acquires an immediate transaction before reading the version. Session
initialization, every pending migration and all version updates commit together.
If an upgrade fails, the database retains its previous schema, records and version
and can retry the same upgrade. Individual migrations do not manage transactions
or write version metadata.

Versions 1 through 19 and their resulting schema remain unchanged. New databases,
legacy score conversion and existing repositories keep their established formats.
No new dependency, schema version, migration metadata table or deployment unit is
introduced.

## Extension and validation

Append a numbered migration and register it at the end of `allMigrations`. Keep
historical migrations self-contained: do not import current domain models,
repositories or schemas whose future edits would change an old upgrade. Do not
rewrite an already published migration to repair data; append a new version.
Dependency-cruiser enforces this boundary and prevents feature modules from
importing migration internals.

Test upgrades with existing rows, failure rollback and reopening at the current
version. The refactoring was also compared against the original initializer for
all starting versions 0 through 19: resulting schemas, versions, session scores
and seeded shoot-off outbox records matched. Regression tests exercise legacy
score conversion, initialization policies, retry after failure and rejection of
newer databases. Existing repository tests retain evidence and constraint checks.

## Consequences

A new storage feature adds an explicit migration without expanding connection
initialization. Version metadata and migrated data share one failure boundary,
and a failed startup does not leak a database handle.

The transaction holds a write lock for the pending upgrade. Future large data
migrations must account for startup duration. Lane and Director deliberately keep
separate runners because their migration histories and compatibility policies
remain different.
