import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { getReviewSettings, setReviewSettings } = vi.hoisted(() => ({
  getReviewSettings: vi.fn(),
  setReviewSettings: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({ resultPublicationService: { getReviewSettings, setReviewSettings } }));
import { ResultPublicationSettingsPanel } from '@/renderer/presentation/features/settings/ResultPublicationSettingsPanel';

describe('ResultPublicationSettingsPanel', () => {
  it('saves each review requirement independently', async () => {
    getReviewSettings.mockResolvedValue({
      success: true,
      data: { requireIncidentReports: true, requireFinalRecoveriesComplete: true, requireProtestCasesComplete: true },
    });
    setReviewSettings.mockImplementation(async (data) => ({ success: true, data }));
    render(<ResultPublicationSettingsPanel />);
    fireEvent.click(await screen.findByLabelText('Require completed or voided Final recovery cases'));
    fireEvent.click(screen.getByRole('button', { name: 'Save official result checks' }));
    await waitFor(() =>
      expect(setReviewSettings).toHaveBeenCalledWith({
        requireIncidentReports: true,
        requireFinalRecoveriesComplete: false,
        requireProtestCasesComplete: true,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('checks saved');
  });
});
