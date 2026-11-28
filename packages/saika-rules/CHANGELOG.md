# @sasakiuri/saika-rules

## 0.2.1

### Patch Changes

- [#219](https://github.com/sasakiuri/oss/pull/219) [`3df0e2d`](https://github.com/sasakiuri/oss/commit/3df0e2d669f01188065a1b799682e6e8276ba8bb) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Require a Sighting switch before Match in athlete-controlled scored series. Nullify a forgotten-switch extra without consuming a score or shot slot, reset the Lane target to Sighting, and show the original device mode in review evidence.

  Await persisted competition progress before announcing recorded shots. Preserve nullified observations in Director's append-only journal and require official review before result publication; Final deductions remain explicit Jury decisions.

- [#219](https://github.com/sasakiuri/oss/pull/219) [`d3c0e9d`](https://github.com/sasakiuri/oss/commit/d3c0e9d8bbad61ddf59cfb9b004d4fe01fa5fcf3) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Allow immediate Sighting and Match selection in eligible three-position series. Disable Sighting after the first Match shot while preserving progress, scores, and the shared timer.

## 0.2.0

### Added

- Define Qualification firearm malfunction policies, including claim limits, repair, repeat or completion firing, and score calculation.
- Define stage-specific 25m interruption and EST failure recovery, missing-shot procedures, and command pauses.
- Add standard air and beam Qualification and Final definitions used by Vista sources.
- Add 300m Rifle and 50m Pistol events with their own timings, scoring gauges, and qualifying-field limits.
- Separate target-face dimensions from event scoring gauges, including the ISSF 5.60 mm smallbore and 9.65 mm Centre Fire measuring edges.
- Define team tie breaks, Mixed Team timing, and result-publication policies.

### Fixed

- Limit 25m Pistol Women Final EST replacement to one missing shot, including a shot already recorded as zero. Firearm-malfunction completion and Rapid Fire Pistol refiring retain their own procedures.

### Changed

- Update test dependencies and package notices.
