# Architecture decisions

These notes explain a few lasting design choices. The
[architecture guide](../../ARCHITECTURE.md) describes the current implementation,
data flow and maintenance requirements.

- [Shared IPC contracts](0003-ipc-contract-system.md)
- [Versioned competition rules](0004-versioned-rule-packs.md)
- [MQTT command ordering](0006-director-mqtt-application-boundaries.md)
- [Persistent spectator displays](0016-vista-display-architecture.md)

Add a record only when a significant choice or tradeoff needs an explanation for
future maintenance. Keep current specifications in the guides; routine fixes and
implementation changes belong in commits and pull requests.
