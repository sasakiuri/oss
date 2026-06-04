// SPDX-License-Identifier: MIT

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]';

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const editableElement = target.closest(EDITABLE_SELECTOR);
  if (!editableElement) {
    return false;
  }

  if (
    editableElement instanceof HTMLInputElement ||
    editableElement instanceof HTMLTextAreaElement ||
    editableElement instanceof HTMLSelectElement
  ) {
    return true;
  }

  const contentEditable = editableElement.getAttribute('contenteditable')?.toLowerCase();
  return contentEditable === '' || contentEditable === 'true' || contentEditable === 'plaintext-only';
}
