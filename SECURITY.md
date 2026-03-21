# Security Policy

## Supported Versions

| Package        | Version | Supported |
| -------------- | ------- | --------- |
| saika-lane     | 0.1.x   | Yes       |
| shared configs | 1.0.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue.**
2. Use [GitHub Security Advisories](https://github.com/sasakiuri/oss/security/advisories/new) to report the vulnerability privately.
3. Include a description of the vulnerability, steps to reproduce, and potential impact.

We will acknowledge your report within 7 days and provide a fix timeline within 30 days.

## Scope

This policy applies to the code in this repository. Third-party dependencies are managed via Dependabot.

## Disclosure Policy

We follow a coordinated disclosure process:

1. Reporter submits vulnerability via GitHub Security Advisories.
2. We acknowledge receipt within **7 days**.
3. We investigate and provide a fix timeline within **30 days**.
4. A fix is developed and tested in a private fork.
5. The fix is released and the advisory is published.
6. Public disclosure occurs **90 days** after the initial report, or when the fix is released, whichever comes first.

## Local Data Storage

Saika Lane stores all data locally on the user's machine. **Data is not encrypted at rest.** No data is sent to external servers unless MQTT is explicitly configured.

| File                                     | Format | Description                             |
| ---------------------------------------- | ------ | --------------------------------------- |
| `saika-lane.db`                          | SQLite | Session and shot records                |
| `saika-lane.json`                        | JSON   | Application settings (electron-store)   |
| `logs/combined.log`                      | Text   | Application log (rotated, max 5 MB × 5) |
| `logs/error.log`                         | Text   | Error log (rotated, max 5 MB × 5)       |
| `logs/score-discrepancy.csv`             | CSV    | Score calculation discrepancy log       |
| `ShotLog/<timestamp>_<discipline>.jsonl` | JSONL  | Raw shot data per session               |

**Storage location** (OS-specific user data directory):

| OS      | Path                                        |
| ------- | ------------------------------------------- |
| Windows | `%APPDATA%\Saika Lane\`                     |
| macOS   | `~/Library/Application Support/Saika Lane/` |
| Linux   | `~/.config/Saika Lane/`                     |

To remove all stored data, delete the directory above.
