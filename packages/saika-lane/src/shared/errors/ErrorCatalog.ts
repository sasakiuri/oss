// SPDX-License-Identifier: MIT
import { COMPETITION_ERRORS } from './catalogs/CompetitionErrors';
import { CONNECTION_ERRORS } from './catalogs/ConnectionErrors';
import { INFRA_ERRORS } from './catalogs/InfraErrors';
import { MQTT_ERRORS } from './catalogs/MqttErrors';
import { REPORT_ERRORS } from './catalogs/ReportErrors';
import { SESSION_ERRORS } from './catalogs/SessionErrors';
import { STORAGE_ERRORS } from './catalogs/StorageErrors';
import { TARGET_ERRORS } from './catalogs/TargetErrors';
import { DomainError } from './DomainError';

/**
 * Error definition type
 */
export interface ErrorDefinition {
  code: string;
  message: string;
  userMessage: string;
  severity: 'error' | 'warning' | 'info';
}

/** A domain catalog: each error code once, with its texts and severity. */
export type ErrorCatalogEntries = Readonly<Record<string, Omit<ErrorDefinition, 'code'>>>;

const CATALOG_ENTRIES = {
  ...SESSION_ERRORS,
  ...CONNECTION_ERRORS,
  ...STORAGE_ERRORS,
  ...INFRA_ERRORS,
  ...TARGET_ERRORS,
  ...COMPETITION_ERRORS,
  ...REPORT_ERRORS,
  ...MQTT_ERRORS,
};

/**
 * Error code type definition
 */
export type ErrorCode = keyof typeof CATALOG_ENTRIES;

/**
 * CatalogError implementation class
 */
class CatalogError extends DomainError {
  constructor(
    code: string,
    message: string,
    userMessage: string,
    severity: 'error' | 'warning' | 'info' = 'error',
    metadata?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(code, message, userMessage, severity, metadata, cause);
  }
}

/**
 * ErrorCatalog
 *
 * Centralized error management class used throughout the application.
 * Integrates domain-specific catalogs and provides error creation and definition retrieval.
 */
export class ErrorCatalog {
  private static readonly ERROR_DEFINITIONS: ReadonlyMap<ErrorCode, ErrorDefinition> = new Map(
    (Object.keys(CATALOG_ENTRIES) as ErrorCode[]).map((code) => [code, { code, ...CATALOG_ENTRIES[code] }]),
  );

  static createError(code: ErrorCode, metadata?: Record<string, unknown>, cause?: Error): DomainError {
    const definition = this.ERROR_DEFINITIONS.get(code);

    if (!definition) {
      const unknownDefinition = this.ERROR_DEFINITIONS.get('UNKNOWN_ERROR')!;
      return new CatalogError(
        unknownDefinition.code,
        unknownDefinition.message,
        unknownDefinition.userMessage,
        unknownDefinition.severity,
        metadata,
        cause,
      );
    }

    const message = this.replaceTemplateVariables(definition.message, metadata);
    const userMessage = this.replaceTemplateVariables(definition.userMessage, metadata);

    return new CatalogError(definition.code, message, userMessage, definition.severity, metadata, cause);
  }

  static getErrorDefinition(code: ErrorCode): ErrorDefinition | undefined {
    return this.ERROR_DEFINITIONS.get(code);
  }

  private static replaceTemplateVariables(template: string, metadata?: Record<string, unknown>): string {
    if (!metadata) {
      return template;
    }

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = metadata[key];
      return value !== undefined ? String(value) : match;
    });
  }
}
