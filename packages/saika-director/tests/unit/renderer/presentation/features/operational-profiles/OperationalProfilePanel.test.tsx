import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OperationalProfilePanel } from '@/renderer/presentation/features/operational-profiles/OperationalProfilePanel';
import { operationalProfilesService } from '@/renderer/services';

vi.mock('@/renderer/services', () => ({ operationalProfilesService: { preview: vi.fn(), apply: vi.fn() } }));

describe('OperationalProfilePanel', () => {
  it('previews mode changes before applying and displays an individual failure', async () => {
    vi.mocked(operationalProfilesService.preview).mockImplementation(async (input) => ({
      success: true,
      data: {
        competitionId: input.competitionId,
        fingerprint: 'a'.repeat(64),
        changes: [
          {
            id: 'clock',
            label: 'Clock quality',
            scope: 'DIRECTOR',
            before: 'ADVISORY',
            after: input.modes.clock ?? 'ADVISORY',
            context: 'existing thresholds',
          },
        ],
      },
    }));
    vi.mocked(operationalProfilesService.apply).mockResolvedValue({
      success: true,
      data: { complete: false, results: [{ id: 'clock', status: 'FAILED', message: 'Another competition is active' }] },
    });
    const applied = vi.fn();
    render(<OperationalProfilePanel competitionId="11111111-1111-4111-8111-111111111111" onApplied={applied} />);
    expect(await screen.findByText('All competitions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Require all listed checks' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply reviewed settings' })).toBeEnabled());
    expect(operationalProfilesService.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed settings' }));
    expect(await screen.findByText(/Another competition is active/)).toBeInTheDocument();
    expect(operationalProfilesService.apply).toHaveBeenCalledWith(
      expect.objectContaining({ modes: { clock: 'REQUIRED' }, fingerprint: 'a'.repeat(64) }),
    );
    expect(applied).toHaveBeenCalledOnce();
  });
});
