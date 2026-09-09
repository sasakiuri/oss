# Architecture Decision Records (ADR)

## What is an ADR?

An Architecture Decision Record captures an important architectural decision made along with its context and consequences. ADRs are lightweight documents that help the team understand why certain decisions were made, even long after the original authors have moved on.

This project follows [Michael Nygard's ADR format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

## How to Create a New ADR

1. Copy `template.md` to a new file with the next sequential number:
   ```
   cp template.md NNNN-short-title.md
   ```
2. Replace `NNNN` with the zero-padded number (e.g., `0004`).
3. Fill in the title, date, context, decision, and consequences.
4. Set the status to **Proposed** and submit a pull request for review.

## Status Lifecycle

```
Proposed --> Accepted --> Deprecated
                     \-> Superseded by [ADR-NNNN]
```

- **Proposed** -- Under discussion; not yet agreed upon.
- **Accepted** -- The team has agreed to follow this decision.
- **Deprecated** -- No longer relevant (e.g., the feature was removed).
- **Superseded** -- Replaced by a newer ADR (link to the replacement).

## Index

| ADR                                                         | Title                                                | Status   |
| ----------------------------------------------------------- | ---------------------------------------------------- | -------- |
| [0001](0001-monorepo-toolchain.md)                          | Monorepo Toolchain                                   | Accepted |
| [0002](0002-electron-architecture.md)                       | Electron App Architecture                            | Accepted |
| [0003](0003-ipc-contract-system.md)                         | IPC Contract System                                  | Accepted |
| [0004](0004-versioned-rule-packs.md)                        | Versioned Rule Packs                                 | Accepted |
| [0005](0005-application-composition-and-wire-contracts.md)  | Application Composition and Shared MQTT Contracts    | Proposed |
| [0006](0006-director-mqtt-application-boundaries.md)        | Director MQTT Application Boundaries                 | Proposed |
| [0007](0007-mqtt-lifecycle-and-command-processing.md)       | MQTT Lifecycle Ownership and Lane Command Processing | Proposed |
| [0008](0008-director-renderer-state-and-view-boundaries.md) | Director Renderer State and View Boundaries          | Proposed |
| [0009](0009-lane-database-migration-boundaries.md)          | Lane Database Migration Boundaries                   | Proposed |
| [0010](0010-director-command-workflow-boundaries.md)        | Director Command Workflow Boundaries                 | Proposed |
| [0011](0011-rule-pack-validation-boundaries.md)             | Rule Pack Validation Boundaries                      | Proposed |
| [0012](0012-serial-protocol-deadline-ownership.md)          | Serial Protocol Deadline Ownership                   | Proposed |
| [0013](0013-lane-settings-document-boundaries.md)           | Lane Settings Document Boundaries                    | Proposed |
| [0014](0014-target-examination-workspace-boundaries.md)     | Target Examination Workspace Boundaries              | Proposed |
