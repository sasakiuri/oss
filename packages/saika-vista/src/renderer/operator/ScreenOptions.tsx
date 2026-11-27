// SPDX-License-Identifier: MIT
import type { ScreenConfig } from '../../shared/model';

import { NumberField } from './NumberField';
import type { ChangeDraft } from './useScreenDraft';

/** Page size, rotation and starting page, with the page count this PC can determine. */
export function LayoutFields({
  draft,
  change,
  resultRows,
  count,
  pages,
}: {
  draft: ScreenConfig;
  change: ChangeDraft;
  resultRows: boolean;
  count: number | null;
  pages: number | null;
}) {
  return (
    <>
      <h3>Layout & rotation</h3>
      <div className="form-row three">
        <NumberField
          label={resultRows ? 'Rows per page' : 'Targets per page'}
          value={draft.slots}
          integerOnly
          disabled={draft.view === 'focus'}
          max={100}
          onChange={(slots) => change({ slots, page: 0 })}
        />
        <NumberField
          label="Seconds per page"
          disabled={!draft.autoRotate}
          value={draft.pageSeconds}
          max={3600}
          step="any"
          onChange={(pageSeconds) => change({ pageSeconds })}
        />
        <NumberField
          label="Starting page"
          integerOnly
          value={draft.page + 1}
          max={pages === null ? undefined : Math.max(pages, draft.page + 1)}
          onChange={(page) => change({ page: page - 1 })}
        />
      </div>
      <label className="check-field">
        <input
          type="checkbox"
          checked={draft.autoRotate}
          onChange={(event) => change({ autoRotate: event.target.checked })}
        />
        Rotate pages automatically
      </label>
      <p className="field-help">
        {count === null
          ? 'Position and page counts are unavailable on this PC. Set a starting page and confirm it on the audience screen.'
          : `${count} selected ${count === 1 ? 'position' : 'positions'} · ${pages} ${pages === 1 ? 'page' : 'pages'}.`}{' '}
        {resultRows && ' Rows scale to fit the screen; fewer rows give larger text.'}
      </p>
    </>
  );
}

/** Target zoom and shot filtering, which result rows do not use. */
export function AppearanceOptions({
  draft,
  change,
  resultRows,
}: {
  draft: ScreenConfig;
  change: ChangeDraft;
  resultRows: boolean;
}) {
  return (
    <details className="editor-options">
      <summary>Target appearance</summary>
      <div className="form-row three">
        <label className="field">
          Target zoom
          <select
            disabled={resultRows}
            value={draft.zoom}
            onChange={(event) => change({ zoom: Number(event.target.value) })}
          >
            {[1, 2, 3, 4, 6, 8, 12, 16].map((zoom) => (
              <option value={zoom} key={zoom}>
                {zoom === 1 ? 'Full target' : `${zoom}× · center fixed`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Shot display
          <select
            disabled={resultRows}
            value={draft.shotFilter}
            onChange={(event) => change({ shotFilter: event.target.value as ScreenConfig['shotFilter'] })}
          >
            <option value="all">All shots</option>
            <option value="series">Current series</option>
            <option value="recent">Recent shots</option>
          </select>
        </label>
        <NumberField
          label="Recent shot count"
          integerOnly
          disabled={resultRows || draft.shotFilter !== 'recent'}
          value={draft.recentShots}
          max={1000}
          onChange={(recentShots) => change({ recentShots })}
        />
      </div>
    </details>
  );
}

export function StartupOptions({ draft, change }: { draft: ScreenConfig; change: ChangeDraft }) {
  return (
    <details className="editor-options">
      <summary>Startup and standby</summary>
      <label className="check-field">
        <input
          type="checkbox"
          checked={draft.standby}
          onChange={(event) => change({ standby: event.target.checked })}
        />
        Show standby screen
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={draft.autoStart}
          onChange={(event) => change({ autoStart: event.target.checked })}
        />
        Open this audience screen automatically when Vista starts
      </label>
      <p className="field-help">
        Standby keeps receiving updates. For unattended startup, also enable “Start Vista at login” on the display PC.
      </p>
    </details>
  );
}
