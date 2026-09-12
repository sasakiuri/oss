# Release Checks

Run `bash scripts/pre-release-check.sh` and review its output alongside CI.
Record the tested version, environment, and unresolved failures before release.
The checker requires README and LICENSE files for directories with a package
manifest. Private configuration packages are allowed; public configuration
packages must declare public access. Suite versions must match, while shared
packages are versioned independently. Run `npm run test:pre-release` when changing
these checks.

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
- [ ] Application updates are tested from the preceding installed version, including cancelled restart, interrupted download, and installation failure.

## Distribution

- [ ] CI, dependency, secret, and license checks pass; packaged files contain the required notices.
- [ ] Artifacts exclude local files, credentials, test data, and debug output.
- [ ] The release includes installers, checksums, update metadata, and documentation for the same version.
- [ ] Publication credentials and repository access are configured for the intended packages and workflows.
- [ ] Contributions and bundled assets have the required distribution rights.

After publication, verify installer downloads and update metadata against the
published checksums. Confirm that documentation links resolve to the released version.

## Update distribution

The desktop applications share one release. Lane uses `latest*.yml` (or its
prerelease channel); Director and Vista use `director-*.yml` and `vista-*.yml`.
Keep these metadata files, referenced installers, macOS ZIP archives, and blockmaps
in the release. Run `npm run test:release-metadata` after changing packaging.

macOS releases can be built without a signing certificate; these builds require
manual updates from the DMG or ZIP. For signed releases, optionally configure
`MACOS_CSC_LINK` (the exported Developer ID Application certificate) and
`MACOS_CSC_KEY_PASSWORD` in repository secrets. The release workflow enables
identity detection when the certificate is provided. Automatic macOS updates
require a consistent signing identity across versions; an unsigned installation
must be replaced manually. Notarization is not configured in the release workflow.
Verify signing, first launch, and the applicable update path on macOS before release. See the
[Electron update requirements](https://www.electronjs.org/docs/latest/api/auto-updater#macos).
