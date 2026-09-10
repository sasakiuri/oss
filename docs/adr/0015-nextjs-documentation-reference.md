# ADR 0015: Next.js documentation application

Status: Accepted

## Context

The repository contains Japanese Markdown manuals and shared application packages. The documentation needs a browser interface and a maintained foundation for future Next.js development.

## Decision

Use Next.js App Router with server and static output. Keep document parsing, search, UI and route composition in separate layers. Reuse the monorepo's lint, formatting and TypeScript configuration. Enable typed routes and React Compiler.

Render Markdown with unified plugins, sanitized HTML, syntax highlighting, math and lazy diagrams. Supply document navigation, search, themes, metadata, RSS, printing and offline static distribution. Component examples demonstrate accessible forms, lists and dialogs using local document data.

Validate source contracts, environment declarations, dependency direction, browser behavior, accessibility, visual changes and build artifacts. Property and mutation tests exercise URL validation. Optional telemetry remains inactive without explicit settings.

Keep the application self-contained. Include only the development and distribution tooling used by the documentation application. Deployment services, external content systems and business-domain examples are outside this decision.

## Consequences

Static hosting must apply the generated HTTP headers. Server-only features are excluded from static output. Existing editorial findings have an explicit baseline; new findings fail checks. Publication and release continue to use the repository's approval rules.

See [the application guide](../reference-nextjs.md) for commands and settings.
