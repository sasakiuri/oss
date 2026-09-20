# Contributing

Development setup, code conventions, checks, and contribution workflow for the Saika repository.

## Development Setup

### Prerequisites

- **Node.js** 22.22.2 ([Volta](https://volta.sh/) recommended)
- **npm** 10.9.4
- For `saika-lane`: Visual Studio Build Tools with "Desktop development with C++" workload (required for native modules like `serialport`)
- Shell scripts in `scripts/` require **Bash** (Linux / macOS / WSL)

### Getting Started

```bash
git clone https://github.com/sasakiuri/oss.git
cd oss
npm ci
npx turbo dev
```

The root install hook rebuilds the shared Electron native modules once, after
workspace installation. Run dependency installation from the repository root.

## Development Workflow

### Repository Checks

Run these commands from the root with the pinned Node.js and npm versions:

```bash
npm run check # Types, lint, architecture, contracts, dependencies, and licenses
npm run qa    # Also builds, runs coverage and tooling tests, checks sizes, and audits dependencies
```

`make check` and `make qa` invoke the same commands. `make qa-docs` retains the
Docs-only checks. The other Make setup and development targets serve Saika Docs.

`qa` rebuilds `better-sqlite3` for Node.js before testing. Run `npm run postinstall`
afterwards, even if a check failed, before returning to Electron development or
E2E tests. To run only coverage, use `npm rebuild better-sqlite3` followed by
`npm run test:coverage`. This uses the same package test selection as CI, includes
Docs, reads current workspace manifests, and runs ordinary tests for packages
without coverage scripts. `npm run test:tooling` checks repository and Docs tools.
Local coverage uses two Vitest workers by default. Set `VITEST_MAX_WORKERS` to
override this limit.

Browser tests, mutation tests, and Docker-based infrastructure checks retain
their dedicated commands and CI jobs; `qa` does not run those suites.

### Documentation Site

Saika Docs renders the Japanese Markdown manuals with Next.js App Router.

```bash
npm run dev -w @sasakiuri/saika-docs
```

Open `http://localhost:5175`. Edit the original Markdown files; the content watcher
updates the catalog and checks document links. Keep relative links between documents.
See the [site development guide](docs/reference-nextjs.md) for builds, browser tests,
PDF output, hosting, and optional telemetry.

### Running Tests

```bash
npm rebuild better-sqlite3
npx turbo test
```

Before returning to Electron development or E2E tests, run `npm run postinstall`
from the root to rebuild the native modules for Electron.

On machines with limited resources, bound workspace and test-worker parallelism:

```bash
npx turbo test --concurrency=1 -- --maxWorkers=2
```

Lane, Director, Vista, and Updater coverage includes all source files, including files not reached
by tests. Keep that scope and the existing thresholds when updating test tooling.
Vista runs main-process tests in Node.js and renderer tests in jsdom.

Vitest and React Testing Library checks use the optional presets from
`@sasakiuri/eslint-config`. CI rejects focused tests, conditional assertions without
an explicit nonzero `expect.assertions(n)` count, and Playwright tests that
pass only after a retry. Fix asynchronous assertions and flaky behavior before
merging; a successful retry is useful diagnostic evidence.

PRs require at least 80% coverage of changed executable lines within each
workspace's configured Vitest coverage scope. Generate `test:coverage` reports
at the checked-out revision, then run `npm run coverage:diff -- --base origin/1.x`.
The comparison uses committed changes from the merge base; uncommitted edits
are not included. Missing measurements for changed runtime files fail the check.
Workspaces without a `test:coverage` script are reported as outside its scope.

Rules and Protocol also mutation-test their selected scoring, rule selection,
and recovery logic on Linux CI, requiring a mutation score of at least 95%:

```bash
npm run test:mutation -w @sasakiuri/saika-rules
npm run test:mutation -w @sasakiuri/saika-protocol
```

Run `make lint-infra` (or `npm run lint:infra`) with Docker to check Shell,
Actions, Dockerfiles, and Actions security using the same pinned tool images as
CI. ShellCheck reports correctness diagnostics; zizmor fails on low or higher
severity findings. Narrow exceptions are documented at the affected operation.
For API contract checks and local k6 smoke or explicitly configured load tests,
see [the site development guide](docs/reference-nextjs.md#api-and-http-load-checks).

### CI Scope

CI selects changed workspaces and their transitive dependents from the workspace
manifests, including development, peer, and optional dependencies. Package content
and assets also count as changes. For example, a Lane change tests Lane, while a
Protocol change also tests Lane, Director, and Vista. Turbo builds any prerequisites.

Electron application changes run on Linux, Windows, and macOS. When no Electron
package is affected, build jobs run only on Linux. Saika Docs keeps its dedicated
quality workflow. Root dependency lock files, shared configuration, and CI scripts
select all workspaces. Repository documentation and
unrelated workflow settings skip package jobs. Shared repository consistency and
security checks remain enabled, and `CI Required` rejects failed detection or
unexpectedly skipped checks. The Changes job summary lists the selected packages.

Infrastructure checks run on every PR, including documentation-only changes,
and are required by `CI Required`. Changed-code coverage and core mutation
checks run inside the applicable build jobs. Docs runs API lint and a local
production-server k6 smoke test in its dedicated workflow.

Dependabot updates the npm workspaces through the shared root lockfile. Normal
updates run weekly with a seven-day cooldown; security updates bypass cooldown.
Production dependencies and major updates require review. Only minor and patch
updates in the development-dependency and Actions groups are eligible for
automatic rebase merging after required checks pass.

### Changing Application Code

Read the relevant section of the [architecture guide](ARCHITECTURE.md) for component
responsibilities, data flow and compatibility requirements. Test the affected
behavior, including failures and recovery. For asynchronous changes, cover delayed
responses and changes of connection or selection. For persistence changes, cover
upgrades with existing records, rollback and reopening.

Run `npx turbo depcruise` to check dependency direction. Update the relevant
manuals in `saika-docs` when behavior or screen labels change.

### Code Style

This project uses **ESLint 9** and **Prettier 3** with shared configurations. Run the following to lint and auto-fix:

```bash
npm run lint     # Check workspace code and repository text
npm run fix      # Auto-fix lint + formatting
```

Japanese prose uses a half-width space between Japanese characters and English
words: `Director で競技を開始します` and `MQTT 接続を確認します`.
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

- `feat(saika-lane): add a session export option`
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

Lane, Director, Vista, and Docs form a Changesets fixed group. A change to any suite
package advances all four to the same version. The shared `v<version>` release contains
the three desktop applications and documentation. Shared configuration packages are
versioned separately.

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
