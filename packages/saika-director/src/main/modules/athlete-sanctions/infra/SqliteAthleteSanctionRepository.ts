import type Database from 'better-sqlite3';

import { AthleteIdentity } from '../domain/AthleteIdentity';
import {
  AthleteIdentityLinkEntry,
  type AthleteIdentityLinkBasis,
  type AthleteIdentityLinkEntryType,
} from '../domain/AthleteIdentityLink';
import type { IAthleteSanctionRepository } from '../domain/IAthleteSanctionRepository';
import {
  SanctionDecision,
  type SanctionAuthorityBasis,
  type SanctionAuthorizationMode,
  type SanctionClassificationCode,
  type SanctionDecisionType,
  type SanctionOfficialRole,
  type SanctionScope,
} from '../domain/SanctionDecision';

interface IdentityRow {
  id: string;
  championship_id: string;
  display_name: string;
  issf_id: string | null;
  created_by: string;
  creation_statement: string;
  created_at: string;
}

interface LinkRow {
  id: string;
  athlete_identity_id: string;
  participant_id: string;
  event_id_snapshot: string;
  event_name_snapshot: string;
  player_name_snapshot: string;
  issf_id_snapshot: string | null;
  entry_type: AthleteIdentityLinkEntryType;
  link_basis: AthleteIdentityLinkBasis;
  statement: string;
  official_name: string;
  recorded_at: string;
  reverses_link_id: string | null;
}

interface SanctionRow {
  id: string;
  athlete_identity_id: string;
  source_event_id: string;
  decision_type: SanctionDecisionType;
  classification_code: SanctionClassificationCode;
  sanction_scope: SanctionScope;
  authority_basis: SanctionAuthorityBasis;
  authority_reference: string;
  rule_reference: string;
  incident_report_number: string | null;
  public_remark: string;
  internal_note: string | null;
  official_name: string;
  official_role: SanctionOfficialRole;
  official_actor_id: string | null;
  authorization_mode: SanctionAuthorizationMode;
  decided_at: string;
  recorded_at: string;
  reverses_decision_id: string | null;
}

export class SqliteAthleteSanctionRepository implements IAthleteSanctionRepository {
  constructor(private readonly database: Database.Database) {}

  appendIdentity(identity: AthleteIdentity): void {
    this.database
      .prepare(
        `INSERT INTO athlete_identities (
          id, championship_id, display_name, issf_id, created_by, creation_statement, created_at
        ) VALUES (@id, @championshipId, @displayName, @issfId, @createdBy, @creationStatement, @createdAt)`,
      )
      .run({ ...identity, createdAt: identity.createdAt.toISOString() });
  }

  findIdentityById(id: string): AthleteIdentity | null {
    const row = this.database.prepare('SELECT * FROM athlete_identities WHERE id = ?').get(id) as
      IdentityRow | undefined;
    return row ? toIdentity(row) : null;
  }

  findIdentitiesByChampionship(championshipId: string): AthleteIdentity[] {
    return (
      this.database
        .prepare('SELECT * FROM athlete_identities WHERE championship_id = ? ORDER BY display_name, id')
        .all(championshipId) as IdentityRow[]
    ).map(toIdentity);
  }

  appendLinkEntry(entry: AthleteIdentityLinkEntry): void {
    this.database
      .prepare(
        `INSERT INTO athlete_identity_link_entries (
          id, athlete_identity_id, participant_id, entry_type, link_basis,
          event_id_snapshot, event_name_snapshot, player_name_snapshot, issf_id_snapshot,
          statement, official_name, recorded_at, reverses_link_id
        ) VALUES (
          @id, @athleteIdentityId, @participantId, @entryType, @linkBasis,
          @eventIdSnapshot, @eventNameSnapshot, @playerNameSnapshot, @issfIdSnapshot,
          @statement, @officialName, @recordedAt, @reversesLinkId
        )`,
      )
      .run({ ...entry, recordedAt: entry.recordedAt.toISOString() });
  }

  findLinkEntryById(id: string): AthleteIdentityLinkEntry | null {
    const row = this.database.prepare('SELECT * FROM athlete_identity_link_entries WHERE id = ?').get(id) as
      LinkRow | undefined;
    return row ? toLink(row) : null;
  }

  findLinkEntriesByChampionship(championshipId: string): AthleteIdentityLinkEntry[] {
    return (
      this.database
        .prepare(
          `SELECT link.*
           FROM athlete_identity_link_entries link
           JOIN athlete_identities identity ON identity.id = link.athlete_identity_id
           WHERE identity.championship_id = ?
           ORDER BY link.recorded_at, link.id`,
        )
        .all(championshipId) as LinkRow[]
    ).map(toLink);
  }

  appendDecision(decision: SanctionDecision): void {
    this.database
      .prepare(
        `INSERT INTO athlete_sanction_decisions (
          id, athlete_identity_id, source_event_id, decision_type, classification_code,
          sanction_scope, authority_basis, authority_reference, rule_reference,
          incident_report_number, public_remark, internal_note, official_name,
          official_role, official_actor_id, authorization_mode, decided_at,
          recorded_at, reverses_decision_id
        ) VALUES (
          @id, @athleteIdentityId, @sourceEventId, @decisionType, @classificationCode,
          @scope, @authorityBasis, @authorityReference, @ruleReference,
          @incidentReportNumber, @publicRemark, @internalNote, @officialName,
          @officialRole, @officialActorId, @authorizationMode, @decidedAt,
          @recordedAt, @reversesDecisionId
        )`,
      )
      .run({
        id: decision.id,
        athleteIdentityId: decision.athleteIdentityId,
        sourceEventId: decision.sourceEventId,
        decisionType: decision.decisionType,
        classificationCode: decision.classificationCode,
        scope: decision.scope,
        authorityBasis: decision.authorization.basis,
        authorityReference: decision.authorization.authorityReference,
        ruleReference: decision.ruleReference,
        incidentReportNumber: decision.incidentReportNumber,
        publicRemark: decision.publicRemark,
        internalNote: decision.internalNote,
        officialName: decision.authorization.officialName,
        officialRole: decision.authorization.officialRole,
        officialActorId: decision.authorization.officialActorId,
        authorizationMode: decision.authorization.mode,
        decidedAt: decision.decidedAt.toISOString(),
        recordedAt: decision.recordedAt.toISOString(),
        reversesDecisionId: decision.reversesDecisionId,
      });
  }

  findDecisionById(id: string): SanctionDecision | null {
    const row = this.database.prepare('SELECT * FROM athlete_sanction_decisions WHERE id = ?').get(id) as
      SanctionRow | undefined;
    return row ? toSanction(row) : null;
  }

  findDecisionsByChampionship(championshipId: string): SanctionDecision[] {
    return (
      this.database
        .prepare(
          `SELECT decision.*
           FROM athlete_sanction_decisions decision
           JOIN athlete_identities identity ON identity.id = decision.athlete_identity_id
           WHERE identity.championship_id = ?
           ORDER BY decision.decided_at, decision.id`,
        )
        .all(championshipId) as SanctionRow[]
    ).map(toSanction);
  }

  executeInTransaction<T>(operation: () => T): T {
    return this.database.transaction(operation)();
  }
}

function toIdentity(row: IdentityRow): AthleteIdentity {
  return AthleteIdentity.reconstruct({
    id: row.id,
    championshipId: row.championship_id,
    displayName: row.display_name,
    issfId: row.issf_id,
    createdBy: row.created_by,
    creationStatement: row.creation_statement,
    createdAt: new Date(row.created_at),
  });
}

function toLink(row: LinkRow): AthleteIdentityLinkEntry {
  return AthleteIdentityLinkEntry.reconstruct({
    id: row.id,
    athleteIdentityId: row.athlete_identity_id,
    participantId: row.participant_id,
    eventIdSnapshot: row.event_id_snapshot,
    eventNameSnapshot: row.event_name_snapshot,
    playerNameSnapshot: row.player_name_snapshot,
    issfIdSnapshot: row.issf_id_snapshot,
    entryType: row.entry_type,
    linkBasis: row.link_basis,
    statement: row.statement,
    officialName: row.official_name,
    recordedAt: new Date(row.recorded_at),
    reversesLinkId: row.reverses_link_id,
  });
}

function toSanction(row: SanctionRow): SanctionDecision {
  return SanctionDecision.reconstruct({
    id: row.id,
    athleteIdentityId: row.athlete_identity_id,
    sourceEventId: row.source_event_id,
    decisionType: row.decision_type,
    classificationCode: row.classification_code,
    scope: row.sanction_scope,
    authorization: {
      basis: row.authority_basis,
      authorityReference: row.authority_reference,
      officialName: row.official_name,
      officialRole: row.official_role,
      officialActorId: row.official_actor_id,
      mode: row.authorization_mode,
    },
    ruleReference: row.rule_reference,
    incidentReportNumber: row.incident_report_number,
    publicRemark: row.public_remark,
    internalNote: row.internal_note,
    decidedAt: new Date(row.decided_at),
    recordedAt: new Date(row.recorded_at),
    reversesDecisionId: row.reverses_decision_id,
  });
}
