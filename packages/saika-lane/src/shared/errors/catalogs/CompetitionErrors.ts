// SPDX-License-Identifier: MIT
import type { ErrorDefinition } from '../ErrorCatalog';

export type CompetitionErrorCode =
  | 'ATHLETE_TARGET_OFFICIAL_SIGHTING'
  | 'ATHLETE_TARGET_CONTEXT_CHANGED'
  | 'ATHLETE_TARGET_NOT_ACTIVE'
  | 'ATHLETE_TARGET_NOT_CONTROLLED'
  | 'ATHLETE_SIGHTING_CLOSED'
  | 'ATHLETE_MATCH_UNAVAILABLE'
  | 'UNKNOWN_COMPETITION_TYPE'
  | 'COMPETITION_NOT_FOUND'
  | 'INVALID_PHASE_TRANSITION'
  | 'COMPETITION_ALREADY_FINISHED'
  | 'NO_MORE_STAGES'
  | 'SERIES_NOT_COMPLETE'
  | 'SHOT_NOT_ACCEPTED'
  | 'INVALID_TIMER_DURATION';

export const COMPETITION_ERRORS: ReadonlyArray<[CompetitionErrorCode, ErrorDefinition]> = [
  [
    'ATHLETE_TARGET_OFFICIAL_SIGHTING',
    {
      code: 'ATHLETE_TARGET_OFFICIAL_SIGHTING',
      message: 'Official sighting is in progress',
      userMessage: 'Official sighting is in progress',
      severity: 'warning',
    },
  ],
  [
    'ATHLETE_TARGET_CONTEXT_CHANGED',
    {
      code: 'ATHLETE_TARGET_CONTEXT_CHANGED',
      message: 'The competition series has changed',
      userMessage: 'The competition series has changed',
      severity: 'warning',
    },
  ],
  [
    'ATHLETE_TARGET_NOT_ACTIVE',
    {
      code: 'ATHLETE_TARGET_NOT_ACTIVE',
      message: 'Athlete target mode requires an active series',
      userMessage: 'Athlete target mode requires an active series',
      severity: 'warning',
    },
  ],
  [
    'ATHLETE_TARGET_NOT_CONTROLLED',
    {
      code: 'ATHLETE_TARGET_NOT_CONTROLLED',
      message: 'This series does not allow athlete target mode selection',
      userMessage: 'This series does not allow athlete target mode selection',
      severity: 'warning',
    },
  ],
  [
    'ATHLETE_SIGHTING_CLOSED',
    {
      code: 'ATHLETE_SIGHTING_CLOSED',
      message: 'Sighting is unavailable after the first Match shot of this series',
      userMessage: 'Sighting is unavailable after the first Match shot of this series',
      severity: 'warning',
    },
  ],
  [
    'ATHLETE_MATCH_UNAVAILABLE',
    {
      code: 'ATHLETE_MATCH_UNAVAILABLE',
      message: 'This position change allows Sighting only',
      userMessage: 'This position change allows Sighting only',
      severity: 'warning',
    },
  ],

  [
    'UNKNOWN_COMPETITION_TYPE',
    {
      code: 'UNKNOWN_COMPETITION_TYPE',
      message: 'Unknown competition type: {{typeId}}',
      userMessage: 'Unknown competition type: {{typeId}}',
      severity: 'error',
    },
  ],
  [
    'COMPETITION_NOT_FOUND',
    {
      code: 'COMPETITION_NOT_FOUND',
      message: 'Competition state not found: {{id}}',
      userMessage: 'Competition state not found: {{id}}',
      severity: 'error',
    },
  ],
  [
    'INVALID_PHASE_TRANSITION',
    {
      code: 'INVALID_PHASE_TRANSITION',
      message: 'Invalid phase transition: {{from}} → {{to}}',
      userMessage: 'Invalid phase transition: {{from}} → {{to}}',
      severity: 'error',
    },
  ],
  [
    'COMPETITION_ALREADY_FINISHED',
    {
      code: 'COMPETITION_ALREADY_FINISHED',
      message: 'Competition is already finished',
      userMessage: 'Competition is already finished',
      severity: 'error',
    },
  ],
  [
    'NO_MORE_STAGES',
    {
      code: 'NO_MORE_STAGES',
      message: 'No more stages available',
      userMessage: 'No more stages available',
      severity: 'error',
    },
  ],
  [
    'SERIES_NOT_COMPLETE',
    {
      code: 'SERIES_NOT_COMPLETE',
      message: 'Series is not complete',
      userMessage: 'Series is not complete',
      severity: 'error',
    },
  ],
  [
    'SHOT_NOT_ACCEPTED',
    {
      code: 'SHOT_NOT_ACCEPTED',
      message: 'Shot not accepted (phase: {{phase}})',
      userMessage: 'Shot not accepted (phase: {{phase}})',
      severity: 'warning',
    },
  ],
  [
    'INVALID_TIMER_DURATION',
    {
      code: 'INVALID_TIMER_DURATION',
      message: 'Total seconds must be a non-negative integer: {{value}}',
      userMessage: 'Timer seconds must be a non-negative integer: {{value}}',
      severity: 'error',
    },
  ],
];
