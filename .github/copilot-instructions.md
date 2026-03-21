# GitHub Copilot Instructions

## Project Overview

This is a monorepo managed with **Turborepo** and **npm workspaces**.

### Packages

| Package                        | Description                                             |
| ------------------------------ | ------------------------------------------------------- |
| `saika-lane`                   | Electron desktop app for electronic target shot display |
| `@sasakiuri/eslint-config`     | Shared ESLint flat config                               |
| `@sasakiuri/prettier-config`   | Shared Prettier config                                  |
| `@sasakiuri/stylelint-config`  | Shared Stylelint config                                 |
| `@sasakiuri/typescript-config` | Shared TypeScript config                                |

## Language & Frameworks

- **TypeScript** (strict mode) for all packages
- **Electron** — main process (Node.js) + renderer process (browser)
- **React 19** — renderer UI
- **Zustand** — state management
- **Tailwind CSS** — styling
- **Vite** — build tool
- **serialport** — USB serial communication (native module)
- **better-sqlite3** — local database
- **mqtt** — MQTT messaging

## Commands

```bash
npm install          # Install all dependencies
npx turbo dev        # Start development
npx turbo build      # Build all packages
npx turbo lint       # Lint all packages
npx turbo fix        # Auto-fix lint + formatting
npx turbo test       # Run all tests
npx changeset        # Create a changeset for versioning
```

## Code Style

- **ESLint 9** flat config via `@sasakiuri/eslint-config`
- **Prettier 3** via `@sasakiuri/prettier-config`
- **Stylelint** via `@sasakiuri/stylelint-config`
- **TypeScript** extends `@sasakiuri/typescript-config`

## Commit Convention

**Conventional Commits** format enforced by commitlint:

```
type(scope): message
```

- **Scope is required** and must be one of: `saika-lane`, `eslint-config`, `prettier-config`, `stylelint-config`, `typescript-config`, `repo`
- **Allowed types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `revert`
- Header max length: 100 characters

**Examples:**

- `feat(saika-lane): add SIUS adapter support`
- `fix(eslint-config): correct TypeScript override`
- `chore(repo): update CI workflow`

## Branch Strategy

| Branch                     | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `1.x`, `2.x`, ...          | Main branches (highest number = default) |
| `staging`                  | Staging environment                      |
| `canary`                   | Next development                         |
| `feature/<package-name>/*` | New features                             |
| `fix/<package-name>/*`     | Bug fixes                                |

## Architecture (saika-lane)

### Module-Based Architecture

The Electron main process uses feature modules, each containing DDD layers:

```
modules/{feature}/
  domain/        # Entities, value objects, repository interfaces
  application/   # CQRS command/query handlers
  infra/         # Repository implementations, external integrations
  *.module.ts    # Module definition (dependency wiring)
```

### Key Patterns

- **Clean Architecture** — business logic independent of frameworks
- **DDD (Domain-Driven Design)** — domain knowledge expressed in code
- **CQRS** — separate command and query buses (token-based)
- **Event-Driven** — `TypedEventBus` for loose coupling between modules
- **Hexagonal Architecture** — external dependencies isolated behind interfaces

### IPC Layer

- Contracts defined in `shared/ipc/contracts/` using **Zod schemas**
- `defineContract()` DSL generates type-safe contracts
- `IpcRouter` handles main-process routing with input/output validation
- `createBridge()` auto-generates preload API from contracts
- Renderer uses a service layer (`renderer/services/`) wrapping IPC calls

### Process Boundaries

```
Renderer (React/Zustand) <-> Preload (contextBridge) <-> Main (Modules/CQRS)
```

## Testing

- **Vitest** — unit tests (`tests/unit/`)
- **Playwright** — E2E tests
- Test helpers in `tests/helpers/` (factories, mocks)

## Important Rules

- **No backward compatibility hacks** — errors must be explicit, never silently swallowed
- **No silent fallbacks** — if something fails, it must fail visibly
- **Atomic commits** — each commit should represent a meaningful, complete unit of work
- **Scope is mandatory** in commit messages — commitlint will reject scopeless commits
