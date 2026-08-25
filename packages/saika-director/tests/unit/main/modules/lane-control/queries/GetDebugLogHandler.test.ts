import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetDebugLogHandler } from '@/main/modules/lane-control/queries/GetDebugLogHandler';
import type { IDebugLogStore } from '@/main/infrastructure/logging/Logger';
import type { DebugLogEntry } from '@/shared/ipc/contracts/debug.contract';

describe('GetDebugLogHandler', () => {
  let mockLogStore: IDebugLogStore;
  let handler: GetDebugLogHandler;

  beforeEach(() => {
    mockLogStore = {
      addEntry: vi.fn(),
      getEntries: vi.fn(),
      clear: vi.fn(),
    };
    handler = new GetDebugLogHandler(mockLogStore);
  });

  it('should return entries from the log store', async () => {
    const entries: DebugLogEntry[] = [
      { timestamp: 1000, direction: 'RX', raw: 'data1', parsed: 'parsed1' },
      { timestamp: 2000, direction: 'TX', raw: 'data2' },
    ];
    vi.mocked(mockLogStore.getEntries).mockReturnValue(entries);

    const result = await handler.execute();

    expect(result.entries).toEqual(entries);
    expect(result.entries).toHaveLength(2);
  });

  it('should return empty entries when log store is empty', async () => {
    vi.mocked(mockLogStore.getEntries).mockReturnValue([]);

    const result = await handler.execute();

    expect(result.entries).toEqual([]);
  });

  it('should include LOG direction entries', async () => {
    const entries: DebugLogEntry[] = [{ timestamp: 1000, direction: 'LOG', raw: 'log message' }];
    vi.mocked(mockLogStore.getEntries).mockReturnValue(entries);

    const result = await handler.execute();

    expect(result.entries[0]!.direction).toBe('LOG');
  });
});
