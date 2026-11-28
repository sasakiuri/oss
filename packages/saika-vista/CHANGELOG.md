# @sasakiuri/saika-vista

## 0.4.2

### Patch Changes

- [#275](https://github.com/sasakiuri/oss/pull/275) [`f0e3e35`](https://github.com/sasakiuri/oss/commit/f0e3e3565bb182517e24a6e74790dd0ec328ae08) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Stop building macOS installers and update metadata; macOS builds end with 0.4.1. Releases provide Windows x64 and Linux x64 packages, and the installation guides no longer describe macOS distribution or signing.

- [#273](https://github.com/sasakiuri/oss/pull/273) [`366f868`](https://github.com/sasakiuri/oss/commit/366f8680e8f79e5110f30c21d51fc230cb4afff1) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Clear operator errors once their cause is resolved, keep polling and report a failed change notice, send notices only to an open operator window, keep display connections when a local revocation cannot be saved, keep the state loaded after an operator command over older refreshes, show update status errors without an error prefix, allow a window to reload the page it shows, and retry update initialization after a loader fails synchronously.

- [#260](https://github.com/sasakiuri/oss/pull/260) [`ada61ae`](https://github.com/sasakiuri/oss/commit/ada61aeea395358a5d7fe19a7bdaa48a18c75475) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Ask the operator and audience windows to reload only when the state they show has changed, instead of five times a second.

- Updated dependencies [[`3df0e2d`](https://github.com/sasakiuri/oss/commit/3df0e2d669f01188065a1b799682e6e8276ba8bb), [`366f868`](https://github.com/sasakiuri/oss/commit/366f8680e8f79e5110f30c21d51fc230cb4afff1), [`366f868`](https://github.com/sasakiuri/oss/commit/366f8680e8f79e5110f30c21d51fc230cb4afff1)]:
  - @sasakiuri/saika-protocol@0.2.2
  - @sasakiuri/saika-updater@0.2.2

## 0.4.1

### Patch Changes

- [#187](https://github.com/sasakiuri/oss/pull/187) [`0651716`](https://github.com/sasakiuri/oss/commit/0651716ed38db5d0bbd1f7fa06a87c6fdb450c36) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Update the shared Electron runtime to 43.5.0 to apply the sandboxed preload code-cache security fix.

- [#211](https://github.com/sasakiuri/oss/pull/211) [`bc30725`](https://github.com/sasakiuri/oss/commit/bc3072565f2dafc685da7f9011c47fb794e0e481) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Update application runtimes, schema validation, and development tooling to patched dependency versions.

- Updated dependencies [[`bc30725`](https://github.com/sasakiuri/oss/commit/bc3072565f2dafc685da7f9011c47fb794e0e481)]:
  - @sasakiuri/saika-protocol@0.2.1
  - @sasakiuri/saika-updater@0.2.1

## 0.4.0

### Added

- Display targets, scores, and standings from Lane and Director for standard individual air and beam Qualification and Final events.
- Pair with data sources over encrypted local connections and manage monitors on local or remote Vista PCs.
- Save screen settings and received data for offline display and restoration after restart. Show saving, data reception, and rendering status separately.
- Check for application updates, download releases, and install after a confirmed restart.
- Add the Vista icon and a dark operator theme consistent with Lane and Director.

### Fixed

- Restore login startup after updates and preserve the correct OS setting when saving fails.
- Keep storage errors visible and ask before discarding unapplied screen edits during navigation.
- Finish shutdown when an audience window is still loading.

### Distribution

- Vista joins Lane, Director, and Docs in the shared suite release, with its own automatic-update metadata.
- macOS packages can be built unsigned; unsigned installations require manual updates.
- Exclude dependency tests from installers and update the shared protocol and updater packages to 0.2.0.

The [venue test with 100 lanes over 12 hours](../saika-docs/vista/REQUIREMENTS.md#%E4%BC%9A%E5%A0%B4%E8%A9%A6%E9%A8%93) remains pending.
