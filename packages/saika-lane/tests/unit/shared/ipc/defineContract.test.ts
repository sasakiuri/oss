// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  command,
  commandDataResponseSchema,
  CommandResponseSchema,
  commandWithDataSchema,
  defineContract,
  defineEvent,
  defineEventContract,
  IpcErrorSchema,
  query,
  queryResponseSchema,
} from '@/shared/ipc/defineContract';

describe('defineContract DSL', () => {
  // ================================================================
  // command()
  // ================================================================

  describe('command()', () => {
    it('creates a command ProcedureDef from input and output schemas', () => {
      const input = z.object({ id: z.string() });
      const output = z.object({ success: z.boolean() });
      const proc = command(input, output);

      expect(proc.kind).toBe('command');
      expect(proc.input).toBe(input);
      expect(proc.output).toBe(output);
      expect(proc.channelOverride).toBeUndefined();
    });

    it('sets input to z.void() when only output is specified', () => {
      const output = z.object({ success: z.boolean() });
      const proc = command(output);

      expect(proc.kind).toBe('command');
      expect(proc.input).toBeInstanceOf(z.ZodVoid);
      expect(proc.output).toBe(output);
    });

    it('accepts a channel override', () => {
      const output = z.object({ ok: z.boolean() });
      const proc = command(output, { channel: 'custom:channel' });

      expect(proc.channelOverride).toBe('custom:channel');
    });

    it('accepts the 3-argument form: input + output + options', () => {
      const input = z.object({ name: z.string() });
      const output = CommandResponseSchema;
      const proc = command(input, output, { channel: 'cmd:save' });

      expect(proc.kind).toBe('command');
      expect(proc.input).toBe(input);
      expect(proc.output).toBe(output);
      expect(proc.channelOverride).toBe('cmd:save');
    });
  });

  // ================================================================
  // query()
  // ================================================================

  describe('query()', () => {
    it('creates a query ProcedureDef from input and output schemas', () => {
      const input = z.object({ id: z.string() });
      const output = z.object({ data: z.string() });
      const proc = query(input, output);

      expect(proc.kind).toBe('query');
      expect(proc.input).toBe(input);
      expect(proc.output).toBe(output);
      expect(proc.channelOverride).toBeUndefined();
    });

    it('sets input to z.void() when only output is specified', () => {
      const output = z.object({ items: z.array(z.string()) });
      const proc = query(output);

      expect(proc.kind).toBe('query');
      expect(proc.input).toBeInstanceOf(z.ZodVoid);
      expect(proc.output).toBe(output);
    });

    it('accepts a channel override', () => {
      const output = z.object({ count: z.number() });
      const proc = query(output, { channel: 'query:count' });

      expect(proc.channelOverride).toBe('query:count');
    });
  });

  // ================================================================
  // defineEvent()
  // ================================================================

  describe('defineEvent()', () => {
    it('creates an EventDef from a schema', () => {
      const schema = z.object({ message: z.string() });
      const evt = defineEvent(schema);

      expect(evt.kind).toBe('event');
      expect(evt.schema).toBe(schema);
      expect(evt.channelOverride).toBeUndefined();
    });

    it('accepts a channel override', () => {
      const schema = z.object({ id: z.string() });
      const evt = defineEvent(schema, { channel: 'event:custom' });

      expect(evt.kind).toBe('event');
      expect(evt.channelOverride).toBe('event:custom');
    });
  });

  // ================================================================
  // defineContract()
  // ================================================================

  describe('defineContract()', () => {
    it('auto-generates channel names in namespace:key format', () => {
      const contract = defineContract('test', {
        doSomething: command(z.object({ ok: z.boolean() })),
        getData: query(z.object({ data: z.string() })),
      });

      expect(contract.namespace).toBe('test');
      expect(contract.channels.doSomething).toBe('test:doSomething');
      expect(contract.channels.getData).toBe('test:getData');
    });

    it('overrides auto-generated channel name when channelOverride is set', () => {
      const contract = defineContract('ns', {
        save: command(CommandResponseSchema, { channel: 'custom:save' }),
      });

      expect(contract.channels.save).toBe('custom:save');
    });

    it('preserves procedures as-is', () => {
      const proc = command(z.object({ id: z.string() }), CommandResponseSchema);
      const contract = defineContract('demo', { myCmd: proc });

      expect(contract.procedures.myCmd).toBe(proc);
    });

    it('works with an empty procedure map', () => {
      const contract = defineContract('empty', {});

      expect(contract.namespace).toBe('empty');
      expect(Object.keys(contract.channels)).toHaveLength(0);
    });
  });

  // ================================================================
  // defineEventContract()
  // ================================================================

  describe('defineEventContract()', () => {
    it('auto-generates event channel names in namespace:key format', () => {
      const schema = z.object({ value: z.number() });
      const ec = defineEventContract('bus', {
        tick: defineEvent(schema),
      });

      expect(ec.namespace).toBe('bus');
      expect(ec.channels.tick).toBe('bus:tick');
      expect(ec.events.tick.schema).toBe(schema);
    });

    it('overrides auto-generated channel name when channelOverride is set', () => {
      const ec = defineEventContract('bus', {
        alert: defineEvent(z.object({ msg: z.string() }), { channel: 'alert:fire' }),
      });

      expect(ec.channels.alert).toBe('alert:fire');
    });
  });

  // ================================================================
  // Common schemas
  // ================================================================

  describe('IpcErrorSchema', () => {
    it('validates valid error data', () => {
      const result = IpcErrorSchema.safeParse({
        code: 'ERR_001',
        message: 'Something went wrong',
      });
      expect(result.success).toBe(true);
    });

    it('stack and metadata are optional', () => {
      const result = IpcErrorSchema.safeParse({
        code: 'ERR_002',
        message: 'Error',
        stack: 'Error\n  at ...',
        metadata: { key: 'value' },
      });
      expect(result.success).toBe(true);
    });

    it('fails validation when code is missing', () => {
      const result = IpcErrorSchema.safeParse({ message: 'Error' });
      expect(result.success).toBe(false);
    });
  });

  describe('CommandResponseSchema', () => {
    it('validates a success response', () => {
      const result = CommandResponseSchema.safeParse({ success: true });
      expect(result.success).toBe(true);
    });

    it('validates a failure response with error', () => {
      const result = CommandResponseSchema.safeParse({
        success: false,
        error: { code: 'ERR', message: 'fail' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('queryResponseSchema()', () => {
    const schema = queryResponseSchema(z.object({ id: z.string() }));

    it('validates a success response (success: true)', () => {
      const result = schema.safeParse({ success: true, data: { id: 'abc' } });
      expect(result.success).toBe(true);
    });

    it('validates a failure response (success: false)', () => {
      const result = schema.safeParse({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid success response', () => {
      const result = schema.safeParse({ success: true, data: { id: 123 } });
      expect(result.success).toBe(false);
    });
  });

  describe('commandDataResponseSchema()', () => {
    const schema = commandDataResponseSchema(z.object({ id: z.string() }));

    it('validates a success response', () => {
      const result = schema.safeParse({ success: true, data: { id: 'x' } });
      expect(result.success).toBe(true);
    });

    it('validates a failure response', () => {
      const result = schema.safeParse({
        success: false,
        error: { code: 'ERR', message: 'fail' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('commandWithDataSchema()', () => {
    const schema = commandWithDataSchema(z.object({ count: z.number() }));

    it('validates a success response with data', () => {
      const result = schema.safeParse({ success: true, data: { count: 5 } });
      expect(result.success).toBe(true);
    });

    it('validates a success response without data', () => {
      const result = schema.safeParse({ success: true });
      expect(result.success).toBe(true);
    });
  });
});
