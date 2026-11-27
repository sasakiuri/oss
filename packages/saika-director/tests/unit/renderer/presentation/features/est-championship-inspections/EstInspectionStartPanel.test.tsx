import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, getAll, getStartSettings, setStartSettings } = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  getStartSettings: vi.fn(),
  setStartSettings: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  championshipService: { getAll },
  estChampionshipInspectionsService: { get, getStartSettings, setStartSettings },
}));
import { EstInspectionStartPanel } from '@/renderer/presentation/features/est-championship-inspections/EstInspectionStartPanel';
import { ok } from '../../../../../helpers/renderer/serviceResponses';

const settings = { competitionId: 'competition', championshipId: 'championship', mode: 'ADVISORY', laneTargets: [] };
const failure = (message: string) => ({ success: false, error: { code: 'UNKNOWN_ERROR', message } });

function renderPanel() {
  render(<EstInspectionStartPanel competitionId="competition" lanes={[{ laneId: 'lane', label: 'Lane A' }]} />);
}

describe('EstInspectionStartPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAll.mockResolvedValue(ok({ championships: [{ id: 'championship', name: 'Championship' }] }));
    getStartSettings.mockResolvedValue(ok(settings));
    get.mockResolvedValue(ok({ ready: true, plan: { versionNumber: 1 }, targets: [] }));
  });

  it('shows a failed settings load with the Error prefix and renders no form', async () => {
    getStartSettings.mockResolvedValue(failure('Settings unavailable'));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Error: Settings unavailable$/);
    expect(screen.queryByLabelText('Inspection policy')).toBeNull();
  });

  it('shows a failed championship load with the Error prefix and renders no form', async () => {
    getAll.mockResolvedValue(failure('Championships unavailable'));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Error: Championships unavailable$/);
    expect(screen.queryByLabelText('Inspection policy')).toBeNull();
  });

  it('shows a failed inspection load with the Error prefix and keeps the form', async () => {
    get.mockResolvedValue(failure('Inspection unavailable'));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Error: Inspection unavailable$/);
    expect(screen.getByLabelText('Inspection policy')).toBeInTheDocument();
    expect(screen.getByText('Loading inspection…')).toBeInTheDocument();
  });

  it('shows a failed save as its message and does not report the policy as saved', async () => {
    setStartSettings.mockResolvedValue(failure('Plan is stale'));
    renderPanel();
    await screen.findByText('Plan 1 · all targets passed');
    fireEvent.click(screen.getByRole('button', { name: 'Save inspection start policy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Plan is stale$/);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByLabelText('Inspection policy')).toHaveValue('ADVISORY');
  });

  it('saves multiple physical targets for one Lane and the chosen enforcement mode', async () => {
    getStartSettings.mockResolvedValue(
      ok({ competitionId: 'competition', championshipId: 'championship', mode: 'ADVISORY', laneTargets: [] }),
    );
    get.mockResolvedValue(
      ok({
        ready: true,
        plan: { versionNumber: 1 },
        targets: ['EST-1', 'EST-2'].map((targetIdentifier) => ({ targetIdentifier, status: 'PASSED' })),
      }),
    );
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
