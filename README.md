# @sasakiuri/oss

[![CI](https://github.com/sasakiuri/oss/actions/workflows/ci.yml/badge.svg?branch=1.x)](https://github.com/sasakiuri/oss/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![codecov](https://codecov.io/gh/sasakiuri/oss/branch/1.x/graph/badge.svg)](https://codecov.io/gh/sasakiuri/oss) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/sasakiuri/oss/badge)](https://scorecard.dev/viewer/?uri=github.com/sasakiuri/oss)

Open-source monorepo for **Saika Lane**, **Saika Director**, **Saika Docs**, and shared configuration packages.

Saika Lane is an Electron-based electronic target display system for shooting ranges. It connects to electronic targets from multiple manufacturers via USB/serial, providing real-time shot visualization, scoring, and record management.

Saika Director coordinates Lane instances over MQTT, including competition membership, athlete assignment, match progression, timers, and live score collection.

## Packages

| Package                                                 | Description                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| [`@sasakiuri/saika-lane`](packages/saika-lane/)         | Electronic target display system (Electron + React + TypeScript) |
| [`@sasakiuri/saika-director`](packages/saika-director/) | MQTT competition controller (Electron + React + TypeScript)      |
| [`@sasakiuri/saika-docs`](packages/saika-docs/)         | Specifications, design notes, and test scenarios for Saika apps  |
| [`@sasakiuri/saika-protocol`](packages/saika-protocol/) | Shared MQTT schemas, message types, and topic builders           |
| [`@sasakiuri/saika-rules`](packages/saika-rules/)       | Versioned competition rules and capability validation            |
| `@sasakiuri/eslint-config`                              | Shared ESLint configuration                                      |
| `@sasakiuri/prettier-config`                            | Shared Prettier configuration                                    |
| `@sasakiuri/stylelint-config`                           | Shared Stylelint configuration                                   |
| `@sasakiuri/typescript-config`                          | Shared TypeScript configuration                                  |

Saika Lane, Saika Director, and Saika Docs form one suite release train: their
versions stay equal, a single `v<version>` tag builds both applications, and one
GitHub Release contains both sets of installers plus the versioned documentation
source. Shared configuration packages keep independent versions because they
have a separate publishing lifecycle.

## Quick Start

### Prerequisites

- **Node.js** 22.22.0+ ([Volta](https://volta.sh/) recommended)
- **npm** 10.x+

### Setup

```bash
# Clone the repository
git clone https://github.com/sasakiuri/oss.git
cd oss

# Install dependencies
npm install

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
- [Saika Docs](packages/saika-docs/) -- manuals and technical documentation; run
  `npm run dev --workspace=@sasakiuri/saika-docs` and open `http://localhost:5175`
- [Minimal appliance OS](docs/minimal-appliance-os.md) -- proposed Debian kiosk configuration with audio, printing, and MQTT
- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE) -- Copyright (c) 2026 sasakiuri
