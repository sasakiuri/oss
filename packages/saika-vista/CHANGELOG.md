# @sasakiuri/saika-vista

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
