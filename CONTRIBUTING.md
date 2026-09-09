# Contributing

Thank you for your interest in contributing to this project. This guide covers the development workflow.

## Development Setup

### Prerequisites

- **Node.js** 22.22.0+ ([Volta](https://volta.sh/) recommended)
- **npm** 10.x+
- For `saika-lane`: Visual Studio Build Tools with "Desktop development with C++" workload (required for native modules like `serialport`)
- Shell scripts in `scripts/` require **Bash** (Linux / macOS / WSL)

### Getting Started

```bash
git clone https://github.com/sasakiuri/oss.git
cd oss
npm install
npx turbo dev
```

## Development Workflow

### Running Tests

```bash
npx turbo test
```

On machines with limited resources, bound workspace and test-worker parallelism:

```bash
npx turbo test --concurrency=1 -- --maxWorkers=2 --minWorkers=1
```

### Extending Director Controls

Competition control and interruption records separate view composition, state lifetimes, command workflows and
pure recovery checks. Follow [ADR-0008](docs/adr/0008-director-renderer-state-and-view-boundaries.md) when extending
these features. Keep IPC calls in their owning hooks/workflows, pass callbacks to competition display panels, and
place shared types outside the parent view. Cover asynchronous changes with deferred-response tests as well as
existing screen tests. Run `npx turbo depcruise` to check dependency direction.

### Extending MQTT Commands and Database Storage

Director's recovery, interruption and safety workflows receive explicit command and context ports. Keep competition
and safety queue acquisition in `DirectorMqttService` so new commands share ordering with existing controls. Read
state when the queued operation executes and cover partial failures and pending acknowledgements. See
[ADR-0010](docs/adr/0010-director-command-workflow-boundaries.md).

For Lane storage, append a named, consecutive migration under `src/main/shared-infra/sqlite/migrations/` and register
it in `allMigrations`. Leave transaction and version bookkeeping to the runner. Keep historical migrations independent
of current feature code; test upgrades with existing records, rollback and reopen behavior. See
[ADR-0009](docs/adr/0009-lane-database-migration-boundaries.md). Run `npx turbo depcruise` for both boundaries.

### Extending Rule Packs and Serial Protocols

Rule Pack type contracts stay in `saika-rules/src/RulePack.ts`; capability validation lives under `validation/`.
Keep validation order explicit in `defineRulePack` and check relationships through the public factory. The compatibility
suite records all shipped fingerprints: change these only when intentionally changing rule content. See
[ADR-0011](docs/adr/0011-rule-pack-validation-boundaries.md). `npx turbo depcruise` also checks the rule package's
independence from applications, runtime libraries and concrete edition imports inside validators.

USB protocol deadlines that use `SerializedProtocolTimer` share their session's existing queue. Supply a live session
and state guard, cancel on shutdown and replacement, and test expiry while serial work is pending. Cancellation can
suppress queued work but cannot retract an in-flight serial write. See
[ADR-0012](docs/adr/0012-serial-protocol-deadline-ownership.md).

### Extending Settings and Target Examinations

Lane settings transformations live in `settings/application/SettingsDocument.ts`. Keep file I/O and Lane identity
allocation in `AppSettingsStore` and electron-store reads/projections in `LegacySettingsBridge`. Consumers import
`application/IAppSettingsStore`. Preserve raw device migration inputs, Lane ID precedence and explicit preference
defaults; see [ADR-0013](docs/adr/0013-lane-settings-document-boundaries.md).

Director target-examination forms receive `TargetExaminationCommands` callbacks from their workspace hook. Keep
case drafts under the keyed `CaseDetail`, and put display policy and types outside parent views. Extend deferred
query/command tests when changing asynchronous behavior; see
[ADR-0014](docs/adr/0014-target-examination-workspace-boundaries.md). Run `npx turbo depcruise` to enforce both boundaries.

### Code Style

This project uses **ESLint 9** and **Prettier 3** with shared configurations. Run the following to lint and auto-fix:

```bash
npx turbo lint    # Check for issues
npx turbo fix     # Auto-fix lint + formatting
```

### Building

```bash
npx turbo build
```

## Commit Convention

Use the **Conventional Commits** format:

```
type(scope): message
```

**Examples:**

- `feat(saika-lane): add SIUS adapter support`
- `fix(eslint-config): correct TypeScript override`

**Types:**

| Type       | Description                                       |
| ---------- | ------------------------------------------------- |
| `feat`     | New feature                                       |
| `fix`      | Bug fix                                           |
| `refactor` | Code restructuring (no behavior change)           |
| `docs`     | Documentation only                                |
| `test`     | Adding or updating tests                          |
| `chore`    | Maintenance (dependency updates, config, etc.)    |
| `style`    | Code style changes (formatting, semicolons, etc.) |
| `perf`     | Performance improvements                          |
| `ci`       | CI/CD changes                                     |
| `revert`   | Reverting a previous commit                       |

## Branch Strategy

| Branch                                 | Purpose              |
| -------------------------------------- | -------------------- |
| `1.x`                                  | Main branch (stable) |
| `staging`                              | Staging environment  |
| `canary`                               | Next development     |
| `feature/{package-name}/{description}` | New features         |
| `fix/{package-name}/{description}`     | Bug fixes            |

**Example:** `feature/saika-lane/add-disag-adapter`

## Changesets (Version Management)

This project uses [changesets](https://github.com/changesets/changesets) to manage versioning and changelogs. When you make changes that affect a package's public API or behavior, add a changeset:

```bash
npx changeset
```

You will be prompted to:

1. Select the affected package(s).
2. Choose the semver bump type (`patch`, `minor`, or `major`).
3. Write a short summary of the change.

This creates a markdown file in `.changeset/` that should be committed with your PR. When changesets are merged to `1.x`, a "Version Packages" PR is automatically created. Merging that PR triggers version bumps, tag creation, and the release workflow.

Saika Lane, Saika Director, and Saika Docs are configured as a Changesets fixed
group. A change to any suite package advances all three to the same version. The
shared `v<version>` release contains both applications and the documentation at
that tag. Shared configuration packages remain independently versioned.

## Pull Request Process

1. **Create a branch** from `1.x` following the naming convention above.
2. **Make your changes** -- keep commits atomic and focused.
3. **Add a changeset** -- run `npx changeset` if your changes affect package consumers.
4. **Run checks** -- ensure the following all pass:
   ```bash
   npx turbo test
   npx turbo lint
   npx turbo depcruise
   npm run syncpack
   ```
5. **Submit a PR** to `1.x` with a clear description of the changes.
6. **Address review feedback** promptly.

## Reporting Issues

Use [GitHub Issues](https://github.com/sasakiuri/oss/issues) to report bugs or suggest features. Please include:

- Steps to reproduce (for bugs)
- Expected vs. actual behavior
- Environment details (OS, Node.js version)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
