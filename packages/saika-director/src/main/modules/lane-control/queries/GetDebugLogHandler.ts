import type { DebugLogResponse } from '@/shared/ipc/contracts/debug.contract';
import type { IDebugLogStore } from '@/main/infrastructure/logging/Logger';

export class GetDebugLogHandler {
  constructor(private readonly logStore: IDebugLogStore) {}

  async execute(): Promise<DebugLogResponse> {
    return { entries: this.logStore.getEntries() };
  }
}
