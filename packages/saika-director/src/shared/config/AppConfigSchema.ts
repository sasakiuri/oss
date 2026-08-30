import { z } from 'zod';

export const MqttBrokerUrlSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid MQTT broker URL' });
      return;
    }

    if (url.protocol !== 'mqtt:' && url.protocol !== 'mqtts:') {
      ctx.addIssue({ code: 'custom', message: 'MQTT broker URL must use mqtt:// or mqtts://' });
    }
    if (!url.hostname) {
      ctx.addIssue({ code: 'custom', message: 'MQTT broker URL must include a host' });
    }
    if (url.port === '0') {
      ctx.addIssue({ code: 'custom', message: 'MQTT broker URL port must be between 1 and 65535' });
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: 'custom', message: 'Credentials must not be embedded in the MQTT broker URL' });
    }
    if ((url.pathname !== '' && url.pathname !== '/') || url.search || url.hash) {
      ctx.addIssue({ code: 'custom', message: 'MQTT broker URL must not include a path, query, or fragment' });
    }
  });

const PersistedBooleanSchema = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

/**
 * Application configuration schema.
 *
 * Provides type-safe access to the key-value TEXT app_settings table.
 * Each field converts the persisted string (or undefined) and supplies a default when unset.
 */
export const AppConfigSchema = z.object({
  'mqtt.broker.port': z.coerce.number().int().min(1).max(65535).default(1883),
  'mqtt.broker.url': MqttBrokerUrlSchema.default('mqtt://localhost:1883'),
  'mqtt.broker.mode': z.enum(['embedded', 'external']).default('embedded'),
  'mqtt.director.id': z.string().min(1).default('saika-director'),
  'mqtt.commandTimeoutMs': z.coerce.number().int().min(100).max(60_000).default(10_000),
  'mqtt.startDelayMs': z.coerce.number().int().min(0).max(30_000).default(3_000),
  'competitionAnnouncements.enabled': PersistedBooleanSchema.default(true),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type AppConfigKey = keyof AppConfig;
