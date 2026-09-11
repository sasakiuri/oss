<!-- SPDX-License-Identifier: MIT -->

# ADR-0016: Independent Vista spectator application

- Status: Accepted for implementation
- Date: 2026-09-11
- Requirements: [Saika Vista](../../packages/saika-docs/vista/REQUIREMENTS.md)

## Decision

Vista is a separate Electron/React workspace, using the existing desktop toolchain. Each installation can run an operator window and one audience window per selected local monitor. An operator can pair other Vista installations and send each monitor its own versioned configuration. Rendering acknowledgements are independent from durable configuration application and data synchronization.

Lane and Director expose an opt-in, read-only display source. The portable Zod contracts live at `@sasakiuri/saika-protocol/Vista`; Node transport is a separate `vista-node` subpath, excluded from portable schemas and renderers. Existing competition MQTT commands and Electron IPC are not exposed on this interface.

## Data and authority

Sources publish catalogs and complete subject snapshots. Polling complete atomic snapshots avoids a separate snapshot/delta barrier and ensures a missing final shot is recovered even when no further shots arrive. Source identity, subject identity, reset generation, semantic revision and exact display definition stay associated. Reordered/conflicting revisions and definition replacement are rejected before persistence or rendering. Corrections replace a snapshot; they do not append duplicate shots or replay live-shot animation.

Lane binds current and preceding stage sessions and preserves source archives. Director provides its own live rankings, confirmed assignment/transfer graph, shot journal and atomic `ResultBoardSnapshotService` results. Director never labels unproven upstream history complete. Vista never calculates ranks, eliminates athletes or reconstructs official totals from target coordinates. Frozen targets and scoring definitions are part of each saved snapshot; adding other disciplines requires explicit source definition adapters and renderer capabilities.

Director catalogs current-competition standings and event results as separate subjects. Their ranking scope remains fixed after finish and restoration. Both views derive from one durable canonical snapshot, which retains both rankings for corrections and archives. Event results are unavailable until acquired; current-competition rows cannot stand in for an event result. Scheduled timers hold the full competition duration until the acknowledged start time, then advance without requiring another MQTT publication.

Acquisition proceeds independently per connected source and display PC. A failed request has a three-second deadline and does not hold all other peers behind it. No fixed product limit is imposed on sources or screens. Resource exhaustion and insufficient history remain observable; the 100-lane and 12-hour venue goals need measured acceptance on representative hardware.

## Security

An encrypted request/response protocol uses Node's AES-256-GCM, random nonces, request binding, expected stable source identity and a limited replay window. Pairing secrets are generated on the actual device, shown locally and exchanged out of band. Discovery advertises only unauthenticated candidates. The allowlisted source API has no competition mutations. Display APIs additionally require the registered controller ID and its persisted startup generation, with monotonically ordered frames and configuration revisions.

Audience windows use sandboxed preload bridges, context isolation, disabled Node integration, blocked navigation/new windows, a local content security policy and sender/frame-scoped IPC. Audience processes can retrieve only their own selected display state and acknowledge rendering; they cannot retrieve pairing secrets or invoke operator commands. Names are rendered as React text. No remotely supplied scripts, images or arbitrary templates execute.

## Persistence and failure

The application serializes mutations, validates documents, syncs a temporary file and atomically replaces the last saved document. In-memory publication follows successful persistence inside the same serialization queue. Unsupported saved versions are not overwritten. Restored snapshots begin as saved/unconfirmed, and a fresh transport connection alone cannot confer official publication or complete shooting history.

Document envelopes, authority and screen settings remain strict startup boundaries. Saved snapshot entries are validated independently, retaining invalid originals in the existing snapshot array while valid entries and settings remain usable. Newly validated copies recover their subjects without deleting unsupported or damaged originals. Received frames validate their envelope, owner and configuration before validating each subject separately; an invalid subject retains its preceding coherent version without blocking unrelated updates. Direct state updates use the same snapshot validation before persistence. Operator diagnostics identify the subject or, when identity is invalid, the entry number; audience renderers receive only validated snapshots.

The display PC persists received data and settings independently, so losing the operator, sources or LAN retains its last coherent selected display. Standby is part of the saved configuration. Monitor loss does not move content to another monitor. OS login startup uses native login items or XDG autostart; active audience windows request prevention of display sleep.

Broadcast outputs, external publication, custom rules, mixed teams, media playlists and multi-region composition remain separate extensions. They must not broaden the local read-only source contract or the current authority boundary implicitly.
