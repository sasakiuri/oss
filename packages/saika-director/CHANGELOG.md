# Changelog

All notable changes to Saika Director are documented in this file.

## 0.1.0 - 2026-08-25

### Added

- Default progress-management workflow for `BR60S` and `BP60` qualification competitions, backed by MQTT lane control.
- Simultaneous, independently controlled competitions on disjoint Lane groups, including per-competition timers and BP/BR group selection.
- Embedded MQTT broker and external `mqtt://` / `mqtts://` broker support.
- Saika Lane discovery, athlete assignment, synchronized phase commands, acknowledgements, and live scoring state.
- Bulk application of tournament firing-point assignments by relay and Director firing-point number.
- Windows x64, macOS x64/arm64, and Linux x64 release packaging.
- Electron 43 supported runtime line and `better-sqlite3` 13 compatibility with current Chromium/V8 security updates.
- Unit, Electron E2E, accessibility, architecture, bundle-size, license-artifact, and coverage quality gates.

### Security

- Sandboxed Electron renderers, restrictive Content Security Policy, blocked external navigation, and single-instance locking.
- MQTT URLs reject embedded credentials and unsupported protocols.

### Fixed

- Native `better-sqlite3` binaries are rebuilt for each Electron target and restored for local Node.js development.
- MQTT configuration is saved only after a successful runtime transition and rolls back on failure.
- Graceful shutdown flushes lane state before closing SQLite, closes remaining board windows on application exit, and keeps macOS services alive while all windows are closed.
- Failed MQTT client and embedded broker startup attempts now clean up their sockets and resources.
- Invalid persisted settings are replaced with safe defaults so legacy configuration cannot prevent recovery.
- Tournament participants cannot be assigned to multiple relays or overwrite an existing result from another relay.
- Command acknowledgements are accepted only on the exact expected MQTT topic, and terminal acknowledgements cannot regress to `executing`.
- Result publication waits for fresh final Lane state and score snapshots instead of trusting a finish acknowledgement that may overtake broker delivery.
- The embedded broker persists retained MQTT messages in SQLite and restores them before accepting clients after a restart.
- Athlete assignments are locked during active competition and after result publication, while remaining editable for recoverable result-save failures.
- A deleted result event no longer traps its linked competition before the recoverable result-repair phase.
- Gracefully disconnected and offline Lanes no longer remain eligible for Director firing-point assignments or reserve a replacement Lane's number.
- MQTT result publication rejects Lane athletes who are not assigned to the selected championship relay.
- Lane aliases supplied for the current MQTT connection are reflected immediately in Director discovery and firing-point resolution.
- Failed Lane MQTT initialization closes its reconnecting client and publishes an offline rollback instead of leaving Director with a ghost connection.
- Final shoot-offs are indexed by event, validate every target before changing Lane state, reject duplicate or incomplete rankings, and return all target Lanes from `SHOOTOFF` after resolution.
- Lane assignment and final-result publication reject duplicate channels, Lanes, and athletes before changing state; final-result storage now enforces one row per event athlete.
- Partial MQTT result publication replaces only results from the same Director competition, preserving other simultaneous competitions in the relay.
- Finishing a linked competition before its match starts is treated as an explicit abandonment and cannot publish a zero-score championship result.
- Active competition timer deadlines are retained and restored after Director reconnects or restarts.
- Final Lane state and score snapshots are correlated to the finish command so delayed pre-finish scores cannot be saved.
- Concurrent commands for one MQTT competition are serialized, and membership changes across competitions cannot reserve the same Lane concurrently.
- Broker configuration, connection, and lifecycle transitions are serialized so overlapping changes cannot leave the runtime connected to a different broker than the saved configuration.
- Timer-bearing MQTT commands retain their intended deadline before broadcast, so retries cannot extend a timer when the post-ACK competition-state update fails.
- Retained Lane heartbeats expire after 150 seconds, so broker recovery cannot leave absent Lanes online or reserving firing-point numbers.
- MQTT result publication treats the retained final score as the authoritative shot detail, so pre-reset shot events cannot reappear when a reset acknowledgement is lost.
- A pending sighting deadline is discarded after every possibly affected Lane leaves, so replacement Lanes start with a fresh timer instead of an expired retry deadline.
- Expired competition timers are retried after acknowledgement or retained-state failures until their original deadline is durably cleared.
- Packaged applications ignore `VITE_DEV_SERVER_URL`, preventing environment configuration from replacing trusted renderer files with remote content that can access preload APIs.
- An old timer expiry is not broadcast while a replacement timer remains partly applied, preventing an extension or restart from ending successful Lanes at the superseded deadline.
- Broker transitions wait for in-flight competition operations, so completion and result-cleanup state cannot cross into a newly selected broker.
- Structurally inconsistent Lane score payloads are rejected before they can produce contradictory totals and tie-break details in tournament results.
- Published results take athlete names and affiliations from the tournament database instead of trusting echoed MQTT assignment text.
- Final scores must use the competition's configured scoring mode, and BP60 qualification metadata now correctly declares integer ring scoring.
- Manual timer restarts are rejected before a competition starts and after it completes, preventing retained timer state that no Lane can apply.
- Lane, live-ranking, and shoot-off IPC responses are structurally validated before reaching renderer code.
- Legacy result publication cannot replace confirmed results or results owned by an MQTT competition.
- Shoot-off creation returns its structured identifier through the validated IPC contract.
