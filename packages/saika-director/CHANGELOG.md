# Changelog

## 0.4.0

### Added

- Coordinate Lane participation, athlete assignments, timers, and command retries, with competition recovery after reconnecting or restarting.
- Share targets, standings, and publication status with Saika Vista over an encrypted local connection.
- Issue a range-wide STOP / UNLOAD and record Lane responses. Clearing the stop requires a safety check.
- Configure start checks for relay readiness, EST inspections, clocks, Lane timing, and backup availability. Save reusable operating presets and templates.
- Record firearm malfunctions, interruptions, target examinations, and authorized Qualification or 25m Final recovery firing. Officials confirm scoring separately.
- Transfer a paused continuous Qualification session to a reserve Lane already joined to the competition; resuming requires a separate Jury authorization.
- Prepare malfunction calculation sheets, preview score corrections from Jury evidence, and retain the original scores and correction history.
- Import and monitor independent EST backups in JSON, CSV, or TSV. Compare totals, ordered shots, and series for Qualification and Final results, retaining the original files.
- Manage protest and appeal records, print their history, and prepare drafts on locally selected official PDF forms.
- Configure result-publication checks by event and round. Record actual posting times, official approvals, and Final declarations; unresolved cases can block publication.
- Register athletes across a championship, record DSQ, DQB, and AD-DSQ decisions, and apply their classifications to entries and results.
- Register equipment and inspections, and review post-competition checks before publication.
- Add optional operator sign-in, operation permissions, and signing roles for result approvals and Results Books.
- Export certified Results Books as HTML, A4 PDF, or JSON, including individual and team records and official confirmations.
- Add 300m Rifle and 50m Pistol event definitions and event-specific scoring gauges.
- Check for application updates, download releases, and install after a confirmed restart.

### Fixed

- Preserve all Qualification series and shot counts, including 12-series events, in storage, live boards, and printed results.
- Use ten-shot countback blocks for ISSF 25m Qualification ties and require review when missing evidence prevents a reliable ranking.
- Recheck start conditions immediately before LOAD and use the correct 25m Final readiness periods and replacement-shot limits.
- Keep form drafts, pending queries, and errors with the selected competition or case when navigating between screens.
- Retain original evidence files in database backups and verify their size and SHA-256 before restoring.
- Prevent delayed commands and timers from affecting a replacement MQTT connection. Restore backup monitoring without delaying startup or other sources.
- Preserve firing-point assignments when editing entry counts and apply entry classifications consistently.

### Distribution

- Lane, Director, Vista, and Docs use the same suite version and release. Director has its own automatic-update metadata.
- macOS packages can be built unsigned; unsigned installations require manual updates.
- Update shared rules, protocol, and updater packages to 0.2.0 and update test dependencies.

See the [operation](../saika-docs/director/OPERATIONS.md) and [results](../saika-docs/director/RESULTS.md) guides for procedures and limits.

## 0.1.0 - 2026-08-25

### Added

- Default progress-management workflow for `BR60S` and `BP60` qualification competitions, backed by MQTT lane control.
- Simultaneous, independently controlled competitions on disjoint Lane groups, including per-competition timers and BP/BR group selection.
- Embedded MQTT broker and external `mqtt://` / `mqtts://` broker support.
- Saika Lane discovery, athlete assignment, synchronized phase commands, acknowledgements, and live scoring state.
- Bulk application of tournament firing-point assignments by relay and Director firing-point number.
- Windows x64, macOS x64/arm64, and Linux x64 release packaging.
- Electron 43 supported runtime line and `better-sqlite3` 13 compatibility with current Chromium/V8 security updates.
- Unit, Electron E2E, accessibility, architecture, bundle-size, license-artifact, and coverage quality gates.

### Security

- Sandboxed Electron renderers, restrictive Content Security Policy, blocked external navigation, and single-instance locking.
- MQTT URLs reject embedded credentials and unsupported protocols.

### Fixed

- Build native SQLite modules for each Electron target and restore the Node.js development binaries afterward.
- Save MQTT settings only after a successful connection change. Failed client or broker startup closes sockets and reconnect attempts; invalid saved settings fall back to defaults.
- Flush Lane state before closing SQLite, close board windows on exit, and keep macOS services running when all windows are closed.
- Preserve retained broker messages, competition deadlines, and recovery state across restarts. Offline Lanes and expired heartbeats no longer reserve firing points.
- Serialize competition commands, Lane membership changes, and broker transitions. Acknowledgements must match the command topic and cannot regress from a terminal state.
- Keep original timer deadlines through retries and partial failures. Discard obsolete deadlines after Lane replacement, and reject timer restarts outside an active competition.
- Wait for final Lane state and score snapshots tied to the finish command before saving results. Use the retained score history so earlier shot events cannot restore reset scores.
- Validate score totals, scoring modes, and tie-break details before publication. BP60 Qualification uses integer ring scoring.
- Prevent duplicate Lane and athlete assignments. Lock assignments during competition and after publication, while allowing repairs after failed result saves.
- Publish results only for athletes assigned to the selected relay, using names and affiliations from the tournament database. Preserve confirmed results and results owned by other competitions.
- Allow cleanup when a linked event has been deleted. Abandoning a competition before Match starts does not publish zero-score results.
- Validate all shoot-off targets and rankings before changing Lane state; return every target Lane from SHOOTOFF after resolution.
- Validate Lane, live-ranking, and shoot-off IPC responses, including the identifier returned when a shoot-off is created.
- Ignore VITE_DEV_SERVER_URL in packaged applications so renderer content is loaded from the installed files.
