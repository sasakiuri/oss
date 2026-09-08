/**
 * Board Window Configuration Types
 *
 * Shared between main process (WindowManager) and renderer (board screens).
 * Extracted from IpcPayloads.ts for standalone use.
 */

/**
 * Board window type.
 */
export type BoardType =
  | 'target-board'
  | 'ranking-board'
  | 'results-board'
  | 'final-board'
  | 'score-sheet-print'
  | 'results-list-print'
  | 'incident-report-print'
  | 'protest-print';

/**
 * Board window configuration.
 */
export interface BoardWindowConfig {
  type: BoardType;
  /** Target Board: visible Lane-number range. */
  laneRange?: { from: number; to: number };
  /** Results Board: championship ID. */
  competitionId?: string;
  /** Results Board: event ID. */
  eventId?: string;
  /** Score Sheet Print: Lane IDs to print. */
  laneIds?: string[];
  /** Score Sheet Print: championship name. */
  championshipName?: string;
  /** Score Sheet Print: venue. */
  venue?: string;
  /** Score Sheet Print: event name. */
  eventName?: string;
  /** Results List Print: relay number. */
  relayNumber?: number;
  /** Results List Print: round type. */
  round?: string;
  /** Results List Print: competition type such as AR60 or BR60S. */
  eventType?: string;
  /** Incident Report Print: report ID. */
  reportId?: string;
  /** Protest Print: protest or appeal case ID. */
  protestId?: string;
}
