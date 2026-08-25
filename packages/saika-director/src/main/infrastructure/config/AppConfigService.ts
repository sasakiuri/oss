import type Database from 'better-sqlite3';
import { AppConfigSchema, type AppConfigKey, type AppConfig } from '@/shared/config/AppConfigSchema';
import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('AppConfigService');

/**
 * Type-safe application configuration service.
 *
 * Reads/writes app_settings with Zod conversion and validation, caching values to avoid duplicate queries.
 */
export class AppConfigService {
  private cache = new Map<string, unknown>();

  constructor(private readonly db: Database.Database) {}

  get<K extends AppConfigKey>(key: K): AppConfig[K] {
    if (this.cache.has(key)) return this.cache.get(key) as AppConfig[K];

    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      { value: string } | undefined;

    const rawValue = row?.value ?? undefined;
    const schema = AppConfigSchema.shape[key];
    const result = schema.safeParse(rawValue);
    if (!result.success) {
      const fallback = schema.parse(undefined) as AppConfig[K];
      this.set(key, fallback);
      logger.warn(`Invalid persisted setting restored to its default: ${key}`);
      return fallback;
    }
    const parsed = result.data;

    this.cache.set(key, parsed);
    return parsed as AppConfig[K];
  }

  set<K extends AppConfigKey>(key: K, value: AppConfig[K]): void {
    const schema = AppConfigSchema.shape[key];
    const parsed = schema.parse(value) as AppConfig[K];

    const stringValue = String(parsed);
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      )
      .run(key, stringValue);

    this.cache.set(key, parsed);
  }

  /** Saves multiple settings atomically without changing the cache if validation or persistence fails. */
  setMany(values: Partial<AppConfig>): void {
    const entries = Object.entries(values) as [AppConfigKey, AppConfig[AppConfigKey]][];
    const validated = entries.map(([key, value]) => {
      const schema = AppConfigSchema.shape[key];
      return [key, schema.parse(value)] as const;
    });
    const statement = this.db.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    );

    this.db.transaction(() => {
      for (const [key, value] of validated) statement.run(key, String(value));
    })();

    for (const [key, value] of validated) this.cache.set(key, value);
  }

  delete(key: AppConfigKey): void {
    this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
    this.cache.delete(key);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
