// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { ClockProbeAcknowledgementDataSchema, CommandAcknowledgementSchema } from '../src/Acknowledgement';

const acknowledgement = {
  commandId: 'f95c3d67-c3ab-4527-aefa-d6ea030faed5',
  laneId: '83ff09f8-eb12-4377-a8e2-744ed63e52ba',
  status: 'done',
  acknowledgedAt: '2026-11-09T00:00:00.000Z',
};

describe('command acknowledgements', () => {
  it.each(['executing', 'done', 'error'])('accepts the %s state and preserves optional payloads', (status) => {
    const value = {
      ...acknowledgement,
      status,
      error: { code: 'unavailable', message: 'Try again' },
      warning: 'Delayed',
      data: { revision: 1 },
    };
    expect(CommandAcknowledgementSchema.parse(value)).toEqual(value);
    expect(CommandAcknowledgementSchema.parse({ ...acknowledgement, status })).toEqual({ ...acknowledgement, status });
  });
  it.each([
    ['commandId', 'not-a-uuid'],
    ['laneId', 'not-a-uuid'],
    ['status', 'queued'],
    ['acknowledgedAt', 'yesterday'],
    ['error', {}],
    ['error', { code: 1, message: 'failure' }],
    ['error', { code: 'failure', message: 1 }],
    ['warning', 1],
    ['data', []],
  ])('rejects invalid %s', (key, value) => {
    expect(CommandAcknowledgementSchema.safeParse({ ...acknowledgement, [key]: value }).success).toBe(false);
  });
  it.each(['commandId', 'laneId', 'status', 'acknowledgedAt'] as const)('requires %s', (key) => {
    const value: Record<string, unknown> = { ...acknowledgement };
    delete value[key];
    expect(CommandAcknowledgementSchema.safeParse(value).success).toBe(false);
  });
  it('requires each clock sample to be an ISO timestamp', () => {
    const value = {
      directorSentAt: acknowledgement.acknowledgedAt,
      laneReceivedAt: acknowledgement.acknowledgedAt,
      laneSentAt: acknowledgement.acknowledgedAt,
    };
    expect(ClockProbeAcknowledgementDataSchema.parse(value)).toEqual(value);
    for (const key of Object.keys(value)) {
      expect(ClockProbeAcknowledgementDataSchema.safeParse({ ...value, [key]: 'bad' }).success).toBe(false);
      expect(ClockProbeAcknowledgementDataSchema.safeParse({ ...value, [key]: undefined }).success).toBe(false);
    }
  });
});
