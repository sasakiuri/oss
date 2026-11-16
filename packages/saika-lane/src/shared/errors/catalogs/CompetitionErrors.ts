// SPDX-License-Identifier: MIT
import type { ErrorCatalogEntries } from '../ErrorCatalog';

export const COMPETITION_ERRORS = {
  ATHLETE_SIGHTING_REQUIRED: {
    message: 'Switch to Sighting before selecting Match.',
    userMessage: 'Switch to Sighting before selecting Match.',
    severity: 'warning',
  },
  SHOT_PROGRESS_FAILED: {
    message: 'The shot was saved, but competition progress failed. Contact a Range Officer.',
    userMessage: 'The shot was saved, but competition progress failed. Contact a Range Officer.',
    severity: 'error',
  },
  ATHLETE_TARGET_OFFICIAL_SIGHTING: {
    message: 'Official sighting is in progress',
    userMessage: 'Official sighting is in progress',
    severity: 'warning',
  },
  ATHLETE_TARGET_CONTEXT_CHANGED: {
    message: 'The competition series has changed',
    userMessage: 'The competition series has changed',
    severity: 'warning',
  },
  ATHLETE_TARGET_NOT_ACTIVE: {
    message: 'Athlete target mode requires an active series',
    userMessage: 'Athlete target mode requires an active series',
    severity: 'warning',
  },
  ATHLETE_TARGET_NOT_CONTROLLED: {
    message: 'This series does not allow athlete target mode selection',
    userMessage: 'This series does not allow athlete target mode selection',
    severity: 'warning',
  },
  ATHLETE_SIGHTING_CLOSED: {
    message: 'Sighting is unavailable after the first Match shot of this series',
    userMessage: 'Sighting is unavailable after the first Match shot of this series',
    severity: 'warning',
  },
  ATHLETE_MATCH_UNAVAILABLE: {
    message: 'This position change allows Sighting only',
    userMessage: 'This position change allows Sighting only',
    severity: 'warning',
  },
  UNKNOWN_COMPETITION_TYPE: {
    message: 'Unknown competition type: {{typeId}}',
    userMessage: 'Unknown competition type: {{typeId}}',
    severity: 'error',
  },
  COMPETITION_NOT_FOUND: {
    message: 'Competition state not found: {{id}}',
    userMessage: 'Competition state not found: {{id}}',
    severity: 'error',
  },
  INVALID_PHASE_TRANSITION: {
    message: 'Invalid phase transition: {{from}} → {{to}}',
    userMessage: 'Invalid phase transition: {{from}} → {{to}}',
    severity: 'error',
  },
  COMPETITION_ALREADY_FINISHED: {
    message: 'Competition is already finished',
    userMessage: 'Competition is already finished',
    severity: 'error',
  },
  SERIES_NOT_COMPLETE: {
    message: 'Series is not complete',
    userMessage: 'Series is not complete',
    severity: 'error',
  },
  INVALID_TIMER_DURATION: {
    message: 'Total seconds must be a non-negative integer: {{value}}',
    userMessage: 'Timer seconds must be a non-negative integer: {{value}}',
    severity: 'error',
  },
} satisfies ErrorCatalogEntries;
