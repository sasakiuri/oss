import type Database from 'better-sqlite3';

import type {
  CompetitionEvidenceSection,
  CompetitionEvidenceSummary,
  EvidenceRecord,
  EvidenceScalar,
  ICompetitionEvidenceSource,
} from '../domain/CompetitionEvidenceBundle';

interface SectionQuery {
  readonly id: string;
  readonly sql: string;
}

const EVENT_IDS = `SELECT id FROM events WHERE championship_id = @championshipId`;
const RUNTIME_COMPETITION_IDS = `
  SELECT source_competition_id FROM results
    WHERE event_id IN (${EVENT_IDS}) AND source_competition_id IS NOT NULL
  UNION SELECT source_competition_id FROM scoring_decisions
    WHERE event_id IN (${EVENT_IDS}) AND source_competition_id IS NOT NULL
  UNION SELECT source_competition_id FROM mixed_team_final_results
    WHERE event_id IN (${EVENT_IDS})
  UNION SELECT competition_id FROM final_operation_runs
    WHERE event_id IN (${EVENT_IDS})
  UNION SELECT competition_id FROM final_recovery_cases
    WHERE event_id IN (${EVENT_IDS})
  UNION SELECT competition_id FROM irregular_shot_cases
    WHERE event_id IN (${EVENT_IDS})
`;

const DIRECT_EVENT_TABLES = [
  'participants',
  'firing_point_assignments',
  'results',
  'final_results',
  'mixed_team_final_results',
  'scoring_decisions',
  'result_verification_checks',
  'result_list_approval_entries',
  'result_publication_entries',
  'final_result_declarations',
  'final_placement_review_entries',
  'est_backup_verification_runs',
  'range_incident_reports',
  'start_list_versions',
  'final_recovery_cases',
  'irregular_shot_cases',
] as const;

const SECTION_QUERIES: readonly SectionQuery[] = [
  { id: 'championship', sql: 'SELECT * FROM championships WHERE id = @championshipId' },
  { id: 'events', sql: `SELECT * FROM events WHERE championship_id = @championshipId` },
  { id: 'est-inspection-plans', sql: 'SELECT * FROM est_inspection_plans WHERE championship_id = @championshipId' },
  {
    id: 'est-inspection-entries',
    sql: `SELECT * FROM est_inspection_entries
          WHERE plan_id IN (SELECT id FROM est_inspection_plans WHERE championship_id = @championshipId)`,
  },
  {
    id: 'championship-official-entries',
    sql: 'SELECT * FROM championship_official_entries WHERE championship_id = @championshipId',
  },
  { id: 'record-claims', sql: 'SELECT * FROM record_claims WHERE championship_id = @championshipId' },
  {
    id: 'record-claim-entries',
    sql: `SELECT * FROM record_claim_entries
          WHERE claim_id IN (SELECT id FROM record_claims WHERE championship_id = @championshipId)`,
  },
  { id: 'results-book-versions', sql: 'SELECT * FROM results_book_versions WHERE championship_id = @championshipId' },
  {
    id: 'results-book-signatures',
    sql: `SELECT * FROM results_book_signatures
          WHERE book_id IN (SELECT id FROM results_book_versions WHERE championship_id = @championshipId)`,
  },
  {
    id: 'results-book-finalizations',
    sql: `SELECT * FROM results_book_finalizations
          WHERE book_id IN (SELECT id FROM results_book_versions WHERE championship_id = @championshipId)`,
  },
  ...DIRECT_EVENT_TABLES.map((table) => ({
    id: table.replaceAll('_', '-'),
    sql: `SELECT * FROM ${table} WHERE event_id IN (${EVENT_IDS})`,
  })),
  {
    id: 'range-incident-report-entries',
    sql: `SELECT * FROM range_incident_report_entries
          WHERE report_id IN (SELECT id FROM range_incident_reports WHERE event_id IN (${EVENT_IDS}))`,
  },
  {
    id: 'start-list-entries',
    sql: `SELECT * FROM start_list_entries
          WHERE version_id IN (SELECT id FROM start_list_versions WHERE event_id IN (${EVENT_IDS}))`,
  },
  {
    id: 'irregular-shot-evidence',
    sql: `SELECT * FROM irregular_shot_evidence
          WHERE case_id IN (SELECT id FROM irregular_shot_cases WHERE event_id IN (${EVENT_IDS}))`,
  },
  {
    id: 'irregular-shot-case-entries',
    sql: `SELECT * FROM irregular_shot_case_entries
          WHERE case_id IN (SELECT id FROM irregular_shot_cases WHERE event_id IN (${EVENT_IDS}))`,
  },
  {
    id: 'final-operation-runs',
    sql: `SELECT * FROM final_operation_runs WHERE event_id IN (${EVENT_IDS})`,
  },
  {
    id: 'final-operation-entries',
    sql: `SELECT * FROM final_operation_entries
          WHERE run_id IN (SELECT id FROM final_operation_runs WHERE event_id IN (${EVENT_IDS}))`,
  },
  {
    id: 'final-operation-shoot-off-shots',
    sql: `SELECT * FROM final_operation_shoot_off_shots
          WHERE run_id IN (SELECT id FROM final_operation_runs WHERE event_id IN (${EVENT_IDS}))`,
  },
  {
    id: 'final-recovery-entries',
    sql: `SELECT * FROM final_recovery_entries
          WHERE case_id IN (SELECT id FROM final_recovery_cases WHERE event_id IN (${EVENT_IDS}))`,
  },
  {
    id: 'protest-cases',
    sql: `SELECT * FROM protest_cases WHERE scope_type = 'EVENT' AND scope_id IN (${EVENT_IDS})`,
  },
  {
    id: 'protest-entries',
    sql: `SELECT * FROM protest_entries WHERE case_id IN (
            SELECT id FROM protest_cases WHERE scope_type = 'EVENT' AND scope_id IN (${EVENT_IDS})
          )`,
  },
  {
    id: 'target-examination-cases',
    sql: `SELECT * FROM target_examination_cases WHERE id IN (
            SELECT case_id FROM target_examination_scope_links
            WHERE scope_type = 'EVENT' AND scope_id IN (${EVENT_IDS})
               OR scope_type = 'COMPETITION' AND scope_id IN (${RUNTIME_COMPETITION_IDS})
          )`,
  },
  {
    id: 'target-examination-scope-links',
    sql: `SELECT * FROM target_examination_scope_links WHERE case_id IN (
            SELECT case_id FROM target_examination_scope_links
            WHERE scope_type = 'EVENT' AND scope_id IN (${EVENT_IDS})
               OR scope_type = 'COMPETITION' AND scope_id IN (${RUNTIME_COMPETITION_IDS})
          )`,
  },
  {
    id: 'target-examination-evidence',
    sql: `SELECT * FROM target_examination_evidence WHERE case_id IN (
            SELECT case_id FROM target_examination_scope_links
            WHERE scope_type = 'EVENT' AND scope_id IN (${EVENT_IDS})
               OR scope_type = 'COMPETITION' AND scope_id IN (${RUNTIME_COMPETITION_IDS})
          )`,
  },
  {
    id: 'target-examination-entries',
    sql: `SELECT * FROM target_examination_entries WHERE case_id IN (
            SELECT case_id FROM target_examination_scope_links
            WHERE scope_type = 'EVENT' AND scope_id IN (${EVENT_IDS})
               OR scope_type = 'COMPETITION' AND scope_id IN (${RUNTIME_COMPETITION_IDS})
          )`,
  },
  {
    id: 'range-interruption-cases',
    sql: `SELECT * FROM range_interruption_cases WHERE id IN (
            SELECT case_id FROM range_interruption_scope_links
            WHERE scope_type = 'EVENT' AND scope_id IN (${EVENT_IDS})
               OR scope_type = 'COMPETITION' AND scope_id IN (${RUNTIME_COMPETITION_IDS})
          )`,
  },
  {
    id: 'range-interruption-scope-links',
    sql: `SELECT * FROM range_interruption_scope_links WHERE case_id IN (
            SELECT case_id FROM range_interruption_scope_links
            WHERE scope_type = 'EVENT' AND scope_id IN (${EVENT_IDS})
               OR scope_type = 'COMPETITION' AND scope_id IN (${RUNTIME_COMPETITION_IDS})
          )`,
  },
  {
    id: 'range-interruption-entries',
    sql: `SELECT * FROM range_interruption_entries WHERE case_id IN (
            SELECT case_id FROM range_interruption_scope_links
            WHERE scope_type = 'EVENT' AND scope_id IN (${EVENT_IDS})
               OR scope_type = 'COMPETITION' AND scope_id IN (${RUNTIME_COMPETITION_IDS})
          )`,
  },
  {
    id: 'adjudication-cases',
    sql: `SELECT * FROM adjudication_cases
          WHERE scope_type = 'EVENT' AND scope_id IN (${EVENT_IDS})
             OR scope_type = 'COMPETITION' AND scope_id IN (${RUNTIME_COMPETITION_IDS})`,
  },
  {
    id: 'adjudication-case-entries',
    sql: `SELECT * FROM adjudication_case_entries WHERE case_id IN (
            SELECT id FROM adjudication_cases
            WHERE scope_type = 'EVENT' AND scope_id IN (${EVENT_IDS})
               OR scope_type = 'COMPETITION' AND scope_id IN (${RUNTIME_COMPETITION_IDS})
          )`,
  },
  {
    id: 'adjudication-case-links',
    sql: `SELECT * FROM adjudication_case_links WHERE case_id IN (
            SELECT id FROM adjudication_cases
            WHERE scope_type = 'EVENT' AND scope_id IN (${EVENT_IDS})
               OR scope_type = 'COMPETITION' AND scope_id IN (${RUNTIME_COMPETITION_IDS})
          )`,
  },
  {
    id: 'mqtt-shot-observations',
    sql: `SELECT * FROM mqtt_competition_shot_observations
          WHERE competition_id IN (${RUNTIME_COMPETITION_IDS})`,
  },
  {
    id: 'mqtt-firing-command-boundaries',
    sql: `SELECT * FROM mqtt_firing_command_boundaries
          WHERE competition_id IN (${RUNTIME_COMPETITION_IDS})`,
  },
  {
    id: 'mqtt-firing-window-violations',
    sql: `SELECT * FROM mqtt_firing_window_violations
          WHERE competition_id IN (${RUNTIME_COMPETITION_IDS})`,
  },
  {
    id: 'mqtt-shot-observation-evidence',
    sql: `SELECT * FROM mqtt_shot_observation_evidence
          WHERE competition_id IN (${RUNTIME_COMPETITION_IDS})`,
  },
  {
    id: 'relay-readiness-entries',
    sql: `SELECT * FROM relay_readiness_entries
          WHERE competition_id IN (${RUNTIME_COMPETITION_IDS})`,
  },
  {
    id: 'range-interruption-command-batches',
    sql: `SELECT * FROM range_interruption_command_batches
          WHERE competition_id IN (${RUNTIME_COMPETITION_IDS})`,
  },
];

/** SQLite adapter kept outside the bundle builder so additional sources can replace or extend it. */
export class SqliteCompetitionEvidenceSource implements ICompetitionEvidenceSource {
  constructor(
    private readonly db: Database.Database,
    private readonly queries: readonly SectionQuery[] = SECTION_QUERIES,
  ) {}

  getChampionship(championshipId: string): CompetitionEvidenceSummary | null {
    const row = this.db.prepare('SELECT id, name, date, venue FROM championships WHERE id = ?').get(championshipId) as
      CompetitionEvidenceSummary | undefined;
    return row ?? null;
  }

  collect(championshipId: string): readonly CompetitionEvidenceSection[] {
    return this.queries.map((query) => {
      try {
        return {
          id: query.id,
          records: (this.db.prepare(query.sql).all({ championshipId }) as Array<Record<string, unknown>>).map(toRecord),
        };
      } catch (error) {
        throw new Error(`Failed to collect evidence section ${query.id}`, { cause: error });
      }
    });
  }
}

function toRecord(row: Record<string, unknown>): EvidenceRecord {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toScalar(value)]));
}

function toScalar(value: unknown): EvidenceScalar {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return `base64:${Buffer.from(value).toString('base64')}`;
  throw new Error(`Unsupported SQLite evidence value: ${typeof value}`);
}
