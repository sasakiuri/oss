import { describe, it, expect } from 'vitest';
import { AppConfigSchema } from '@/shared/config/AppConfigSchema';
import type { AppConfig, AppConfigKey } from '@/shared/config/AppConfigSchema';

describe('AppConfigSchema', () => {
  describe('mqtt.broker.port', () => {
    const schema = AppConfigSchema.shape['mqtt.broker.port'];

    it('should coerce string to number', () => {
      expect(schema.parse('1883')).toBe(1883);
    });

    it('should accept a number directly', () => {
      expect(schema.parse(9999)).toBe(9999);
    });

    it('should return default 1883 for undefined', () => {
      expect(schema.parse(undefined)).toBe(1883);
    });

    it('should reject port < 1', () => {
      expect(() => schema.parse(0)).toThrow();
    });

    it('should reject port > 65535', () => {
      expect(() => schema.parse(70000)).toThrow();
    });

    it('should reject non-integer', () => {
      expect(() => schema.parse(1883.5)).toThrow();
    });
  });

  describe('mqtt.broker.url', () => {
    const schema = AppConfigSchema.shape['mqtt.broker.url'];

    it('should accept a valid URL string', () => {
      expect(schema.parse('mqtt://broker.example:1883')).toBe('mqtt://broker.example:1883');
    });

    it('should return default for undefined', () => {
      expect(schema.parse(undefined)).toBe('mqtt://localhost:1883');
    });

    it('should accept secure MQTT URLs', () => {
      expect(schema.parse('mqtts://broker.example:8883')).toBe('mqtts://broker.example:8883');
    });

    it('should reject non-MQTT protocols and malformed URLs', () => {
      expect(() => schema.parse('https://broker.example')).toThrow();
      expect(() => schema.parse('not a URL')).toThrow();
    });

    it('should reject credentials embedded in the URL', () => {
      const urlWithCredentials = ['mqtt://user:secret', 'broker.example:1883'].join(String.fromCharCode(64));
      expect(() => schema.parse(urlWithCredentials)).toThrow();
    });

    it('should reject URL paths, query parameters, and fragments', () => {
      expect(() => schema.parse('mqtt://broker.example/topic')).toThrow();
      expect(() => schema.parse('mqtt://broker.example?clientId=director')).toThrow();
      expect(() => schema.parse('mqtt://broker.example#fragment')).toThrow();
    });

    it('should reject port zero', () => {
      expect(() => schema.parse('mqtt://broker.example:0')).toThrow();
    });
  });

  describe('mqtt.broker.mode', () => {
    const schema = AppConfigSchema.shape['mqtt.broker.mode'];

    it('should accept "embedded"', () => {
      expect(schema.parse('embedded')).toBe('embedded');
    });

    it('should accept "external"', () => {
      expect(schema.parse('external')).toBe('external');
    });

    it('should return default "embedded" for undefined', () => {
      expect(schema.parse(undefined)).toBe('embedded');
    });

    it('should reject invalid mode', () => {
      expect(() => schema.parse('invalid')).toThrow();
    });
  });

  describe('full schema parse', () => {
    it('should parse a full config object', () => {
      const result = AppConfigSchema.parse({
        'mqtt.broker.port': '2883',
        'mqtt.broker.url': 'mqtt://custom:2883',
        'mqtt.broker.mode': 'external',
      });
      expect(result).toEqual({
        'mqtt.broker.port': 2883,
        'mqtt.broker.url': 'mqtt://custom:2883',
        'mqtt.broker.mode': 'external',
        'mqtt.director.id': 'saika-director',
        'mqtt.commandTimeoutMs': 10000,
        'mqtt.startDelayMs': 3000,
        'competitionAnnouncements.enabled': true,
      });
    });

    it('should fill defaults for missing fields', () => {
      const result = AppConfigSchema.parse({});
      expect(result).toEqual({
        'mqtt.broker.port': 1883,
        'mqtt.broker.url': 'mqtt://localhost:1883',
        'mqtt.broker.mode': 'embedded',
        'mqtt.director.id': 'saika-director',
        'mqtt.commandTimeoutMs': 10000,
        'mqtt.startDelayMs': 3000,
        'competitionAnnouncements.enabled': true,
      });
    });
  });

  describe('type safety', () => {
    it('should have correct AppConfigKey type', () => {
      const keys: AppConfigKey[] = [
        'mqtt.broker.port',
        'mqtt.broker.url',
        'mqtt.broker.mode',
        'mqtt.director.id',
        'mqtt.commandTimeoutMs',
        'mqtt.startDelayMs',
        'competitionAnnouncements.enabled',
      ];
      expect(keys).toHaveLength(7);
    });

    it('should infer correct types for AppConfig', () => {
      const config: AppConfig = {
        'mqtt.broker.port': 1883,
        'mqtt.broker.url': 'mqtt://localhost:1883',
        'mqtt.broker.mode': 'embedded',
        'mqtt.director.id': 'saika-director',
        'mqtt.commandTimeoutMs': 10000,
        'mqtt.startDelayMs': 3000,
        'competitionAnnouncements.enabled': true,
      };
      expect(config['mqtt.broker.port']).toBeTypeOf('number');
      expect(config['mqtt.broker.url']).toBeTypeOf('string');
      expect(config['mqtt.broker.mode']).toBeTypeOf('string');
      expect(config['competitionAnnouncements.enabled']).toBeTypeOf('boolean');
    });
  });
});
