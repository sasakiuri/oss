import type { Migration } from './Migration';

/** Keeps cross-event athlete identity and ISSF sanction history outside event-local result records. */
export const migration058AthleteIdentitiesAndSanctions: Migration = {
  version: 58,
  name: 'athlete_identities_and_sanctions',
  up(db) {
    db.exec(`
      CREATE TABLE athlete_identities (
        id TEXT PRIMARY KEY,
        championship_id TEXT NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
        display_name TEXT NOT NULL,
        issf_id TEXT,
        created_by TEXT NOT NULL,
        creation_statement TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK(length(trim(display_name)) > 0),
        CHECK(issf_id IS NULL OR (length(trim(issf_id)) > 0 AND issf_id = upper(trim(issf_id)))),
        CHECK(length(trim(created_by)) > 0),
        CHECK(length(trim(creation_statement)) > 0)
      );

      CREATE UNIQUE INDEX uq_athlete_identities_championship_issf_id
        ON athlete_identities(championship_id, upper(issf_id))
        WHERE issf_id IS NOT NULL;

      CREATE INDEX idx_athlete_identities_championship
        ON athlete_identities(championship_id, display_name, id);

      CREATE TABLE athlete_identity_link_entries (
        id TEXT PRIMARY KEY,
        athlete_identity_id TEXT NOT NULL REFERENCES athlete_identities(id) ON DELETE CASCADE,
        participant_id TEXT NOT NULL,
        event_id_snapshot TEXT NOT NULL,
        event_name_snapshot TEXT NOT NULL,
        player_name_snapshot TEXT NOT NULL,
        issf_id_snapshot TEXT,
        entry_type TEXT NOT NULL CHECK(entry_type IN ('LINKED', 'UNLINKED')),
        link_basis TEXT NOT NULL CHECK(link_basis IN ('ISSF_ID', 'MANUAL')),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        reverses_link_id TEXT REFERENCES athlete_identity_link_entries(id),
        CHECK(
          (entry_type = 'LINKED' AND reverses_link_id IS NULL)
          OR (entry_type = 'UNLINKED' AND reverses_link_id IS NOT NULL)
        ),
        CHECK(length(trim(event_id_snapshot)) > 0),
        CHECK(length(trim(event_name_snapshot)) > 0),
        CHECK(length(trim(player_name_snapshot)) > 0),
        CHECK(length(trim(statement)) > 0),
        CHECK(length(trim(official_name)) > 0)
      );

      CREATE INDEX idx_athlete_identity_links_participant
        ON athlete_identity_link_entries(participant_id, recorded_at, id);
      CREATE INDEX idx_athlete_identity_links_identity
        ON athlete_identity_link_entries(athlete_identity_id, recorded_at, id);
      CREATE UNIQUE INDEX uq_athlete_identity_link_single_reversal
        ON athlete_identity_link_entries(reverses_link_id)
        WHERE reverses_link_id IS NOT NULL;

      CREATE TRIGGER trg_athlete_identity_link_same_championship
      BEFORE INSERT ON athlete_identity_link_entries
      WHEN NEW.entry_type = 'LINKED'
        AND NOT EXISTS (
        SELECT 1
        FROM athlete_identities identity
        JOIN participants participant ON participant.id = NEW.participant_id
        JOIN events event ON event.id = participant.event_id
        WHERE identity.id = NEW.athlete_identity_id
          AND identity.championship_id = event.championship_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Athlete identity and participant must belong to the same Championship');
      END;

      CREATE TRIGGER trg_athlete_identity_link_issf_id_basis
      BEFORE INSERT ON athlete_identity_link_entries
      WHEN NEW.entry_type = 'LINKED'
        AND NEW.link_basis = 'ISSF_ID'
        AND NOT EXISTS (
          SELECT 1
          FROM athlete_identities identity
          JOIN participants participant ON participant.id = NEW.participant_id
          WHERE identity.id = NEW.athlete_identity_id
            AND identity.issf_id IS NOT NULL
            AND participant.issf_id IS NOT NULL
            AND upper(trim(identity.issf_id)) = upper(trim(participant.issf_id))
        )
      BEGIN
        SELECT RAISE(ABORT, 'ISSF ID identity links require matching ISSF IDs');
      END;

      CREATE TRIGGER trg_athlete_identity_link_snapshot_matches_entry
      BEFORE INSERT ON athlete_identity_link_entries
      WHEN NEW.entry_type = 'LINKED'
        AND NOT EXISTS (
          SELECT 1
          FROM participants participant
          JOIN events event ON event.id = participant.event_id
          WHERE participant.id = NEW.participant_id
            AND event.id = NEW.event_id_snapshot
            AND event.name = NEW.event_name_snapshot
            AND participant.player_name = NEW.player_name_snapshot
            AND participant.issf_id IS NEW.issf_id_snapshot
        )
      BEGIN
        SELECT RAISE(ABORT, 'Athlete identity link snapshot must match the current event entry');
      END;

      CREATE TRIGGER trg_athlete_identity_link_one_active_identity
      BEFORE INSERT ON athlete_identity_link_entries
      WHEN NEW.entry_type = 'LINKED'
        AND EXISTS (
          SELECT 1
          FROM athlete_identity_link_entries linked
          WHERE linked.participant_id = NEW.participant_id
            AND linked.entry_type = 'LINKED'
            AND NOT EXISTS (
              SELECT 1
              FROM athlete_identity_link_entries unlinked
              WHERE unlinked.entry_type = 'UNLINKED'
                AND unlinked.reverses_link_id = linked.id
            )
        )
      BEGIN
        SELECT RAISE(ABORT, 'Participant already has an active athlete identity link');
      END;

      CREATE TRIGGER trg_athlete_identity_unlink_matches_link
      BEFORE INSERT ON athlete_identity_link_entries
      WHEN NEW.entry_type = 'UNLINKED'
        AND NOT EXISTS (
          SELECT 1
          FROM athlete_identity_link_entries linked
          WHERE linked.id = NEW.reverses_link_id
            AND linked.entry_type = 'LINKED'
            AND linked.athlete_identity_id = NEW.athlete_identity_id
            AND linked.participant_id = NEW.participant_id
            AND linked.event_id_snapshot = NEW.event_id_snapshot
            AND linked.event_name_snapshot = NEW.event_name_snapshot
            AND linked.player_name_snapshot = NEW.player_name_snapshot
            AND linked.issf_id_snapshot IS NEW.issf_id_snapshot
            AND linked.link_basis = NEW.link_basis
        )
      BEGIN
        SELECT RAISE(ABORT, 'Athlete identity unlink must reverse its matching link');
      END;

      CREATE TABLE athlete_sanction_decisions (
        id TEXT PRIMARY KEY,
        athlete_identity_id TEXT NOT NULL REFERENCES athlete_identities(id) ON DELETE CASCADE,
        source_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        decision_type TEXT NOT NULL CHECK(decision_type IN ('IMPOSED', 'REVOKED')),
        classification_code TEXT NOT NULL CHECK(classification_code IN ('DSQ', 'DQB', 'AD_DSQ')),
        sanction_scope TEXT NOT NULL CHECK(sanction_scope IN ('EVENT', 'CHAMPIONSHIP')),
        authority_basis TEXT NOT NULL CHECK(
          authority_basis IN ('JURY_MAJORITY', 'POST_COMPETITION_CHECK', 'ANTI_DOPING_DECISION')
        ),
        authority_reference TEXT NOT NULL,
        rule_reference TEXT NOT NULL,
        incident_report_number TEXT,
        public_remark TEXT NOT NULL,
        internal_note TEXT,
        official_name TEXT NOT NULL,
        official_role TEXT NOT NULL CHECK(
          official_role IN ('JURY_MEMBER', 'EQUIPMENT_CONTROL_JURY', 'ANTI_DOPING_AUTHORITY')
        ),
        official_actor_id TEXT,
        authorization_mode TEXT NOT NULL CHECK(
          authorization_mode IN ('MANUAL_ATTESTATION', 'AUTHENTICATED_SESSION')
        ),
        decided_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        reverses_decision_id TEXT REFERENCES athlete_sanction_decisions(id),
        CHECK(
          (decision_type = 'IMPOSED' AND reverses_decision_id IS NULL)
          OR (decision_type = 'REVOKED' AND reverses_decision_id IS NOT NULL)
        ),
        CHECK(
          (classification_code = 'DSQ' AND sanction_scope = 'EVENT'
            AND authority_basis IN ('JURY_MAJORITY', 'POST_COMPETITION_CHECK'))
          OR (classification_code = 'DQB' AND sanction_scope = 'CHAMPIONSHIP'
            AND authority_basis = 'JURY_MAJORITY')
          OR (classification_code = 'AD_DSQ' AND sanction_scope = 'CHAMPIONSHIP'
            AND authority_basis = 'ANTI_DOPING_DECISION')
        ),
        CHECK(
          (authority_basis = 'JURY_MAJORITY' AND official_role = 'JURY_MEMBER')
          OR (authority_basis = 'POST_COMPETITION_CHECK' AND official_role = 'EQUIPMENT_CONTROL_JURY')
          OR (authority_basis = 'ANTI_DOPING_DECISION' AND official_role = 'ANTI_DOPING_AUTHORITY')
        ),
        CHECK(
          (authorization_mode = 'MANUAL_ATTESTATION' AND official_actor_id IS NULL)
          OR (authorization_mode = 'AUTHENTICATED_SESSION'
            AND official_actor_id IS NOT NULL AND length(trim(official_actor_id)) > 0)
        ),
        CHECK(length(trim(authority_reference)) > 0),
        CHECK(length(trim(rule_reference)) > 0),
        CHECK(length(trim(public_remark)) > 0),
        CHECK(length(trim(official_name)) > 0)
      );

      CREATE INDEX idx_athlete_sanctions_identity
        ON athlete_sanction_decisions(athlete_identity_id, decided_at, id);
      CREATE INDEX idx_athlete_sanctions_event
        ON athlete_sanction_decisions(source_event_id, decided_at, id);
      CREATE UNIQUE INDEX uq_athlete_sanction_single_revocation
        ON athlete_sanction_decisions(reverses_decision_id)
        WHERE reverses_decision_id IS NOT NULL;

      CREATE TRIGGER trg_athlete_sanction_same_championship
      BEFORE INSERT ON athlete_sanction_decisions
      WHEN NOT EXISTS (
        SELECT 1
        FROM athlete_identities identity
        JOIN events event ON event.id = NEW.source_event_id
        WHERE identity.id = NEW.athlete_identity_id
          AND identity.championship_id = event.championship_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Athlete sanction source event must belong to the identity Championship');
      END;

      CREATE TRIGGER trg_athlete_sanction_revocation_matches_decision
      BEFORE INSERT ON athlete_sanction_decisions
      WHEN NEW.decision_type = 'REVOKED'
        AND NOT EXISTS (
          SELECT 1
          FROM athlete_sanction_decisions imposed
          WHERE imposed.id = NEW.reverses_decision_id
            AND imposed.decision_type = 'IMPOSED'
            AND imposed.athlete_identity_id = NEW.athlete_identity_id
            AND imposed.source_event_id = NEW.source_event_id
            AND imposed.classification_code = NEW.classification_code
            AND imposed.sanction_scope = NEW.sanction_scope
        )
      BEGIN
        SELECT RAISE(ABORT, 'Athlete sanction revocation must match the imposed decision');
      END;

      CREATE TRIGGER trg_athlete_identities_no_update
      BEFORE UPDATE ON athlete_identities
      BEGIN
        SELECT RAISE(ABORT, 'Athlete identities are immutable');
      END;

      CREATE TRIGGER trg_athlete_identities_no_delete
      BEFORE DELETE ON athlete_identities
      BEGIN
        SELECT RAISE(ABORT, 'Athlete identities are append-only');
      END;

      CREATE TRIGGER trg_athlete_identity_links_no_update
      BEFORE UPDATE ON athlete_identity_link_entries
      BEGIN
        SELECT RAISE(ABORT, 'Athlete identity links are append-only');
      END;

      CREATE TRIGGER trg_athlete_identity_links_no_delete
      BEFORE DELETE ON athlete_identity_link_entries
      BEGIN
        SELECT RAISE(ABORT, 'Athlete identity links are append-only');
      END;

      CREATE TRIGGER trg_athlete_sanctions_no_update
      BEFORE UPDATE ON athlete_sanction_decisions
      BEGIN
        SELECT RAISE(ABORT, 'Athlete sanction decisions are append-only');
      END;

      CREATE TRIGGER trg_athlete_sanctions_no_delete
      BEFORE DELETE ON athlete_sanction_decisions
      BEGIN
        SELECT RAISE(ABORT, 'Athlete sanction decisions are append-only');
      END;

      CREATE TRIGGER trg_protect_linked_participant_issf_id
      BEFORE UPDATE OF issf_id ON participants
      WHEN NOT (OLD.issf_id IS NEW.issf_id)
        AND EXISTS (
          SELECT 1
          FROM athlete_identity_link_entries linked
          WHERE linked.participant_id = OLD.id
            AND linked.entry_type = 'LINKED'
            AND linked.link_basis = 'ISSF_ID'
            AND NOT EXISTS (
              SELECT 1 FROM athlete_identity_link_entries unlinked
              WHERE unlinked.entry_type = 'UNLINKED'
                AND unlinked.reverses_link_id = linked.id
            )
        )
      BEGIN
        SELECT RAISE(ABORT, 'Unlink the active ISSF ID athlete identity before changing the participant ISSF ID');
      END;

      CREATE TRIGGER trg_protect_athlete_sanction_event_delete
      BEFORE DELETE ON events
      WHEN EXISTS (
        SELECT 1 FROM athlete_sanction_decisions WHERE source_event_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Cannot delete an event with athlete sanction history');
      END;

      CREATE TRIGGER trg_protect_athlete_sanction_event_type
      BEFORE UPDATE OF event_type ON events
      WHEN OLD.event_type <> NEW.event_type
        AND EXISTS (
          SELECT 1 FROM athlete_sanction_decisions WHERE source_event_id = OLD.id
        )
      BEGIN
        SELECT RAISE(ABORT, 'Cannot change the type of an event with athlete sanction history');
      END;
    `);
  },
};
