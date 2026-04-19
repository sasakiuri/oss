// SPDX-License-Identifier: MIT
/**
 * SettingsModal component
 *
 * @description
 * Settings modal component.
 * General tab: Lane number settings
 * Target tab: Discipline selection
 * Connection tab: USB connection management
 *
 * @example
 * ```tsx
 * <SettingsModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   initialTab="target"
 * />
 * ```
 */

import { Volume2, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useMqttStore } from '@/renderer/presentation/stores/mqttStore';
import { settingsService } from '@/renderer/services/settingsService';
import type { AppSettingsDto } from '@/shared/ipc/contracts';

import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { useSessionStore } from '../stores/sessionStore';

import { MqttSettingsTab } from './settings/MqttSettingsTab';
import { SettingsConnectionTab } from './settings/SettingsConnectionTab';
import { SettingsTargetTab } from './settings/SettingsTargetTab';

/**
 * SettingsModal component props
 */
export interface SettingsModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Initial tab to display */
  initialTab?: 'general' | 'target' | 'connection' | 'mqtt' | 'json';
  /** Optional CSS class name */
  className?: string;
}

/**
 * SettingsModal component
 */
export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'general',
  className = '',
}) => {
  const { laneNumber, setLaneNumber, audioVolume, setAudioVolume } = useSessionStore();
  const { playTestSound } = useAudioPlayback();
  const [inputValue, setInputValue] = useState(laneNumber.toString());
  const [volumeValue, setVolumeValue] = useState(audioVolume);
  const [activeTab, setActiveTab] = useState<'general' | 'target' | 'connection' | 'mqtt' | 'json'>(initialTab);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [settingsFilePath, setSettingsFilePath] = useState('');

  const applySettingsToStores = (settings: AppSettingsDto) => {
    useSessionStore.getState().setLaneNumber(settings.userPreferences.laneNumber);
    useSessionStore.getState().setAudioVolume(settings.userPreferences.audioVolume);
    useSessionStore.getState().setDiscipline(settings.userPreferences.discipline);

    useCompetitionStore.getState().setSavedCompetitionTypeId(settings.userPreferences.competitionTypeId || null);
    useMqttStore.getState().setSettings(settings.mqtt);
  };

  const readSettingsDocument = async () => {
    const [settings, metadata] = await Promise.all([
      settingsService.getAppSettings(),
      settingsService.getSettingsFileInfo(),
    ]);

    return { settings, metadata };
  };

  // Sync input values with store when modal opens or values change
  useEffect(() => {
    if (isOpen) {
      setInputValue(laneNumber.toString());
      setVolumeValue(audioVolume);
      setSaveError(null);
      setJsonError(null);
    }
  }, [isOpen, laneNumber, audioVolume]);

  // Reset active tab only when modal opens or initialTab changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'json') {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setJsonError(null);
        const { settings, metadata } = await readSettingsDocument();
        if (cancelled) {
          return;
        }

        setJsonDraft(JSON.stringify(settings, null, 2));
        setSettingsFilePath(metadata.path);
      } catch (err) {
        if (!cancelled) {
          setJsonError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const parsedValue = parseInt(inputValue, 10);
    const isValidLaneNumber = !isNaN(parsedValue) && parsedValue > 0;

    // Persist first, then update store only on success
    try {
      setSaveError(null);
      await settingsService.saveUserPreferences({
        ...(isValidLaneNumber ? { laneNumber: parsedValue } : {}),
        audioVolume: volumeValue,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      return;
    }

    // Store update: volume is always saved, lane number only when validation passes
    setAudioVolume(volumeValue);
    if (isValidLaneNumber) {
      setLaneNumber(parsedValue);
    }

    onClose();
  };

  const handleReloadJson = async () => {
    try {
      setJsonError(null);
      const { settings, metadata } = await readSettingsDocument();
      setJsonDraft(JSON.stringify(settings, null, 2));
      setSettingsFilePath(metadata.path);
      applySettingsToStores(settings);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveJson = async () => {
    try {
      setJsonError(null);
      const parsed = JSON.parse(jsonDraft) as AppSettingsDto;
      await settingsService.saveAppSettings(parsed);
      const normalized = await settingsService.getAppSettings();
      setJsonDraft(JSON.stringify(normalized, null, 2));
      applySettingsToStores(normalized);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 ${className}`.trim()}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="w-[500px] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-700 bg-zinc-900 px-4 py-3">
          <h2 id="settings-title" className="text-lg font-semibold text-zinc-100">
            Settings
          </h2>
          <button onClick={onClose} className="text-zinc-400 transition-colors hover:text-zinc-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-zinc-700">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'general' ? 'border-b-2 border-blue-400 text-blue-400' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('target')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'target' ? 'border-b-2 border-blue-400 text-blue-400' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Target
          </button>
          <button
            onClick={() => setActiveTab('connection')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'connection'
                ? 'border-b-2 border-blue-400 text-blue-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Connection
          </button>
          <button
            onClick={() => setActiveTab('mqtt')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'mqtt' ? 'border-b-2 border-blue-400 text-blue-400' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            MQTT
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'json' ? 'border-b-2 border-blue-400 text-blue-400' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            JSON
          </button>
        </div>

        {/* Content */}
        {activeTab === 'general' && (
          <>
            <div className="p-4">
              <div className="flex flex-col gap-4">
                {/* Lane Number Input */}
                <div className="flex flex-col gap-2">
                  <label htmlFor="lane-number" className="text-sm font-medium text-zinc-300">
                    Lane Number
                  </label>
                  <input
                    id="lane-number"
                    type="number"
                    min="1"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-describedby="lane-number-help"
                  />
                  <span id="lane-number-help" className="text-xs text-zinc-400">
                    Please enter an integer of 1 or greater
                  </span>
                </div>

                {/* Audio Volume Slider */}
                <div className="flex flex-col gap-2">
                  <label htmlFor="audio-volume" className="text-sm font-medium text-zinc-300">
                    Shot Sound Volume
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="audio-volume"
                      type="range"
                      min="0"
                      max="100"
                      value={volumeValue}
                      onChange={(e) => setVolumeValue(parseInt(e.target.value, 10))}
                      className="h-2 flex-1 accent-blue-500"
                    />
                    <span className="w-10 text-right text-sm text-zinc-300">{volumeValue}%</span>
                    <button
                      type="button"
                      onClick={() => playTestSound(volumeValue)}
                      className="rounded bg-zinc-700 p-1.5 text-zinc-300 transition-colors hover:bg-zinc-600 hover:text-zinc-100"
                      aria-label="Test sound"
                      title="Test sound"
                    >
                      <Volume2 size={16} />
                    </button>
                  </div>
                  <span className="text-xs text-zinc-400">MT-201 device shot sound volume (0% = mute)</span>
                </div>
              </div>
            </div>

            {/* Save error */}
            {saveError && (
              <div
                className="mx-4 rounded-lg border border-red-500 bg-red-500/10 p-3 text-sm text-red-400"
                role="alert"
                aria-live="polite"
                aria-atomic="true"
              >
                {saveError}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-zinc-700 bg-zinc-900 px-4 py-3">
              <button
                onClick={onClose}
                className="rounded bg-zinc-700 px-4 py-2 text-sm text-zinc-100 transition-colors hover:bg-zinc-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500"
              >
                Save
              </button>
            </div>
          </>
        )}

        {activeTab === 'target' && <SettingsTargetTab />}

        {activeTab === 'connection' && <SettingsConnectionTab />}

        {activeTab === 'mqtt' && <MqttSettingsTab />}

        {activeTab === 'json' && (
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
                  value={jsonDraft}
                  onChange={(e) => setJsonDraft(e.target.value)}
                  spellCheck={false}
                  className="h-72 resize-none rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-zinc-400">
                  GUI からの保存と同じ検証を通して、設定全体をまとめて更新します。
                </span>
              </div>
            </div>

            {jsonError && (
              <div
                className="mx-4 rounded-lg border border-red-500 bg-red-500/10 p-3 text-sm text-red-400"
                role="alert"
                aria-live="polite"
                aria-atomic="true"
              >
                {jsonError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-zinc-700 bg-zinc-900 px-4 py-3">
              <button
                onClick={handleReloadJson}
                className="rounded bg-zinc-700 px-4 py-2 text-sm text-zinc-100 transition-colors hover:bg-zinc-600"
              >
                Reload
              </button>
              <button
                onClick={handleSaveJson}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500"
              >
                Save JSON
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
