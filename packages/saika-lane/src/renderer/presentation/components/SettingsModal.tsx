// SPDX-License-Identifier: MIT
import { Volume2, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { ErrorAlert } from '@/renderer/presentation/components/common/ErrorAlert';
import { useUpdateStore } from '@/renderer/presentation/stores/updateStore';
import { settingsService } from '@/renderer/services/settingsService';
import { errorMessage } from '@/shared/errors/errorMessage';

import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { useSessionStore } from '../stores/sessionStore';

import { MqttSettingsTab } from './settings/MqttSettingsTab';
import { SettingsConnectionTab } from './settings/SettingsConnectionTab';
import { SettingsJsonTab } from './settings/SettingsJsonTab';
import { SettingsPrintingTab } from './settings/SettingsPrintingTab';
import { SettingsTargetTab } from './settings/SettingsTargetTab';
import { ShotTimingSettingsPanel } from './settings/ShotTimingSettingsPanel';
import { UpdateStatusPanel } from './settings/UpdateStatusPanel';
import { VistaSettingsPanel } from './settings/VistaSettingsPanel';

export type SettingsTab = 'general' | 'target' | 'connection' | 'mqtt' | 'printing' | 'vista' | 'json';

const tabs: ReadonlyArray<{ id: SettingsTab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'target', label: 'Target' },
  { id: 'connection', label: 'Connection' },
  { id: 'mqtt', label: 'MQTT' },
  { id: 'printing', label: 'Printing' },
  { id: 'vista', label: 'Vista' },
  { id: 'json', label: 'JSON' },
];

function tabClassName(tab: SettingsTab, active: boolean): string {
  // The Vista tab has never had the hover and transition styles of the other tabs.
  if (tab === 'vista') {
    return `px-4 py-2 text-sm font-medium ${active ? 'border-b-2 border-blue-400 text-blue-400' : 'text-zinc-400'}`;
  }
  return `px-4 py-2 text-sm font-medium transition-colors ${
    active ? 'border-b-2 border-blue-400 text-blue-400' : 'text-zinc-400 hover:text-zinc-200'
  }`;
}

/**
 * SettingsModal component props
 */
export interface SettingsModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Initial tab to display */
  initialTab?: SettingsTab;
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
  const laneNumber = useSessionStore((state) => state.laneNumber);
  const setLaneNumber = useSessionStore((state) => state.setLaneNumber);
  const audioVolume = useSessionStore((state) => state.audioVolume);
  const setAudioVolume = useSessionStore((state) => state.setAudioVolume);
  const { playTestSound } = useAudioPlayback();
  const updateState = useUpdateStore((state) => state);
  const [inputValue, setInputValue] = useState(laneNumber.toString());
  const [volumeValue, setVolumeValue] = useState(audioVolume);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [updateActionError, setUpdateActionError] = useState<string | null>(null);

  // Sync input values with store when modal opens or values change
  useEffect(() => {
    if (isOpen) {
      setInputValue(laneNumber.toString());
      setVolumeValue(audioVolume);
      setSaveError(null);
      setUpdateActionError(null);
    }
  }, [isOpen, laneNumber, audioVolume]);

  // Reset active tab only when modal opens or initialTab changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    setUpdateActionError(null);
  }, [updateState]);

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
      setSaveError(errorMessage(err));
      return;
    }

    // Store update: volume is always saved, lane number only when validation passes
    setAudioVolume(volumeValue);
    if (isValidLaneNumber) {
      setLaneNumber(parsedValue);
    }

    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 ${className}`.trim()}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="flex max-h-full w-[500px] max-w-full flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-700 bg-zinc-900 px-4 py-3">
          <h2 id="settings-title" className="text-lg font-semibold text-zinc-100">
            Settings
          </h2>
          <button onClick={onClose} className="text-zinc-400 transition-colors hover:text-zinc-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex shrink-0 overflow-x-auto border-b border-zinc-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={tabClassName(tab.id, activeTab === tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div key={activeTab} className="min-h-0 overflow-y-auto overscroll-contain">
          {activeTab === 'printing' && <SettingsPrintingTab />}
          {activeTab === 'general' && (
            <>
              <div className="p-4">
                <div className="flex flex-col gap-4">
                  <UpdateStatusPanel actionError={updateActionError} onActionError={setUpdateActionError} />

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
                    <span className="text-xs text-zinc-400">
                      MT-201 / BPT-216 / DISAG RedDot shot sound volume (0% = mute)
                    </span>
                  </div>
                </div>
              </div>

              {/* Save error */}
              {saveError && <ErrorAlert inset>{saveError}</ErrorAlert>}

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

          {activeTab === 'connection' && (
            <>
              <SettingsConnectionTab />
              <ShotTimingSettingsPanel />
            </>
          )}

          {activeTab === 'mqtt' && <MqttSettingsTab />}
          {activeTab === 'vista' && <VistaSettingsPanel />}

          {activeTab === 'json' && <SettingsJsonTab />}
        </div>
      </div>
    </div>
  );
};
