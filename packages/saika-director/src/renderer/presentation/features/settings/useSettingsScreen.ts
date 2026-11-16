import { useCallback, useEffect, useState } from 'react';

import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import { competitionAnnouncementsService, mqttService } from '@/renderer/services';
import type { BrokerStatus } from '@/shared/ipc/contracts';
import { Logger } from '@/shared/logging';

// The log lines keep the screen's context name.
const logger = Logger.create('SettingsScreen');

export type BrokerMode = 'embedded' | 'external';

/** MQTT broker settings and commands of the network section. */
export interface NetworkSettings {
  brokerMode: BrokerMode;
  brokerUrl: string;
  brokerStatus: BrokerStatus;
  saving: boolean;
  refreshing: boolean;
  /** Shows the external broker form; nothing is saved until `saveExternalConfig`. */
  selectExternalMode: () => void;
  setBrokerUrl: (url: string) => void;
  refreshStatus: () => Promise<void>;
  copyConnectionUrl: (url: string) => Promise<void>;
  enableEmbeddedBroker: () => Promise<void>;
  saveExternalConfig: () => Promise<void>;
}

/** The CRO rule reminder preference. */
export interface RuleReminderSettings {
  enabled: boolean;
  saving: boolean;
  update: (enabled: boolean) => Promise<void>;
}

/**
 * Owns the settings screen's broker and rule reminder settings. Both load together; `loading` stays true until every
 * initial query settled, and a rejected query applies none of them.
 */
export function useSettingsScreen(): {
  loading: boolean;
  network: NetworkSettings;
  ruleReminders: RuleReminderSettings;
} {
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [brokerMode, setBrokerMode] = useState<BrokerMode>('embedded');
  const [configuredBrokerMode, setConfiguredBrokerMode] = useState<BrokerMode>('embedded');
  const [brokerUrl, setBrokerUrl] = useState('');
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus>({
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

  const saveExternalConfig = useCallback(async () => {
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

  return {
    loading,
    network: {
      brokerMode,
      brokerUrl,
      brokerStatus,
      saving,
      refreshing,
      selectExternalMode: () => setBrokerMode('external'),
      setBrokerUrl,
      refreshStatus,
      copyConnectionUrl,
      enableEmbeddedBroker,
      saveExternalConfig,
    },
    ruleReminders: { enabled: ruleRemindersEnabled, saving: savingRuleReminders, update: updateRuleReminders },
  };
}
