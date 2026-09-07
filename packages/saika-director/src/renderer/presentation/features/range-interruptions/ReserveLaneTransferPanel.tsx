// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useState } from 'react';

import { reserveLaneTransfersService } from '@/renderer/services';
import type { ReserveTransferWorkspaceDto } from '@/shared/ipc/contracts';
import type { ReserveLaneTransferRequest } from '@/shared/mqtt/ReserveLaneTransfer';

const field = 'rounded border border-vscode-border bg-vscode-input p-2 text-vscode-text';
export function ReserveLaneTransferPanel({
  competitionId,
  lanes,
}: {
  competitionId: string;
  lanes: readonly { laneId: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [workspace, setWorkspace] = useState<ReserveTransferWorkspaceDto>([]);
  const [request, setRequest] = useState<ReserveLaneTransferRequest>({
    id: crypto.randomUUID(),
    competitionId,
    sourceLaneId: '',
    destinationLaneId: '',
    officialName: '',
    statement: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(300);
  const [sighting, setSighting] = useState(true);
  const load = useCallback(async () => {
    const response = await reserveLaneTransfersService.workspace({ competitionId });
    if (!response.success) throw new Error(response.error?.message ?? 'Reserve transfer failed');
    setWorkspace(response.data);
  }, [competitionId]);
  useEffect(() => {
    if (open)
      void load().catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Unable to load transfers'),
      );
  }, [load, open]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Transfer failed');
    } finally {
      try {
        await load();
      } catch {
        /* Retain the original failure for retry. */
      }
      setBusy(false);
    }
  };
  return (
    <details
      className="my-3 rounded border border-vscode-border p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">Reserve Lane transfer</summary>
      {open && (
        <div className="space-y-3 pt-3">
          <p className="text-sm">
            Both Lanes must be joined before the relay starts and remain under safety STOP. The reserve must be
            unassigned and have no shots. This version supports one continuous Qualification MATCH stage.
          </p>
          <p className="text-xs">
            The transfer preserves shot identity and the frozen timer. Source evidence remains on its original Lane.
            Clear the reserve safety STOP only after transfer completes, then record the separate Jury resume grant.
          </p>
          {error && (
            <p role="alert" className="text-vscode-error">
              {error}
            </p>
          )}
          <form
            aria-label="Prepare reserve Lane transfer"
            className="grid grid-cols-2 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const response = await reserveLaneTransfersService.prepare(request);
                if (!response.success) throw new Error(response.error?.message ?? 'Reserve transfer failed');
                setRequest((current) => ({ ...current, id: crypto.randomUUID() }));
              });
            }}
          >
            <label>
              Source Lane{' '}
              <select
                className={`${field} w-full`}
                value={request.sourceLaneId}
                onChange={(event) => setRequest({ ...request, sourceLaneId: event.target.value })}
                required
              >
                <option value="">Select source</option>
                {lanes.map((lane) => (
                  <option key={lane.laneId} value={lane.laneId}>
                    {lane.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reserve Lane{' '}
              <select
                className={`${field} w-full`}
                value={request.destinationLaneId}
                onChange={(event) => setRequest({ ...request, destinationLaneId: event.target.value })}
                required
              >
                <option value="">Select reserve</option>
                {lanes
                  .filter((lane) => lane.laneId !== request.sourceLaneId)
                  .map((lane) => (
                    <option key={lane.laneId} value={lane.laneId}>
                      {lane.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Transfer / resume official{' '}
              <input
                className={`${field} w-full`}
                value={request.officialName}
                onChange={(event) => setRequest({ ...request, officialName: event.target.value })}
                required
              />
            </label>
            <label>
              Decision / IR reference{' '}
              <input
                className={`${field} w-full`}
                value={request.statement}
                onChange={(event) => setRequest({ ...request, statement: event.target.value })}
                required
              />
            </label>
            <button className={field} type="submit" disabled={busy}>
              Prepare source snapshot
            </button>
          </form>
          {workspace.map(({ request: saved, bundle, entries }) => {
            const cancelled = entries.some((entry) => entry.operation === 'CANCELLED');
            const retireAttempted = entries.some((entry) => entry.operation === 'SOURCE_RETIRED');
            const complete = entries.some((entry) => entry.operation === 'TARGET_ACTIVE');
            const resumed = entries.some((entry) => entry.operation === 'RESUMED');
            const grant = entries.find((entry) => entry.operation === 'RESUME_AUTHORIZED')?.detail as
              | {
                  id: string;
                  transferId: string;
                  remainingSeconds: number;
                  unlimitedSightingShots: boolean;
                  officialName: string;
                  statement: string;
                }
              | undefined;
            return (
              <div key={saved.id} className="space-y-2 border-t border-vscode-border pt-3">
                <p>
                  {lanes.find((lane) => lane.laneId === saved.sourceLaneId)?.label ?? saved.sourceLaneId} →{' '}
                  {lanes.find((lane) => lane.laneId === saved.destinationLaneId)?.label ?? saved.destinationLaneId}
                </p>
                <p className="text-xs">
                  {saved.officialName}: {saved.statement}
                </p>
                <p className="text-xs">{entries.at(-1)?.operation ?? 'PREPARATION PENDING'}</p>
                {!cancelled && !retireAttempted && (
                  <button
                    type="button"
                    className={field}
                    disabled={busy || !request.officialName.trim() || !request.statement.trim()}
                    onClick={() =>
                      void run(async () => {
                        const result = await reserveLaneTransfersService.cancel({
                          id: saved.id,
                          officialName: request.officialName,
                          statement: request.statement,
                        });
                        if (!result.success) throw new Error(result.error?.message ?? 'Reserve transfer failed');
                      })
                    }
                  >
                    Cancel preparation using the official and reason above
                  </button>
                )}
                {!cancelled && !bundle && (
                  <button
                    type="button"
                    className={field}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await reserveLaneTransfersService.prepare(saved);
                        if (!result.success) throw new Error(result.error?.message ?? 'Reserve transfer failed');
                      })
                    }
                  >
                    Retry source snapshot
                  </button>
                )}
                {!cancelled && bundle && (
                  <>
                    <p>
                      {bundle.summary.athleteName} · {bundle.summary.matchShots} MATCH shots ·{' '}
                      {bundle.summary.totalScoreX10 / 10} points · {bundle.summary.remainingSeconds}s remaining
                    </p>
                    {!complete && (
                      <>
                        <label className="block">
                          <input
                            type="checkbox"
                            checked={confirmed === saved.id}
                            onChange={(event) => setConfirmed(event.target.checked ? saved.id : null)}
                          />{' '}
                          I confirm the athlete, reserve Lane and frozen score / timer.
                        </label>
                        <button
                          type="button"
                          className={field}
                          disabled={busy || confirmed !== saved.id}
                          onClick={() =>
                            void run(async () => {
                              const response = await reserveLaneTransfersService.complete({
                                id: saved.id,
                                expectedDigest: bundle.digest,
                                confirmed: true,
                              });
                              if (!response.success)
                                throw new Error(response.error?.message ?? 'Reserve transfer failed');
                              setConfirmed(null);
                            })
                          }
                        >
                          Complete or retry transfer
                        </button>
                      </>
                    )}
                    {complete && !resumed && (
                      <>
                        <label className="block">
                          Additional time authorized by Jury (seconds){' '}
                          <input
                            type="number"
                            className={field}
                            min="0"
                            max="86400"
                            value={seconds}
                            disabled={!!grant}
                            onChange={(event) => setSeconds(Number(event.target.value))}
                          />
                        </label>
                        <label className="block">
                          <input
                            type="checkbox"
                            checked={grant?.unlimitedSightingShots ?? sighting}
                            disabled={!!grant}
                            onChange={(event) => setSighting(event.target.checked)}
                          />{' '}
                          Unlimited extra sighting before MATCH
                        </label>
                        <p className="text-xs">
                          Resume with {grant?.remainingSeconds ?? Math.ceil(bundle.summary.remainingSeconds) + seconds}
                          s. Confirm the grant against ISSF 6.10.9 and the Jury decision.
                        </p>
                        <button
                          type="button"
                          className={field}
                          disabled={busy || !request.officialName.trim() || !request.statement.trim()}
                          onClick={() =>
                            void run(async () => {
                              const response = await reserveLaneTransfersService.resume(
                                grant ?? {
                                  id: crypto.randomUUID(),
                                  transferId: saved.id,
                                  remainingSeconds: Math.ceil(bundle.summary.remainingSeconds) + seconds,
                                  unlimitedSightingShots: sighting,
                                  officialName: request.officialName,
                                  statement: request.statement,
                                },
                              );
                              if (!response.success)
                                throw new Error(response.error?.message ?? 'Reserve transfer failed');
                            })
                          }
                        >
                          Apply or retry recorded resume grant
                        </button>
                      </>
                    )}
                    {resumed &&
                      grant?.unlimitedSightingShots &&
                      !entries.some((entry) => entry.operation === 'MATCH_RESUMED') && (
                        <button
                          type="button"
                          className={field}
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const response = await reserveLaneTransfersService.resumeMatch({ id: saved.id });
                              if (!response.success)
                                throw new Error(response.error?.message ?? 'Reserve transfer failed');
                            })
                          }
                        >
                          End extra sighting and resume MATCH
                        </button>
                      )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </details>
  );
}
