import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { get, getStartSettings, setStartSettings } = vi.hoisted(() => ({
  get: vi.fn(),
  getStartSettings: vi.fn(),
  setStartSettings: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  championshipService: {
    getChampionships: async () => ({
      success: true,
      data: { championships: [{ id: 'championship', name: 'Championship' }] },
    }),
  },
  estChampionshipInspectionsService: { get, getStartSettings, setStartSettings },
}));
import { EstInspectionStartPanel } from '@/renderer/presentation/features/est-championship-inspections/EstInspectionStartPanel';

describe('EstInspectionStartPanel', () => {
  it('saves multiple physical targets for one Lane and the chosen enforcement mode', async () => {
    getStartSettings.mockResolvedValue({
      success: true,
      data: { competitionId: 'competition', championshipId: 'championship', mode: 'ADVISORY', laneTargets: [] },
    });
    get.mockResolvedValue({
      success: true,
      data: {
        ready: true,
        plan: { versionNumber: 1 },
        targets: ['EST-1', 'EST-2'].map((targetIdentifier) => ({ targetIdentifier, status: 'PASSED' })),
      },
    });
    setStartSettings.mockImplementation(async (data) => ({ success: true, data }));
    render(<EstInspectionStartPanel competitionId="competition" lanes={[{ laneId: 'lane', label: 'Lane A' }]} />);
    const targets = (await screen.findByLabelText('Targets · Lane A')) as HTMLSelectElement;
    for (const option of Array.from(targets.options)) option.selected = true;
    fireEvent.change(targets);
    fireEvent.change(screen.getByLabelText('Inspection policy'), { target: { value: 'REQUIRED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save inspection start policy' }));
    await waitFor(() =>
      expect(setStartSettings).toHaveBeenCalledWith({
        competitionId: 'competition',
        championshipId: 'championship',
        mode: 'REQUIRED',
        laneTargets: [{ laneId: 'lane', targetIdentifiers: ['EST-1', 'EST-2'] }],
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('policy saved');
  });
});
