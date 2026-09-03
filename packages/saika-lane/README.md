# Saika Lane

Electronic target scoring display system for shooting ranges.

## Overview

Saika Lane is a desktop application installed on a PC or laptop, designed for visualizing impact points from electronic targets in real time. It supports multiple target manufacturers, calculates scores automatically, and manages session records.

- Real-time impact point display
- Multi-manufacturer target support
- Score calculation and session recording
- Director-authorized Lane-specific timer pause/resume with durable interruption recovery
- Competition-independent durable safety STOP, timer gate, STOP / UNLOAD overlay, and quarantined-shot evidence
- ISSF 2026 Individual and Mixed Team 10m plus 50m Rifle Qualification/Final course definitions
- ISSF 2026 25m Pistol qualification schedules with persisted LOAD, ATTENTION, red/green, and EST after-time boundaries
- Synchronized series/single-shot timers and Director-authorized Final retirement snapshots

## Supported Devices

| Manufacturer                    | Models                                        | Status                                           |
| ------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| Kohto Electronics (Koto Denshi) | MT201, BPT-216                                | Implemented; BPT-216 hardware validation pending |
| SIUS                            | HS10, HS25, Ascor                             | Stub                                             |
| Meyton                          | —                                             | Stub                                             |
| DISAG                           | KT RDT ZIE 1 (RedDot Rifle / Pistol profiles) | Implemented; hardware validation pending         |
| Custom                          | User-defined protocol                         | Supported                                        |

## Supported Disciplines

- 10m Air Rifle
- 10m Air Pistol
- 10m Beam Rifle
- 10m Beam Pistol
- 50m Rifle
- 25m Pistol

## Tech Stack

| Category          | Technology     |
| ----------------- | -------------- |
| Desktop framework | Electron       |
| UI framework      | React 19       |
| State management  | Zustand        |
| Styling           | Tailwind CSS   |
| Language          | TypeScript 5   |
| USB communication | serialport     |
| Local storage     | better-sqlite3 |
| Build tool        | Vite           |
| Testing           | Vitest         |

## Architecture

Saika Lane follows Clean Architecture combined with Domain-Driven Design (DDD), CQRS, and an event-driven approach:

- **Feature modules** (`src/main/modules/`): each module encapsulates `domain/`, `application/`, and `infra/` layers
- **IPC Contract layer** (`src/shared/ipc/`): Zod-based type-safe contracts auto-generate preload bridges
- **CQRS Bus** (`src/main/shared-infra/cqrs/`): token-based CommandBus and QueryBus with middleware support
- **TypedEventBus** (`src/main/shared-infra/events/`): mapped-type event bus for loose coupling between modules

```
Renderer (React + Zustand)
  |-- IPC Contract Layer (shared/ipc/)
  |-- Feature Modules (main/modules/)
        session / connection / target / settings / competition
  |-- Shared Infrastructure (main/shared-infra/)
        CQRS Bus / TypedEventBus / IpcRouter / Logging
```

## Data Storage

By default, Saika Lane stores persistent data under the OS-specific user data directory:

| OS      | Path                                        |
| ------- | ------------------------------------------- |
| Windows | `%APPDATA%\Saika Lane\`                     |
| macOS   | `~/Library/Application Support/Saika Lane/` |
| Linux   | `~/.config/Saika Lane/`                     |

### Stored files

| File / Directory                         | Format | Description                                                                    |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| `saika-lane.db`                          | SQLite | Session history, shots, and scores                                             |
| `settings.json`                          | JSON   | Canonical application, device, and MQTT settings                               |
| `saika-lane.json`                        | JSON   | Compatibility settings, connection history, competition and interruption state |
| `logs/combined.log`                      | Log    | Application log (rotated, 5 MB x 5 files)                                      |
| `logs/error.log`                         | Log    | Error-only log (rotated, 5 MB x 5 files)                                       |
| `logs/score-discrepancy.csv`             | CSV    | Records of score mismatches between device and app calculation                 |
| `ShotLog/<timestamp>_<discipline>.jsonl` | JSONL  | Per-session shot log with coordinates, scores, and metadata                    |

### Deleting all data

Remove the user data directory listed above to clear the database, settings, and all log files.

## Supported Platforms

| Platform            | Status       |
| ------------------- | ------------ |
| Windows 10/11 (x64) | Supported    |
| macOS               | Experimental |
| Linux               | Experimental |

> **Note:** Native modules (`serialport`, `better-sqlite3`) require C++ build tools. On Windows, install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.
>
> macOS builds are unsigned and not notarized. You may need to allow the app in System Preferences > Security & Privacy.

## Distribution

Saika Lane, Saika Director, and Saika Docs share one suite version and one
`v<version>` release tag. The release and canary workflows build both applications
for every supported platform and publish their artifacts together in one GitHub
Release; Saika Docs is included as versioned source at the same tag. Saika Lane's
automatic-update metadata remains included alongside both sets of application
packages.

For a proposed minimal Debian kiosk setup with audio, printing, and MQTT, see the
[minimal appliance OS design note](../../docs/minimal-appliance-os.md).

## Getting Started

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Run tests
npm run test

# Lint
npm run lint
```

## Runtime Policy Configuration

The 25m timed-target engine is independent of the device adapter and can be adjusted for official, local, or practice operation.

| Environment variable               | Values                             | Default    | Purpose                                                               |
| ---------------------------------- | ---------------------------------- | ---------- | --------------------------------------------------------------------- |
| `SAIKA_TIMED_TARGET_ENFORCEMENT`   | `REQUIRED`, `ADVISORY`, `DISABLED` | `REQUIRED` | Reject, warn about, or bypass shots outside the configured EST window |
| `SAIKA_COMMAND_AUTHORIZATION_MODE` | `REQUIRED`, `ADVISORY`, `DISABLED` | `ADVISORY` | Reject, warn about, or bypass untrusted Director issuer IDs           |
| `SAIKA_TRUSTED_DIRECTOR_IDS`       | Comma-separated IDs                | —          | Trusted IDs; at least one is required in `REQUIRED` mode              |
| `SAIKA_MQTT_LANE_USERNAME`         | Non-empty string                   | —          | MQTT username; must be set together with the password                 |
| `SAIKA_MQTT_LANE_PASSWORD`         | Non-empty string                   | —          | MQTT password; must be set together with the username                 |

The original shot observation is retained in every timed-target enforcement mode. `ADVISORY` and `DISABLED` are
operational policy choices and do not alter the versioned ISSF Rule Pack. Director issuer verification is independent
of broker authentication: set the trusted ID to Director's `SAIKA_MQTT_DIRECTOR_ID` for strict operation.

## Windows Build

A PowerShell build script is provided for building the Windows installer.
Requires Windows PowerShell 5.1 (`powershell.exe`) or [PowerShell 7+](https://github.com/PowerShell/PowerShell) (`pwsh`):

```powershell
# Full build (NSIS installer + ZIP) — use pwsh or powershell.exe
pwsh -File scripts\build-win.ps1 -WslMonorepoRoot '\\wsl.localhost\<Distro>\path\to\oss'
powershell.exe -File scripts\build-win.ps1 -WslMonorepoRoot '\\wsl.localhost\<Distro>\path\to\oss'

# Test build (unpacked only)
pwsh -File scripts\build-win.ps1 -WslMonorepoRoot '\\wsl.localhost\<Distro>\path\to\oss' -Pack
```

See `scripts/build-win.ps1` for detailed options and step-by-step instructions.

## Audio Assets

`src/assets/sounds/shot.wav` — Original recording by the author, licensed under MIT.

## Documentation

Detailed specifications, MQTT design, scoring data, and legal/provenance notices are maintained in
[`@sasakiuri/saika-docs`](../saika-docs/).

For synchronized multi-lane competitions, Saika Lane can be discovered and controlled over MQTT by
[`@sasakiuri/saika-director`](../saika-director/). The operational flow is documented in the
[Director MQTT control guide](../saika-docs/director/MQTT_CONTROL.md).

## Disclaimer

This is an **unofficial, independent** project. It is not affiliated with, endorsed by, or supported by any electronic target manufacturer.

**No Warranty**: This software is provided "as is" without warranty of any kind. The author shall not be liable for any damages arising from the use of this software.

**Not for Official Use**: This software is not intended for use as an official scoring or timing system in sanctioned competitions.

**No Affiliation with SIUS**: Saika Lane is not related to or affiliated with SIUS Lane or any SIUS AG product.

**Trademarks**: Kohto Electronics (Koto Denshi), SIUS, Meyton, and DISAG are trademarks of their respective owners.

**Safety**: This software is a scoring display tool only. Always follow proper firearms safety procedures and applicable range rules.

**Accuracy**: Score accuracy depends on hardware calibration and environmental conditions. Do not rely solely on this software for official competition results.

## Known Limitations

- **MQTT client certificates**: Username/password authentication is supported, but TLS client-certificate selection is not currently configurable in Lane.
- **25m physical target output**: The timing engine publishes a device-neutral state stream, but a production lamp or turning-target hardware adapter and automatic spoken `UNLOAD` command are not included. The CRO must use the approved range equipment and procedure.

## License

MIT License — see [LICENSE](./LICENSE) for details.

## Contributing

Contributions are welcome. Please open an issue or pull request on the project repository.
