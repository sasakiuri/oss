import { useCallback, useEffect, useRef, useState } from 'react';
import { operatorAccessService } from '@/renderer/services';
import type {
  OperatorAccount,
  OperatorAccessStatus,
  OperatorAuditEntry,
  OperatorPermission,
} from '@/shared/ipc/contracts/operatorAccess.contract';
import { Button } from '../shared/common/Button';
import { Input } from '../shared/common/Input';
import { Modal } from '../shared/common/Modal';

const permissions: [OperatorPermission, string][] = [
  ['ADMIN', 'Administration'],
  ['OPERATE', 'Competition operation'],
  ['OFFICIATE', 'Results and adjudication'],
  ['EQUIPMENT', 'Equipment records'],
];
const officialRoles: [OperatorAccount['officialRoles'][number], string][] = [
  ['JURY_MEMBER', 'Jury member'],
  ['EQUIPMENT_CONTROL_JURY', 'Equipment Control Jury'],
  ['ANTI_DOPING_AUTHORITY', 'Anti-doping authority'],
  ['RTS_JURY', 'RTS Jury (result approval)'],
];
const blank: OperatorAccount = { id: '', name: '', permissions: [], officialRoles: [], disabled: false };

export function OperatorAccessPanel() {
  const [status, setStatus] = useState<OperatorAccessStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [account, setAccount] = useState<OperatorAccount>({ ...blank });
  const [newPassword, setNewPassword] = useState('');
  const [accounts, setAccounts] = useState<OperatorAccount[]>([]);
  const [audit, setAudit] = useState<OperatorAuditEntry[]>([]);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const response = await operatorAccessService.status();
      if (current !== generation.current) return;
      if (!response.success) throw new Error(response.error.message);
      setStatus(response.data);
      setError(null);
      if (open && response.data.actor?.permissions.includes('ADMIN')) {
        const administration = await operatorAccessService.getAdministration();
        if (current !== generation.current) return;
        if (!administration.success) throw new Error(administration.error.message);
        setAccounts(administration.data.accounts);
        setAudit(administration.data.audit);
      } else {
        setAccounts([]);
        setAudit([]);
      }
    } catch (error) {
      if (current === generation.current) setError(error instanceof Error ? error.message : String(error));
    }
  }, [open]);
  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      if (!busyRef.current) void load();
    }, 30_000);
    return () => {
      clearInterval(interval);
      generation.current++;
    };
  }, [load]);
  async function run(operation: () => ReturnType<typeof operatorAccessService.signIn>) {
    generation.current++;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await operation();
      if (!response.success) throw new Error(response.error.message);
      setStatus(response.data);
      setPassword('');
      setNewPassword('');
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const admin = status?.actor?.permissions.includes('ADMIN');
  const close = () => {
    if (!busy) {
      setOpen(false);
      setPassword('');
      setNewPassword('');
    }
  };
  return (
    <>
      <button
        type="button"
        className="text-sm text-vscode-text-muted hover:text-vscode-text"
        onClick={() => setOpen(true)}
      >
        Operator:{' '}
        {status
          ? (status.actor?.name ?? (status.enabled ? 'Signed out · changes restricted' : 'Manual operation'))
          : 'Access status unavailable'}
      </button>
      <Modal isOpen={open} onClose={close} title="Operator access" size="xl">
        <div className="space-y-4 p-5">
          <p className="text-sm">
            {status?.enabled ? 'Operator sign-in is required for changes.' : 'Manual operation is enabled.'} Display
            reading and emergency safety stops remain available. Sessions expire after 30 minutes without an operation.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          {status?.actor ? (
            <div className="flex items-center gap-3">
              <span>Signed in: {status.actor.name}</span>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void run(() => operatorAccessService.signOut())}
              >
                Sign out
              </Button>
            </div>
          ) : (
            !status?.setupRequired && (
              <form
                className="grid items-end gap-3 md:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(() => operatorAccessService.signIn({ name, password }));
                }}
              >
                <Input label="Operator name" value={name} onChange={setName} autoComplete="username" disabled={busy} />
                <Input
                  label="Operator password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  disabled={busy}
                />
                <Button type="submit" disabled={busy || !name.trim() || !password}>
                  Sign in
                </Button>
              </form>
            )
          )}
          {admin && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => operatorAccessService.setEnabled({ enabled: !status!.enabled }))}
            >
              {status?.enabled ? 'Allow manual operation' : 'Require operator sign-in'}
            </Button>
          )}
          {(status?.setupRequired || admin) && (
            <fieldset disabled={busy} className="space-y-3 rounded border border-vscode-border p-4">
              <h3 className="font-semibold">
                {status?.setupRequired ? 'Create the first administrator' : 'Manage operators'}
              </h3>
              {!status?.setupRequired && (
                <label className="flex flex-col gap-1 text-sm">
                  Account to edit
                  <select
                    className="rounded border border-vscode-border bg-vscode-input p-2"
                    value={account.id}
                    onChange={(event) => {
                      setAccount(accounts.find((value) => value.id === event.target.value) ?? { ...blank });
                      setNewPassword('');
                    }}
                  >
                    <option value="">New operator</option>
                    {accounts.map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.name}
                        {value.disabled ? ' (disabled)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Account name"
                  value={account.name}
                  onChange={(value) => setAccount({ ...account, name: value })}
                  autoComplete="off"
                />
                <Input
                  label={
                    account.id ? 'Replacement password (leave blank to keep)' : 'New password (at least 10 characters)'
                  }
                  type="password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                />
              </div>
              {!status?.setupRequired && (
                <div className="flex flex-wrap gap-4">
                  {permissions.map(([permission, label]) => (
                    <label className="text-sm" key={permission}>
                      <input
                        type="checkbox"
                        checked={account.permissions.includes(permission)}
                        onChange={(event) =>
                          setAccount({
                            ...account,
                            permissions: event.target.checked
                              ? [...account.permissions, permission]
                              : account.permissions.filter((value) => value !== permission),
                          })
                        }
                      />{' '}
                      {label}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-sm text-vscode-text-muted">
                No operation permissions gives read access. Championship setup and account administration require
                Administration. Assign official signing roles separately according to the official's actual appointment.
              </p>
              <div className="flex flex-wrap gap-4">
                {officialRoles.map(([role, label]) => (
                  <label className="text-sm" key={role}>
                    <input
                      type="checkbox"
                      checked={account.officialRoles.includes(role)}
                      onChange={(event) =>
                        setAccount({
                          ...account,
                          officialRoles: event.target.checked
                            ? [...account.officialRoles, role]
                            : account.officialRoles.filter((value) => value !== role),
                        })
                      }
                    />{' '}
                    {label}
                  </label>
                ))}
              </div>
              {!status?.setupRequired && (
                <label className="block text-sm">
                  <input
                    type="checkbox"
                    checked={account.disabled}
                    onChange={(event) => setAccount({ ...account, disabled: event.target.checked })}
                  />{' '}
                  Disable account
                </label>
              )}
              <p className="text-sm text-vscode-text-muted">
                Saving an existing account signs out its active sessions. Sanction decisions use the signed-in
                official's identity; account access does not replace the Jury decision or its evidence.
              </p>
              <Button
                disabled={
                  busy ||
                  !account.name.trim() ||
                  (!account.id && newPassword.length < 10) ||
                  (newPassword.length > 0 && newPassword.length < 10)
                }
                onClick={() =>
                  void run(() =>
                    operatorAccessService.saveAccount({
                      id: account.id || null,
                      name: account.name,
                      permissions: status?.setupRequired ? ['ADMIN'] : account.permissions,
                      officialRoles: account.officialRoles,
                      disabled: status?.setupRequired ? false : account.disabled,
                      password: newPassword || null,
                    }),
                  )
                }
              >
                Save operator account
              </Button>
            </fieldset>
          )}
          {admin && (
            <details>
              <summary className="cursor-pointer">Recent operator activity</summary>
              <p className="my-2 text-sm text-vscode-text-muted">
                Returned means the handler returned; inspect the operation result for per-Lane failures.
              </p>
              {audit.map((entry) => (
                <p key={entry.id} className="my-1 text-sm">
                  {entry.recordedAt} · {entry.actorName ?? 'Signed out'} · {entry.operation} · {entry.outcome}
                </p>
              ))}
            </details>
          )}
        </div>
      </Modal>
    </>
  );
}
