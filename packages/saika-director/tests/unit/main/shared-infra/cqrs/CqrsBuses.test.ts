// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { CommandBus, defineCommand } from '@/main/shared-infra/cqrs/CommandBus';
import { defineQuery, QueryBus } from '@/main/shared-infra/cqrs/QueryBus';

describe('CQRS buses', () => {
  it('rejects a second command handler and keeps the first', async () => {
    const bus = new CommandBus();
    const token = defineCommand<number, string>('Example');
    bus.register(token, async (value) => `first ${value}`);
    expect(() => bus.register(token, async (value) => `second ${value}`)).toThrow(
      'CommandBus: duplicate command handler registration: "Example"',
    );
    await expect(bus.execute(token, 1)).resolves.toBe('first 1');
  });

  it('rejects a second query handler and keeps the first', async () => {
    const bus = new QueryBus();
    const token = defineQuery<number, string>('Example');
    bus.register(token, async (value) => `first ${value}`);
    expect(() => bus.register(token, async (value) => `second ${value}`)).toThrow(
      'QueryBus: duplicate query handler registration: "Example"',
    );
    await expect(bus.execute(token, 1)).resolves.toBe('first 1');
  });

  it('allows a command and a query to share a name', async () => {
    const commands = new CommandBus();
    const queries = new QueryBus();
    commands.register(defineCommand<void, string>('Shared'), async () => 'command');
    queries.register(defineQuery<void, string>('Shared'), async () => 'query');
    await expect(commands.execute(defineCommand<void, string>('Shared'), undefined)).resolves.toBe('command');
    await expect(queries.execute(defineQuery<void, string>('Shared'), undefined)).resolves.toBe('query');
  });
});
