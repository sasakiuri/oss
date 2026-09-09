// SPDX-License-Identifier: MIT
import { AlertTriangle, BellRing } from 'lucide-react';

import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';
import type { EstComplaintIssue } from '@/shared/mqtt';

function formatEstComplaintIssue(issue: EstComplaintIssue | null): string {
  switch (issue) {
    case 'SHOT_VALUE':
      return 'Displayed shot value';
    case 'SHOT_NOT_REGISTERED':
      return 'Shot not registered or displayed';
    case 'TARGET_FAILURE':
      return 'Target failure';
    case 'TARGET_MEDIA_ADVANCE':
      return 'Paper or rubber strip advance';
    case 'OTHER':
      return 'Other EST issue';
    default:
      return 'EST issue';
  }
}

export function LaneAttentionSignals({ lanes }: { lanes: MqttControlSnapshotDto['lanes'] }) {
  const activeRangeOfficerRequests = lanes.filter((lane) => lane.rangeOfficerRequest?.status === 'ACTIVE');
  const activeQualificationMalfunctionSignals = lanes.filter(
    (lane) => lane.qualificationMalfunctionSignal?.status === 'ACTIVE',
  );
  const activeEstComplaintSignals = lanes.filter((lane) => lane.estComplaintSignal?.status === 'ACTIVE');
  return (
    <>
      {activeEstComplaintSignals.length > 0 && (
        <section
          className="border-2 border-cyan-500 bg-cyan-500/10 p-4"
          aria-label="Active electronic target complaints"
          aria-live="assertive"
        >
          <div className="flex items-center gap-2 text-cyan-300">
            <AlertTriangle size={19} aria-hidden="true" />
            <h2 className="text-sm font-bold">Electronic target complaint raised</h2>
          </div>
          <ul className="mt-2 space-y-2">
            {activeEstComplaintSignals.map((lane) => {
              const signal = lane.estComplaintSignal!;
              const context = signal.context!;
              return (
                <li key={signal.signalId ?? lane.laneId} className="text-sm text-vscode-text">
                  <span className="font-semibold">
                    {lane.firingPointNumber ? `Firing point ${lane.firingPointNumber}` : lane.laneAlias || lane.laneId}
                  </span>
                  {' · '}
                  {context.startNumber ? `#${context.startNumber} ` : ''}
                  {context.participantName}
                  {' · '}
                  {formatEstComplaintIssue(signal.issue)}
                  {' · '}
                  {context.phase}, stage {context.stageIndex + 1}, series {context.seriesIndex + 1}, shot{' '}
                  {context.recordedShots}
                  {context.exposureIndex === null ? '' : `, exposure ${context.exposureIndex + 1}`}
                  {signal.message ? ` · ${signal.message}` : ''}
                  {signal.signalledAt ? ` · ${new Date(signal.signalledAt).toLocaleTimeString()}` : ''}
                  {lane.hardware?.connection.status !== 'connected' ? ' · Lane offline' : ''}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-vscode-text-muted">
            This is a Lane observation, not a ruling on timeliness, validity, or score. Preserve the target and use
            Target examinations to open the official evidence record.
          </p>
        </section>
      )}
      {activeQualificationMalfunctionSignals.length > 0 && (
        <section
          className="border-2 border-vscode-error bg-vscode-error/10 p-4"
          aria-label="Active qualification malfunction declarations"
          aria-live="assertive"
        >
          <div className="flex items-center gap-2 text-vscode-error">
            <AlertTriangle size={19} aria-hidden="true" />
            <h2 className="text-sm font-bold">Possible qualification malfunction declared</h2>
          </div>
          <ul className="mt-2 space-y-2">
            {activeQualificationMalfunctionSignals.map((lane) => {
              const signal = lane.qualificationMalfunctionSignal!;
              const context = signal.context!;
              return (
                <li key={signal.signalId ?? lane.laneId} className="text-sm text-vscode-text">
                  <span className="font-semibold">
                    {lane.firingPointNumber ? `Firing point ${lane.firingPointNumber}` : lane.laneAlias || lane.laneId}
                  </span>
                  {' · '}
                  {context.startNumber ? `#${context.startNumber} ` : ''}
                  {context.participantName}
                  {' · '}
                  {context.phase}, stage {context.stageIndex + 1}, series {context.seriesIndex + 1}, shot{' '}
                  {context.recordedShots}
                  {signal.message ? ` · ${signal.message}` : ''}
                  {signal.signalledAt ? ` · ${new Date(signal.signalledAt).toLocaleTimeString()}` : ''}
                  {lane.hardware?.connection.status !== 'connected' ? ' · Lane offline' : ''}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-vscode-text-muted">
            This is an athlete/Lane declaration, not an official classification or claim decision. Use it in
            Qualification malfunction cases to open the official record; classify it separately after inspection.
          </p>
        </section>
      )}
      {activeRangeOfficerRequests.length > 0 && (
        <section
          className="border-2 border-vscode-warning bg-vscode-warning/10 p-4"
          aria-label="Active Range Officer requests"
          aria-live="assertive"
        >
          <div className="flex items-center gap-2 text-vscode-warning">
            <BellRing size={19} aria-hidden="true" />
            <h2 className="text-sm font-bold">Range Officer requested</h2>
          </div>
          <ul className="mt-2 space-y-2">
            {activeRangeOfficerRequests.map((lane) => {
              const request = lane.rangeOfficerRequest!;
              return (
                <li key={request.requestId ?? lane.laneId} className="text-sm text-vscode-text">
                  <span className="font-semibold">
                    {lane.firingPointNumber ? `Firing point ${lane.firingPointNumber}` : lane.laneAlias || lane.laneId}
                  </span>
                  {' · '}
                  {request.category?.replaceAll('_', ' ') ?? 'ASSISTANCE'}
                  {request.message ? ` · ${request.message}` : ''}
                  {request.requestedAt ? ` · ${new Date(request.requestedAt).toLocaleTimeString()}` : ''}
                  {lane.hardware?.connection.status !== 'connected' ? ' · Lane offline' : ''}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-vscode-text-muted">
            The Lane owns and clears this assistance signal. It does not change firing or safety state.
          </p>
        </section>
      )}
    </>
  );
}
