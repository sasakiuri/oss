import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResultsView } from '@/renderer/presentation/features/results/ResultsView';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import type { MixedTeamFinalResultDto } from '@/shared/ipc/contracts';
import type { FinalRankedResultDto, RankedResultDto } from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

const {
  getByEvent,
  getByRelay,
  getFinalByEvent,
  getMixedFinal,
  confirm,
  openResultsListPrint,
  listByResult,
  add,
  revoke,
  getVerificationStatus,
  addVerificationCheck,
  approveResultList,
  revokeResultListApproval,
  getPublicationStatus,
  publishPreliminary,
  registerResultProtest,
  resolveResultProtest,
  publishOfficial,
  getPlacementReviewStatus,
  recordPlacementReview,
  revokePlacementReview,
  listBackupRuns,
  listBackupSources,
  openEstBackupSourcePrint,
} = vi.hoisted(() => ({
  getByEvent: vi.fn(),
  getByRelay: vi.fn(),
  getFinalByEvent: vi.fn(),
  getMixedFinal: vi.fn(),
  confirm: vi.fn(),
  openResultsListPrint: vi.fn(),
  listByResult: vi.fn(),
  add: vi.fn(),
  revoke: vi.fn(),
  getVerificationStatus: vi.fn(),
  addVerificationCheck: vi.fn(),
  approveResultList: vi.fn(),
  revokeResultListApproval: vi.fn(),
  getPublicationStatus: vi.fn(),
  publishPreliminary: vi.fn(),
  registerResultProtest: vi.fn(),
  resolveResultProtest: vi.fn(),
  publishOfficial: vi.fn(),
  getPlacementReviewStatus: vi.fn(),
  recordPlacementReview: vi.fn(),
  revokePlacementReview: vi.fn(),
  listBackupRuns: vi.fn(),
  listBackupSources: vi.fn(),
  openEstBackupSourcePrint: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  resultsService: { getByEvent, getByRelay, getFinalByEvent, confirm },
  teamResultsService: { getMixedFinal },
  boardService: { openResultsListPrint, openEstBackupSourcePrint },
  estBackupVerificationService: { list: listBackupRuns, listSources: listBackupSources },
  scoringDecisionsService: { listByResult, add, revoke },
  resultVerificationService: {
    getStatus: getVerificationStatus,
    addCheck: addVerificationCheck,
    approve: approveResultList,
    revokeApproval: revokeResultListApproval,
  },
  resultPublicationService: {
    getStatus: getPublicationStatus,
    publishPreliminary,
    registerProtest: registerResultProtest,
    resolveProtest: resolveResultProtest,
    publishOfficial,
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
    entryStatus: 'COMPETING',
    classificationCode: null,
    decisionCount: 0,
    projectionIssues: [],
    evidenceSummary: {
      expectedShots: 10,
      linkedShots: 10,
      independentDecimalShots: 10,
      innerTenClassifiedShots: 10,
      scoreConflicts: 0,
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
  stage2Total: 20,
  seriesScores: [50, 50, 10, 10],
  seriesShotCounts: [5, 5, 1, 1],
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
    listBackupRuns.mockResolvedValue({ success: true, data: [] });
    listBackupSources.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'source-1',
          eventId: 'event-1',
          fileName: 'backup.csv',
          recordCount: 2,
          importedAt: '2026-09-09T00:00:00.000Z',
        },
      ],
    });
    openEstBackupSourcePrint.mockResolvedValue({ success: true });
    listByResult.mockResolvedValue({ success: true, data: { decisions: [] } });
    add.mockResolvedValue({ success: true, data: {} });
    getVerificationStatus.mockResolvedValue({
      success: true,
      data: {
        eventId: 'event-1',
        snapshotRevision: 'b'.repeat(64),
        configuredIndividualChecks: 10,
        configuredTeamChecks: 0,
        requiredIndividualChecks: 2,
        requiredTeamChecks: 0,
        teamVerificationSupported: true,
        checkedIndividualResults: 0,
        checkedTeamResults: 0,
        teamVerificationRunId: null,
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
    getMixedFinal.mockResolvedValue({ success: true, data: [] });
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
    getPublicationStatus.mockResolvedValue({
      success: true,
      data: {
        eventId: 'event-1',
        resultScope: 'QUALIFICATION',
        status: 'DRAFT',
        preliminaryId: null,
        publicationSnapshotRevision: null,
        currentSnapshotRevision: 'b'.repeat(64),
        publicationCurrent: false,
        postedAt: null,
        protestEndsAt: null,
        openProtestReferences: [],
        officialPublishedAt: null,
        approvalId: null,
        canRegisterProtest: false,
        canPublishOfficial: false,
        issues: ['Preliminary results have not been published'],
        history: [],
      },
    });
  });

  it.each(['empty', 'failed'] as const)('prints retained sources when result loading is %s', async (state) => {
    getByEvent.mockResolvedValueOnce(
      state === 'empty'
        ? { success: true, data: { results: [] } }
        : { success: false, error: { message: 'Results unavailable' } },
    );
    const { rerender } = render(<ResultsView eventId="event-1" />);
    await screen.findByText(state === 'empty' ? 'No results' : 'Results unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'EST backup verification' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Print source' }));
    expect(openEstBackupSourcePrint).toHaveBeenCalledWith({ sourceId: 'source-1' });
    expect(listBackupSources).toHaveBeenCalledWith({ eventId: 'event-1' });
    await act(async () => rerender(<ResultsView eventId="event-2" />));
    expect(screen.queryByRole('button', { name: 'Print source' })).not.toBeInTheDocument();
    await act(async () => rerender(<ResultsView eventId="event-2" readOnly />));
    expect(screen.queryByRole('button', { name: 'EST backup verification' })).not.toBeInTheDocument();
  });

  it.each(['RPO', 'MQS', 'OOC'] as const)(
    'shows %s and its score in the saved qualification result table',
    async (entryStatus) => {
      getByEvent.mockResolvedValue({
        success: true,
        data: { eventId: 'event-1', results: [{ ...eventOneResults[0]!, rank: 0, entryStatus }] },
      });
      render(<ResultsView eventId="event-1" />);
      expect(await screen.findByText(entryStatus)).toBeInTheDocument();
      expect(screen.getAllByText('100.0').length).toBeGreaterThan(0);
    },
  );

  it('opens the independent RTS result-verification workflow', async () => {
    render(<ResultsView eventId="event-1" eventName="Qualification" />);

    fireEvent.click(await screen.findByRole('button', { name: 'RTS verification' }));

    await waitFor(() =>
      expect(getVerificationStatus).toHaveBeenCalledWith({ eventId: 'event-1', resultScope: 'QUALIFICATION' }),
    );
    expect(screen.getByRole('dialog', { name: 'RTS result verification — Qualification' })).toBeInTheDocument();
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
  });

  it('opens the result publication workflow independently from score confirmation', async () => {
    render(<ResultsView eventId="event-1" eventName="Qualification" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Publication' }));

    await waitFor(() =>
      expect(getPublicationStatus).toHaveBeenCalledWith({ eventId: 'event-1', resultScope: 'QUALIFICATION' }),
    );
    expect(screen.getByRole('dialog', { name: 'Result publication — Qualification' })).toBeInTheDocument();
    expect(screen.getByText('Preliminary results have not been published')).toBeInTheDocument();
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
    expect(screen.getByText('Available series: S1 (5), S2 (5), S3 (1), S4 (1)')).toBeInTheDocument();
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

  describe('loading, confirming and printing', () => {
    const mixedTeamResult: MixedTeamFinalResultDto = {
      id: '66666666-6666-4666-8666-666666666666',
      eventId: '77777777-7777-4777-8777-777777777777',
      sourceCompetitionId: '88888888-8888-4888-8888-888888888888',
      teamId: 'JPN-1',
      teamName: 'Japan 1',
      nationCode: 'JPN',
      rank: 2,
      stage1Total: 102.3,
      stage2Total: 20.4,
      totalScore: 410.2,
      eliminatedAtShot: 4,
      shootoffId: null,
      remarks: 'Shoot-off won',
      members: [
        {
          participantId: 'member-1',
          playerName: 'Alex Mixed',
          gender: 'M',
          firingPointNumber: 3,
          stage1Shots: [],
          stage2Shots: [],
          totalScore: 205.1,
        },
        {
          participantId: 'member-2',
          playerName: 'Bea Mixed',
          gender: 'F',
          firingPointNumber: 4,
          stage1Shots: [],
          stage2Shots: [],
          totalScore: 204,
        },
      ],
    };
    const errorBannerClass = 'border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error';

    function notifications() {
      return useNotificationStore.getState().notifications.map(({ type, message }) => ({ type, message }));
    }

    beforeEach(() => {
      useNotificationStore.setState({ notifications: [] });
    });

    it.each([
      [
        'a failed Final response',
        () => getFinalByEvent.mockResolvedValue(fail('Final unavailable')),
        'Final unavailable',
      ],
      [
        'a failed Final response without an error',
        () => getFinalByEvent.mockResolvedValue({ success: false }),
        'Failed to load results',
      ],
      [
        'a failed Mixed Team response',
        () => getMixedFinal.mockResolvedValue(fail('Mixed Team unavailable')),
        'Mixed Team unavailable',
      ],
      [
        'a failed Mixed Team response without an error',
        () => getMixedFinal.mockResolvedValue({ success: false }),
        'Failed to load Mixed Team results',
      ],
      [
        'the Final failure when both responses failed',
        () => {
          getFinalByEvent.mockResolvedValue(fail('Final unavailable'));
          getMixedFinal.mockResolvedValue(fail('Mixed Team unavailable'));
        },
        'Final unavailable',
      ],
      ['a rejected error', () => getFinalByEvent.mockRejectedValue(new Error('Final rejected')), 'Final rejected'],
      [
        'a rejected value without a message',
        () => getFinalByEvent.mockRejectedValue('offline'),
        'Failed to load results',
      ],
    ])(
      'shows %s while loading Final results and keeps the EST backup verification',
      async (_case, arrange, message) => {
        arrange();
        render(<ResultsView eventId="event-final" eventName="Final" round="Final" />);

        const banner = await screen.findByText(message);

        expect(banner.outerHTML).toBe(`<p class="${errorBannerClass}">${message}</p>`);
        expect(screen.getByRole('button', { name: 'EST backup verification' })).toBeInTheDocument();
        expect(screen.queryByText('Final Athlete')).not.toBeInTheDocument();
        expect(getFinalByEvent).toHaveBeenCalledWith({ eventId: 'event-final' });
        expect(getMixedFinal).toHaveBeenCalledWith({ eventId: 'event-final' });
      },
    );

    it('shows Final loading and ignores the response of an earlier event', async () => {
      let finishEarlierLoad!: (response: unknown) => void;
      getFinalByEvent.mockImplementationOnce(() => new Promise((resolve) => (finishEarlierLoad = resolve)));
      const { rerender } = render(<ResultsView eventId="event-final" eventName="Final" round="Final" />);

      expect(screen.getByText('Loading results…')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'EST backup verification' })).toBeInTheDocument();
      getFinalByEvent.mockResolvedValueOnce(
        ok({
          eventId: 'event-final-2',
          results: [{ ...finalResult, id: 'final-result-2', playerName: 'Second Final Athlete' }],
        }),
      );
      rerender(<ResultsView eventId="event-final-2" eventName="Final" round="Final" />);
      expect(await screen.findByText('Second Final Athlete')).toBeInTheDocument();

      await act(async () => finishEarlierLoad(ok({ eventId: 'event-final', results: [finalResult] })));

      expect(screen.getByText('Second Final Athlete')).toBeInTheDocument();
      expect(screen.queryByText('Final Athlete')).not.toBeInTheDocument();
      expect(screen.queryByText('Loading results…')).not.toBeInTheDocument();
      expect(getFinalByEvent.mock.calls.map(([input]) => input)).toEqual([
        { eventId: 'event-final' },
        { eventId: 'event-final-2' },
      ]);
    });

    it('shows Mixed Team Final results instead of the individual Final table', async () => {
      getMixedFinal.mockResolvedValue(ok([mixedTeamResult]));
      render(<ResultsView eventId="event-final" eventName="Final" round="Final" />);

      expect(await screen.findByRole('heading', { name: 'Mixed Team Final results' })).toBeInTheDocument();
      expect(
        screen.getByText(
          'Team totals combine the two athletes’ recorded Lane scores. Places follow the recorded Final decisions.',
        ),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
        'Rank',
        'Team',
        'NOC',
        'Members',
        'Stage 1',
        'Stage 2',
        'Total',
        'Decision',
      ]);
      expect(
        within(screen.getAllByRole('row')[1]!)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      ).toEqual([
        '2',
        'Japan 1JPN-1',
        'JPN',
        'M · FP 3 · Alex Mixed · 205.1F · FP 4 · Bea Mixed · 204.0',
        '102.3',
        '20.4',
        '410.2',
        'Placed after shot 4Shoot-off won',
      ]);
      expect(screen.getByRole('button', { name: 'RTS verification' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Results final' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Print' })).not.toBeInTheDocument();
      expect(screen.queryByText('Final Athlete')).not.toBeInTheDocument();
    });

    it('names the winning Mixed Team and hides its actions when read-only', async () => {
      getMixedFinal.mockResolvedValue(ok([{ ...mixedTeamResult, rank: 1, eliminatedAtShot: null, remarks: '' }]));
      render(<ResultsView eventId="event-final" eventName="Final" round="Final" readOnly />);

      expect(await screen.findByText('Winner')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'RTS verification' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Results final' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'EST backup verification' })).not.toBeInTheDocument();
    });

    it('closes the open result workflows when the event changes', async () => {
      const { rerender } = render(<ResultsView eventId="event-1" eventName="Qualification" />);

      fireEvent.click(await screen.findByRole('button', { name: 'RTS verification' }));
      fireEvent.click(screen.getByRole('button', { name: 'Publication' }));
      fireEvent.click(screen.getByRole('button', { name: 'Scoring decisions for Relay One Athlete' }));
      await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(3));
      rerender(<ResultsView eventId="event-2" eventName="Qualification" />);

      expect(await screen.findByText('New Event Athlete')).toBeInTheDocument();
      expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    });

    it('shows the loading state while confirming and then reloads the selected relay', async () => {
      let finishConfirm!: (response: unknown) => void;
      confirm.mockReturnValue(new Promise((resolve) => (finishConfirm = resolve)));
      render(<ResultsView eventId="event-1" />);
      await screen.findByText('Relay Two Athlete');
      fireEvent.change(screen.getByLabelText('Relay:'), { target: { value: '2' } });
      await waitFor(() => expect(getByRelay).toHaveBeenCalledWith({ eventId: 'event-1', relayNumber: 2 }));

      fireEvent.click(await screen.findByRole('button', { name: 'Confirm (1)' }));

      expect(confirm).toHaveBeenCalledWith({ eventId: 'event-1', resultIds: ['result-2'] });
      expect(await screen.findByText('Loading results…')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Confirm/ })).not.toBeInTheDocument();
      await act(async () => finishConfirm({ success: true }));
      await waitFor(() => expect(getByRelay).toHaveBeenCalledTimes(2));
      expect(getByRelay).toHaveBeenLastCalledWith({ eventId: 'event-1', relayNumber: 2 });
      expect(getByEvent).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Relay Two Athlete')).toBeInTheDocument();
    });

    it.each([
      ['a failed confirmation', fail('Confirmation refused'), 'Confirmation refused'],
      ['a failed confirmation without an error', { success: false }, 'Failed to confirm results'],
    ])('reports %s above the results, which stay with their filter', async (_case, response, message) => {
      confirm.mockResolvedValue(response);
      render(<ResultsView eventId="event-1" />);

      fireEvent.click(await screen.findByRole('button', { name: 'Confirm (2)' }));

      expect((await screen.findByRole('alert')).outerHTML).toBe(
        `<p role="alert" class="${errorBannerClass}">${message}</p>`,
      );
      expect(screen.getByText('Relay One Athlete')).toBeInTheDocument();
      expect(screen.getByLabelText('Relay:')).toHaveValue('all');
      expect(screen.getByRole('button', { name: 'Confirm (2)' })).toBeEnabled();
      expect(getByEvent).toHaveBeenCalledTimes(1);
    });

    it('clears a failed confirmation when the results are loaded again', async () => {
      confirm.mockResolvedValue(fail('Confirmation refused'));
      render(<ResultsView eventId="event-1" />);
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm (2)' }));
      await screen.findByRole('alert');

      fireEvent.change(screen.getByLabelText('Relay:'), { target: { value: '2' } });

      await waitFor(() => expect(getByRelay).toHaveBeenCalledWith({ eventId: 'event-1', relayNumber: 2 }));
      await screen.findByText('Relay Two Athlete');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('opens the print window for the selected relay and disables printing while it opens', async () => {
      let finishOpening!: (response: unknown) => void;
      openResultsListPrint.mockResolvedValueOnce({ success: true });
      render(<ResultsView eventId="event-1" eventName="Qualification" />);

      fireEvent.click(await screen.findByRole('button', { name: 'Print' }));
      await waitFor(() =>
        expect(openResultsListPrint).toHaveBeenCalledWith({
          eventId: 'event-1',
          eventName: 'Qualification',
          relayNumber: undefined,
        }),
      );
      fireEvent.change(screen.getByLabelText('Relay:'), { target: { value: '2' } });
      await waitFor(() => expect(getByRelay).toHaveBeenCalledWith({ eventId: 'event-1', relayNumber: 2 }));
      openResultsListPrint.mockReturnValueOnce(new Promise((resolve) => (finishOpening = resolve)));
      fireEvent.click(await screen.findByRole('button', { name: 'Print' }));

      expect(await screen.findByRole('button', { name: 'Opening…' })).toBeDisabled();
      expect(openResultsListPrint).toHaveBeenLastCalledWith({
        eventId: 'event-1',
        eventName: 'Qualification',
        relayNumber: 2,
      });
      await act(async () => finishOpening({ success: true }));
      expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled();
      expect(notifications()).toEqual([]);
    });

    it.each([
      ['a failed response', () => openResultsListPrint.mockResolvedValueOnce(fail('Print refused'))],
      ['a rejected value', () => openResultsListPrint.mockRejectedValueOnce('offline')],
    ])('reports %s while opening the print window', async (_case, arrange) => {
      arrange();
      render(<ResultsView eventId="event-final" eventName="Final" round="Final" />);

      fireEvent.click(await screen.findByRole('button', { name: 'Print' }));

      await waitFor(() =>
        expect(notifications()).toEqual([{ type: 'error', message: 'Failed to open the print window' }]),
      );
      expect(openResultsListPrint).toHaveBeenCalledWith({ eventId: 'event-final', eventName: 'Final' });
      expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled();
    });
  });
});
