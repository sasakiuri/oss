// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { errorMessage } from '@/renderer/presentation/utils/errorMessage';
import { ServiceError } from '@/renderer/services/createServiceMethod';

describe('errorMessage', () => {
  it("returns an Error's message", () => {
    expect(errorMessage(new ServiceError('Broker unreachable', 'MQTT_001'))).toBe('Broker unreachable');
    expect(errorMessage(new Error('Failed'), 'fallback')).toBe('Failed');
  });

  it('returns the fallback for a non-Error value', () => {
    expect(errorMessage('boom', 'Failed to fetch port list')).toBe('Failed to fetch port list');
  });

  it('returns a non-Error value as text without a fallback', () => {
    expect(errorMessage('boom')).toBe('boom');
    expect(errorMessage(undefined)).toBe('undefined');
  });
});
