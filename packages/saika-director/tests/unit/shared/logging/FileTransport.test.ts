import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileTransport } from '@/shared/logging/FileTransport';

describe('FileTransport', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('durably writes buffered entries before flush returns', () => {
    const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'saika-director-logs-'));
    temporaryDirectories.push(logDirectory);
    const transport = new FileTransport({ logDirectory });
    vi.spyOn(fs, 'appendFile').mockImplementation(() => undefined);

    transport.write('INFO', '[INFO] [Test] final entry', []);
    transport.flush();

    const logFile = fs.readdirSync(logDirectory).find((file) => file.endsWith('.log'));
    expect(logFile).toBeDefined();
    expect(fs.readFileSync(path.join(logDirectory, logFile!), 'utf8')).toContain('[INFO] [Test] final entry');
  });
});
