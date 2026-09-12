# @sasakiuri/saika-lane

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
