import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TeamResultsPanel } from '@/renderer/presentation/features/championship/components/TeamResultsPanel';
import { teamResultsService } from '@/renderer/services';

import { fail } from '../../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../../helpers/renderer/mockServices')).mockServices(),
);

describe('TeamResultsPanel', () => {
  it('shows a failed load as its message or the fallback text', async () => {
    vi.mocked(teamResultsService.getQualification)
      .mockResolvedValueOnce(fail('Event not found'))
      .mockRejectedValueOnce('offline');
    render(<TeamResultsPanel eventId="event" onClose={() => {}} />);
    expect(await screen.findByText('Event not found')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('Failed to load team results')).toBeVisible();
    expect(screen.queryByText('Event not found')).toBeNull();
  });
});
