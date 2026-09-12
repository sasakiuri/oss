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

## Development Workflow

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
npx turbo test
```

On machines with limited resources, bound workspace and test-worker parallelism:

```bash
npx turbo test --concurrency=1 -- --maxWorkers=2
```

Lane and Director coverage includes all source files, including files not reached
by tests. Keep that scope and the existing thresholds when updating test tooling.
Vista runs main-process tests in Node.js and renderer tests in jsdom.

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
