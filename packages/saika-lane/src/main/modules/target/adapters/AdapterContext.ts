// SPDX-License-Identifier: MIT
import type { Discipline } from '@/main/modules/session/domain/Discipline';
import type { Mode } from '@/main/modules/session/domain/Mode';

/**
 * AdapterContext
 *
 * Context information passed to the adapter.
 * Session state is injected from outside to keep the adapter stateless.
 */
export interface AdapterContext {
  /** Current shot number (1-based) */
  shotNumber: number;
  /** Current discipline */
  discipline: Discipline;
  /** Current mode (sighting/match) */
  mode: Mode;
}
