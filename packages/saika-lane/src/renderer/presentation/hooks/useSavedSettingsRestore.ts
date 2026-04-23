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
    let cancelled = false;
    const initialSessionState = {
      discipline: useSessionStore.getState().discipline,
      laneNumber: useSessionStore.getState().laneNumber,
      audioVolume: useSessionStore.getState().audioVolume,
    };
    const initialCompetitionTypeId = useCompetitionStore.getState().savedCompetitionTypeId;

    const loadSavedSettings = async () => {
      try {
        const prefs = await settingsService.getUserPreferences();
        const { discipline, laneNumber } = prefs;
        if (cancelled) {
          return;
        }

        const sessionStore = useSessionStore.getState();
        const competitionStore = useCompetitionStore.getState();

        if (discipline && sessionStore.discipline === initialSessionState.discipline) {
          sessionStore.setDiscipline(discipline);
        }
        if (laneNumber !== undefined && sessionStore.laneNumber === initialSessionState.laneNumber) {
          sessionStore.setLaneNumber(laneNumber);
        }
        if (prefs.audioVolume !== undefined && sessionStore.audioVolume === initialSessionState.audioVolume) {
          sessionStore.setAudioVolume(prefs.audioVolume);
        }
        if (prefs.competitionTypeId && competitionStore.savedCompetitionTypeId === initialCompetitionTypeId) {
          competitionStore.setSavedCompetitionTypeId(prefs.competitionTypeId);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        useLogStore.getState().addEntry({
          id: `settings-restore-error-${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `Failed to load user preferences: ${error instanceof Error ? error.message : String(error)}`,
          source: 'renderer',
        });
      }
    };

    void loadSavedSettings();

    return () => {
      cancelled = true;
    };
  }, []);
}
