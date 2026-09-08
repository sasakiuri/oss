import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetitionStartReadinessPanel } from '@/renderer/presentation/features/competition-control/CompetitionStartReadinessPanel';
import { mqttService } from '@/renderer/services';

vi.mock('@/renderer/services', () => ({ mqttService: { getStartReadiness: vi.fn() } }));
const scope = { competitionId: '11111111-1111-4111-8111-111111111111', phase: 'SIGHTING' as const };
const data = { ...scope, checkedAt: '2026-09-08T00:00:00.000Z', laneIds: ['lane-a'], issues: [] };

describe('CompetitionStartReadinessPanel', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.useRealTimers());

  it('distinguishes blocking checks from advisory issues and refreshes on request', async () => {
    vi.mocked(mqttService.getStartReadiness)
      .mockResolvedValueOnce({
        success: true,
        data: {
          ...data,
          issues: [
            { code: 'EST_INSPECTION', message: 'Target inspection missing', blocking: true },
            { code: 'CLOCK_QUALITY', message: 'Probe Lane A', blocking: false },
          ],
        },
      })
      .mockResolvedValue({ success: true, data });
    render(<CompetitionStartReadinessPanel {...scope} />);
    expect(await screen.findByText('Target inspection missing', { exact: false })).toHaveTextContent('Required:');
    expect(screen.getByText('Probe Lane A', { exact: false })).toHaveTextContent('Advisory:');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh checks' }));
    expect(await screen.findByText('No outstanding configured checks.')).toBeInTheDocument();
  });

  it('replaces an earlier clear assessment when a periodic refresh fails', async () => {
    vi.useFakeTimers();
    vi.mocked(mqttService.getStartReadiness)
      .mockResolvedValueOnce({ success: true, data })
      .mockRejectedValue(new Error('Disconnected'));
    render(<CompetitionStartReadinessPanel {...scope} />);
    await act(async () => {});
    expect(screen.getByText('No outstanding configured checks.')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole('alert')).toHaveTextContent('Disconnected');
    expect(screen.queryByText('No outstanding configured checks.')).not.toBeInTheDocument();
  });

  it('ignores late replies from the previously selected competition', async () => {
    let resolveFirst!: (value: { success: true; data: typeof data }) => void;
    vi.mocked(mqttService.getStartReadiness).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    vi.mocked(mqttService.getStartReadiness).mockResolvedValue({
      success: true,
      data: { ...data, competitionId: 'other', laneIds: [] },
    });
    const view = render(<CompetitionStartReadinessPanel {...scope} />);
    view.rerender(<CompetitionStartReadinessPanel {...scope} competitionId="other" />);
    expect(await screen.findByText('Join Lanes before checking their readiness.')).toBeInTheDocument();
    await act(async () => resolveFirst({ success: true, data }));
    expect(screen.queryByText('No outstanding configured checks.')).not.toBeInTheDocument();
    expect(screen.getByText('Join Lanes before checking their readiness.')).toBeInTheDocument();
  });
});
