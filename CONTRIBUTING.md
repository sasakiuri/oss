# Contributing

Thank you for your interest in contributing to this project. This guide covers the development workflow.

## Development Setup

### Prerequisites

- **Node.js** 22.15.0+ ([Volta](https://volta.sh/) recommended)
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

## Pull Request Process

1. **Create a branch** from `1.x` following the naming convention above.
2. **Make your changes** -- keep commits atomic and focused.
3. **Add a changeset** -- run `npx changeset` if your changes affect package consumers.
4. **Run checks** -- ensure the following all pass:
   ```bash
   npx turbo test
   npx turbo lint
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
