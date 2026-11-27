// SPDX-License-Identifier: MIT
import { findEntry, type AppState, type Selection, type SourceView } from '../../shared/model';
import { stateLabel } from '../viewModel';

import type { Run } from './types';

export function SelectionEditor({
  selection,
  onChange,
  onRemove,
  sources,
  state,
  index,
  inspect,
  resultRows,
}: {
  selection: Selection;
  onChange: (s: Selection) => void;
  onRemove: () => void;
  sources: SourceView[];
  state: AppState;
  index: number;
  inspect: Run;
  resultRows: boolean;
}) {
  const source = sources.find((s) => s.id === selection.sourceId);
  const entry = findEntry(state.snapshots, selection);
  const participants = entry?.snapshot.participants ?? [];
  const changeSubject = (sourceId: string, subjectId: string) => {
    const snapshot = findEntry(state.snapshots, { sourceId, subjectId })?.snapshot;
    onChange({
      ...selection,
      sourceId,
      subjectId,
      label: '',
      participantIds: snapshot?.participants.map((p) => (selection.follow === 'lane' ? p.laneId : p.id)) ?? [],
    });
    if (sourceId && subjectId) void inspect({ type: 'inspectSubject', sourceId, subjectId });
  };
  const chosen = selection.participantIds;
  const availableIds = participants.map((p) => (selection.follow === 'lane' ? p.laneId : p.id));
  return (
    <fieldset className="selection-card">
      <legend>Source {index + 1}</legend>
      <div className="form-row">
        <label className="field">
          Data source
          <select
            value={selection.sourceId}
            onChange={(event) => {
              const next = sources.find((s) => s.id === event.target.value);
              changeSubject(
                event.target.value,
                next?.catalog?.subjects.find((s) => s.availability === 'available')?.id ?? '',
              );
            }}
          >
            <option value="">Choose a source</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.catalog?.identity.name || s.endpoint} · {s.catalog?.identity.kind || s.state}
              </option>
            ))}
            {selection.sourceId && !source && <option value={selection.sourceId}>Unavailable source</option>}
          </select>
        </label>
        <label className="field">
          Competition / session
          <select
            value={selection.subjectId}
            onChange={(event) => changeSubject(selection.sourceId, event.target.value)}
          >
            <option value="">Choose a competition</option>
            {source?.catalog?.subjects.map((s) => (
              <option key={s.id} value={s.id} disabled={s.availability !== 'available'}>
                {s.label} · {s.eventCode}
                {s.availability !== 'available' ? ` · ${s.reason || 'Unsupported'}` : ''}
              </option>
            ))}
            {selection.subjectId && !source?.catalog?.subjects.some((s) => s.id === selection.subjectId) && (
              <option value={selection.subjectId}>Saved selection · unavailable</option>
            )}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          Follow
          <select
            value={selection.follow}
            disabled={resultRows}
            onChange={(event) => {
              const follow = event.target.value as Selection['follow'];
              onChange({
                ...selection,
                follow,
                participantIds: participants
                  .filter((p) => !chosen.length || chosen.includes(selection.follow === 'lane' ? p.laneId : p.id))
                  .map((p) => (follow === 'lane' ? p.laneId : p.id)),
              });
            }}
          >
            <option value="lane">Fixed lanes</option>
            <option value="athlete" disabled={source?.catalog?.identity.kind === 'lane'}>
              Athletes across lane changes
            </option>
          </select>
        </label>
        <label className="field">
          Display label
          <input
            value={selection.label}
            maxLength={200}
            placeholder="Use the competition name"
            onChange={(event) => onChange({ ...selection, label: event.target.value })}
          />
        </label>
      </div>
      <div className="participant-picker">
        <div className="picker-heading">
          <span>{selection.follow === 'lane' ? 'Lanes to display' : 'Athletes to follow'}</span>
          <button
            type="button"
            className="text-button"
            disabled={resultRows || !participants.length}
            onClick={() => onChange({ ...selection, participantIds: availableIds })}
          >
            Select current {selection.follow === 'lane' ? 'lanes' : 'athletes'}
          </button>
        </div>
        {!participants.length && (
          <p className="muted">{entry ? stateLabel[entry.state] : 'Waiting for the participant list.'}</p>
        )}
        <div className="participant-options">
          {participants.map((p) => {
            const id = selection.follow === 'lane' ? p.laneId : p.id;
            return (
              <label key={id} className="check-field">
                <input
                  type="checkbox"
                  checked={chosen.includes(id)}
                  disabled={resultRows}
                  onChange={(event) =>
                    onChange({
                      ...selection,
                      participantIds: event.target.checked ? [...chosen, id] : chosen.filter((key) => key !== id),
                    })
                  }
                />
                <span>
                  {p.laneName} · {p.name || 'Unnamed athlete'}
                </span>
              </label>
            );
          })}
          {chosen
            .filter((id) => !availableIds.includes(id))
            .map((id) => (
              <label key={id} className="check-field">
                <input
                  type="checkbox"
                  checked
                  disabled={resultRows}
                  onChange={() => onChange({ ...selection, participantIds: chosen.filter((key) => key !== id) })}
                />
                <span>Unavailable selection · {id}</span>
              </label>
            ))}
        </div>
      </div>
      {!chosen.length && !resultRows && (
        <p className="field-help">
          All participants in this subject will be displayed. Select specific lanes or athletes to reserve their
          positions when unavailable.
        </p>
      )}
      <button type="button" className="text-button danger" onClick={onRemove}>
        Remove source from screen
      </button>
    </fieldset>
  );
}
