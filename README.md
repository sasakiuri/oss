# @sasakiuri/oss

[![CI](https://github.com/sasakiuri/oss/actions/workflows/ci.yml/badge.svg?branch=1.x)](https://github.com/sasakiuri/oss/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![codecov](https://codecov.io/gh/sasakiuri/oss/branch/1.x/graph/badge.svg)](https://codecov.io/gh/sasakiuri/oss) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/sasakiuri/oss/badge)](https://scorecard.dev/viewer/?uri=github.com/sasakiuri/oss)

Open-source monorepo for **Saika Lane**, **Saika Director**, **Saika Vista**, **Saika Docs**, and shared configuration packages.

Saika Lane connects to electronic targets over USB/serial to display shots, calculate
scores and save session records. Saika Director manages competitions, assigns athletes
and controls Lane timing over MQTT. Saika Vista displays targets, scores and standings
on venue monitors, with local and remote screens managed from one operator PC.

## Packages

| Package                                                 | Description                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| [`@sasakiuri/saika-lane`](packages/saika-lane/)         | Electronic target display system (Electron + React + TypeScript) |
| [`@sasakiuri/saika-director`](packages/saika-director/) | MQTT competition controller (Electron + React + TypeScript)      |
| [`@sasakiuri/saika-vista`](packages/saika-vista/)       | Offline spectator screens and multi-PC display management        |
| [`@sasakiuri/saika-docs`](packages/saika-docs/)         | Japanese manuals and documentation site                          |
| [`@sasakiuri/saika-protocol`](packages/saika-protocol/) | Shared MQTT schemas, message types, and topic builders           |
| [`@sasakiuri/saika-rules`](packages/saika-rules/)       | Versioned competition rules and capability validation            |
| [`@sasakiuri/saika-updater`](packages/saika-updater/)   | Shared application update state and installer coordination       |
| `@sasakiuri/eslint-config`                              | Shared ESLint configuration                                      |
| `@sasakiuri/prettier-config`                            | Shared Prettier configuration                                    |
| `@sasakiuri/stylelint-config`                           | Shared Stylelint configuration                                   |
| `@sasakiuri/typescript-config`                          | Shared TypeScript configuration                                  |

Lane, Director, Vista, and Docs share a version. A single `v<version>` tag builds the
three desktop applications, and one GitHub Release contains their installers and
versioned documentation source. Shared configuration packages are versioned separately.

## Quick Start

### Prerequisites

- **Node.js** 22.22.2 ([Volta](https://volta.sh/) recommended)
- **npm** 10.9.4

### Setup

```bash
# Clone the repository
git clone https://github.com/sasakiuri/oss.git
cd oss

# Install dependencies
npm ci

# Start development
npx turbo dev

# Build all packages
npx turbo build

# Run tests
npx turbo test

# Lint and fix
npx turbo lint
npx turbo fix
```

## Documentation

- [Saika Lane README](packages/saika-lane/) -- detailed setup, architecture, and usage
- [Saika Director README](packages/saika-director/) -- Director setup and MQTT control workflow
- [Saika Vista README](packages/saika-vista/) -- spectator screen setup and operation
- [Saika Docs](packages/saika-docs/) -- manuals and technical documentation; run
  `npm run dev --workspace=@sasakiuri/saika-docs` and open `http://localhost:5175`
- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE) -- Copyright (c) 2026 sasakiuri
