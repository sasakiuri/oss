// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ErrorCatalog, type ErrorCode } from '@/shared/errors/ErrorCatalog';

const golden = JSON.parse(readFileSync(join(__dirname, 'errorCatalog.golden.json'), 'utf8')) as Record<
  string,
  { message: string; userMessage: string; severity: string }
>;

describe('error catalog golden', () => {
  it('registers exactly the golden codes', () => {
    // ErrorCatalog exposes no code list; read the definitions it actually serves.
    const registered = ErrorCatalog['ERROR_DEFINITIONS'];

    expect([...registered.keys()].sort()).toEqual(Object.keys(golden).sort());
  });

  it.each(Object.entries(golden))('keeps the code, texts and severity of %s', (code, text) => {
    expect(ErrorCatalog.getErrorDefinition(code as ErrorCode)).toEqual({ code, ...text });
  });

  it('fills message templates from metadata without changing the code', () => {
    const error = ErrorCatalog.createError('MQTT_CONNECTION_FAILED', { brokerUrl: 'mqtt://range:1883' });

    expect(error.code).toBe('MQTT_CONNECTION_FAILED');
    expect(error.message).toBe('Failed to connect to MQTT broker: mqtt://range:1883');
  });
});
