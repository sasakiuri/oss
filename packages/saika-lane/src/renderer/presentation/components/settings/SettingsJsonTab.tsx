// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';

import { ErrorAlert } from '@/renderer/presentation/components/common/ErrorAlert';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { settingsService } from '@/renderer/services/settingsService';
import { errorMessage } from '@/shared/errors/errorMessage';
import type { AppSettingsDto, AppSettingsInputDto, SettingsFileInfoDto } from '@/shared/ipc/contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applySettingsToStores(settings: AppSettingsDto) {
  useSessionStore.getState().setLaneNumber(settings.userPreferences.laneNumber);
  useSessionStore.getState().setAudioVolume(settings.userPreferences.audioVolume);
  useSessionStore.getState().setDiscipline(settings.userPreferences.discipline);

  useCompetitionStore.getState().setSavedCompetitionTypeId(settings.userPreferences.competitionTypeId || null);
}

async function readSettingsDocument() {
  const settings = await settingsService.getAppSettings();
  let metadata: SettingsFileInfoDto | null = null;

  try {
    metadata = await settingsService.getSettingsFileInfo();
  } catch {
    metadata = null;
  }

  return { settings, metadata };
}

/** Edits the whole settings.json document; loads it each time the tab is shown and on Reload. */
export function SettingsJsonTab() {
  const laneNumber = useSessionStore((state) => state.laneNumber);
  const audioVolume = useSessionStore((state) => state.audioVolume);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [settingsFilePath, setSettingsFilePath] = useState('');
  const draftDirtyRef = useRef(false);

  /** Reloads the document; a draft edited while loading is kept. */
  const load = async (isCancelled: () => boolean = () => false) => {
    try {
      setError(null);
      setDraft('');
      setSettingsFilePath('');
      draftDirtyRef.current = false;
      const { settings, metadata } = await readSettingsDocument();
      if (isCancelled()) {
        return;
      }

      setSettingsFilePath(metadata?.path ?? 'Unavailable');
      if (!draftDirtyRef.current) {
        setDraft(JSON.stringify(settings, null, 2));
      }
    } catch (err) {
      if (!isCancelled()) {
        setError(errorMessage(err));
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, []);

  // Like the dialog's other fields, a lane number or volume change (for example after Save JSON) clears the
  // error and the edited flag.
  useEffect(() => {
    setError(null);
    draftDirtyRef.current = false;
  }, [laneNumber, audioVolume]);

  const handleSave = async () => {
    try {
      setError(null);
      const parsed = JSON.parse(draft) as unknown;
      const normalizedSettings =
        isRecord(parsed) &&
        isRecord(parsed.mqtt) &&
        typeof parsed.mqtt.laneId === 'string' &&
        parsed.mqtt.laneId.trim() === ''
          ? {
              ...parsed,
              mqtt: {
                enabled: parsed.mqtt.enabled,
                brokerUrl: parsed.mqtt.brokerUrl,
                laneAlias: parsed.mqtt.laneAlias,
                autoConnect: parsed.mqtt.autoConnect,
              },
            }
          : parsed;

      await settingsService.saveAppSettings(normalizedSettings as AppSettingsInputDto);
      const normalized = await settingsService.getAppSettings();
      draftDirtyRef.current = false;
      setDraft(JSON.stringify(normalized, null, 2));
      applySettingsToStores(normalized);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 p-4">
        <div className="rounded border border-zinc-700 bg-zinc-900/60 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">settings.json</p>
          <p className="mt-1 break-all font-mono text-xs text-zinc-300">{settingsFilePath || 'Loading...'}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="settings-json" className="text-sm font-medium text-zinc-300">
            Settings Document
          </label>
          <textarea
            id="settings-json"
            value={draft}
            onChange={(e) => {
              draftDirtyRef.current = true;
              setDraft(e.target.value);
            }}
            spellCheck={false}
            className="h-72 resize-none rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs text-zinc-400">
            Updating the entire document applies the same validation as saving through the GUI. mqtt.laneId is managed
            automatically and retains its current value when saved.
          </span>
        </div>
      </div>

      {error && <ErrorAlert inset>{error}</ErrorAlert>}

      <div className="flex items-center justify-end gap-2 border-t border-zinc-700 bg-zinc-900 px-4 py-3">
        <button
          onClick={() => void load()}
          className="rounded bg-zinc-700 px-4 py-2 text-sm text-zinc-100 transition-colors hover:bg-zinc-600"
        >
          Reload
        </button>
        <button
          onClick={handleSave}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500"
        >
          Save JSON
        </button>
      </div>
    </>
  );
}
