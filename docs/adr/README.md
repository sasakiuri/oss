<!-- SPDX-License-Identifier: MIT -->

# Design rationale

See the [architecture guide](../../ARCHITECTURE.md) for the current design.

## Shared IPC contracts

IPC messages need runtime validation because TypeScript types are erased.
Shared Zod contracts keep that validation consistent with preload types and channel names.

## Versioned competition rules

Lane and Director share scoring and course-of-fire rules while keeping their own
session and result models. Rule Packs avoid coupling those models. Content
fingerprints identify the rules used by saved records across application updates.

## MQTT command ordering

Competition, recovery and interruption commands modify the same Lane state and
must run in order. Safety STOP needs a separate queue to remain available while
another command waits for acknowledgement. Broker changes also wait for pending
controls, so a slow Lane can delay switching brokers.

## Persistent spectator displays

Complete snapshots allow offline display and recovery from missed updates, with
network and storage costs that grow with shot history. Rendering needs its own
acknowledgement: saving a setting cannot confirm that it appeared on a monitor.
