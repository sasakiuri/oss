import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ScoringDecisionPanel } from '@/renderer/presentation/features/scoring-decisions/ScoringDecisionPanel';
import { scoringDecisionsService } from '@/renderer/services';
import type { ScoringDecisionDto } from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
vi.mock('@/renderer/presentation/features/score-corrections/ScoreCorrectionPanel', () => ({
  ScoreCorrectionPanel: () => null,
}));

const result = {
  id: 'result',
  playerName: 'Athlete A',
  baseTotalScore: 630.1,
  totalScore: 630.1,
  classificationCode: null,
};

const decision: ScoringDecisionDto = {
  id: 'decision',
  eventId: 'event',
  participantId: 'participant',
  relayNumber: 1,
  resultScope: 'QUALIFICATION',
  resultIdAtDecision: 'result',
  sourceCompetitionId: null,
  type: 'WARNING',
  applicationPolicy: 'NONE',
  pointsX10: null,
  seriesIndex: null,
  shotIndex: null,
  classificationCode: null,
  ruleReference: '6.14.6',
  incidentReportNumber: null,
  publicRemark: 'Warning for late shot',
  internalNote: null,
  officialName: 'Jury A',
  decidedAt: '2026-09-09T10:00:00.000Z',
  reversesDecisionId: null,
  active: true,
};

function renderPanel() {
  return render(
    <ScoringDecisionPanel result={result} resultScope="QUALIFICATION" onClose={() => {}} onChanged={() => {}} />,
  );
}

describe('ScoringDecisionPanel', () => {
  it('shows a failed load as its message or the fallback text', async () => {
    vi.mocked(scoringDecisionsService.listByResult).mockResolvedValueOnce(fail('Result not found'));
    const { unmount } = renderPanel();
    expect(await screen.findByText('Result not found')).toBeVisible();
    unmount();

    vi.mocked(scoringDecisionsService.listByResult).mockRejectedValueOnce('offline');
    renderPanel();
    expect(await screen.findByText('Failed to load scoring decisions')).toBeVisible();
  });

  it('shows a failed decision as its message or the fallback text', async () => {
    vi.mocked(scoringDecisionsService.listByResult).mockResolvedValue(ok({ decisions: [] }));
    vi.mocked(scoringDecisionsService.add)
      .mockResolvedValueOnce(fail('The result changed'))
      .mockRejectedValueOnce('offline');
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Public result-list remark'), { target: { value: 'Deduction' } });
    fireEvent.change(screen.getByLabelText('Official / jury member'), { target: { value: 'Jury A' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Add scoring decision' }));
    expect(await screen.findByText('The result changed')).toBeVisible();
    expect(screen.getByLabelText('Public result-list remark')).toHaveValue('Deduction');
    fireEvent.submit(screen.getByRole('form', { name: 'Add scoring decision' }));
    expect(await screen.findByText('Failed to append scoring decision')).toBeVisible();
  });

  it('shows a failed revocation as its message or the fallback text', async () => {
    vi.mocked(scoringDecisionsService.listByResult).mockResolvedValue(ok({ decisions: [decision] }));
    vi.mocked(scoringDecisionsService.revoke)
      .mockResolvedValueOnce(fail('The decision was already revoked'))
      .mockRejectedValueOnce('offline');
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    fireEvent.change(screen.getByLabelText('Revocation reason'), { target: { value: 'Entered in error' } });
    fireEvent.change(screen.getByLabelText('Official / jury member'), { target: { value: 'Jury A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Append revocation' }));
    expect(await screen.findByText('The decision was already revoked')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Append revocation' }));
    expect(await screen.findByText('Failed to revoke scoring decision')).toBeVisible();
  });
});
