/** ISSF round types. */
export type Round = 'Elimination' | 'Qualification' | 'Final' | 'Individual';

/** Extensible competition type identifier (for example AR60 or BR60S). */
export type EventType = string;

/**
 * Unified competition phase.
 *
 * Represents qualification and final rounds with one state machine.
 */
export type LanePhase =
  | 'IDLE' // Initial state.
  | 'ACTIVE' // Timer running and shots being recorded.
  | 'SHOT_COMPLETE' // Shot mode: waiting to start the next shot.
  | 'SERIES_COMPLETE' // Series complete; waiting for the next action.
  | 'STAGE_ENTERED' // New stage entered; waiting for Match.
  | 'SHOOTOFF' // Resolving a final-round tie.
  | 'FINISHED'; // Competition complete.
