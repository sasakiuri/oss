// SPDX-License-Identifier: MIT
/**
 * Phase — Competition phase value object
 *
 * A literal type representing the current phase in the competition state machine.
 *
 * - IDLE: Initial state (not started)
 * - ACTIVE: Shooting in progress (sighting or match)
 * - SERIES_COMPLETE: Series complete (waiting for next series or stage transition)
 * - SERIES_ENTERED: Entered next series (within same stage, waiting to start)
 * - STAGE_ENTERED: Entered new stage (waiting to start)
 * - FINISHED: Competition finished
 */
export type Phase = 'IDLE' | 'ACTIVE' | 'SERIES_COMPLETE' | 'SERIES_ENTERED' | 'STAGE_ENTERED' | 'FINISHED';

/**
 * Array of Phase values — for Zod schema generation
 */
export const PHASE_VALUES = [
  'IDLE',
  'ACTIVE',
  'SERIES_COMPLETE',
  'SERIES_ENTERED',
  'STAGE_ENTERED',
  'FINISHED',
] as const;
