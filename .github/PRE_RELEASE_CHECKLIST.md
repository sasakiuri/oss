# Pre-Release Manual Checklist

> Copy this checklist into the release PR description and check off each item.

> Items marked with (auto) are also checked by `scripts/pre-release-check.sh`. Review the automated results before manually verifying.

## Community & Governance

- [ ] CODE_OF_CONDUCT.md reporting channel is appropriate for public use
- [ ] CONTRIBUTING.md branch strategy matches actual practice
- [ ] CONTRIBUTING.md development setup instructions are accurate and tested
- [ ] CODEOWNERS file is accurate
- [ ] (auto) CODE_OF_CONDUCT.md reporting email is a real contact address (not noreply)

## Documentation Accuracy

- [ ] (auto) README.md exists at monorepo root
- [ ] README.md installation/usage instructions are accurate
- [ ] README.md badges and links point to correct URLs
- [ ] (auto) CHANGELOG.md is up-to-date with all changes since last release
- [ ] (auto) SECURITY.md supported versions table matches actual released versions
- [ ] (auto) Package-level READMEs exist and are accurate
- [ ] saika-lane README.md has no remaining Japanese text in English sections
- [ ] Windows build instructions in saika-lane README match actual script parameters

## Distribution & Publishing

- [ ] Publishing strategy decided and documented (npm for shared configs, GitHub Releases for saika-lane)
- [ ] npm access tokens configured (if publishing shared configs)
- [ ] npm Trusted Publishers (OIDC) configured — eliminates long-lived npm tokens ([npm docs](https://docs.npmjs.com/generating-provenance-statements#publishing-packages-with-provenance-via-github-actions))
- [ ] (auto) Changeset access field matches publishing intent (`public` vs `restricted`)
- [ ] Changeset files present for all unreleased changes
- [ ] Version bump strategy confirmed (major/minor/patch)
- [ ] (auto) publish.yml workflow trigger matches documented activation status
- [ ] (auto) All packages have `private: true` set correctly
- [ ] (auto) .npmrc has no private registry URLs
- [ ] (auto) License field consistent across all packages
- [ ] (auto) LICENSE file exists in each package

## GitHub Repository Settings

- [ ] Branch protection rules configured on default branch (`1.x`) — run `scripts/setup-branch-protection.sh`
- [ ] Required status checks enabled: `CI Required`, `validate`, `dependency-review`, `Analyze (javascript-typescript)`, `gitleaks`
- [ ] Merge strategy configured (squash-merge only recommended)
- [ ] Auto-delete head branches enabled
- [ ] Dependabot alerts and security updates enabled
- [ ] Secret scanning and push protection enabled
- [ ] Repository description, homepage URL, and topics set
- [ ] Social preview image set
- [ ] GitHub Discussions enabled (optional)
- [ ] (auto) GitHub Actions pinned to full commit SHAs

## Electron App (saika-lane)

- [ ] Windows build tested and verified (`scripts/build-win.ps1`)
- [ ] Application launches and basic functionality works
- [ ] Serial port connection works with target hardware (if available)
- [ ] (auto) All UI translations are complete (no Japanese text in `packages/saika-lane/src/`)
- [ ] Test data and debug artifacts removed from production build
- [ ] `jp.nilay.saika.lane` app ID reviewed for organizational information disclosure

## Internationalization

- [ ] (auto) `packages/saika-lane/src/` — no Japanese text in .ts/.tsx/.css files (tests excluded)
- [ ] `tests/` — all test files translated
- [ ] `packages/saika-lane/README.md` — no remaining Japanese text in English sections

## Security Final Review

- [ ] (auto) No hardcoded secrets in source files
- [ ] (auto) No internal URLs or private paths in source files
- [ ] (auto) No personal email addresses leaked in source files
- [ ] (auto) npm audit shows no high/critical vulnerabilities
- [ ] (auto) Electron security settings (nodeIntegration: false, contextIsolation: true, sandbox: true)
- [ ] (auto) MQTT broker URL does not accept credentials in userinfo (mqtt://user:pass@host format)
- [ ] (auto) Gitleaks reports no secrets in git history
- [ ] (auto) OSV Scanner reports no known vulnerabilities
- [ ] (auto) THIRD-PARTY-LICENSES.txt is up-to-date (`npm run license-report:check`)
- [ ] (release CI) Packaged app contains the project LICENSE and a license entry for every bundled npm dependency
- [ ] (auto) Git history author emails use GitHub noreply addresses
- [ ] (auto) No files tracked that should be gitignored (CLAUDE.md, .claude/, .env, etc.)
- [ ] Electron Content Security Policy is appropriately restrictive

## Legal Review

- [ ] Serial protocol implementations (Kohto/SIUS/Meyton/DISAG) do not violate NDAs or proprietary agreements
- [ ] `jp.nilay.saika.lane` app ID does not disclose private organizational affiliation

## CI Quality Gates (auto)

- [ ] (auto) TypeScript compiles without errors
- [ ] (auto) ESLint passes
- [ ] (auto) Build succeeds
- [ ] (auto) Unit tests pass
- [ ] (auto) Architecture constraints pass (dependency-cruiser)
- [ ] (auto) License compatibility check passes
- [ ] (auto) Spell check passes
- [ ] (auto) No unused exports (knip)
- [ ] (auto) Bundle size within limits
- [ ] (auto) Dependency versions synced (syncpack)
- [ ] (auto) Dependency license compatibility verified (not just repo license recognition)

## Metadata Consistency (auto)

- [ ] (auto) Shared config package versions are consistent
- [ ] (auto) Author field is consistent across packages

## Post-Publication

- [ ] SUPPORT.md created
- [ ] GOVERNANCE.md or MAINTAINERS.md created
- [ ] First-time external contributor PR approval required
- [ ] GitHub Releases page has proper release notes
