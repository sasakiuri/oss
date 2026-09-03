// SPDX-License-Identifier: MIT

/**
 * Opaque ownership tag for a timed acquisition whose shots must not enter the
 * active competition series. The timed-target engine preserves this tag but
 * does not interpret the owner's rules.
 */
export interface TimedTargetExecutionContext {
  readonly shotDisposition: 'ISOLATED';
  readonly owner: string;
  readonly referenceId: string;
}
