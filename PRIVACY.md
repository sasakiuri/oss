# Privacy and Network Activity

Last updated: 2026-08-08

Saika Lane is a local-first desktop application. It does not intentionally implement analytics, advertising, user tracking, or crash-reporting services. Application data is not encrypted at rest.

## Automatic Update Checks

Packaged builds automatically check the `sasakiuri/oss` GitHub Releases repository for updates after the application window loads. Users can also start an update check from the settings screen. Development builds do not perform these checks.

When an update is available, Saika Lane automatically downloads it and installs it when the application exits. Update requests do not include the shot database, shot logs, application settings, or MQTT messages. GitHub nevertheless receives ordinary network request information, such as the requesting IP address, time, and request metadata, under GitHub's own privacy terms.

## MQTT

When MQTT is enabled and a broker is configured, Saika Lane connects to that user-selected broker and exchanges the configured lane status, command, session, and shot messages. The broker operator can receive and retain those messages according to the broker's configuration. Users are responsible for choosing a trusted broker, configuring access controls, and using `mqtts://` when transport encryption is required.

MQTT broker credentials are not accepted as part of the broker URL. Saika Lane does not send MQTT messages to the project maintainer unless the maintainer operates the broker selected by the user.

## Local Data

Saika Lane can store the following data below the operating system's application-data directory:

- `saika-lane.db`: session and shot records.
- `settings.json`: canonical application, device, and MQTT settings.
- `saika-lane.json`: an electron-store compatibility mirror plus connection history and competition state.
- `logs/combined.log` and `logs/error.log`: rotating diagnostic logs.
- `logs/score-discrepancy.csv`: score-calculation discrepancy records.
- `ShotLog/*.jsonl`: raw shot records for individual sessions.

The normal locations are `%APPDATA%\Saika Lane\` on Windows, `~/Library/Application Support/Saika Lane/` on macOS, and `~/.config/Saika Lane/` on Linux. Deleting that directory removes Saika Lane's locally stored data. Back up any records that must be retained before deletion.

## Security and Questions

Security vulnerabilities should be reported privately as described in [SECURITY.md](./SECURITY.md). General privacy questions can be raised through the repository's support channels without attaching shot records, log files, or other personal information to a public issue.
