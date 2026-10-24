# @sasakiuri/saika-updater

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
