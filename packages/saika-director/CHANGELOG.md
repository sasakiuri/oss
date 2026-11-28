# Changelog

## 0.5.0

### Minor Changes

- [#219](https://github.com/sasakiuri/oss/pull/219) [`3df0e2d`](https://github.com/sasakiuri/oss/commit/3df0e2d669f01188065a1b799682e6e8276ba8bb) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Require a Sighting switch before Match in athlete-controlled scored series. Nullify a forgotten-switch extra without consuming a score or shot slot, reset the Lane target to Sighting, and show the original device mode in review evidence.

  Await persisted competition progress before announcing recorded shots. Preserve nullified observations in Director's append-only journal and require official review before result publication; Final deductions remain explicit Jury decisions.

### Patch Changes

- [#265](https://github.com/sasakiuri/oss/pull/265) [`b9ac5d6`](https://github.com/sasakiuri/oss/commit/b9ac5d6c6188b75e6e5ddaf62aa74114c7c8042e) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Compute Vista definition fingerprints and reserve transfer digests independently of the operating system locale.

- [#260](https://github.com/sasakiuri/oss/pull/260) [`426834f`](https://github.com/sasakiuri/oss/commit/426834f0e47c1b7ac83778e2ed5e4806ca218f5d) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Report a failed championship deletion instead of ignoring it, and report a failed load of a newly added event's entries as a load failure instead of saying that adding the event failed.

- [#261](https://github.com/sasakiuri/oss/pull/261) [`0709799`](https://github.com/sasakiuri/oss/commit/0709799ae13cac849acc9229a2a5b9f1f6d326bc) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Report a failed reload after a championship or event is saved or deleted as a reload error, instead of reporting the saved change as failed or ignoring the reload failure.

- [#261](https://github.com/sasakiuri/oss/pull/261) [`7608faf`](https://github.com/sasakiuri/oss/commit/7608faf2d69fb4164f7f2a11e6f2206f42ecb5ff) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Style the athlete sanction inputs, the EST complaint official field and the qualification malfunction rule source box with the same colours as the other Director forms.

- [#260](https://github.com/sasakiuri/oss/pull/260) [`c6d497f`](https://github.com/sasakiuri/oss/commit/c6d497fd2f2867ac4e976977957e23b3c103d455) Thanks [@sasakiuri](https://github.com/sasakiuri)! - List the operator permission of every Director command group explicitly, so a new command group cannot be left without one; the permission each existing command requires is unchanged.

- [#261](https://github.com/sasakiuri/oss/pull/261) [`685b52b`](https://github.com/sasakiuri/oss/commit/685b52b5e85e1db5bea533e09c5551bf57a991c5) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Keep the range interruption record an operator selects while a command is still running, instead of jumping back to the record the command changed.

- [#261](https://github.com/sasakiuri/oss/pull/261) [`d5f1d17`](https://github.com/sasakiuri/oss/commit/d5f1d17f18c08ad446b3f3293399a3d64f27bf6e) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Submit the case action shown in an irregular shot case after its status changes, instead of the previous action that the new status no longer allows.

- [#260](https://github.com/sasakiuri/oss/pull/260) [`d5eea3a`](https://github.com/sasakiuri/oss/commit/d5eea3ae1d5785ba6636db88a11a86331b10a454) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Remove the status-bar Debug button, which did not open anything, together with the in-memory debug log it was meant to show; the log files are written as before.

- [#260](https://github.com/sasakiuri/oss/pull/260) [`6a37d77`](https://github.com/sasakiuri/oss/commit/6a37d77921cc378af5790b0b666d98ef2fd1cd62) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Keep the results table and relay filter on screen when confirming results fails, and show the failure above them, instead of replacing them with the error until the screen is left.

- [#261](https://github.com/sasakiuri/oss/pull/261) [`e974dda`](https://github.com/sasakiuri/oss/commit/e974dda8aba11425e55818e39a4cc10941681454) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Keep Final command errors visible while a shoot-off refreshes every second, and stop an older refresh from replacing the run a command just returned.

- [#261](https://github.com/sasakiuri/oss/pull/261) [`13281df`](https://github.com/sasakiuri/oss/commit/13281df1c34a976618596edcfc55875b9222e9b8) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Disable "Append case action" on a void irregular shot case, which Director never changes, as the adjudication case panel already does.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`11f364e`](https://github.com/sasakiuri/oss/commit/11f364eb99ef0280571316aef76e6380fb8f5d09) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Limit reported-mode labels to series with a nullified extra and distinguish target observation evidence from official review. Clear reset notices after selection or progress, and format unscored device values using the event scoring method.

  Preserve a single nullified outcome if the Sighting reset fails, show the failure, and require Sighting selection or another nullified Match observation to retry the reset. Require explicit policy inputs and share the scope and position-label rules.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`bc0a099`](https://github.com/sasakiuri/oss/commit/bc0a099bfd3b6331e06088fad170a09dbdebb57b) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Restore the saved Lane run, shots and original standalone clock deadline after a restart. Hold joined ordinary clocks for official adoption and resume, provide recovery and explicit finish paths, and reconnect and replay saved session data after startup readiness. Show retained interruption status in the Director lane table and document restart recovery.

- Updated dependencies [[`3df0e2d`](https://github.com/sasakiuri/oss/commit/3df0e2d669f01188065a1b799682e6e8276ba8bb), [`d3c0e9d`](https://github.com/sasakiuri/oss/commit/d3c0e9d8bbad61ddf59cfb9b004d4fe01fa5fcf3)]:
  - @sasakiuri/saika-protocol@0.3.0
  - @sasakiuri/saika-rules@0.2.1

## 0.4.1

### Patch Changes

- [#187](https://github.com/sasakiuri/oss/pull/187) [`0651716`](https://github.com/sasakiuri/oss/commit/0651716ed38db5d0bbd1f7fa06a87c6fdb450c36) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Update the shared Electron runtime to 43.5.0 to apply the sandboxed preload code-cache security fix.

- [#211](https://github.com/sasakiuri/oss/pull/211) [`bc30725`](https://github.com/sasakiuri/oss/commit/bc3072565f2dafc685da7f9011c47fb794e0e481) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Update application runtimes, schema validation, and development tooling to patched dependency versions.

- Updated dependencies [[`bc30725`](https://github.com/sasakiuri/oss/commit/bc3072565f2dafc685da7f9011c47fb794e0e481)]:
  - @sasakiuri/saika-protocol@0.2.1
  - @sasakiuri/saika-updater@0.2.1

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
