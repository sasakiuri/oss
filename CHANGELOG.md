# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Saika Director 0.1.0 MQTT competition control application for BR60S and BP60 qualification events.
- Cross-platform Saika Director packaging, release provenance, checksums, legal-notice verification, and Linux smoke tests.
- Saika Director Electron E2E, WCAG 2.1 AA, dependency architecture, bundle-size, and coverage gates.
- Electron runtime upgraded from the unsupported 35 line to the supported 43 line for both desktop packages.

### Security

- Sandboxed Saika Director renderers with a restrictive Content Security Policy and blocked external navigation.
- MQTT broker URL protocol and credential validation.

### Fixed

- Saika Director native module packaging, graceful shutdown ordering, macOS window lifecycle, broker configuration rollback, and MQTT startup cleanup.

## [0.1.0] - 2026-03-11

### Added

- Initial OSS release of Saika Lane (electronic target display system)
- Shared configuration packages (@sasakiuri/eslint-config, prettier-config, stylelint-config, typescript-config)
- CI/CD pipeline with GitHub Actions
- MIT license
