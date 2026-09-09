// @vitest-environment node
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration085OperationalSettingTemplates } from '@/main/infrastructure/database/migrations/085_operational_setting_templates';
import { OperationalProfileService } from '@/main/modules/operational-profiles';
import { OperationalTemplateService } from '@/main/modules/operational-templates/OperationalTemplateService';
import { SqliteOperationalTemplateRepository } from '@/main/modules/operational-templates/SqliteOperationalTemplateRepository';

let db: Database.Database;
let directory: string;
let service: OperationalTemplateService;
const input = {
  name: ' Club evening ',
  description: ' Manual equipment ',
  modes: { relay: 'ADVISORY' as const },
  expectedRevision: 0,
};
function open() {
  db = new Database(join(directory, 'templates.sqlite'));
  service = new OperationalTemplateService(new SqliteOperationalTemplateRepository(db));
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'saika-template-'));
  open();
  migration085OperationalSettingTemplates.up(db);
});
afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('Operational templates', () => {
  it('persists selected modes across restarts without copying competition-specific facts or applying them', async () => {
    const saved = service.save(input);
    expect(saved).toMatchObject({
      name: 'Club evening',
      description: 'Manual equipment',
      modes: input.modes,
      revision: 1,
    });
    db.close();
    open();
    expect(service.list()).toEqual([saved]);
    let mode = 'REQUIRED' as 'REQUIRED' | 'ADVISORY';
    const profiles = new OperationalProfileService(
      [
        {
          id: 'relay',
          label: 'Relay',
          scope: 'COMPETITION',
          supportedModes: ['REQUIRED', 'ADVISORY'],
          read: () => ({ mode, context: 'current-relay' }),
          write: (_id, next) => {
            mode = next as typeof mode;
          },
        },
      ],
      () => {},
    );
    const selection = { competitionId: 'different-competition', modes: saved.modes };
    const preview = await profiles.preview(selection);
    expect(mode).toBe('REQUIRED');
    await profiles.apply({ ...selection, fingerprint: preview.fingerprint });
    expect(mode).toBe('ADVISORY');
    expect(service.list()).toEqual([saved]);
  });

  it('rejects stale replacement and removal and cannot recreate a removed template through an old revision', () => {
    const saved = service.save(input);
    const edited = service.save({ ...input, name: 'Updated', id: saved.id, expectedRevision: saved.revision });
    expect(edited.revision).toBe(2);
    expect(() => service.save({ ...input, id: saved.id, expectedRevision: 1 })).toThrow('changed or was removed');
    expect(() => service.remove({ id: saved.id, expectedRevision: 1 })).toThrow('changed or was removed');
    expect(service.list()).toEqual([edited]);
    service.remove({ id: edited.id, expectedRevision: 2 });
    expect(() => service.save({ ...input, id: edited.id, expectedRevision: 2 })).toThrow('changed or was removed');
    expect(service.list()).toEqual([]);
  });

  it('validates inputs and names without changing existing templates on failure', () => {
    const saved = service.save(input);
    expect(() => service.save({ ...input, name: 'club EVENING' })).toThrow('already uses this name');
    expect(() => service.save({ ...input, name: ' ', modes: {} })).toThrow();
    expect(() => service.save({ ...input, expectedRevision: 1 })).toThrow('Reload');
    expect(() => service.save({ ...input, id: saved.id })).toThrow('Reload');
    expect(() => service.save({ ...input, modes: { relay: 'UNKNOWN' as never } })).toThrow();
    expect(service.list()).toEqual([saved]);
  });

  it('retains portable choices for absent components while active settings reject their application', async () => {
    const saved = service.save({ ...input, modes: { external: 'REQUIRED' } });
    const profiles = new OperationalProfileService([], () => {});
    await expect(profiles.preview({ competitionId: 'competition', modes: saved.modes })).rejects.toThrow('Unknown');
    expect(service.list()).toEqual([saved]);
  });
});
