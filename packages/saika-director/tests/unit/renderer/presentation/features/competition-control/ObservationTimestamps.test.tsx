import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ObservationTimestamps } from '@/renderer/presentation/features/competition-control/ObservationTimestamps';

describe('Observation timestamp labels', () => {
  it.each([
    ['LANE_RECEIPT', 'Lane receipt'],
    ['DEVICE_REPORTED', 'Device-reported time'],
    ['UNKNOWN', 'Timestamp (source unknown)'],
    [undefined, 'Timestamp (source unknown)'],
  ] as const)('identifies %s provenance without claiming a verified firing time', (timestampSource, label) => {
    render(
      <ObservationTimestamps
        evidence={{
          firedAt: '2026-09-08T00:00:00Z',
          receivedAt: '2026-09-08T00:00:01Z',
          timestampSource,
        }}
      />,
    );
    expect(screen.getByText((content) => content.startsWith(label))).toHaveTextContent('Lane processing');
    expect(screen.queryByText(/Fired /)).not.toBeInTheDocument();
  });
});
