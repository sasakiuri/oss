import { useState } from 'react';

import { SectionTabs } from '../shared/common/SectionTabs';
import { PageHeader } from '../shared/layout/PageHeader';

import { AppUpdateSettingsPanel } from './AppUpdateSettingsPanel';
import { ClockQualitySettingsPanel } from './ClockQualitySettingsPanel';
import { NetworkSettingsPanel } from './NetworkSettingsPanel';
import { OperationalArchivesPanel } from './OperationalArchivesPanel';
import { ResultPublicationSettingsPanel } from './ResultPublicationSettingsPanel';
import { useSettingsScreen } from './useSettingsScreen';
import { VistaSettingsPanel } from './VistaSettingsPanel';

const settingsSections = [
  { id: 'network', label: 'Network' },
  { id: 'competition', label: 'Competition' },
  { id: 'vista', label: 'Vista' },
  { id: 'backups', label: 'Backups' },
  { id: 'updates', label: 'Updates' },
] as const;

export function SettingsScreen() {
  const [section, setSection] = useState<(typeof settingsSections)[number]['id']>('network');
  const { loading, network, ruleReminders } = useSettingsScreen();
  const { brokerStatus } = network;

  return (
    <div className="min-h-full">
      <PageHeader
        title="Settings"
        actions={
          <span
            role="status"
            className={`inline-flex items-center gap-1.5 text-[13px] ${
              brokerStatus.clientConnected ? 'text-vscode-success' : 'text-vscode-text-muted'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${brokerStatus.clientConnected ? 'bg-vscode-success' : 'bg-vscode-dimmed'}`}
            />
            {loading ? 'Checking…' : brokerStatus.clientConnected ? 'MQTT connected' : 'MQTT disconnected'}
          </span>
        }
      />

      <div className="max-w-6xl p-5">
        <SectionTabs
          label="Settings sections"
          tabs={settingsSections}
          value={section}
          onChange={setSection}
          prefix="settings"
        />
        <div
          id="settings-network-panel"
          role="tabpanel"
          aria-labelledby="settings-network-tab"
          tabIndex={0}
          hidden={section !== 'network'}
        >
          <NetworkSettingsPanel loading={loading} network={network} />
        </div>
        <div
          id="settings-competition-panel"
          role="tabpanel"
          aria-labelledby="settings-competition-tab"
          tabIndex={0}
          hidden={section !== 'competition'}
        >
          <section aria-labelledby="rule-reminders-heading" className="mt-6 border-t border-vscode-border">
            <div className="border-b border-vscode-border py-3">
              <h3
                id="rule-reminders-heading"
                className="flex items-center gap-2 text-sm font-semibold text-vscode-text"
              >
                Rule reminders
              </h3>
            </div>

            <div className="grid gap-4 border-b border-vscode-border py-4 md:grid-cols-[15rem_minmax(0,1fr)]">
              <div>
                <h4 id="cro-reminders-heading" className="text-[13px] font-medium text-vscode-text">
                  CRO announcement prompts
                </h4>
                <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
                  Show prompts at the announcement times defined for the competition. No audio is played.
                </p>
              </div>

              <div className="max-w-xl">
                <button
                  type="button"
                  role="switch"
                  aria-labelledby="cro-reminders-heading"
                  aria-checked={ruleReminders.enabled}
                  disabled={loading || ruleReminders.saving}
                  onClick={() => void ruleReminders.update(!ruleReminders.enabled)}
                  className="flex min-h-12 w-full items-center justify-between gap-4 rounded-[3px] border border-vscode-border bg-vscode-input px-3 py-2 text-left transition-colors hover:bg-vscode-hover disabled:opacity-50"
                >
                  <span>
                    <span className="block text-[13px] font-medium text-vscode-text">
                      {ruleReminders.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className="block text-[11px] text-vscode-text-muted">
                      Show announcement reminders during competition.
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      ruleReminders.enabled ? 'bg-vscode-primary' : 'bg-vscode-dimmed'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                        ruleReminders.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                </button>
              </div>
            </div>
          </section>
          <ClockQualitySettingsPanel />
          <ResultPublicationSettingsPanel />
        </div>
        <div
          id="settings-vista-panel"
          role="tabpanel"
          aria-labelledby="settings-vista-tab"
          tabIndex={0}
          hidden={section !== 'vista'}
        >
          <VistaSettingsPanel />
        </div>
        <div
          id="settings-backups-panel"
          role="tabpanel"
          aria-labelledby="settings-backups-tab"
          tabIndex={0}
          hidden={section !== 'backups'}
        >
          <OperationalArchivesPanel />
        </div>
        <div
          id="settings-updates-panel"
          role="tabpanel"
          aria-labelledby="settings-updates-tab"
          tabIndex={0}
          hidden={section !== 'updates'}
        >
          <AppUpdateSettingsPanel />
        </div>
      </div>
    </div>
  );
}
