import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductionOperationsPanel } from '@/renderer/presentation/features/production-operations/ProductionOperationsPanel';
import { productionOperationsService } from '@/renderer/services';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);

const scope = {
  competitionId: '00000000-0000-4000-8000-000000000001',
  competitionTypeId: 'air-rifle',
  roundName: 'Final',
  phase: 'MATCH',
};
const assessment = {
  mode: 'ADVISORY' as const,
  musicRequired: true,
  musicPlaying: false,
  musicProgramApproved: false,
  finalProductionConfirmed: false,
  ready: false,
  mayProceed: true,
  guidance: ['Start the music before the Final'],
  ruleReferences: ['ISSF 6.17'],
};

describe('ProductionOperationsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a failed assessment as its message', async () => {
    vi.mocked(productionOperationsService.assess).mockResolvedValue(fail('Production policy is unavailable'));
    render(<ProductionOperationsPanel {...scope} />);
    expect(await screen.findByText('Production policy is unavailable')).toBeInTheDocument();
    expect(screen.getByText(/policy … · action advised/)).toBeInTheDocument();
  });

  it('shows a failed record as its message without reloading the assessment', async () => {
    vi.mocked(productionOperationsService.assess).mockResolvedValue(ok(assessment));
    vi.mocked(productionOperationsService.record).mockResolvedValue(
      fail('The music programme is not approved', 'VALIDATION_ERROR'),
    );
    render(<ProductionOperationsPanel {...scope} />);
    expect(await screen.findByText('Start the music before the Final')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Official / sound technician'), { target: { value: 'Sound A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record music started' }));
    expect(await screen.findByText('The music programme is not approved')).toBeInTheDocument();
    expect(productionOperationsService.record).toHaveBeenCalledWith({
      ...scope,
      action: 'MUSIC_STARTED',
      officialName: 'Sound A',
      statement: 'External sound and production system checked',
    });
    expect(productionOperationsService.assess).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record music started' })).toBeEnabled());
  });
});
