import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResultsView } from '@/renderer/presentation/features/championship/components/ResultsView';
import type { FinalRankedResultDto, RankedResultDto } from '@/shared/ipc/contracts/results.contract';

const {
  getByEvent,
  getByRelay,
  getFinalByEvent,
  confirm,
  openResultsListPrint,
  listByResult,
  add,
  revoke,
  getVerificationStatus,
  addVerificationCheck,
  approveResultList,
  revokeResultListApproval,
  getPlacementReviewStatus,
  recordPlacementReview,
  revokePlacementReview,
} = vi.hoisted(() => ({
  getByEvent: vi.fn(),
  getByRelay: vi.fn(),
  getFinalByEvent: vi.fn(),
  confirm: vi.fn(),
  openResultsListPrint: vi.fn(),
  listByResult: vi.fn(),
  add: vi.fn(),
  revoke: vi.fn(),
  getVerificationStatus: vi.fn(),
  addVerificationCheck: vi.fn(),
  approveResultList: vi.fn(),
  revokeResultListApproval: vi.fn(),
  getPlacementReviewStatus: vi.fn(),
  recordPlacementReview: vi.fn(),
  revokePlacementReview: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  resultsService: { getByEvent, getByRelay, getFinalByEvent, confirm },
  boardService: { openResultsListPrint },
  scoringDecisionsService: { listByResult, add, revoke },
  resultVerificationService: {
    getStatus: getVerificationStatus,
    addCheck: addVerificationCheck,
    approve: approveResultList,
    revokeApproval: revokeResultListApproval,
  },
  finalPlacementReviewService: {
    getStatus: getPlacementReviewStatus,
    record: recordPlacementReview,
    revoke: revokePlacementReview,
  },
}));

function createResult(id: string, relayNumber: number, playerName: string): RankedResultDto {
  return {
    id,
    participantId: `participant-${id}`,
    rank: relayNumber,
    playerName,
    familyName: playerName,
    affiliation: 'Test Team',
    relayNumber,
    seriesScores: [100],
    baseTotalScore: 100,
    totalScore: 100,
    scoreAdjustment: 0,
    deductionTotal: 0,
    remarks: [],
    classificationCode: null,
    decisionCount: 0,
    projectionIssues: [],
    evidenceSummary: {
      expectedShots: 10,
      linkedShots: 10,
      independentDecimalShots: 10,
      innerTenClassifiedShots: 10,
    },
    revision: 'a'.repeat(64),
    confirmedAt: '2026-01-01T00:00:00.000Z',
    status: 'published',
  };
}

const eventOneResults = [
  createResult('result-1', 1, 'Relay One Athlete'),
  createResult('result-2', 2, 'Relay Two Athlete'),
];

const finalResult: FinalRankedResultDto = {
  id: 'final-result-1',
  participantId: 'final-participant-1',
  sourceRank: 1,
  rank: 1,
  playerName: 'Final Athlete',
  affiliation: 'Final Team',
  firingPointNumber: 1,
  stage1Shots: Array.from({ length: 10 }, () => 10),
  stage1Total: 100,
  stage2Shots: [10, 10],
  stage2Total: 19,
  seriesScores: [50, 50, 19],
  seriesShotCounts: [5, 5, 2],
  baseTotalScore: 120,
  totalScore: 119,
  scoreAdjustment: 1,
  deductionTotal: 1,
  classificationCode: null,
  decisionCount: 1,
  projectionIssues: ['Final placement must be reviewed after a score or classification intervention'],
  scoringRevision: 'c'.repeat(64),
  placementReviewId: null,
  placementReviewRequired: true,
  remarks: 'One-point deduction',
  status: 'in_progress',
};

describe('ResultsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByResult.mockResolvedValue({ success: true, data: { decisions: [] } });
    add.mockResolvedValue({ success: true, data: {} });
    getVerificationStatus.mockResolvedValue({
      success: true,
      data: {
        eventId: 'event-1',
        snapshotRevision: 'b'.repeat(64),
        configuredIndividualChecks: 10,
        requiredIndividualChecks: 2,
        requiredTeamChecks: 0,
        teamVerificationSupported: true,
        checkedIndividualResults: 0,
        allResultsConfirmed: false,
        readyForApproval: false,
        issues: ['All qualification results must be confirmed'],
        results: eventOneResults.map((result) => ({
          resultId: result.id,
          participantId: result.participantId,
          revision: result.revision,
          rank: result.rank,
          playerName: result.playerName,
          affiliation: result.affiliation,
          relayNumber: result.relayNumber,
          totalScore: result.totalScore,
          classificationCode: result.classificationCode,
          decisionCount: result.decisionCount,
          projectionIssues: result.projectionIssues,
          status: result.status,
          evidenceSummary: result.evidenceSummary,
          required: true,
          latestCheck: null,
          currentCheck: null,
        })),
        currentApproval: null,
        approvalHistory: [],
      },
    });
    getByEvent.mockImplementation(({ eventId }: { eventId: string }) =>
      Promise.resolve({
        success: true,
        data: {
          eventId,
          results: eventId === 'event-1' ? eventOneResults : [createResult('result-3', 1, 'New Event Athlete')],
        },
      }),
    );
    getByRelay.mockImplementation(({ eventId, relayNumber }: { eventId: string; relayNumber: number }) =>
      Promise.resolve({
        success: true,
        data: {
          eventId,
          relayNumber,
          results: eventId === 'event-1' ? eventOneResults.filter((result) => result.relayNumber === relayNumber) : [],
        },
      }),
    );
    getFinalByEvent.mockImplementation(({ eventId }: { eventId: string }) =>
      Promise.resolve({ success: true, data: { eventId, results: [finalResult] } }),
    );
    getPlacementReviewStatus.mockResolvedValue({
      success: true,
      data: {
        eventId: 'event-final',
        scoringRevision: 'e'.repeat(64),
        reviewRequired: true,
        issues: ['Final placements require review after a score or classification intervention'],
        results: [finalResult],
        currentReview: null,
        reviewHistory: [],
      },
    });
    recordPlacementReview.mockResolvedValue({ success: true, data: {} });
    revokePlacementReview.mockResolvedValue({ success: true, data: {} });
  });

  it('opens the independent RTS result-verification workflow', async () => {
    render(<ResultsView eventId="event-1" eventName="Qualification" />);

    fireEvent.click(await screen.findByRole('button', { name: 'RTS verification' }));

    await waitFor(() => expect(getVerificationStatus).toHaveBeenCalledWith({ eventId: 'event-1' }));
    expect(screen.getByRole('dialog', { name: 'RTS result verification — Qualification' })).toBeInTheDocument();
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
  });

  it('keeps every relay available after filtering to one relay', async () => {
    render(<ResultsView eventId="event-1" />);

    await screen.findByText('Relay Two Athlete');
    fireEvent.change(screen.getByLabelText('Relay:'), { target: { value: '1' } });

    await waitFor(() => expect(getByRelay).toHaveBeenCalledWith({ eventId: 'event-1', relayNumber: 1 }));
    expect(await screen.findByRole('option', { name: 'Relay 2' })).toBeInTheDocument();
  });

  it('resets the relay filter when switching events', async () => {
    const { rerender } = render(<ResultsView eventId="event-1" />);

    await screen.findByText('Relay Two Athlete');
    fireEvent.change(screen.getByLabelText('Relay:'), { target: { value: '2' } });
    await waitFor(() => expect(getByRelay).toHaveBeenCalledWith({ eventId: 'event-1', relayNumber: 2 }));

    rerender(<ResultsView eventId="event-2" />);

    expect(await screen.findByText('New Event Athlete')).toBeInTheDocument();
    expect(screen.getByLabelText('Relay:')).toHaveValue('all');
    expect(getByEvent).toHaveBeenCalledWith({ eventId: 'event-2' });
  });

  it('appends a non-destructive deduction from the result decision panel', async () => {
    render(<ResultsView eventId="event-1" />);

    await screen.findByText('Relay One Athlete');
    fireEvent.click(screen.getByRole('button', { name: 'Scoring decisions for Relay One Athlete' }));
    await screen.findByRole('dialog', { name: 'Scoring decisions — Relay One Athlete' });

    fireEvent.change(screen.getByLabelText('Public result-list remark'), {
      target: { value: 'Two-point deduction' },
    });
    fireEvent.change(screen.getByLabelText('Official / jury member'), { target: { value: 'Jury A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Append decision' }));

    await waitFor(() =>
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({
          resultId: 'result-1',
          resultScope: 'QUALIFICATION',
          type: 'DEDUCTION',
          applicationPolicy: 'LOWEST_SHOT_IN_SERIES',
          pointsX10: 20,
          seriesIndex: 0,
          publicRemark: 'Two-point deduction',
          officialName: 'Jury A',
        }),
      ),
    );
  });

  it('opens the same append-only decision workflow for a Final result and reloads its projection', async () => {
    render(<ResultsView eventId="event-final" eventName="Final" round="Final" />);

    expect(await screen.findByText('Final Athlete')).toBeInTheDocument();
    expect(screen.getAllByText('Placement review required').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Scoring decisions for Final Athlete' }));

    await waitFor(() =>
      expect(listByResult).toHaveBeenCalledWith({ resultId: 'final-result-1', resultScope: 'FINAL' }),
    );
    expect(screen.getByText('Available series: S1 (5), S2 (5), S3 (2)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Public result-list remark'), {
      target: { value: 'Final deduction confirmed' },
    });
    fireEvent.change(screen.getByLabelText('Official / jury member'), { target: { value: 'Final Jury' } });
    fireEvent.click(screen.getByRole('button', { name: 'Append decision' }));

    await waitFor(() =>
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({
          resultId: 'final-result-1',
          resultScope: 'FINAL',
          type: 'DEDUCTION',
          publicRemark: 'Final deduction confirmed',
          officialName: 'Final Jury',
        }),
      ),
    );
    await waitFor(() => expect(getFinalByEvent).toHaveBeenCalledTimes(2));
  });

  it('records an explicit Final placement review against its scoring snapshot', async () => {
    render(<ResultsView eventId="event-final" eventName="Final" round="Final" />);

    await screen.findByText('Final Athlete');
    fireEvent.click(screen.getByRole('button', { name: 'Review placements' }));
    expect(await screen.findByRole('dialog', { name: 'Final placement review — Final' })).toBeInTheDocument();
    expect(getPlacementReviewStatus).toHaveBeenCalledWith({ eventId: 'event-final' });

    fireEvent.change(screen.getByLabelText('Reviewed rank for Final Athlete'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Official / Jury member'), { target: { value: 'Final Jury Chair' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record placement review' }));

    await waitFor(() =>
      expect(recordPlacementReview).toHaveBeenCalledWith({
        eventId: 'event-final',
        scoringRevision: 'e'.repeat(64),
        placements: [
          {
            resultId: 'final-result-1',
            participantId: 'final-participant-1',
            rank: 2,
          },
        ],
        ruleReference: '6.17',
        statement: 'Final placements reviewed against elimination and shoot-off history',
        officialName: 'Final Jury Chair',
      }),
    );
    await waitFor(() => expect(getFinalByEvent).toHaveBeenCalledTimes(2));
  });

  it('does not reload an old event when its confirmation finishes after switching events', async () => {
    let resolveConfirm!: (value: { success: true }) => void;
    const confirmation = new Promise<{ success: true }>((resolve) => {
      resolveConfirm = resolve;
    });
    confirm.mockReturnValue(confirmation);
    const { rerender } = render(<ResultsView eventId="event-1" />);

    await screen.findByText('Relay Two Athlete');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm (2)' }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith({ eventId: 'event-1', resultIds: ['result-1', 'result-2'] }),
    );

    rerender(<ResultsView eventId="event-2" />);
    expect(await screen.findByText('New Event Athlete')).toBeInTheDocument();

    await act(async () => {
      resolveConfirm({ success: true });
      await confirmation;
    });

    expect(screen.getByText('New Event Athlete')).toBeInTheDocument();
    expect(screen.queryByText('Relay One Athlete')).not.toBeInTheDocument();
    expect(getByEvent.mock.calls.map(([input]) => input)).toEqual([{ eventId: 'event-1' }, { eventId: 'event-2' }]);
  });
});
