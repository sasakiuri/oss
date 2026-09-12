# @sasakiuri/saika-updater

Private workspace package providing application update state and the shared
Electron update service for Lane, Director, and Vista.

- Import update schemas, DTO types, and error summaries from `@sasakiuri/saika-updater`.
- Import `UpdaterService` and its configuration types from `@sasakiuri/saika-updater/main` in the main process.
- Each application supplies its update metadata namespace and the checks required before installation.

Run the service and state tests from the repository root:

```sh
npm test -w @sasakiuri/saika-updater
```
