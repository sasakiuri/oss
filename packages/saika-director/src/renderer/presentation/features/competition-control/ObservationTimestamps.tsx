import type { ShotObservationEvidenceDto } from '@/shared/ipc/contracts';

const labels = {
  LANE_RECEIPT: 'Lane receipt',
  DEVICE_REPORTED: 'Device-reported time',
  UNKNOWN: 'Timestamp (source unknown)',
};

export function ObservationTimestamps({
  evidence,
}: {
  evidence: Pick<ShotObservationEvidenceDto, 'firedAt' | 'receivedAt' | 'timestampSource'>;
}) {
  return (
    <p className="text-vscode-text-muted">
      {labels[evidence.timestampSource ?? 'UNKNOWN']} {new Date(evidence.firedAt).toLocaleString()} · Lane processing{' '}
      {new Date(evidence.receivedAt).toLocaleString()}
    </p>
  );
}
