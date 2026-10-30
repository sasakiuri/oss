// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { StartupRecovery } from '@/renderer/presentation/screens/StartupRecovery';
import { useDirectorMembershipStore } from '@/renderer/presentation/stores/directorMembershipStore';
import { competitionService } from '@/renderer/services/competitionService';
import { settingsService } from '@/renderer/services/settingsService';

import { createMockElectronAPI } from '../../../helpers/mockElectronAPI';

vi.mock('@/renderer/presentation/components/SettingsModal', () => ({ SettingsModal: () => null }));
vi.mock('@/renderer/services/competitionService', () => ({
  competitionService: { getCompetitionTypes: vi.fn(), startCompetition: vi.fn() },
}));
vi.mock('@/renderer/services/settingsService', () => ({ settingsService: { saveUserPreferences: vi.fn() } }));
const state = {
  status: 'ERROR' as const,
  error: 'Saved run is unreadable',
  competitionId: null,
  sessionId: null,
  currentSeriesStartIndex: 0,
  canFinish: false,
};
beforeEach(() => {
  const api = createMockElectronAPI();
  api.startup.setAsideSavedRun.mockResolvedValue({ success: true, data: state });
  window.electronAPI = api as unknown as typeof window.electronAPI;
  useDirectorMembershipStore.setState({
    membership: { competitionId: null, revision: 1 },
    hydrated: true,
    hydrationFailed: false,
  });
});

it('requires confirmation to set aside an unreadable saved run', async () => {
  const retry = vi.fn().mockResolvedValue(undefined);
  render(<StartupRecovery state={{ ...state, canSetAside: true }} onRetry={retry} />);
  fireEvent.click(screen.getByRole('button', { name: 'Set aside saved run' }));
  expect(window.electronAPI.startup.setAsideSavedRun).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(retry).toHaveBeenCalledOnce());
  expect(window.electronAPI.startup.setAsideSavedRun).toHaveBeenCalledOnce();
});

it('creates only the operator-selected valid type after an unknown saved type', async () => {
  vi.mocked(competitionService.getCompetitionTypes).mockResolvedValue([
    { id: 'AR60', name: 'Air rifle' },
    { id: 'AP60', name: 'Air pistol' },
  ]);
  vi.mocked(competitionService.startCompetition).mockResolvedValue({ competitionId: 'new', sessionId: 'session' });
  vi.mocked(settingsService.saveUserPreferences).mockResolvedValue(undefined);
  const retry = vi.fn().mockResolvedValue(undefined);
  render(<StartupRecovery state={{ ...state, canChooseType: true }} onRetry={retry} />);
  await screen.findByRole('option', { name: 'Air pistol' });
  expect(competitionService.startCompetition).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Competition type'), { target: { value: 'AP60' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create competition' }));
  await waitFor(() => expect(retry).toHaveBeenCalledOnce());
  expect(competitionService.startCompetition).toHaveBeenCalledWith({ competitionTypeId: 'AP60' });
  expect(settingsService.saveUserPreferences).toHaveBeenCalledWith({ competitionTypeId: 'AP60' });
});
