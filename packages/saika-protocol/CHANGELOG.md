# @sasakiuri/saika-protocol

## 0.2.2

### Patch Changes

- [#219](https://github.com/sasakiuri/oss/pull/219) [`3df0e2d`](https://github.com/sasakiuri/oss/commit/3df0e2d669f01188065a1b799682e6e8276ba8bb) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Require a Sighting switch before Match in athlete-controlled scored series. Nullify a forgotten-switch extra without consuming a score or shot slot, reset the Lane target to Sighting, and show the original device mode in review evidence.

  Await persisted competition progress before announcing recorded shots. Preserve nullified observations in Director's append-only journal and require official review before result publication; Final deductions remain explicit Jury decisions.

- [#273](https://github.com/sasakiuri/oss/pull/273) [`366f868`](https://github.com/sasakiuri/oss/commit/366f8680e8f79e5110f30c21d51fc230cb4afff1) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Round MQTT Final stage totals and Mixed Team totals to tenths, clear a Lane's retained Qualification recovery state when a competition finishes, let a Lane publish only the topics it sends under its own Lane ID on the embedded broker, report a missing shoot-off with the not-found error code, leave the relay number of Final verification items empty, ignore a superseded results query, show a failed EST backup verification list, and open the newest adjudication case by default.

## 0.2.1

### Patch Changes

- [#211](https://github.com/sasakiuri/oss/pull/211) [`bc30725`](https://github.com/sasakiuri/oss/commit/bc3072565f2dafc685da7f9011c47fb794e0e481) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Update application runtimes, schema validation, and development tooling to patched dependency versions.

## 0.2.0

### Added

- Add Vista source, screen, and snapshot contracts, with encrypted Node.js transport and local device discovery.

### Changed

- Update test dependencies and package notices.
