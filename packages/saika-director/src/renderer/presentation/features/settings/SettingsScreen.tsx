import { AppUpdateSettingsPanel } from './AppUpdateSettingsPanel';
import { VistaSettingsPanel } from './VistaSettingsPanel';
import { Copy, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import { competitionAnnouncementsService, mqttService } from '@/renderer/services';
import { Logger } from '@/shared/utils/Logger';

import { Button } from '../shared/common/Button';
import { Input } from '../shared/common/Input';
import { SectionTabs } from '../shared/common/SectionTabs';
import { PageHeader } from '../shared/layout/PageHeader';

import { ClockQualitySettingsPanel } from './ClockQualitySettingsPanel';
import { OperationalArchivesPanel } from './OperationalArchivesPanel';
import { ResultPublicationSettingsPanel } from './ResultPublicationSettingsPanel';

const logger = Logger.create('SettingsScreen');
const settingsSections = [
  { id: 'network', label: 'Network' },
  { id: 'competition', label: 'Competition' },
  { id: 'vista', label: 'Vista' },
  { id: 'backups', label: 'Backups' },
  { id: 'updates', label: 'Updates' },
] as const;

export function SettingsScreen() {
  const [section, setSection] = useState<(typeof settingsSections)[number]['id']>('network');
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [brokerMode, setBrokerMode] = useState<'embedded' | 'external'>('embedded');
  const [configuredBrokerMode, setConfiguredBrokerMode] = useState<'embedded' | 'external'>('embedded');
  const [brokerUrl, setBrokerUrl] = useState('');
  const [brokerStatus, setBrokerStatus] = useState<{
    brokerRunning: boolean;
    clientConnected: boolean;
    brokerPort: number;
    localAddresses: string[];
  }>({
    brokerRunning: false,
    clientConnected: false,
    brokerPort: 1883,
    localAddresses: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ruleRemindersEnabled, setRuleRemindersEnabled] = useState(true);
  const [savingRuleReminders, setSavingRuleReminders] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [configRes, statusRes, reminderRes] = await Promise.all([
          mqttService.getBrokerConfig(),
          mqttService.getBrokerStatus(),
          competitionAnnouncementsService.getSettings(),
        ]);
        if (configRes.success) {
          setBrokerMode(configRes.data.mode);
          setConfiguredBrokerMode(configRes.data.mode);
          setBrokerUrl(configRes.data.url);
        } else {
          addNotification('error', configRes.error.message);
        }
        if (statusRes.success) {
          setBrokerStatus(statusRes.data);
        } else {
          addNotification('error', statusRes.error.message);
        }
        if (reminderRes.success) {
          setRuleRemindersEnabled(reminderRes.data.enabled);
        } else {
          addNotification('error', reminderRes.error.message);
        }
      } catch (error) {
        logger.error('Failed to load MQTT settings:', error);
        addNotification('error', 'Failed to load network settings');
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [addNotification]);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await mqttService.getBrokerStatus();
      if (response.success) {
        setBrokerStatus(response.data);
      } else {
        addNotification('error', response.error.message);
      }
    } catch (error) {
      logger.error('Failed to refresh broker status:', error);
      addNotification('error', 'Failed to refresh network status');
    } finally {
      setRefreshing(false);
    }
  }, [addNotification]);

  const copyConnectionUrl = useCallback(
    async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        addNotification('success', 'Connection URL copied');
      } catch (error) {
        logger.error('Failed to copy the connection URL:', error);
        addNotification('error', 'Failed to copy the connection URL');
      }
    },
    [addNotification],
  );

  const enableEmbeddedBroker = useCallback(async () => {
    setBrokerMode('embedded');
    setSaving(true);
    try {
      const result = await mqttService.setBrokerConfig({ mode: 'embedded' });
      if (!result.success) {
        setBrokerMode(configuredBrokerMode);
        addNotification('error', result.error?.message ?? 'Failed to change broker mode');
      } else {
        setConfiguredBrokerMode('embedded');
        addNotification('success', 'Connected to the embedded broker');
      }
      await refreshStatus();
    } catch (error) {
      setBrokerMode(configuredBrokerMode);
      logger.error('Failed to save broker mode:', error);
      addNotification('error', 'Failed to change broker mode');
    } finally {
      setSaving(false);
    }
  }, [configuredBrokerMode, refreshStatus, addNotification]);

  const handleSaveExternalConfig = useCallback(async () => {
    setSaving(true);
    try {
      const result = await mqttService.setBrokerConfig({
        mode: 'external',
        url: brokerUrl,
      });
      if (!result.success) {
        setBrokerMode(configuredBrokerMode);
        addNotification('error', result.error?.message ?? 'Failed to connect to the external broker');
      } else {
        setConfiguredBrokerMode('external');
        addNotification('success', 'Connected to the external broker');
      }
      await refreshStatus();
    } catch (error) {
      setBrokerMode(configuredBrokerMode);
      logger.error('Failed to save external broker config:', error);
      addNotification('error', 'Failed to connect to the external broker');
    } finally {
      setSaving(false);
    }
  }, [brokerUrl, configuredBrokerMode, refreshStatus, addNotification]);

  const updateRuleReminders = useCallback(
    async (enabled: boolean) => {
      setSavingRuleReminders(true);
      try {
        const response = await competitionAnnouncementsService.setSettings({ enabled });
        if (!response.success) {
          addNotification('error', response.error.message);
          return;
        }
        setRuleRemindersEnabled(response.data.enabled);
        addNotification('success', `Rule reminders ${response.data.enabled ? 'enabled' : 'disabled'}`);
      } catch (error) {
        logger.error('Failed to save rule reminder settings:', error);
        addNotification('error', 'Failed to save rule reminder settings');
      } finally {
        setSavingRuleReminders(false);
      }
    },
    [addNotification],
  );

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
          <section aria-labelledby="mqtt-broker-heading" className="border-t border-vscode-border">
            <div className="border-b border-vscode-border py-3">
              <h3 id="mqtt-broker-heading" className="text-sm font-semibold text-vscode-text">
                MQTT broker
              </h3>
            </div>

            <div className="grid gap-4 border-b border-vscode-border py-4 md:grid-cols-[15rem_minmax(0,1fr)]">
              <div>
                <h4 id="broker-mode-heading" className="text-[13px] font-medium text-vscode-text">
                  Broker mode
                </h4>
                <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
                  Run the broker here or connect to an existing one.
                </p>
              </div>

              <div
                role="group"
                aria-labelledby="broker-mode-heading"
                className="grid max-w-xl grid-cols-2 overflow-hidden rounded-[3px] border border-vscode-border"
              >
                <button
                  type="button"
                  disabled={loading || saving}
                  onClick={enableEmbeddedBroker}
                  aria-label="Embedded"
                  aria-pressed={brokerMode === 'embedded'}
                  className={`flex min-h-12 items-center gap-2.5 border-r border-vscode-border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                    brokerMode === 'embedded'
                      ? 'bg-vscode-highlight text-vscode-text'
                      : 'text-vscode-text-muted hover:bg-vscode-hover hover:text-vscode-text'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                      brokerMode === 'embedded' ? 'border-vscode-primary' : 'border-vscode-dimmed'
                    }`}
                  >
                    {brokerMode === 'embedded' && <span className="h-1.5 w-1.5 rounded-full bg-vscode-primary" />}
                  </span>
                  <span>
                    <span className="block text-[13px] font-medium">Embedded</span>
                    <span className="block text-[11px] text-vscode-text-muted">This computer</span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={loading || saving}
                  onClick={() => setBrokerMode('external')}
                  aria-label="External"
                  aria-pressed={brokerMode === 'external'}
                  className={`flex min-h-12 items-center gap-2.5 px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                    brokerMode === 'external'
                      ? 'bg-vscode-highlight text-vscode-text'
                      : 'text-vscode-text-muted hover:bg-vscode-hover hover:text-vscode-text'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                      brokerMode === 'external' ? 'border-vscode-primary' : 'border-vscode-dimmed'
                    }`}
                  >
                    {brokerMode === 'external' && <span className="h-1.5 w-1.5 rounded-full bg-vscode-primary" />}
                  </span>
                  <span>
                    <span className="block text-[13px] font-medium">External</span>
                    <span className="block text-[11px] text-vscode-text-muted">MQTT URL</span>
                  </span>
                </button>
              </div>
            </div>

            {brokerMode === 'embedded' && brokerStatus.localAddresses.length > 0 && (
              <div className="grid gap-4 border-b border-vscode-border py-4 md:grid-cols-[15rem_minmax(0,1fr)]">
                <div>
                  <h4 className="text-[13px] font-medium text-vscode-text">Lane connection URLs</h4>
                  <p className="mt-1 text-xs leading-5 text-vscode-text-muted">Use one on each Saika Lane device.</p>
                </div>
                <div className="grid max-w-xl gap-1.5">
                  {brokerStatus.localAddresses.map((addr) => {
                    const url = `mqtt://${addr}:${brokerStatus.brokerPort}`;
                    return (
                      <div
                        key={addr}
                        className="flex min-w-0 items-center rounded-[3px] border border-vscode-border bg-vscode-input"
                      >
                        <code className="min-w-0 flex-1 truncate px-2.5 py-2 font-mono text-[13px] text-vscode-accent">
                          {url}
                        </code>
                        <button
                          type="button"
                          aria-label={`Copy ${url}`}
                          title="Copy connection URL"
                          onClick={() => void copyConnectionUrl(url)}
                          className="flex h-8 w-9 shrink-0 items-center justify-center border-l border-vscode-border text-vscode-text-muted transition-colors hover:bg-vscode-hover hover:text-vscode-text"
                        >
                          <Copy size={14} aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {brokerMode === 'external' && (
              <div className="grid gap-4 border-b border-vscode-border py-4 md:grid-cols-[15rem_minmax(0,1fr)]">
                <div>
                  <h4 className="text-[13px] font-medium text-vscode-text">External broker</h4>
                  <p className="mt-1 text-xs leading-5 text-vscode-text-muted">Complete MQTT or MQTTS URL.</p>
                </div>
                <div className="max-w-xl space-y-3">
                  <Input
                    label="Broker URL"
                    value={brokerUrl}
                    onChange={setBrokerUrl}
                    placeholder="mqtt://localhost:1883"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!brokerUrl.trim() || saving}
                    onClick={handleSaveExternalConfig}
                  >
                    {saving ? 'Connecting…' : 'Save and connect'}
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-4 border-b border-vscode-border py-4 md:grid-cols-[15rem_minmax(0,1fr)]">
              <div>
                <h4 id="connection-status-heading" className="text-[13px] font-medium text-vscode-text">
                  Connection status
                </h4>
                <p className="mt-1 text-xs leading-5 text-vscode-text-muted">Broker and Director client.</p>
              </div>
              <section aria-labelledby="connection-status-heading" className="max-w-xl">
                <div className="mb-2 flex justify-end">
                  <Button variant="secondary" size="sm" disabled={refreshing} onClick={() => void refreshStatus()}>
                    <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? 'Checking…' : 'Refresh'}
                  </Button>
                </div>

                <dl className="divide-y divide-vscode-border border-y border-vscode-border">
                  <div className="flex items-center justify-between gap-4 px-1 py-2.5">
                    <dt className="text-[13px] text-vscode-text">Broker service</dt>
                    <dd
                      className={`inline-flex items-center gap-1.5 text-xs ${
                        brokerStatus.brokerRunning ? 'text-vscode-success' : 'text-vscode-text-muted'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${
                          brokerStatus.brokerRunning ? 'bg-vscode-success' : 'bg-vscode-dimmed'
                        }`}
                      />
                      {brokerStatus.brokerRunning ? 'Running' : 'Stopped'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-1 py-2.5">
                    <dt className="text-[13px] text-vscode-text">Director client</dt>
                    <dd
                      className={`inline-flex items-center gap-1.5 text-xs ${
                        brokerStatus.clientConnected ? 'text-vscode-success' : 'text-vscode-text-muted'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${
                          brokerStatus.clientConnected ? 'bg-vscode-success' : 'bg-vscode-dimmed'
                        }`}
                      />
                      {brokerStatus.clientConnected ? 'Connected' : 'Disconnected'}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          </section>
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
                  aria-checked={ruleRemindersEnabled}
                  disabled={loading || savingRuleReminders}
                  onClick={() => void updateRuleReminders(!ruleRemindersEnabled)}
                  className="flex min-h-12 w-full items-center justify-between gap-4 rounded-[3px] border border-vscode-border bg-vscode-input px-3 py-2 text-left transition-colors hover:bg-vscode-hover disabled:opacity-50"
                >
                  <span>
                    <span className="block text-[13px] font-medium text-vscode-text">
                      {ruleRemindersEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className="block text-[11px] text-vscode-text-muted">
                      Show announcement reminders during competition.
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      ruleRemindersEnabled ? 'bg-vscode-primary' : 'bg-vscode-dimmed'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                        ruleRemindersEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
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
