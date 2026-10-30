# @sasakiuri/saika-docs

## 0.5.0

### Patch Changes

- [#219](https://github.com/sasakiuri/oss/pull/219) [`fe3d056`](https://github.com/sasakiuri/oss/commit/fe3d05624eac0a5bb8da8af501ebc68d5a740aa0) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Explain the Sighting-first workflow, automatic nullification and reset, transfer evidence limits, and official review before result publication.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`8f63ad0`](https://github.com/sasakiuri/oss/commit/8f63ad05e0b2f17b62f6781626b375a6f196b6e9) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Clarify reported modes, affected-series history, Director evidence and review panel names, and Sighting reset failure and recovery behavior.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`d3c0e9d`](https://github.com/sasakiuri/oss/commit/d3c0e9d8bbad61ddf59cfb9b004d4fe01fa5fcf3) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Allow immediate Sighting and Match selection in eligible three-position series. Disable Sighting after the first Match shot while preserving progress, scores, and the shared timer.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`d2ce368`](https://github.com/sasakiuri/oss/commit/d2ce368ca10b82c711cf78a050f66ec1954ce873) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Disable Lane progress controls, progress shortcuts, and competition-type selection while joined to Director. Expose membership independently of connection status and cancel pending confirmations when membership changes.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`107ac5b`](https://github.com/sasakiuri/oss/commit/107ac5b8dd5784cf5842b95b8f463826c0ed840d) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Confirm Preparation restarts and Match starts when the current session or series contains shots.
  Share the confirmation between keyboard shortcuts and side-menu buttons, and cancel on timeout or state changes.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`a9c090c`](https://github.com/sasakiuri/oss/commit/a9c090c775d916021fd5dae878a931f9412925b9) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Preserve official interruption cases after a completed-stage restart, reject Director competition commands until startup is ready, and reconcile resume state on recovery with MQTT already connected. Show completed-stage waiting without a stale clock and clarify recovery actions and evidence delivery.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`32b666c`](https://github.com/sasakiuri/oss/commit/32b666ce9a4e2aaef47f3c0418d3764d417b85ff) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Keep mode-cache restoration read-only after a failed Sighting reset. Preserve the final nullified observation and require the athlete to select Sighting, or retry the reset when another Match observation is nullified during ingestion.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`bc0a099`](https://github.com/sasakiuri/oss/commit/bc0a099bfd3b6331e06088fad170a09dbdebb57b) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Restore the saved Lane run, shots and original standalone clock deadline after a restart. Hold joined ordinary clocks for official adoption and resume, provide recovery and explicit finish paths, and reconnect and replay saved session data after startup readiness. Show retained interruption status in the Director lane table and document restart recovery.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`02618e7`](https://github.com/sasakiuri/oss/commit/02618e79566e7a11d41a88baa7eba2acdf7ca4d6) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Handle completed-stage restarts without blocking Director finish, keep READY retries from restarting connections, and provide explicit recovery for unreadable runs and unknown saved types. Show unverified remaining time on the Lane screen, keep ERROR states inactive, preserve athlete mode selection and qualification recovery cancellation, and honor queued manual MQTT settings with visible replay errors.

- [#218](https://github.com/sasakiuri/oss/pull/218) [`bf5067b`](https://github.com/sasakiuri/oss/commit/bf5067bc97512157db7332505931d1bc82d4aa7d) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Show series totals in a two-row, three-column viewport with vertical scrolling and automatic tracking of the latest row. Remove the separate current-series label above the totals.

## 0.4.1

### Patch Changes

- [#211](https://github.com/sasakiuri/oss/pull/211) [`28f6b18`](https://github.com/sasakiuri/oss/commit/28f6b1873d96cadb83d74fc56a2ce94ee42ef1e5) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Group sighting shots into ten-shot series on Lane score sheets so all shot details, series totals, and target diagrams appear in the corresponding series.
  Restore the series layout and page break before the seventh print series.

- [#187](https://github.com/sasakiuri/oss/pull/187) [`0651716`](https://github.com/sasakiuri/oss/commit/0651716ed38db5d0bbd1f7fa06a87c6fdb450c36) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Update the shared Electron runtime to 43.5.0 to apply the sandboxed preload code-cache security fix.

- [#211](https://github.com/sasakiuri/oss/pull/211) [`bc30725`](https://github.com/sasakiuri/oss/commit/bc3072565f2dafc685da7f9011c47fb794e0e481) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Update application runtimes, schema validation, and development tooling to patched dependency versions.

## 0.4.0

### Added

- Publish the Japanese manuals through a Next.js site with search, navigation, diagrams, static hosting, offline reading, RSS, and HTML/PDF output.
- Add Vista setup and display instructions, including pairing, saved screens, and recovery.
- Document Director start checks, operating presets, firearm malfunctions, interruptions, recovery firing, and reserve-Lane transfers.
- Document result approval and publication, protests and appeals, athlete sanctions, equipment checks, and Results Book export.
- Describe independent EST backup import, comparison, original-file storage, and database recovery.
- Explain Lane timing measurements, scoring gauges, range-wide STOP / UNLOAD, and stage-specific missing-shot procedures.

### Changed

- Update installation, application-update, backup, and recovery instructions for the shared suite release, including manual updates for unsigned macOS installations.
- Shorten operating guides and use the application's screen and button labels.
- Add site icons, light and dark themes, and self-hosted typography.

## 0.1.1

### Patch Changes

- [#73](https://github.com/sasakiuri/oss/pull/73) [`11b27fb`](https://github.com/sasakiuri/oss/commit/11b27fbad06af83327ae9dd63cc0747b9430707f) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Document DISAG RedDot and Kohto BPT-216 connections, device settings, and the added 10m Air Rifle, Air Pistol, and Beam Pistol competitions.
