# ADR-0001: Monorepo Toolchain

## Status

Accepted

Amended on 2026-08-27 to record the shared Saika suite release train.

## Date

2025-01-01

## Context

This project contains the Saika Lane and Saika Director desktop applications, their shared Saika Docs specifications, and several shared configuration packages (ESLint, Prettier, Stylelint, TypeScript configs). We needed a monorepo structure that would:

- Allow shared configuration packages to be consumed by the applications without publishing to a registry during development.
- Provide fast, incremental builds as the number of packages grows.
- Support explicit versioning policies and changelogs for each release unit.
- Keep the toolchain simple and well-supported in the Node.js ecosystem.

Alternative approaches considered included Yarn workspaces with Lerna, pnpm workspaces with Nx, and a polyrepo with git submodules.

## Decision

We adopt **npm workspaces** as the workspace manager, **Turborepo** as the build orchestrator, and **Changesets** for versioning and changelog generation.

- **npm workspaces** (`"workspaces": ["packages/*"]`) handles dependency hoisting and cross-package linking natively.
- **Turborepo** provides task-level caching, parallel execution, and a declarative pipeline (`turbo.json`) for `dev`, `build`, `lint`, `fix`, `test`, and `typecheck`.
- **Changesets** (`@changesets/cli`) auto-generates versions and changelogs from structured changeset files. Saika Lane, Saika Director, and Saika Docs are one fixed version group; shared configuration packages remain independently versioned.

Additional tooling enforces consistency across the monorepo:

- **syncpack** ensures dependency version alignment across packages.
- **commitlint** enforces Conventional Commits with scoped package names.
- **husky** + **lint-staged** run pre-commit checks.
- **knip** detects unused exports and dependencies.
- **licensee** validates license compliance.

## Consequences

### Positive

- Turborepo's content-aware caching eliminates redundant builds, significantly reducing CI time.
- npm workspaces require zero additional tooling beyond the npm CLI already in use.
- Changesets enable a lockstep release cycle for the three Saika suite packages and independent cycles for the shared configuration packages with minimal ceremony.
- Shared config packages (`@sasakiuri/eslint-config`, etc.) are linked locally and consumed like published packages.
- The toolchain is well-documented and widely adopted, lowering onboarding friction.

### Negative

- All packages must use npm (pnpm/yarn are not supported as workspace managers alongside npm workspaces).
- Turborepo remote caching requires additional infrastructure setup.
- Changesets add a small overhead to the PR workflow (contributors must include a changeset file).

## References

- [npm workspaces documentation](https://docs.npmjs.com/cli/using-npm/workspaces)
- [Turborepo documentation](https://turbo.build/repo/docs)
- [Changesets documentation](https://github.com/changesets/changesets)
