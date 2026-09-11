<!-- SPDX-License-Identifier: MIT -->

# ADR-0016: Persistent spectator displays

Audience screens must keep a selected competition after the source disconnects
and recover a missed final update even if no more shots arrive. Vista therefore
runs separately, saves complete snapshots and polls an optional display API.
Scores, ranks and publication status come from Lane or Director.

Complete snapshots avoid coordinating an initial snapshot with later deltas, but
network and storage costs grow with the history. Display PCs save their own data
and settings so they can keep displaying while offline. Configuration, data
synchronization and rendering acknowledgements are separate because saving a
setting does not prove that a monitor displayed it.

See [Vista display data](../../ARCHITECTURE.md#vista-display-data) for persistence
and authority checks. The [venue test](../../packages/saika-docs/vista/REQUIREMENTS.md#会場試験)
with 100 lanes over 12 hours remains pending.
