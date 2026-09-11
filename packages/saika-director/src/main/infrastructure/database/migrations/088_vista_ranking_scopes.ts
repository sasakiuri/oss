// SPDX-License-Identifier: MIT
import { VistaSnapshotSchema, type VistaSnapshot } from '@sasakiuri/saika-protocol/Vista';
import type { Migration } from './Migration';

export const migration088VistaRankingScopes: Migration = {
  version: 88,
  name: 'vista_ranking_scopes',
  up(db) {
    const rows = db
      .prepare('SELECT id, snapshot_json, revision FROM vista_competition_sources WHERE snapshot_json IS NOT NULL')
      .all() as { id: string; snapshot_json: string; revision: number }[];
    const update = db.prepare('UPDATE vista_competition_sources SET snapshot_json = ?, revision = ? WHERE id = ?');
    for (const row of rows) {
      const snapshot = VistaSnapshotSchema.parse(JSON.parse(row.snapshot_json));
      const revision = Math.max(row.revision, snapshot.revision) + 1;
      const eventRanking = snapshot.ranking?.kind === 'competition' ? snapshot.ranking : null;
      // Older event snapshots retain corrected participant scores, but not enough
      // evidence to recreate their relay places. Never reuse event places as relay places.
      const ranking: VistaSnapshot['ranking'] = eventRanking
        ? {
            scope: `${snapshot.label} · current competition only`,
            kind: 'live',
            revision: `vista-scopes:${revision}`,
            state: 'UNVERIFIED',
            rows: snapshot.participants.map((participant) => ({
              id: participant.id,
              rank: null,
              name: participant.name ?? participant.laneName,
              affiliation: participant.affiliation,
              total: participant.total,
              classification: eventRanking.rows.find((result) => result.id === participant.id)?.classification ?? null,
            })),
          }
        : snapshot.ranking;
      const next = { ...VistaSnapshotSchema.parse({ ...snapshot, revision, ranking }), eventRanking };
      update.run(JSON.stringify(next), revision, row.id);
    }
  },
};
