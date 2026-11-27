// SPDX-License-Identifier: MIT
import { Button } from '../shared/common/Button';

/** The cancel and submit buttons of an interruption form. */
export function FormButtons({
  saving,
  submitDisabled = false,
  submitLabel,
  onCancel,
  cancelLabel = 'Cancel',
  danger = false,
}: {
  saving: boolean;
  submitDisabled?: boolean;
  submitLabel: string;
  onCancel: () => void;
  cancelLabel?: string;
  danger?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button type="submit" variant={danger ? 'danger' : 'primary'} size="sm" disabled={saving || submitDisabled}>
        {submitLabel}
      </Button>
    </div>
  );
}
