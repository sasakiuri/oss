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

| ADR                                   | Title                     | Status   |
| ------------------------------------- | ------------------------- | -------- |
| [0001](0001-monorepo-toolchain.md)    | Monorepo Toolchain        | Accepted |
| [0002](0002-electron-architecture.md) | Electron App Architecture | Accepted |
| [0003](0003-ipc-contract-system.md)   | IPC Contract System       | Accepted |
