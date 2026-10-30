// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CompetitionEvidencePanel } from '@/renderer/presentation/features/competition-control/CompetitionEvidencePanel';
import type { ShotObservationEvidenceDto } from '@/shared/ipc/contracts';

const extra: ShotObservationEvidenceDto = {
  evidenceVersion: 1,
  evidenceId: 'extra',
  observationId: 'observation',
  outcomeId: 'outcome',
  laneId: 'lane',
  outcome: 'NULLIFIED_POSITION_EXTRA',
  x: 0,
  y: 0,
  deviceScoreX10: 100,
  firedAt: '2026-10-30T01:00:00.000Z',
  receivedAt: '2026-10-30T01:00:00.000Z',
  reportedMode: 'MATCH',
  rawFrameHex: null,
  decidedAt: '2026-10-30T01:00:00.000Z',
  sessionId: 'session',
  detail: 'Previous Kneeling position',
  competition: { competitionId: 'competition', phase: 'ACTIVE', stageIndex: 1, seriesIndex: 2, stageScored: true },
  publishedAt: '2026-10-30T01:00:00.000Z',
  observedAt: '2026-10-30T01:00:00.000Z',
};
describe('CompetitionEvidencePanel', () => {
  it('labels extras and exposes raw modes of recorded observations in the same series for Jury review', () => {
    render(
      <CompetitionEvidencePanel
        lanes={[]}
        firingWindowViolations={[]}
        shotObservationEvidence={[
          extra,
          { ...extra, evidenceId: 'later', outcome: 'RECORDED', detail: null },
          {
            ...extra,
            evidenceId: 'other-series',
            outcome: 'RECORDED',
            competition: { ...extra.competition!, seriesIndex: 3 },
          },
        ]}
      />,
    );
    expect(screen.getByText(/Nullified extra \(previous position\) · ISSF 6.10.4\(c\) \/ 7.7.3/)).toBeInTheDocument();
    expect(screen.getAllByText('Device mode: MATCH')).toHaveLength(2);
    expect(screen.getAllByText(/Recorded target observation/)).toHaveLength(1);
  });
});
