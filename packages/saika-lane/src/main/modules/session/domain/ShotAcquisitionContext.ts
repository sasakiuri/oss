// SPDX-License-Identifier: MIT

/**
 * Transient ownership metadata for a shot acquired outside the ordinary
 * competition series. It is carried by the command/event pipeline while the
 * durable shot and each owning workflow keep their own independent records.
 */
export interface ShotAcquisitionContext {
  readonly shotDisposition: 'ISOLATED';
  readonly owner: string;
  readonly referenceId: string;
}
