// SPDX-License-Identifier: MIT
import { Button } from '../shared/common/Button';

export function FormButtons({
  saving,
  submitDisabled = false,
  submitLabel,
  onCancel,
}: {
  saving: boolean;
  submitDisabled?: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" size="sm" disabled={saving || submitDisabled}>
        {submitLabel}
      </Button>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
      {label}
      {children}
    </label>
  );
}

export function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-vscode-dimmed">{label}</dt>
      <dd className="mt-0.5 text-vscode-text">{value}</dd>
    </div>
  );
}

export const inputClass =
  'min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';

export const formClass = 'space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3';
