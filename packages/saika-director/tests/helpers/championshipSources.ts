// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import {
  SqliteEventSummaryReader,
  SqliteFiringPointAssignmentRepository,
  SqliteParticipantRepository,
} from '@/main/modules/championship';

/** The championship readers and repositories the composition passes to Start List and squadding services. */
export function championshipSources(database: Database.Database) {
  return {
    events: new SqliteEventSummaryReader(database),
    participants: new SqliteParticipantRepository(database),
    assignments: new SqliteFiringPointAssignmentRepository(database),
  };
}
