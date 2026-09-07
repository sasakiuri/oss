# Saika Director

Saika Director is the desktop control application for coordinating multiple
[Saika Lane](../saika-lane/) instances over MQTT.

## Features

- Embedded MQTT broker or connection to an external broker
- Automatic discovery and online-state monitoring of Saika Lane instances
- Exact Rule Pack fingerprint negotiation before a required Lane joins a competition
- Competition creation and lane join/leave control
- Bulk athlete assignment from tournament firing-point plans
- Athlete assignment and per-lane session reset
- Synchronized sighting, match, timer, series, and finish commands
- Per-lane acknowledgement, timeout, score, assignment, and state monitoring
- Competition-independent range safety STOP with retained Lane latches, explicit clearance, and append-only ACK audit
- Recovery of retained competition and lane state after reconnecting
- Optional CRO visual reminders at Rule Pack-defined announcement points
- Rule Pack-derived call-to-line, target-visibility, setup, and target-reset confirmations before phase starts
- Review-only detection and append-only evidence for shots outside Rule Pack-defined START/STOP windows
- Append-only ISSF target-examination custody records and evidence holds that guard Lane reset and retained-data cleanup
- Append-only ISSF interruption records with separate recommendations, official grants, and Lane-specific timer control
- Rule 8.8.1 Qualification recovery with isolated firing, explicit score adjudication, and no-fire retain-series settlement
- Versioned RFPM/STDP/IR malfunction calculation sheets with explicit evidence, target mapping, printable HTML and evidence-bundle inclusion; calculation confirmation is separate from firing and score application
- Append-only preliminary, score-protest, RTS-approval, and official-publication workflow
- Certified Results Book export as standalone HTML, A4 PDF or JSON through independent document adapters
- Scope-separated Qualification/Final RTS verification and append-only RESULTS ARE FINAL declarations
- ISSF 2026 Individual and Mixed Team 10m Qualification/Final Rule Packs and synchronized Final series control
- Independent Individual/Mixed Team Final checkpoint ledgers with per-Lane retirement acknowledgements
- Official three-member and Mixed Team aggregation, including Mixed Team Final result persistence
- Three-member Qualification Team record candidates derived from current Official member results through a replaceable source port
- Reproducible seeded firing-point draws with ISSF constraints, Technical Delegate approval, and explicit application
- Immutable Start List versions with content/paperless approvals, source-staleness checks, deadline status, CSV export, and distribution audit
- Versioned Final command scripts with persistent official confirmations, Lane cues, execution retries, and branch-aware shoot-off shots
- Separate Final malfunction, EST-failure, and incorrect-command recovery cases with ISSF guidance
- Optional adjudication case files that link decisions, incident reports, protests, and recovery records without merging their ledgers
- Advisory external music/Final-production operations and a separate one-use 30-second Mixed Team timeout ledger
- ISSF 25m device-neutral timed-target schedules with Lane-owned persistence, red/green projection, and configurable shot-window enforcement
- Lane range-officer requests, relay athlete lifecycle tracking, and outdoor Elimination planning as independent operational modules

The progress-management workflow uses MQTT and supports Rule Pack-backed ISSF 2026 10m Individual/Mixed Team,
50m Rifle Qualification/Elimination/Final, and 25m Pistol Qualification definitions, plus the local `BR60S` and `BP60` definitions.
Sighting and match command durations are read from the selected competition definition,
including the ISSF 15-minute and 75-minute timings. It is an independent, unofficial application and
must not be used as the sole timing or scoring authority for sanctioned
competitions.

## Development

From the repository root:

```bash
npm install
npm --workspace @sasakiuri/saika-director run dev
```

Validation commands:

```bash
npm --workspace @sasakiuri/saika-director run lint
npm --workspace @sasakiuri/saika-director run typecheck
npm rebuild better-sqlite3
npm --workspace @sasakiuri/saika-director run test
npm --workspace @sasakiuri/saika-director run test:coverage
npm --workspace @sasakiuri/saika-director run depcruise
npm --workspace @sasakiuri/saika-director run build
npm --workspace @sasakiuri/saika-director run size-limit
npx electron-rebuild -f -w better-sqlite3 --module-dir=.
npm --workspace @sasakiuri/saika-director run test:e2e
npm rebuild better-sqlite3
```

The default configuration starts an embedded MQTT broker on TCP port `1883`.
Use the Settings screen to switch to an external `mqtt://` or `mqtts://` broker.

## MQTT Security Configuration

| Environment variable           | Values                 | Default                         | Purpose                                                        |
| ------------------------------ | ---------------------- | ------------------------------- | -------------------------------------------------------------- |
| `SAIKA_MQTT_BROKER_AUTH_MODE`  | `REQUIRED`, `DISABLED` | `DISABLED`                      | Enables embedded-broker authentication and role/topic ACLs     |
| `SAIKA_MQTT_DIRECTOR_ID`       | Non-empty string       | Persisted ID (`saika-director`) | Stable command issuer identity matched by each Lane trust list |
| `SAIKA_MQTT_DIRECTOR_USERNAME` | Non-empty string       | —                               | Director MQTT account                                          |
| `SAIKA_MQTT_DIRECTOR_PASSWORD` | Non-empty string       | —                               | Director MQTT password                                         |
| `SAIKA_MQTT_LANE_USERNAME`     | Non-empty string       | —                               | Lane-role account on the embedded broker                       |
| `SAIKA_MQTT_LANE_PASSWORD`     | Non-empty string       | —                               | Lane-role password on the embedded broker                      |

`REQUIRED` needs both complete accounts. Director and Lane credentials are also accepted when connecting to an
external broker, whose authentication and ACL remain broker-managed. Configure each Lane's
`SAIKA_TRUSTED_DIRECTOR_IDS` with the same stable Director ID and use `SAIKA_COMMAND_AUTHORIZATION_MODE=REQUIRED`
when unverified command issuers must be rejected.

The embedded Lane account is role-level rather than device-specific; its ACL scopes topics from the Lane client ID.
Use an external broker with per-client credentials/ACLs when cryptographic per-device identity is required. `mqtts://`
uses system-trusted server certificates, but custom CA and TLS client-certificate selection are not currently configurable.

## Distribution

Release artifacts are prepared for:

- Windows x64: NSIS installer and ZIP
- macOS x64 and arm64: DMG and ZIP
- Linux x64: AppImage and Debian package

The current builds are unsigned. Windows SmartScreen and macOS Gatekeeper may
therefore require users to explicitly allow the first launch. Code signing and
macOS notarization should be configured before distributing to a broad audience.

Platform packages can be produced locally with `build:win`, `build:mac`, or
`build:linux`; use the corresponding `pack:*` command for an unpacked smoke-test
build. The packaging commands rebuild `better-sqlite3` for the target Electron
ABI and restore the local Node.js ABI afterwards.

Saika Director, Saika Lane, and Saika Docs share one suite version and one release
tag in the form `v<version>`. After release approval, pushing that tag runs the
combined release workflow, verifies all three package versions, builds every
supported application platform, checks legal notices, smoke-tests both Linux
applications, attests the artifacts, and publishes both applications in one
GitHub Release with SHA-256 checksums. Saika Docs is included as versioned source
at the same tag. Canary releases likewise contain artifacts for both applications.

Saika Director does not currently implement automatic updates. Download its new
version from the shared GitHub Release; Saika Lane continues to use its update
metadata from that release.

## Documentation

Setup, operation, MQTT topics, acknowledgements, and recovery behavior are
documented in [`@sasakiuri/saika-docs`](../saika-docs/director/README.md).

## License

MIT License — see [LICENSE](./LICENSE). Third-party notices are generated in
`THIRD-PARTY-LICENSES.txt`.
