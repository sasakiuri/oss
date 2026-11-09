# @sasakiuri/oss

[![CI](https://github.com/sasakiuri/oss/actions/workflows/ci.yml/badge.svg?branch=1.x)](https://github.com/sasakiuri/oss/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![codecov](https://codecov.io/gh/sasakiuri/oss/branch/1.x/graph/badge.svg)](https://codecov.io/gh/sasakiuri/oss) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/sasakiuri/oss/badge)](https://scorecard.dev/viewer/?uri=github.com/sasakiuri/oss)

Open-source monorepo for **Saika** shooting-sports apps and documentation,
**Nilay** websites and news management, and shared libraries and tooling.

Saika Lane connects to electronic targets over USB/serial to display shots, calculate
scores and save session records. Saika Director manages competitions, assigns athletes
and controls Lane timing over MQTT. Saika Vista displays targets, scores and standings
on venue monitors, with local and remote screens managed from one operator PC.

## Packages

| Package                                                       | Description                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`@sasakiuri/nilay-about`](packages/nilay-about/)             | Nilay's service website and Labs tools                                               |
| [`@sasakiuri/nilay-knowledge`](packages/nilay-knowledge/)     | Shooting and hunting information website                                             |
| [`@sasakiuri/nilay-news`](packages/nilay-news/)               | Japanese news collection, review, and publishing through Buffer                      |
| [`@sasakiuri/saika-lane`](packages/saika-lane/)               | Electronic target display system (Electron + React + TypeScript)                     |
| [`@sasakiuri/saika-director`](packages/saika-director/)       | MQTT competition controller (Electron + React + TypeScript)                          |
| [`@sasakiuri/saika-vista`](packages/saika-vista/)             | Offline spectator screens and multi-PC display management                            |
| [`@sasakiuri/saika-docs`](packages/saika-docs/)               | Japanese manuals and documentation site                                              |
| [`@sasakiuri/saika-protocol`](packages/saika-protocol/)       | Shared MQTT schemas, message types, and topic builders                               |
| [`@sasakiuri/saika-rules`](packages/saika-rules/)             | Versioned competition rules and capability validation                                |
| [`@sasakiuri/saika-updater`](packages/saika-updater/)         | Shared application update state and installer coordination                           |
| `@sasakiuri/eslint-config`                                    | Shared ESLint configuration                                                          |
| [`@sasakiuri/lighthouse-config`](packages/lighthouse-config/) | Shared Lighthouse CI configuration                                                   |
| `@sasakiuri/prettier-config`                                  | Shared Prettier configuration                                                        |
| `@sasakiuri/stylelint-config`                                 | Shared Stylelint configuration                                                       |
| [`@sasakiuri/repo-tooling`](packages/repo-tooling/)           | Checkout tooling and quality policies for companion repositories (private workspace) |
| `@sasakiuri/typescript-config`                                | Shared TypeScript configuration                                                      |

Lane, Director, Vista, and Docs share a version. A single `v<version>` tag builds the
three desktop applications, and one GitHub Release contains their installers and
versioned documentation source. Shared configuration packages are versioned separately.

## Quick Start

### Prerequisites

- **Node.js** 24.16.0 ([Volta](https://volta.sh/) recommended)
- **npm** 11.21.2

### Setup

```bash
# Clone the repository
git clone https://github.com/sasakiuri/oss.git
cd oss

# Install dependencies
npm ci

# Start development
npm run dev

# Build all packages
npm run build

# Build native modules for Node.js and run tests
npm rebuild better-sqlite3
npm test

# Restore native modules for Electron development and E2E tests
npm run postinstall

# Run repository checks or the full local quality suite
npm run check
npm run qa

# Restore native modules for Electron after the full quality suite
npm run postinstall

# Lint and fix
npm run lint
npm run fix
```

Run `npm run postinstall` after tests or `npm run qa`, even if either fails,
before returning to Electron development or E2E tests. See
[Contributing](CONTRIBUTING.md#repository-checks) for what the checks cover.

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

## Nilay Knowledge

[Nilay Knowledge](packages/nilay-knowledge/README.md) is the website at
<https://knowledge.nilay.jp>, maintained as `@sasakiuri/nilay-knowledge`.

## Nilay About

[Nilay About](packages/nilay-about/README.md) introduces Nilay's services and is
maintained as `@sasakiuri/nilay-about`. Run
`npm run dev --workspace=@sasakiuri/nilay-about` to start the development server at
`http://localhost:3001`.

## Nilay News

[Nilay News](packages/nilay-news/README.md) collects Japanese news from RSS,
public comments, and government bills for manual review, optional Jev triage,
and posting to X through Buffer. It runs on Cloudflare Workers with D1 storage
and Cloudflare Access authentication. The package README covers local development.
