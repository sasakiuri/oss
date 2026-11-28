# @sasakiuri/saika-updater

## 0.2.2

### Patch Changes

- [#273](https://github.com/sasakiuri/oss/pull/273) [`366f868`](https://github.com/sasakiuri/oss/commit/366f8680e8f79e5110f30c21d51fc230cb4afff1) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Clear operator errors once their cause is resolved, keep polling and report a failed change notice, send notices only to an open operator window, keep display connections when a local revocation cannot be saved, keep the state loaded after an operator command over older refreshes, show update status errors without an error prefix, allow a window to reload the page it shows, and retry update initialization after a loader fails synchronously.

## 0.2.1

### Patch Changes

- [#211](https://github.com/sasakiuri/oss/pull/211) [`bc30725`](https://github.com/sasakiuri/oss/commit/bc3072565f2dafc685da7f9011c47fb794e0e481) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Update application runtimes, schema validation, and development tooling to patched dependency versions.

## 0.2.0

### Added

- Share application-update checks, download state, and restart installation across Lane, Director, and Vista.
- Select each application's update metadata within the shared suite release.
- Keep services running when restart installation is cancelled and report installation failures after shutdown.

### Fixed

- Allow release candidates to update to a newer stable version.

### Changed

- Update test dependencies and package notices.
