// SPDX-License-Identifier: MIT
import { findEntry, type AppState, type ScreenConfig } from '../../shared/model';
import { selectedSlots, stateLabel, usesRankingRows } from '../viewModel';

import { StatusPill } from './StatusPill';

export function SourceDataStatus({ config, state }: { config: ScreenConfig; state: AppState }) {
  return (
    <section className="source-data-status" aria-label="Source data for requested settings">
      <h3>Data reception</h3>
      <p className="field-help">Last data received by this operator PC.</p>
      {!config.selections.length && <p className="muted">No content selected.</p>}
      {config.selections.map((selection, index) => {
        const source = state.sources.find((candidate) => candidate.id === selection.sourceId);
        const entry = findEntry(state.snapshots, selection);
        const resultRows = usesRankingRows(config, state.snapshots);
        const slots = selectedSlots(
          {
            ...config,
            selections: [resultRows ? { ...selection, participantIds: [] } : selection],
          },
          state.snapshots,
        );
        const issues =
          resultRows && entry?.snapshot.ranking?.kind === 'competition'
            ? []
            : slots.filter(({ participant }) =>
                participant ? participant.dataState !== 'live' || !participant.historyComplete : !resultRows,
              );
        const receipt = entry ? new Date(entry.receivedAt) : null;
        const dataState =
          entry?.state === 'live' && (Date.now() - entry.receivedAt > 5000 || Date.now() < entry.receivedAt)
            ? 'stale'
            : entry?.state;
        return (
          <article key={index} className="subject-data-status">
            <strong>
              {source?.catalog?.identity.name || selection.sourceId} ·{' '}
              {entry?.snapshot.label ||
                source?.catalog?.subjects.find((subject) => subject.id === selection.subjectId)?.label ||
                selection.subjectId}
            </strong>
            <StatusPill good={dataState === 'live' && !issues.length}>
              {dataState ? stateLabel[dataState] : 'Waiting for data'}
            </StatusPill>
            <p className="field-help">
              Last received on this PC:{' '}
              {receipt ? (
                <time dateTime={Number.isNaN(receipt.valueOf()) ? undefined : receipt.toISOString()}>
                  {receipt.toLocaleString('en-GB')}
                </time>
              ) : (
                'Never'
              )}
            </p>
            {!!issues.length && entry && (
              <ul className="subject-data-issues">
                {issues.map(({ key, participant, requestedId }) => (
                  <li key={key}>
                    {participant
                      ? `${participant.laneName} · ${participant.name || 'Unnamed athlete'}: ${[
                          ...(participant.dataState !== 'live' ? [stateLabel[participant.dataState]] : []),
                          ...(!participant.historyComplete ? ['Partial history'] : []),
                        ].join(' · ')}`
                      : `${requestedId || 'Participants'}: Selected target unavailable`}
                  </li>
                ))}
              </ul>
            )}
            {(entry?.error || (!entry && source?.error)) && (
              <p className="inline-error">{entry?.error || source?.error}</p>
            )}
          </article>
        );
      })}
    </section>
  );
}
