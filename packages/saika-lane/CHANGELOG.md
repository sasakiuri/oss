# @sasakiuri/saika-lane

## 0.4.2

### Patch Changes

- [#219](https://github.com/sasakiuri/oss/pull/219) [`3df0e2d`](https://github.com/sasakiuri/oss/commit/3df0e2d669f01188065a1b799682e6e8276ba8bb) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Require a Sighting switch before Match in athlete-controlled scored series. Nullify a forgotten-switch extra without consuming a score or shot slot, reset the Lane target to Sighting, and show the original device mode in review evidence.

  Await persisted competition progress before announcing recorded shots. Preserve nullified observations in Director's append-only journal and require official review before result publication; Final deductions remain explicit Jury decisions.

- [#275](https://github.com/sasakiuri/oss/pull/275) [`f0e3e35`](https://github.com/sasakiuri/oss/commit/f0e3e3565bb182517e24a6e74790dd0ec328ae08) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Stop building macOS installers and update metadata; macOS builds end with 0.4.1. Releases provide Windows x64 and Linux x64 packages, and the installation guides no longer describe macOS distribution or signing.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`d3c0e9d`](https://github.com/sasakiuri/oss/commit/d3c0e9d8bbad61ddf59cfb9b004d4fe01fa5fcf3) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Allow immediate Sighting and Match selection in eligible three-position series. Disable Sighting after the first Match shot while preserving progress, scores, and the shared timer.

- [#261](https://github.com/sasakiuri/oss/pull/261) [`e7ddd68`](https://github.com/sasakiuri/oss/commit/e7ddd68578af6cd366c75e5d8707cc0b29ca58ca) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Save Lane `settings.json` through a temporary file so an interrupted save keeps the previous settings instead of leaving a damaged file.

- [#260](https://github.com/sasakiuri/oss/pull/260) [`37f7dc7`](https://github.com/sasakiuri/oss/commit/37f7dc74deb2e59d3c251c85451f4afd1c702847) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Cancel Director start commands that are still waiting for their start time when the Lane leaves the competition or disconnects from MQTT, instead of starting the stage or match later.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`d2ce368`](https://github.com/sasakiuri/oss/commit/d2ce368ca10b82c711cf78a050f66ec1954ce873) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Disable Lane progress controls, progress shortcuts, and competition-type selection while joined to Director. Expose membership independently of connection status and cancel pending confirmations when membership changes.

- [#265](https://github.com/sasakiuri/oss/pull/265) [`918ecaf`](https://github.com/sasakiuri/oss/commit/918ecafb3ce61cd0f9b682280ff741549c6360b6) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Install a downloaded update only through Restart & Install, as Director and Vista do, instead of also on a normal quit.

- [#260](https://github.com/sasakiuri/oss/pull/260) [`00dd3f2`](https://github.com/sasakiuri/oss/commit/00dd3f2ea8dee1298e1080656efed9ba6cdc45c4) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Publish the Lane hardware state, and leave its offline will with the broker, only under the Lane's own ID instead of under `saika/lane/undefined/hardware/state` before the ID is known.

- [#260](https://github.com/sasakiuri/oss/pull/260) [`1ceaa5d`](https://github.com/sasakiuri/oss/commit/1ceaa5d8aaa0b1e3288c1b4485f57392ff3f7378) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Reject Lane IPC responses that do not match their contract with an `IPC_INVALID_RESPONSE` error, and drop event payloads that do not match their schema before they reach the screen.

- [#261](https://github.com/sasakiuri/oss/pull/261) [`6071054`](https://github.com/sasakiuri/oss/commit/6071054609e25aa0bc493ef8ef1eb3ffdb619d25) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Keep the saved target connection and discipline when Connect fails, so the next start does not auto-connect to a port that did not work.

- [#260](https://github.com/sasakiuri/oss/pull/260) [`be9bc5f`](https://github.com/sasakiuri/oss/commit/be9bc5f6a9852fbd41b0d154571fb3ac2a5a0a8d) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Refuse local competition progress requests in the Lane main process, not only on screen, while the Lane is joined to a Director competition.

- [#261](https://github.com/sasakiuri/oss/pull/261) [`77dcfe6`](https://github.com/sasakiuri/oss/commit/77dcfe638d6afb3f4e68cf272594fb248065b734) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Show why Preparation, Match or Next Stage could not start on the Lane screen instead of ignoring the click silently.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`107ac5b`](https://github.com/sasakiuri/oss/commit/107ac5b8dd5784cf5842b95b8f463826c0ed840d) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Confirm Preparation restarts and Match starts when the current session or series contains shots.
  Share the confirmation between keyboard shortcuts and side-menu buttons, and cancel on timeout or state changes.

- [#260](https://github.com/sasakiuri/oss/pull/260) [`ff6487d`](https://github.com/sasakiuri/oss/commit/ff6487dda587622dbe817d5e4a7d792bba042457) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Allow only one Lane to run per user data directory: launching it again brings the running window to the front instead of opening a second Lane on the same database and target port.

- [#261](https://github.com/sasakiuri/oss/pull/261) [`2bc2b47`](https://github.com/sasakiuri/oss/commit/2bc2b479634cbe6ba365001d4e0663be85885236) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Show the Lane Alias as the Lane's name in Vista instead of always using the Lane number.

- [#265](https://github.com/sasakiuri/oss/pull/265) [`b7eccc7`](https://github.com/sasakiuri/oss/commit/b7eccc77240ec4601a45bbf512c5f557d5f4e94e) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Compute Vista definition fingerprints independently of the operating system locale, so every Lane reports the same fingerprint for the same event.

- [#260](https://github.com/sasakiuri/oss/pull/260) [`c968707`](https://github.com/sasakiuri/oss/commit/c9687075c402f0558ed2d31cf6e04d45170b8a91) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Keep the Lane main and score sheet windows on their own page, allowing only a reload of that page, and refuse new windows, webviews and browser permission requests in them.

- [#260](https://github.com/sasakiuri/oss/pull/260) [`ba383f0`](https://github.com/sasakiuri/oss/commit/ba383f01ae920aa6068e291594220879b175d13e) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Make Zoom In (the Zoom button, numpad 6 and View > Zoom In) step from automatic zoom through the whole target and the 4, 6 and 8 rings toward higher magnification, and Zoom Out the other way.

- [#261](https://github.com/sasakiuri/oss/pull/261) [`4cf98c5`](https://github.com/sasakiuri/oss/commit/4cf98c5f05801193f329c9d1bb45a0f840dec1c0) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Make View > Zoom Out step back through the zoom modes instead of repeating Zoom In.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`a9c090c`](https://github.com/sasakiuri/oss/commit/a9c090c775d916021fd5dae878a931f9412925b9) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Preserve official interruption cases after a completed-stage restart, reject Director competition commands until startup is ready, and reconcile resume state on recovery with MQTT already connected. Show completed-stage waiting without a stale clock and clarify recovery actions and evidence delivery.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`11f364e`](https://github.com/sasakiuri/oss/commit/11f364eb99ef0280571316aef76e6380fb8f5d09) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Limit reported-mode labels to series with a nullified extra and distinguish target observation evidence from official review. Clear reset notices after selection or progress, and format unscored device values using the event scoring method.

  Preserve a single nullified outcome if the Sighting reset fails, show the failure, and require Sighting selection or another nullified Match observation to retry the reset. Require explicit policy inputs and share the scope and position-label rules.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`32b666c`](https://github.com/sasakiuri/oss/commit/32b666ce9a4e2aaef47f3c0418d3764d417b85ff) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Keep mode-cache restoration read-only after a failed Sighting reset. Preserve the final nullified observation and require the athlete to select Sighting, or retry the reset when another Match observation is nullified during ingestion.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`bc0a099`](https://github.com/sasakiuri/oss/commit/bc0a099bfd3b6331e06088fad170a09dbdebb57b) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Restore the saved Lane run, shots and original standalone clock deadline after a restart. Hold joined ordinary clocks for official adoption and resume, provide recovery and explicit finish paths, and reconnect and replay saved session data after startup readiness. Show retained interruption status in the Director lane table and document restart recovery.

- [#273](https://github.com/sasakiuri/oss/pull/273) [`366f868`](https://github.com/sasakiuri/oss/commit/366f8680e8f79e5110f30c21d51fc230cb4afff1) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Show the reason of an invalid phase transition and the missing competition in command acknowledgements, replay a transferred session in its own competition, cancel the timed target of a safety stop once and still close an open shoot-off when that cancellation fails, total the side panel's MATCH series by the competition's series, keep newer incident signal, MQTT and timed-target state over older reads, and show updater and load errors as readable summaries.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`02618e7`](https://github.com/sasakiuri/oss/commit/02618e79566e7a11d41a88baa7eba2acdf7ca4d6) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Handle completed-stage restarts without blocking Director finish, keep READY retries from restarting connections, and provide explicit recovery for unreadable runs and unknown saved types. Show unverified remaining time on the Lane screen, keep ERROR states inactive, preserve athlete mode selection and qualification recovery cancellation, and honor queued manual MQTT settings with visible replay errors.

- [#218](https://github.com/sasakiuri/oss/pull/218) [`bf5067b`](https://github.com/sasakiuri/oss/commit/bf5067bc97512157db7332505931d1bc82d4aa7d) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Show series totals in a two-row, three-column viewport with vertical scrolling and automatic tracking of the latest row. Remove the separate current-series label above the totals.

- Updated dependencies [[`3df0e2d`](https://github.com/sasakiuri/oss/commit/3df0e2d669f01188065a1b799682e6e8276ba8bb), [`d3c0e9d`](https://github.com/sasakiuri/oss/commit/d3c0e9d8bbad61ddf59cfb9b004d4fe01fa5fcf3), [`366f868`](https://github.com/sasakiuri/oss/commit/366f8680e8f79e5110f30c21d51fc230cb4afff1), [`366f868`](https://github.com/sasakiuri/oss/commit/366f8680e8f79e5110f30c21d51fc230cb4afff1)]:
  - @sasakiuri/saika-protocol@0.2.2
  - @sasakiuri/saika-rules@0.2.1
  - @sasakiuri/saika-updater@0.2.2

## 0.4.1

### Patch Changes

- [#211](https://github.com/sasakiuri/oss/pull/211) [`28f6b18`](https://github.com/sasakiuri/oss/commit/28f6b1873d96cadb83d74fc56a2ce94ee42ef1e5) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Group sighting shots into ten-shot series on Lane score sheets so all shot details, series totals, and target diagrams appear in the corresponding series.
  Restore the series layout and page break before the seventh print series.

- [#187](https://github.com/sasakiuri/oss/pull/187) [`0651716`](https://github.com/sasakiuri/oss/commit/0651716ed38db5d0bbd1f7fa06a87c6fdb450c36) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Update the shared Electron runtime to 43.5.0 to apply the sandboxed preload code-cache security fix.

- [#211](https://github.com/sasakiuri/oss/pull/211) [`bc30725`](https://github.com/sasakiuri/oss/commit/bc3072565f2dafc685da7f9011c47fb794e0e481) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Update application runtimes, schema validation, and development tooling to patched dependency versions.

- Updated dependencies [[`bc30725`](https://github.com/sasakiuri/oss/commit/bc3072565f2dafc685da7f9011c47fb794e0e481)]:
  - @sasakiuri/saika-protocol@0.2.1
  - @sasakiuri/saika-updater@0.2.1

## 0.4.0

### Added

- Connect to Director for synchronized competition commands, athlete assignments, clock checks, and recovery after reconnecting or restarting.
- Share targets and scores with Saika Vista over an encrypted local connection.
- Report firearm malfunctions and missing shots with instructions for the current competition stage.
- Run authorized Qualification and 25m Final recovery firing. Keep recovery shots separate until officials confirm their scores.
- Transfer a paused continuous Qualification session to a reserve Lane already joined to the competition. Resuming requires a separate Jury authorization.
- Display range-wide STOP / UNLOAD, block firing commands, and retain subsequent shots outside normal scoring until the stop is cleared.
- Import timing measurements, save named profiles, and report their settings to Director. Shots with uncertain timing remain unscored for Jury review.
- Record UNLOAD commands and support optional checks for the required pause before the next command.
- Add 300m Rifle and 50m Pistol definitions and event-specific scoring gauges. Physical target support depends on the device adapter.

### Fixed

- Preserve recorded coordinates during replay, exclude sighting shots from match totals, and continue stage timers between series.
- Keep countdown deadlines and interrupted series correct through delayed commands, failed saves, and reconnects.
- Apply database upgrades in one transaction; failed upgrades roll back, and unsupported newer databases are rejected.
- Preserve the selected discipline when choosing a compatible target and expose Custom CSV serial input in connection settings.
- Use the correct readiness periods and replacement-shot limits for 25m Final recovery, including a missing shot already recorded as zero.
- Retain the current services when an update restart is cancelled and report installation failures.
- Load the bundled screen in packaged applications even when a development server URL is configured.

### Distribution

- Lane, Director, Vista, and Docs use the same suite version and release.
- macOS packages can be built unsigned; unsigned installations require manual updates.
- Update shared rules, protocol, and updater packages to 0.2.0 and update test dependencies.

See the [Lane specification](../saika-docs/lane/SPEC.md) for operating limits and hardware verification status.

## 0.3.0

### Minor Changes

- [#73](https://github.com/sasakiuri/oss/pull/73) [`11b27fb`](https://github.com/sasakiuri/oss/commit/11b27fbad06af83327ae9dd63cc0747b9430707f) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Add DISAG RedDot Rifle/Pistol and Kohto BPT-216 connections, plus 10m Air Rifle, Air Pistol, and Beam Pistol competitions. Restore device settings and baud rates, migrate older device IDs, and update target display and shot sounds.

### Patch Changes

- [#73](https://github.com/sasakiuri/oss/pull/73) [`7c9f151`](https://github.com/sasakiuri/oss/commit/7c9f1510467781a1758eb8a862f1d056ad93e07f) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Update application and build dependencies to patched releases.

- [#73](https://github.com/sasakiuri/oss/pull/73) [`8d8cf9f`](https://github.com/sasakiuri/oss/commit/8d8cf9fe1a5b6e980e2c11e2ec0c949c372f2dbd) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Translate the JSON settings guidance shown in the settings dialog.

## 0.2.11

### Patch Changes

- Restore complete third-party license notices, include Saika Lane's MIT license in packaged applications, and verify legal files against bundled dependencies during release builds.
- Document automatic GitHub update checks, MQTT network activity, and local data storage accurately.

## 0.2.10

### Patch Changes

- [#67](https://github.com/sasakiuri/oss/pull/67) [`0c7a3d0`](https://github.com/sasakiuri/oss/commit/0c7a3d08fa076c963da62a9b89f4a6e6bc44c05e) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Number shots continuously across series on the aggregate printed target.

## 0.2.9

### Patch Changes

- Keep auto zoom from over-zooming outer-ring shot groups.

## 0.2.8

### Patch Changes

- Focus the main window after startup so keyboard shortcuts work without an initial mouse click.

## 0.2.7

### Patch Changes

- Move the zoom shortcut to Numpad6, match its behavior to the zoom button, and preserve numpad input while editing settings fields.

## 0.2.6

### Patch Changes

- Keep shot recording and score sheet printing aligned with the active competition session so impacts and scores render after IDLE, Preparation, and Match transitions.

## 0.2.5

### Patch Changes

- Include Preparation and IDLE shot impacts in printed score sheets when no Match shots have been recorded yet.

## 0.2.4

### Patch Changes

- Update displayed shot numbers so Preparation and Match use separate continuous sequences, with Preparation reset when the Preparation button is pressed.

## 0.2.3

### Patch Changes

- Preserve the saved lane number across session resets.

## 0.2.2

### Patch Changes

- Change the fullscreen shortcut from Numpad Enter to F11.

## 0.2.1

### Patch Changes

- Stabilize settings persistence by unifying storage around `settings.json`, improving reconnect and legacy settings recovery, and preserving explicit default user preferences.

## 0.2.0

### Minor Changes

- [#30](https://github.com/sasakiuri/oss/pull/30) [`3396210`](https://github.com/sasakiuri/oss/commit/3396210d84f10a8de26c56d8701a43640de7d543) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Enable debug panel in production builds to aid field diagnostics, and fix AudioContext handling so playback resumes reliably after the context has been suspended by the browser during idle periods.
