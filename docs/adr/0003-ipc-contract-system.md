# ADR-0003: Shared IPC contracts

TypeScript types cannot validate values received across Electron processes.
Maintaining separate channel, preload and payload definitions also risks drift.
Lane and Director therefore share Zod contracts from which preload methods and
runtime validation are built.

This adds contract helpers to each IPC call, but keeps both ends on the same
message definition. Authorization still belongs to the main process; a valid
payload alone does not grant permission.

See [IPC and renderer state](../../ARCHITECTURE.md#ipc-and-renderer-state) for the
current implementation and extension requirements.
