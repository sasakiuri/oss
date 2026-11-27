// SPDX-License-Identifier: MIT
import type { NodeState, ScreenStatus } from '../../shared/model';
import { displayConfirmed } from '../viewModel';

import { StatusPill } from './StatusPill';

/** Whether the display PC saved the screen's settings and its audience window shows them. */
export function DisplayStatus({ status, node }: { status?: ScreenStatus; node: NodeState }) {
  return (
    <div className="display-status" aria-label="Display status" role="status">
      <StatusPill good={!!status && displayConfirmed(status)}>
        {!status
          ? 'Screen not created'
          : !status.monitorAvailable
            ? 'Monitor disconnected'
            : displayConfirmed(status)
              ? status.config.standby
                ? 'On standby'
                : 'Displaying'
              : 'Display unconfirmed'}
      </StatusPill>
      <span>
        {node.persistenceError
          ? 'Save not confirmed'
          : status?.appliedRevision === status?.config.revision && status
            ? 'Settings saved on display PC'
            : 'Settings not yet saved on display PC'}
      </span>
    </div>
  );
}

/** The requested, saved and displayed revisions of the screen. */
export function ConfirmationDetails({
  status,
  node,
  requested,
}: {
  status?: ScreenStatus;
  node: NodeState;
  /** The revision this editor last sent, if any. */
  requested: number | null;
}) {
  return (
    <details className="connection-details">
      <summary>Settings and display confirmation</summary>
      <div className="revision-strip">
        <div>
          <span>Requested</span>
          <strong>{(requested ?? status?.config.revision) ? `v${requested ?? status?.config.revision}` : '—'}</strong>
        </div>
        <div>
          <span>Saved on display PC</span>
          <strong>
            {node.persistenceError ? 'Unconfirmed' : status?.appliedRevision ? `v${status.appliedRevision}` : 'Not yet'}
          </strong>
        </div>
        <div>
          <span>Audience display</span>
          <strong>
            {status && displayConfirmed(status)
              ? `Confirmed v${status.renderedRevision}`
              : status?.renderedRevision
                ? `Last v${status.renderedRevision} · unconfirmed`
                : 'Not confirmed'}
          </strong>
        </div>
      </div>
    </details>
  );
}
