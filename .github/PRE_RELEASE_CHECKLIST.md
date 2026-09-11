# Release Checks

Run `bash scripts/pre-release-check.sh` and review its output alongside CI.
Record the tested version, environment, and unresolved failures before release.

## Version and documentation

- [ ] Lane, Director, Vista, and Docs use the release version; changesets cover package changes.
- [ ] Installation, update, backup, and recovery instructions match the packaged applications.
- [ ] Release notes identify supported platforms, known limitations, and unverified hardware.

## Packaged applications

- [ ] Installers launch on each supported OS without native-module errors.
- [ ] Lane connects to the target hardware and records, displays, and prints shots.
- [ ] Director connects through both embedded and external MQTT brokers and recovers from connection failure.
- [ ] Competition workflows run from joining through finishing; timing and scores are checked against independent records.
- [ ] Vista pairs with sources and display PCs, applies screen settings, and restores displays after restart.
- [ ] Signing and notarization status is documented for each platform.

## Distribution

- [ ] CI, dependency, secret, and license checks pass; packaged files contain the required notices.
- [ ] Artifacts exclude local files, credentials, test data, and debug output.
- [ ] The release includes installers, checksums, update metadata, and documentation for the same version.
- [ ] Publication credentials and repository access are configured for the intended packages and workflows.
- [ ] Contributions and bundled assets have the required distribution rights.

After publication, verify installer downloads and update metadata against the
published checksums. Confirm that documentation links resolve to the released version.
