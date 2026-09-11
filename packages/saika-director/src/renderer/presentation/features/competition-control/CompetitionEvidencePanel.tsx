// SPDX-License-Identifier: MIT

import type {
  FiringWindowViolationDto,
  MqttControlSnapshotDto,
  ShotObservationEvidenceDto,
} from '@/shared/ipc/contracts';

import { ObservationTimestamps } from './ObservationTimestamps';

interface CompetitionEvidencePanelProps {
  lanes: MqttControlSnapshotDto['lanes'];
  firingWindowViolations: FiringWindowViolationDto[];
  shotObservationEvidence: ShotObservationEvidenceDto[];
}
export function CompetitionEvidencePanel({
  lanes,
  firingWindowViolations,
  shotObservationEvidence,
}: CompetitionEvidencePanelProps) {
  const unscoredObservations = shotObservationEvidence.filter((evidence) => evidence.outcome !== 'RECORDED');
  return (
    <>
      {unscoredObservations.length > 0 && (
        <details className="mt-4 border-l-2 border-vscode-warning bg-vscode-warning/5 px-3 py-2.5">
          <summary className="cursor-pointer text-xs font-semibold text-vscode-warning">
            Unscored target observations ({unscoredObservations.length})
          </summary>
          <p className="mt-2 text-xs leading-5 text-vscode-text-muted">
            These observations cannot be edited and are not included in Lane or result totals.
          </p>
          <ul className="mt-2 grid max-h-64 gap-2 overflow-auto">
            {unscoredObservations.map((evidence) => {
              const lane = lanes.find((entry) => entry.laneId === evidence.laneId);
              return (
                <li key={evidence.evidenceId} className="border-t border-vscode-border pt-2 text-xs leading-5">
                  <p className="font-semibold text-vscode-text">
                    {lane?.laneAlias || `Lane ${evidence.laneId.slice(0, 8)}`} · {evidence.outcome.replaceAll('_', ' ')}
                  </p>
                  <ObservationTimestamps evidence={evidence} />
                  <p className="text-vscode-dimmed">
                    Stage {evidence.competition?.stageIndex ?? '—'} · series {evidence.competition?.seriesIndex ?? '—'}{' '}
                    · observation {evidence.observationId.slice(0, 8)}
                  </p>
                  {evidence.detail && <p className="text-vscode-text-muted">{evidence.detail}</p>}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {firingWindowViolations.length > 0 && (
        <details className="mt-4 border-l-2 border-vscode-warning bg-vscode-warning/5 px-3 py-2.5">
          <summary className="cursor-pointer text-xs font-semibold text-vscode-warning">
            Firing-window review ({firingWindowViolations.length})
          </summary>
          <p className="mt-2 text-xs leading-5 text-vscode-text-muted">
            Detection only; no score or Jury decision was changed.
          </p>
          <ul className="mt-2 grid gap-2">
            {firingWindowViolations.map((violation) => {
              const lane = lanes.find((entry) => entry.laneId === violation.laneId);
              return (
                <li key={violation.id} className="border-t border-vscode-border pt-2 text-xs leading-5">
                  <p className="font-semibold text-vscode-text">
                    {lane?.laneAlias || `Lane ${violation.laneId.slice(0, 8)}`} · Rule {violation.ruleReference}
                  </p>
                  <p className="text-vscode-text-muted">
                    {violation.kind.replaceAll('_', ' ')} · {new Date(violation.evaluatedShotAt).toLocaleString()}
                  </p>
                  <p className="text-vscode-dimmed">
                    Evidence: {violation.timestampSource.replaceAll('_', ' ').toLowerCase()} · boundary tolerance{' '}
                    {violation.clockToleranceMilliseconds} ms
                  </p>
                  <p className="text-vscode-text-muted">{violation.reviewGuidance}</p>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </>
  );
}
