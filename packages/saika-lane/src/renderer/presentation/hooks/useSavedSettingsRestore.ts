// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { logRendererError } from '@/renderer/presentation/stores/logStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { settingsService } from '@/renderer/services/settingsService';
import { errorMessage } from '@/shared/errors/errorMessage';

/**
 * Hook that restores saved user settings on mount.
 *
 * Reads laneNumber, audioVolume and competitionTypeId from settingsService.getUserPreferences()
 * and applies them to the session and competition stores.
 */
export function useSavedSettingsRestore(): void {
  useEffect(() => {
    const loadSavedSettings = async () => {
      try {
        const prefs = await settingsService.getUserPreferences();
        const { laneNumber } = prefs;

        if (laneNumber !== undefined) {
          useSessionStore.getState().setLaneNumber(laneNumber);
        }
        if (prefs.audioVolume !== undefined) {
          useSessionStore.getState().setAudioVolume(prefs.audioVolume);
        }
        if (prefs.competitionTypeId) {
          useCompetitionStore.getState().setSavedCompetitionTypeId(prefs.competitionTypeId);
        }
      } catch (error) {
        logRendererError('settings-restore-error', `Failed to load user preferences: ${errorMessage(error)}`);
      }
    };

    loadSavedSettings();
  }, []);
}
