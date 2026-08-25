import type { ErrorEntry } from './ErrorCodes';

type ErrorCategory = Record<string, ErrorEntry>;
type Catalog = Record<string, ErrorCategory>;

export const ErrorCatalog = {
  COMPETITION: {
    ALREADY_STARTED: { code: 'COMP_001', message: 'Competition already started' },
    INVALID_PHASE_TRANSITION: { code: 'COMP_002', message: 'Invalid phase transition' },
    NO_LANES_CONNECTED: { code: 'COMP_003', message: 'No lanes connected' },
    LANE_NOT_FOUND: { code: 'COMP_004', message: 'Lane not found' },
  },
  CHANNEL: {
    OUT_OF_RANGE: { code: 'CH_001', message: 'Channel number out of range' },
  },
  SCORE: {
    OUT_OF_RANGE: { code: 'SCORE_001', message: 'Score out of range (0.0-10.9)' },
    NOT_FINITE: { code: 'SCORE_002', message: 'Score must be a finite number' },
  },
  TIMER: {
    INVALID_DURATION: { code: 'TIMER_001', message: 'Timer duration must be a non-negative integer' },
  },
  SHOT: {
    INDEX_OUT_OF_RANGE: { code: 'SHOT_001', message: 'Shot index out of range' },
    CANNOT_EDIT_IN_PHASE: { code: 'SHOT_002', message: 'Cannot edit shots in current phase' },
  },
  LANE: {
    NOT_FOUND: { code: 'LANE_000', message: 'Lane not found' },
    TARGET_NOT_EMPTY: { code: 'LANE_001', message: 'The destination Lane already has an athlete assigned' },
    SOURCE_NO_PLAYER: { code: 'LANE_002', message: 'The source Lane has no athlete assigned' },
    SAME_SOURCE_AND_TARGET: { code: 'LANE_003', message: 'Source and destination Lanes must be different' },
    DUPLICATE_CHANNEL_ASSIGNMENT: {
      code: 'LANE_004',
      message: 'A channel can be assigned only once per request',
    },
    DUPLICATE_PARTICIPANT_ASSIGNMENT: {
      code: 'LANE_005',
      message: 'An athlete cannot be assigned to multiple Lanes',
    },
  },
  SHOOTOFF: {
    INSUFFICIENT_PARTICIPANTS: {
      code: 'SHOOTOFF_001',
      message: 'A shoot-off requires at least two participants',
    },
    INVALID_RANK: { code: 'SHOOTOFF_002', message: 'Rank must be at least 1' },
    ALREADY_RESOLVED: { code: 'SHOOTOFF_003', message: 'The shoot-off has already been resolved' },
    INCOMPLETE_ROUND: {
      code: 'SHOOTOFF_004',
      message: 'Shots are missing for one or more participants',
    },
    NO_ROUNDS: { code: 'SHOOTOFF_005', message: 'No shoot-off rounds exist' },
    ALREADY_ELIMINATED: {
      code: 'SHOOTOFF_006',
      message: 'The athlete has already been eliminated',
    },
    EXTRA_PARTICIPANTS: {
      code: 'SHOOTOFF_007',
      message: 'The participant list contains an ineligible athlete',
    },
    DUPLICATE_PARTICIPANTS: {
      code: 'SHOOTOFF_008',
      message: 'The participant list contains duplicates',
    },
    NOT_RESOLVED: {
      code: 'SHOOTOFF_009',
      message: 'The shoot-off has not been resolved',
    },
    INVALID_RANKING: {
      code: 'SHOOTOFF_010',
      message: 'The ranking must contain every shoot-off participant exactly once',
    },
  },
  FINAL_RESULT: {
    ALREADY_FINISHED: {
      code: 'FINAL_001',
      message: 'Cannot add a shot to a completed result',
    },
    SHOT_NOT_REACHED: {
      code: 'FINAL_002',
      message: 'The specified shot number has not been reached',
    },
  },
  IPC: {
    INVALID_PAYLOAD: { code: 'IPC_001', message: 'Invalid IPC payload' },
    INVALID_RESPONSE: { code: 'IPC_002', message: 'Invalid IPC response' },
  },
  GENERAL: {
    UNKNOWN_ERROR: { code: 'UNKNOWN_ERROR', message: 'An unexpected error occurred' },
  },
  PARSE: {
    JSON_SYNTAX_ERROR: { code: 'PARSE_001', message: 'Invalid JSON syntax' },
    INVALID_FORMAT: { code: 'PARSE_002', message: 'Invalid data format' },
    SHOTS_ARRAY_EXPECTED: { code: 'PARSE_003', message: 'Shot data must be an array of numbers' },
    INVALID_NUMBER: { code: 'PARSE_004', message: 'The data contains an invalid number' },
  },
  DATA: {
    NOT_FOUND: { code: 'DATA_001', message: 'Data not found' },
    CORRUPTED: { code: 'DATA_002', message: 'Data is corrupted' },
  },
} as const satisfies Catalog;
