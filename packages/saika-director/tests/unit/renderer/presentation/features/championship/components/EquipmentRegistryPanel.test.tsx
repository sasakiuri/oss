import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EquipmentRegistryPanel } from '@/renderer/presentation/features/championship/components/EquipmentRegistryPanel';
import { equipmentRegistryService } from '@/renderer/services';
vi.mock('@/renderer/services', () => ({ equipmentRegistryService: { getWorkspace: vi.fn(), saveEquipment: vi.fn() } }));
describe('EquipmentRegistryPanel', () => {
  it('requires attribution and retains form input on a stale-record failure', async () => {
    const athleteId = '22222222-2222-4222-8222-222222222222';
    vi.mocked(equipmentRegistryService.getWorkspace).mockResolvedValue({
      success: true,
      data: {
        revision: 3,
        athletes: [{ id: athleteId, name: 'Athlete A', issfId: null }],
        equipment: [],
        entries: [],
        activeCalibrationIds: [],
      },
    });
    vi.mocked(equipmentRegistryService.saveEquipment).mockResolvedValue({
      success: false,
      error: { code: 'COMMAND_ERROR', message: 'Equipment records changed; reload before saving' },
    });
    render(<EquipmentRegistryPanel championshipId="11111111-1111-4111-8111-111111111111" />);
    fireEvent.click(screen.getByText('Register or amend equipment'));
    await screen.findByRole('option', { name: 'Athlete A' });
    expect(screen.getByRole('button', { name: 'Register equipment' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Equipment official'), { target: { value: 'EC Official' } });
    fireEvent.change(screen.getByLabelText('Record statement / correction reason'), {
      target: { value: 'Registration from equipment card' },
    });
    fireEvent.change(screen.getByLabelText('Registered athlete'), { target: { value: athleteId } });
    fireEvent.change(screen.getByLabelText('Equipment description'), { target: { value: 'Air rifle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register equipment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Equipment records changed');
    expect(equipmentRegistryService.saveEquipment).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 3,
        officialName: 'EC Official',
        details: expect.objectContaining({ athleteIdentityId: athleteId, description: 'Air rifle' }),
      }),
    );
    expect(screen.getByLabelText('Equipment description')).toHaveValue('Air rifle');
  });
});
