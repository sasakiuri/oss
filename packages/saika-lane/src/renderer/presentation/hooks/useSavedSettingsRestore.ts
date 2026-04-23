// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useLogStore } from '@/renderer/presentation/stores/logStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { settingsService } from '@/renderer/services/settingsService';

/**
 * Hook that restores saved user settings on mount.
 *
 * Reads discipline and laneNumber from settingsService.getUserPreferences()
 * and applies them to sessionStore.
 */
export function useSavedSettingsRestore(): void {
  useEffect(() => {
    const loadSavedSettings = async () => {
      try {
        const prefs = await settingsService.getUserPreferences();
        const { discipline, laneNumber } = prefs;

        if (discipline) {
          useSessionStore.getState().setDiscipline(discipline);
        }
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
        useLogStore.getState().addEntry({
          id: `settings-restore-error-${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `Failed to load user preferences: ${error instanceof Error ? error.message : String(error)}`,
          source: 'renderer',
        });
      }
    };

    loadSavedSettings();
  }, []);
}
