# Saika Lane

Electronic target scoring display system for shooting ranges.

## Overview

Saika Lane connects a range PC to an electronic target, displays incoming shots, calculates scores, and saves session records.

- Display shot positions, scores, and session history.
- Connect to supported targets through manufacturer-specific adapters.
- Run ISSF 10m Individual and Mixed Team, 50m Rifle, and 25m Pistol courses with series and single-shot timers.
- Pause and resume a Lane under Director control, preserving the timer across interruptions and restarts.
- Display STOP / UNLOAD, block firing commands, and keep subsequent shots out of scoring during a safety stop.
- Record timed-target and recovery firing separately from ordinary match shots; apply the authorized scoring decision.
- Record Director-authorized Final retirement and preserve the results.

Course details and operating limits are described in the [Lane specification](../saika-docs/lane/SPEC.md).

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

Feature modules under `src/main/modules/` separate domain rules, application
operations and device/storage adapters. Shared IPC contracts connect them to the
renderer. See the [architecture guide](../../ARCHITECTURE.md) for composition,
serial data flow, message validation and persistence requirements.

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
| `settings.json`                          | JSON   | Application, device, and MQTT settings                                         |
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
> macOS releases can be built without a signing certificate and require manual updates in that case. Signing is optional; notarization is not configured in the release workflow. Verify the release's signing status and first launch on your Mac.

## Distribution

Lane, Director, Vista, and Docs share one suite version and one `v<version>` release tag.
The release and canary workflows build the three desktop applications for each supported
platform. Tagged releases include automatic-update metadata for each application; Docs is
included as versioned source at the same tag. See the [release checks](../../.github/PRE_RELEASE_CHECKLIST.md#update-distribution)
for optional macOS signing and update requirements.

## Getting Started

Run these commands from the repository root. See the
[contribution guide](../../CONTRIBUTING.md) for prerequisites and checks.

```bash
# Install dependencies
npm ci

# Development
npm run dev -w @sasakiuri/saika-lane

# Build
npm run build -w @sasakiuri/saika-lane

# Run tests
npm test -w @sasakiuri/saika-lane

# Lint
npm run lint -w @sasakiuri/saika-lane
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

`SAIKA_COMMAND_PAUSE_ENFORCEMENT` independently selects `ADVISORY` (default), `REQUIRED`, or `DISABLED`.
P25/CFP and STDP Qualification programs carry an UNLOAD pause rule. Record the actual command and official in
Director's timed-target panel. In required mode, a new LOAD needs that record and the program's minimum pause;
Lane persists the evidence and restores the gate after restart. Advisory mode shows the pause without adding a
start gate. Existing technical timing limits apply in every mode. RFPM and Final programs do not inherit this
Qualification-specific command rule. The command is recorded; audio is not played automatically.

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

Specifications, MQTT messages, scoring data, and license notices are maintained in
[`@sasakiuri/saika-docs`](../saika-docs/).

For synchronized multi-lane competitions, Saika Lane can be discovered and controlled over MQTT by
[`@sasakiuri/saika-director`](../saika-director/). The operational flow is documented in the
[Director MQTT control guide](../saika-docs/director/MQTT_CONTROL.md).

## Disclaimer

Saika is an unofficial project, unaffiliated with electronic target manufacturers.
It is not intended as an official scoring or timing system in sanctioned
competitions. Score accuracy depends on hardware calibration and environmental
conditions. Follow applicable firearms safety procedures and range rules.

Kohto Electronics (Koto Denshi), SIUS, Meyton, and DISAG are trademarks of their
respective owners. The software is provided without warranty under the
[MIT License](./LICENSE).

## Known Limitations

- **MQTT client certificates**: Username/password authentication is supported, but TLS client-certificate selection is not currently configurable in Lane.
- **25m physical target output**: The timing engine publishes a device-neutral state stream, but a production lamp or turning-target hardware adapter and automatic spoken `UNLOAD` command are not included. The CRO must use the approved range equipment and procedure.

## License

MIT License — see [LICENSE](./LICENSE) for details.

## Contributing

Contributions are welcome. Please open an issue or pull request on the project repository.
