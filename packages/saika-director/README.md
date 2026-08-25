# Saika Director

Saika Director is the desktop control application for coordinating multiple
[Saika Lane](../saika-lane/) instances over MQTT.

## Features

- Embedded MQTT broker or connection to an external broker
- Automatic discovery and online-state monitoring of Saika Lane instances
- Competition creation and lane join/leave control
- Bulk athlete assignment from tournament firing-point plans
- Athlete assignment and per-lane session reset
- Synchronized sighting, match, timer, series, and finish commands
- Per-lane acknowledgement, timeout, score, assignment, and state monitoring
- Recovery of retained competition and lane state after reconnecting

The progress-management workflow uses MQTT and supports the `BR60S` and `BP60`
qualification definitions. It is an independent, unofficial application and
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
MQTT authentication and custom TLS client credentials are not currently
supported, so use a trusted, isolated network or broker-side access controls.

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
