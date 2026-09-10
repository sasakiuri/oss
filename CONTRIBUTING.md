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

### Next.js Documentation and Frontend Reference

Saika Docs renders the existing Markdown files with Next.js App Router. It is
also this repository's reference application for future Next.js development.
See [the architecture and tool selection](docs/adr/0015-nextjs-documentation-reference.md).

From the repository root:

```bash
npm run dev --workspace=@sasakiuri/saika-docs
```

Open `http://localhost:5175`. The content watcher regenerates the document
catalog when Markdown changes, including new and deleted files. Next.js then
refreshes the browser. Keep editing the original `.md` files and using relative
links. `README.md` becomes the directory index, `INDEX.md` becomes `/documents/`,
and other filenames become lowercase with underscores replaced by hyphens.
The generator rejects duplicate routes and broken document/heading links.
Application source and license links target GitHub, using `DOCS_SOURCE_REF`
(default `1.x`) to select a branch, tag, or commit.

```bash
npm run check --workspace=@sasakiuri/saika-docs
npm run depcruise --workspace=@sasakiuri/saika-docs
npm run test:e2e --workspace=@sasakiuri/saika-docs
npm run storybook --workspace=@sasakiuri/saika-docs
npm run build-storybook --workspace=@sasakiuri/saika-docs
npm run analyze --workspace=@sasakiuri/saika-docs
npm run lhci --workspace=@sasakiuri/saika-docs
```

Storybook runs at `http://localhost:6006`. Browser tests use their own production
server on port 5178, and include mobile and accessibility checks. Install the
browser engines with `npm run test:install --workspace=@sasakiuri/saika-docs`.
`test:vrt` compares local visual snapshots; `test:vrt:update` refreshes them after
review. Keep browser/OS/font versions consistent when comparing snapshots.
Local Lighthouse reports stay under `.lighthouse.reports/`. CI includes them in its quality artifacts.
`CHROME_PATH` can select an installed Chromium binary for Lighthouse.

For a production Next.js server:

```bash
npm run build --workspace=@sasakiuri/saika-docs
npm run start --workspace=@sasakiuri/saika-docs
```

For static hosting:

```bash
npm run build:static --workspace=@sasakiuri/saika-docs
npm run preview --workspace=@sasakiuri/saika-docs
```

The static export is `packages/saika-docs/out/`, previewed on port 4175. Use an
HTTP server, rather than opening files directly. Set `NEXT_PUBLIC_BASE_PATH`
(e.g. `/saika-docs`) before building for a subdirectory and mount the export at
that path. Set `NEXT_PUBLIC_SITE_URL` to the full public URL, including that
subdirectory, to populate the sitemap. Static hosting must supply HTTP security
headers itself; the Next.js server supplies the configured headers automatically.

Optional environment settings are listed in `packages/saika-docs/.env.example`.
Sentry initializes only when `NEXT_PUBLIC_SENTRY_DSN` is set. Its default
configuration disables personal data, performance sampling, and replay capture.
CI and local builds need no service credentials. The exact `khroma@2.1.0`
license-check allowance covers Mermaid's dependency, which ships an MIT `license`
file but omits its package license field.

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
npm run lint     # Check workspace code and repository text
npm run fix      # Auto-fix lint + formatting
```

Japanese prose uses a half-width space between Japanese characters and English
words: `これは instanton 解です` and `ここでは MQTT protocol が使用されます`.
The root textlint configuration checks Markdown and plain-text documents across
the repository, including headings, table cells, and styled text. Numbers and
punctuation do not require spaces. Code, link destinations, generated changelogs,
and third-party notices are excluded. Run `npm run lint:text` to check spacing or
`npm run fix:text` to insert missing spaces. The rule also runs before commits
and in CI, independently of the Saika Docs legacy textlint baseline.

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
   npm run lint
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

See [the Next.js reference guide](docs/reference-nextjs.md) for document APIs, telemetry, local development, PDF output, and the textlint baseline policy.
