// SPDX-License-Identifier: MIT
import { Button } from '../shared/common/Button';
import { stackedMediumLabelClass } from '../shared/common/formClasses';

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
    <label className={stackedMediumLabelClass}>
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
