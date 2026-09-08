// @vitest-environment node
import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import { migration075OperatorAccess } from '@/main/infrastructure/database/migrations/075_operator_access';
import {
  OperatorAccessService,
  type IOperatorAccessStore,
  type StoredOperatorAccount,
} from '@/main/modules/operator-access/OperatorAccessService';
import { directorOperatorPermission } from '@/main/modules/operator-access/DirectorOperatorPermissions';
import { SessionSanctionAuthorizationResolver } from '@/main/modules/operator-access/SessionSanctionAuthorizationResolver';
import { SqliteOperatorAccessStore } from '@/main/modules/operator-access/SqliteOperatorAccessStore';
import { ManualAttestationSanctionAuthorizationResolver } from '@/main/modules/athlete-sanctions';
import type { OperatorAuditEntry } from '@/shared/ipc/contracts/operatorAccess.contract';

class MemoryStore implements IOperatorAccessStore {
  required = false;
  users: StoredOperatorAccount[] = [];
  entries: OperatorAuditEntry[] = [];
  enabled() {
    return this.required;
  }
  setEnabled(value: boolean) {
    this.required = value;
  }
  accounts() {
    return this.users;
  }
  saveAccount(account: StoredOperatorAccount) {
    this.users = [...this.users.filter((value) => value.id !== account.id), account];
  }
  appendAudit(entry: OperatorAuditEntry) {
    this.entries.push(entry);
  }
  audit() {
    return this.entries;
  }
}
const administrator = {
  id: null,
  name: 'Administrator',
  permissions: ['ADMIN' as const],
  officialRoles: [],
  disabled: false,
  password: 'correct horse battery',
};
const request = { namespace: 'mqtt', operation: 'startMatch', kind: 'command' as const, senderId: 2 };
async function setup() {
  const store = new MemoryStore();
  let time = Date.parse('2026-09-08T12:00:00Z');
  const service = new OperatorAccessService(store, directorOperatorPermission, () => time);
  await service.saveAccount(1, administrator);
  service.setEnabled(1, true);
  return {
    store,
    service,
    advance: () => {
      time += 31 * 60_000;
    },
  };
}

describe('Operator access', () => {
  it('defaults to manual operation and hashes passwords without returning credentials', async () => {
    const store = new MemoryStore();
    const service = new OperatorAccessService(store, directorOperatorPermission);
    expect(await service.invoke(request, async () => 'allowed')).toBe('allowed');
    const result = await service.saveAccount(1, administrator);
    expect(result).toMatchObject({ enabled: false, setupRequired: false, actor: { name: administrator.name } });
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(store.users)).not.toContain(administrator.password);
    expect(store.users[0]!.passwordHash).toHaveLength(128);
  });
  it('checks permissions before invoking a handler, retains read access and always permits a safety stop', async () => {
    const { service, store } = await setup();
    const next = vi.fn(async () => 'executed');
    await expect(service.invoke(request, next)).rejects.toThrow('Sign in');
    expect(next).not.toHaveBeenCalled();
    expect(await service.invoke({ ...request, kind: 'query' }, next)).toBe('executed');
    expect(await service.invoke({ ...request, operation: 'activateSafetyStop' }, next)).toBe('executed');
    expect(store.entries.at(-1)).toMatchObject({ operation: 'mqtt.startMatch', outcome: 'DENIED' });
    await expect(service.invoke({ ...request, operation: 'clearSafetyStop' }, next)).rejects.toThrow('Sign in');
  });
  it('separates equipment access from competition operation and scopes sessions to the calling window', async () => {
    const { service } = await setup();
    await service.saveAccount(1, { ...administrator, name: 'Equipment official', permissions: ['EQUIPMENT'] });
    await service.signIn(2, 'Equipment official', administrator.password);
    await expect(service.invoke(request, async () => true)).rejects.toThrow('authorized');
    expect(
      await service.invoke(
        { ...request, namespace: 'equipmentRegistry', operation: 'recordInspection' },
        async () => true,
      ),
    ).toBe(true);
    await expect(
      service.invoke({ ...request, namespace: 'equipmentRegistry', senderId: 3 }, async () => true),
    ).rejects.toThrow('Sign in');
    expect(directorOperatorPermission({ ...request, namespace: 'unified-lane-control', operation: 'editShot' })).toBe(
      'OFFICIATE',
    );
    expect(directorOperatorPermission({ ...request, namespace: 'futureModule' })).toBe('ADMIN');
  });
  it('revokes sessions after account changes, expires inactive sessions and protects the last administrator', async () => {
    const { service, advance } = await setup();
    await service.saveAccount(1, { ...administrator, name: 'Range official', permissions: ['OPERATE'] });
    await service.signIn(2, 'Range official', administrator.password);
    const account = service.administration(1).accounts.find((value) => value.name === 'Range official')!;
    await service.saveAccount(1, { ...account, disabled: true, password: null });
    expect(service.status(2).actor).toBeNull();
    const admin = service.administration(1).accounts.find((value) => value.name === administrator.name)!;
    await expect(service.saveAccount(1, { ...admin, permissions: [], password: null })).rejects.toThrow('at least one');
    advance();
    expect(service.status(1).actor).toBeNull();
    expect(() => service.setEnabled(1, false)).toThrow('administrator');
  });
  it('rate limits repeated incorrect passwords and cannot race two initial administrator accounts', async () => {
    const { service } = await setup();
    for (let count = 0; count < 5; count++)
      await expect(service.signIn(2, administrator.name, 'incorrect')).rejects.toThrow('Invalid');
    await expect(service.signIn(2, administrator.name, administrator.password)).rejects.toThrow('wait one minute');
    const store = new MemoryStore();
    const fresh = new OperatorAccessService(store, directorOperatorPermission);
    const outcomes = await Promise.allSettled([
      fresh.saveAccount(1, administrator),
      fresh.saveAccount(2, { ...administrator, name: 'Second' }),
    ]);
    expect(outcomes.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(store.users).toHaveLength(1);
  });
  it('keeps concurrent request identities separate and checks assigned sanction roles', async () => {
    const { service, store } = await setup();
    await service.saveAccount(1, {
      ...administrator,
      name: 'Jury A',
      permissions: ['OFFICIATE'],
      officialRoles: ['JURY_MEMBER'],
    });
    await service.signIn(2, 'Jury A', administrator.password);
    const resolver = new SessionSanctionAuthorizationResolver(
      () => service.currentActor(),
      () => store.enabled(),
      new ManualAttestationSanctionAuthorizationResolver(),
    );
    const sanction = {
      authorityBasis: 'JURY_MAJORITY' as const,
      authorityReference: 'Jury decision 1',
      officialName: 'Entered name',
      officialRole: 'JURY_MEMBER' as const,
    };
    const identities = await Promise.all([
      service.invoke({ ...request, namespace: 'athleteSanctions', operation: 'imposeSanction' }, async () => {
        await Promise.resolve();
        return resolver.resolve(sanction);
      }),
      service.invoke({ ...request, senderId: 1 }, async () => {
        await Promise.resolve();
        return service.currentActor()?.name;
      }),
    ]);
    expect(identities[0]).toMatchObject({ officialName: 'Jury A', mode: 'AUTHENTICATED_SESSION' });
    expect(identities[1]).toBe(administrator.name);
    expect(service.currentActor()).toBeNull();
    await expect(service.invoke({ ...request, senderId: 1 }, async () => resolver.resolve(sanction))).rejects.toThrow(
      'official role',
    );
    expect(() => resolver.resolve(sanction)).toThrow('authenticated');
  });
  it('persists enabled mode and audit evidence without restoring authenticated sessions on restart', async () => {
    const database = new Database(':memory:');
    try {
      migration075OperatorAccess.up(database);
      const store = new SqliteOperatorAccessStore(database);
      const service = new OperatorAccessService(store, directorOperatorPermission);
      await service.saveAccount(1, administrator);
      service.setEnabled(1, true);
      await service.invoke({ ...request, senderId: 1 }, async () => undefined);
      const restarted = new OperatorAccessService(new SqliteOperatorAccessStore(database), directorOperatorPermission);
      expect(restarted.status(1)).toMatchObject({ enabled: true, actor: null });
      expect(store.audit()).toEqual(expect.arrayContaining([expect.objectContaining({ outcome: 'RETURNED' })]));
      expect(() => database.exec('DELETE FROM operator_access_audit')).toThrow('append-only');
    } finally {
      database.close();
    }
  });
});
