// SPDX-License-Identifier: MIT
import type { ScreenStatus } from '../../shared/model';

import type { Run } from './types';

/** Commands for a saved screen. Only this PC's own audience windows can be opened or closed here. */
export function ScreenActions({
  status,
  nodeId,
  screenId,
  local,
  run,
  busy,
  onDeleted,
}: {
  status: ScreenStatus;
  nodeId: string;
  screenId: string;
  local: boolean;
  run: Run;
  busy: boolean;
  onDeleted: () => void;
}) {
  return (
    <div className="screen-actions">
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          void run({ type: 'identify', nodeId, screenId });
        }}
      >
        Identify on monitor
      </button>
      {local && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            void run({ type: status.renderAlive ? 'closeScreen' : 'openScreen', screenId });
          }}
        >
          {status.renderAlive ? 'Close audience window' : 'Open audience window'}
        </button>
      )}
      <button
        className="text-button danger"
        disabled={busy}
        onClick={async () => {
          if (await run({ type: 'removeScreen', nodeId, screenId })) onDeleted();
        }}
      >
        Remove screen
      </button>
    </div>
  );
}
