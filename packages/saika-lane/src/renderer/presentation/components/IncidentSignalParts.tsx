// SPDX-License-Identifier: MIT
import type { EstComplaintContextDto, QualificationMalfunctionSignalDto } from '@/shared/ipc/contracts';

/** Athlete and competition position the main process captured with an incident signal. */
type IncidentContext = Pick<
  NonNullable<QualificationMalfunctionSignalDto['context']>,
  | 'participantName'
  | 'startNumber'
  | 'phase'
  | 'stageIndex'
  | 'seriesIndex'
  | 'recordedShots'
  | 'seriesShotLimit'
  | 'exposureIndex'
>;

/** The captured snapshot; `lastShot` adds the latest recorded shot before the exposure. */
export function IncidentSnapshot({
  snapshot,
  lastShot,
}: {
  snapshot: IncidentContext;
  lastShot?: Pick<NonNullable<EstComplaintContextDto['lastShot']>, 'shotNumberInSeries' | 'receivedAt'> | null;
}) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-zinc-200">
      <dt className="text-zinc-400">Athlete</dt>
      <dd>
        {snapshot.startNumber ? `#${snapshot.startNumber} ` : ''}
        {snapshot.participantName}
      </dd>
      <dt className="text-zinc-400">Position</dt>
      <dd>
        {snapshot.phase}, stage {snapshot.stageIndex + 1}, series {snapshot.seriesIndex + 1}
      </dd>
      <dt className="text-zinc-400">Shots recorded</dt>
      <dd>
        {snapshot.recordedShots}
        {snapshot.seriesShotLimit === null ? '' : ` / ${snapshot.seriesShotLimit}`}
      </dd>
      {lastShot && (
        <>
          <dt className="text-zinc-400">Last recorded shot</dt>
          <dd>
            #{lastShot.shotNumberInSeries} at {new Date(lastShot.receivedAt).toLocaleTimeString()}
          </dd>
        </>
      )}
      {snapshot.exposureIndex !== null && (
        <>
          <dt className="text-zinc-400">Exposure</dt>
          <dd>{snapshot.exposureIndex + 1}</dd>
        </>
      )}
    </dl>
  );
}

/** Shown while MQTT is disconnected: the active signal is kept and published on reconnect. */
export function StoredOnLaneNotice() {
  return (
    <p className="text-sm text-amber-300">
      Stored on this Lane. It will be published automatically after MQTT reconnects.
    </p>
  );
}
