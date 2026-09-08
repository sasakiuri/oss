import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';

import type { IpcInvocation, IpcInvocationMiddleware } from '@/main/shared-infra/ipc/IpcInvocationMiddleware';
import {
  saveOperatorAccountSchema,
  type OperatorAccount,
  type OperatorAccessStatus,
  type OperatorAuditEntry,
  type OperatorPermission,
} from '@/shared/ipc/contracts/operatorAccess.contract';

export interface StoredOperatorAccount extends OperatorAccount {
  salt: string;
  passwordHash: string;
}
export interface IOperatorAccessStore {
  enabled(): boolean;
  setEnabled(enabled: boolean): void;
  accounts(): StoredOperatorAccount[];
  saveAccount(account: StoredOperatorAccount): void;
  appendAudit(entry: OperatorAuditEntry): void;
  audit(): OperatorAuditEntry[];
}
export type OperatorPermissionResolver = (invocation: IpcInvocation) => OperatorPermission;
const sessionDurationMs = 30 * 60 * 1000;

export class OperatorAccessService implements IpcInvocationMiddleware {
  private readonly sessions = new Map<number, { accountId: string; expiresAt: number }>();
  private readonly attempts = new Map<string, { count: number; until: number }>();
  private readonly context = new AsyncLocalStorage<OperatorAccount | null>();
  constructor(
    private readonly store: IOperatorAccessStore,
    private readonly permission: OperatorPermissionResolver,
    private readonly now: () => number = Date.now,
  ) {}

  currentActor(): OperatorAccount | null {
    return this.context.getStore() ?? null;
  }
  signingAccounts(): { id: string; name: string }[] {
    return this.store
      .accounts()
      .filter((account) => !account.disabled)
      .map(({ id, name }) => ({ id, name }));
  }
  status(senderId: number): OperatorAccessStatus {
    const actor = this.actor(senderId);
    return {
      enabled: this.store.enabled(),
      setupRequired: this.store.accounts().length === 0,
      actor,
      expiresAt: actor ? new Date(this.sessions.get(senderId)!.expiresAt).toISOString() : null,
    };
  }
  async signIn(senderId: number, name: string, password: string) {
    const key = name.trim().toLowerCase();
    const attempt = this.attempts.get(key);
    if (attempt && attempt.count >= 5 && attempt.until > this.now())
      throw new Error('Too many sign-in attempts; wait one minute');
    const account = this.store.accounts().find((value) => value.name.toLowerCase() === key);
    const hash = await hashPassword(password, account?.salt ?? '0'.repeat(32));
    const valid =
      account &&
      !account.disabled &&
      timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(account.passwordHash, 'hex'));
    const latest = account && this.store.accounts().find((value) => value.id === account.id);
    if (!valid || !latest || latest.disabled || latest.passwordHash !== account.passwordHash) {
      this.attempts.set(key, {
        count: attempt && attempt.until > this.now() ? attempt.count + 1 : 1,
        until: this.now() + 60_000,
      });
      throw new Error('Invalid operator name or password');
    }
    this.attempts.delete(key);
    this.sessions.set(senderId, { accountId: account.id, expiresAt: this.now() + sessionDurationMs });
    return this.status(senderId);
  }
  signOut(senderId: number) {
    this.sessions.delete(senderId);
    return this.status(senderId);
  }
  setEnabled(senderId: number, enabled: boolean) {
    this.assertAdmin(senderId);
    this.audit(this.actor(senderId), 'operatorAccess.setEnabled', 'ACCEPTED');
    this.store.setEnabled(enabled);
    return this.status(senderId);
  }
  setEnabledForCurrentActor(enabled: boolean): void {
    const current = this.currentActor();
    const account = current && this.store.accounts().find((value) => value.id === current.id);
    if (!account || account.disabled || !account.permissions.includes('ADMIN'))
      throw new Error('Create and sign in as an administrator before changing access control');
    this.audit(publicAccount(account), 'operatorAccess.setEnabled', 'ACCEPTED');
    this.store.setEnabled(enabled);
  }
  administration(senderId: number) {
    this.assertAdmin(senderId);
    return { accounts: this.store.accounts().map(publicAccount), audit: this.store.audit() };
  }
  async saveAccount(senderId: number, input: z.input<typeof saveOperatorAccountSchema>) {
    const data = saveOperatorAccountSchema.parse(input);
    if (this.store.accounts().length > 0) this.assertAdmin(senderId);
    // Hash before the final state check so another request cannot race initial administrator setup.
    const salt = data.password ? randomBytes(16).toString('hex') : null;
    const passwordHash = data.password && salt ? await hashPassword(data.password, salt) : null;
    const accounts = this.store.accounts();
    const bootstrap = accounts.length === 0;
    if (!bootstrap) this.assertAdmin(senderId);
    if (bootstrap && (data.id || data.disabled || !data.permissions.includes('ADMIN')))
      throw new Error('The first account must be an active administrator');
    const previous = accounts.find((account) => account.id === data.id);
    if (data.id && !previous) throw new Error('Operator account not found');
    if (!previous && !passwordHash) throw new Error('A password is required for a new operator');
    if (accounts.some((account) => account.id !== data.id && account.name.toLowerCase() === data.name.toLowerCase()))
      throw new Error('Operator name already exists');
    const account: StoredOperatorAccount = {
      id: previous?.id ?? randomUUID(),
      name: data.name,
      permissions: [...new Set(data.permissions)],
      officialRoles: [...new Set(data.officialRoles)],
      disabled: data.disabled,
      salt: salt ?? previous!.salt,
      passwordHash: passwordHash ?? previous!.passwordHash,
    };
    if (
      ![...accounts.filter((value) => value.id !== account.id), account].some(
        (value) => !value.disabled && value.permissions.includes('ADMIN'),
      )
    )
      throw new Error('Keep at least one active administrator');
    this.audit(bootstrap ? publicAccount(account) : this.actor(senderId), 'operatorAccess.saveAccount', 'ACCEPTED');
    this.store.saveAccount(account);
    for (const [id, session] of this.sessions) if (session.accountId === account.id) this.sessions.delete(id);
    if (bootstrap) this.sessions.set(senderId, { accountId: account.id, expiresAt: this.now() + sessionDurationMs });
    return this.status(senderId);
  }
  async invoke<T>(invocation: IpcInvocation, next: () => Promise<T>): Promise<T> {
    // Public displays keep reading; the safety-stop path must remain available even when signed out.
    if (
      invocation.namespace === 'operatorAccess' ||
      invocation.kind === 'query' ||
      (invocation.namespace === 'mqtt' && invocation.operation === 'activateSafetyStop')
    )
      return next();
    const actor = this.actor(invocation.senderId);
    const operation = `${invocation.namespace}.${invocation.operation}`;
    if (
      this.store.enabled() &&
      (!actor || (!actor.permissions.includes('ADMIN') && !actor.permissions.includes(this.permission(invocation))))
    ) {
      this.audit(actor, operation, 'DENIED');
      throw new Error('Sign in with an operator account authorized for this operation');
    }
    if (actor) this.sessions.get(invocation.senderId)!.expiresAt = this.now() + sessionDurationMs;
    if (!this.store.enabled() && !actor) return this.context.run(null, next);
    this.audit(actor, operation, 'ACCEPTED');
    try {
      const result = await this.context.run(actor, next);
      this.audit(actor, operation, 'RETURNED');
      return result;
    } catch (error) {
      this.audit(actor, operation, 'THREW');
      throw error;
    }
  }
  private actor(senderId: number): OperatorAccount | null {
    const session = this.sessions.get(senderId);
    if (!session) return null;
    const account = this.store.accounts().find((value) => value.id === session.accountId);
    if (session.expiresAt <= this.now() || !account || account.disabled) {
      this.sessions.delete(senderId);
      return null;
    }
    return publicAccount(account);
  }
  private assertAdmin(senderId: number) {
    if (!this.actor(senderId)?.permissions.includes('ADMIN'))
      throw new Error('An authenticated administrator is required');
  }
  private audit(actor: OperatorAccount | null, operation: string, outcome: OperatorAuditEntry['outcome']) {
    this.store.appendAudit({
      id: randomUUID(),
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      operation,
      outcome,
      recordedAt: new Date(this.now()).toISOString(),
    });
  }
}
function publicAccount({ salt: _salt, passwordHash: _hash, ...account }: StoredOperatorAccount): OperatorAccount {
  return account;
}
function hashPassword(password: string, salt: string): Promise<string> {
  // OWASP Password Storage Cheat Sheet: scrypt N >= 2^17, r = 8, p = 1.
  // https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key.toString('hex')),
    ),
  );
}
