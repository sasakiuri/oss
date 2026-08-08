// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsTargetTab } from '@/renderer/presentation/components/settings/SettingsTargetTab';
import { settingsService } from '@/renderer/services/settingsService';

// ============================================================
// Mocks
// ============================================================

const mockStartCompetition = vi.fn().mockResolvedValue({ competitionId: 'comp-1', sessionId: 'session-1' });
const mockStartStage = vi.fn().mockResolvedValue({ sessionId: 'session-1' });
const mockGetCompetitionTypes = vi.fn().mockResolvedValue([
  { id: 'AR60', name: '10m Air Rifle 60 shots' },
  { id: 'BR60S', name: 'BR 60S Qualification' },
  { id: 'BP60', name: 'BP 60 Qualification' },
]);

vi.mock('@/renderer/services/competitionService', () => ({
  competitionService: {
    startCompetition: (...args: unknown[]) => mockStartCompetition(...args),
    startStage: (...args: unknown[]) => mockStartStage(...args),
    getCompetitionTypes: () => mockGetCompetitionTypes(),
    startNextSeries: vi.fn(),
    endStage: vi.fn(),
    advanceStage: vi.fn(),
    finishCompetition: vi.fn(),
    getCompetitionState: vi.fn(),
  },
}));

vi.mock('@/renderer/services/settingsService', () => ({
  settingsService: {
    saveUserPreferences: vi.fn().mockResolvedValue(undefined),
    getUserPreferences: vi.fn().mockResolvedValue({ laneNumber: 1 }),
    saveConnectionSettings: vi.fn().mockResolvedValue(undefined),
    getConnectionSettings: vi.fn().mockResolvedValue({}),
  },
}));

const mockSaveUserPreferences = vi.mocked(settingsService.saveUserPreferences);

// ============================================================
// Tests
// ============================================================

describe('SettingsTargetTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartCompetition.mockResolvedValue({ competitionId: 'comp-1', sessionId: 'session-1' });
    mockStartStage.mockResolvedValue({ sessionId: 'session-1' });
    mockGetCompetitionTypes.mockResolvedValue([
      { id: 'AR60', name: '10m Air Rifle 60 shots' },
      { id: 'BR60S', name: 'BR 60S Qualification' },
      { id: 'BP60', name: 'BP 60 Qualification' },
    ]);
  });

  describe('rendering', () => {
    it('dynamically displays competition type buttons', async () => {
      render(<SettingsTargetTab />);

      await waitFor(() => {
        expect(screen.getByText('10m Air Rifle 60 shots')).toBeInTheDocument();
        expect(screen.getByText('BR 60S Qualification')).toBeInTheDocument();
        expect(screen.getByText('BP 60 Qualification')).toBeInTheDocument();
      });
    });

    it('all buttons are button elements', async () => {
      render(<SettingsTargetTab />);

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(3);
      });
    });

    it('does not display buttons when competition type retrieval fails', async () => {
      mockGetCompetitionTypes.mockRejectedValueOnce(new Error('Failed'));

      render(<SettingsTargetTab />);

      // Wait for useEffect to settle
      await act(async () => {});

      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
  });

  describe('event selection', () => {
    it('clicking an event calls startCompetition + startStage', async () => {
      render(<SettingsTargetTab />);

      await waitFor(() => {
        expect(screen.getByText('BR 60S Qualification')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('BR 60S Qualification'));
      });

      await waitFor(() => {
        expect(mockStartCompetition).toHaveBeenCalledWith({ competitionTypeId: 'BR60S' });
        expect(mockStartStage).toHaveBeenCalledWith({ competitionId: 'comp-1' });
      });
    });

    it('clicking an event calls saveUserPreferences', async () => {
      render(<SettingsTargetTab />);

      await waitFor(() => {
        expect(screen.getByText('BP 60 Qualification')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('BP 60 Qualification'));
      });

      await waitFor(() => {
        expect(mockSaveUserPreferences).toHaveBeenCalledWith({
          competitionTypeId: 'BP60',
        });
      });
    });

    it('competition starts successfully even when save fails', async () => {
      mockSaveUserPreferences.mockRejectedValueOnce(new Error('Save failed'));

      render(<SettingsTargetTab />);

      await waitFor(() => {
        expect(screen.getByText('BR 60S Qualification')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('BR 60S Qualification'));
      });

      await waitFor(() => {
        expect(mockStartCompetition).toHaveBeenCalled();
        expect(mockStartStage).toHaveBeenCalled();
      });
    });
  });

  describe('rapid click prevention', () => {
    it('cards are disabled while isApplying', async () => {
      mockStartCompetition.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );

      render(<SettingsTargetTab />);

      await waitFor(() => {
        expect(screen.getByText('BR 60S Qualification')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('BR 60S Qualification'));
      });

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });
});
