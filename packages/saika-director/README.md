# Saika Director

Saika Director is the desktop control application for coordinating multiple
[Saika Lane](../saika-lane/) instances over MQTT.

## Saika Vista sharing

Open **Settings → Vista → Saika Vista spectator displays**, enable sharing, and apply the
settings. The default port is `45832`. On the Vista operator PC, discover this
Director or enter one of the displayed endpoints, then enter its pairing secret.
Sharing is disabled by default and starts automatically after enabling it.

The encrypted endpoint lets Vista read competitions and results. Vista supports
standard individual air rifle, air pistol, beam rifle and beam pistol qualification
and finals. Custom and other event definitions are reported as unsupported. Beam
finals follow JRSF 2026 domestic rules 6.17.5-2 and 6.17.5-3.

Select **Current competition** for the selected relay's standings or **Event
results · all relays** for the whole event. Event results are unavailable until
their rows have been received. The selected competition stays on screen after it
finishes or Lanes move elsewhere. Final state and scores are taken from the same
completed session; later corrections, publication changes and confirmed reserve
transfers are reflected.

Keep Director competition records and its data directory to retrieve corrections
after a restart. Missing shot history and unrecoverable relay places are marked
unverified until refreshed. Reset archives preserve the history available at reset;
older archives may lack it, while saved published results remain viewable as
unverified. See the [Vista guide](../saika-vista/README.md) for display recovery.

## Features

- Connect to Lanes through the embedded MQTT broker or an external broker; discover Lanes and monitor their connection state.
- Create competitions, check Rule Pack compatibility, assign athletes, and control Lane participation and session resets.
- Send synchronized commands for sighting, match, timers, series, and finish; check each Lane's response and retry failures.
- Issue a range-wide safety STOP, record each Lane's response, and clear the stop after a safety check.
- Guide phase starts with call-to-line reminders, target-visibility checks, setup time, and reset confirmations.
- Record interruptions, malfunction claims, target examinations, recovery firing, and scoring decisions while preserving their evidence.
- Run Individual and Mixed Team Finals with recorded official confirmations, retirement decisions, shoot-offs, recovery, and timeout records.
- Control 25m timed-target schedules and review shots outside the firing window. Original observations remain available for review.
- Draw firing points, plan outdoor Elimination relays, approve Start Lists, and export assignments.
- Verify individual and team results, process score protests and official publication, and record Final result declarations.
- Produce Results Books in HTML, A4 PDF, or JSON; retain official appointments, record claims, certifications, and supporting evidence.
- Restore retained competition and Lane state after reconnecting; receive range-officer requests and track athlete status.

See the [operating guide](../saika-docs/director/OPERATIONS.md) for start checks, Finals, malfunctions, and interruptions.
The [results guide](../saika-docs/director/RESULTS.md) covers verification, publication, printing, and evidence storage.

The progress-management workflow uses MQTT and supports Rule Pack-backed ISSF 2026 10m Individual/Mixed Team,
50m Rifle Qualification/Elimination/Final, and 25m Pistol Qualification definitions, plus the local `BR60S` and `BP60` definitions.
Sighting and match command durations are read from the selected competition definition,
including the ISSF 15-minute and 75-minute timings. It is an unofficial application and
must not be used as the sole timing or scoring authority for sanctioned
competitions.

## Development

Services are constructed under `src/main/composition/`. Lane and Director share
MQTT schemas through [`@sasakiuri/saika-protocol`](../saika-protocol/). The
[architecture guide](../../ARCHITECTURE.md) describes composition and command
ordering; the [contribution guide](../../CONTRIBUTING.md#changing-application-code)
covers changes and checks.

From the repository root:

```bash
npm ci
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
Use Settings → Network to switch to an external `mqtt://` or `mqtts://` broker.

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

macOS releases can be built without a signing certificate and require manual
updates in that case. Developer ID Application signing is optional; notarization
is not configured in the release workflow. See the [release checks](../../.github/PRE_RELEASE_CHECKLIST.md#update-distribution)
for signing configuration. Verify signing and first-launch behavior on each target
OS before distribution.

Platform packages can be produced locally with `build:win`, `build:mac`, or
`build:linux`; use the corresponding `pack:*` command for an unpacked smoke-test
build. Electron Builder rebuilds `better-sqlite3` for the target Electron ABI.
Before running Node.js-based tests after packaging, run `npm rebuild better-sqlite3`
from the repository root to restore the local Node.js ABI.

Director is distributed in the [shared Saika release](../../README.md#packages).
Installers, checksums and versioned documentation use the same suite version.

Installed releases check for application updates at startup. Use **Settings →
Updates → Application updates** to check again, download an available release,
and choose **Restart and install**. Save edits and finish range operations before
confirming the restart. Updates require administrator operator access when
operator sign-in is enabled; development builds do not support updates. Normal
shutdown does not install a pending update.

On macOS, automatic updates require signed applications with a consistent signing
identity. Replace an unsigned installation manually using the release DMG or ZIP.

## Documentation

Setup, operation, MQTT topics, acknowledgements, and recovery behavior are
documented in [`@sasakiuri/saika-docs`](../saika-docs/director/README.md).

## License

MIT License — see [LICENSE](./LICENSE). Third-party notices are generated in
`THIRD-PARTY-LICENSES.txt`.
