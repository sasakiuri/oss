// SPDX-License-Identifier: MIT
import type { ErrorDefinition } from '../ErrorCatalog';

export type CompetitionErrorCode =
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
