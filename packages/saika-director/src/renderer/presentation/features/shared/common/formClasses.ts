/**
 * Form class strings that several panels share verbatim. Panels keep their own variant; a string used by one panel
 * stays local to it.
 */

/** Content-width input. */
export const inputClass =
  'min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[13px] text-vscode-text';

/** Content-width input with wider horizontal padding. */
export const paddedInputClass =
  'min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';

/** Full-width input on its own line below a label. */
export const blockInputClass =
  'mt-1 block min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';

/** Full-width input without the default focus outline (focus rings come from index.css). */
export const fullWidthInputClass =
  'w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1.5 text-[13px] text-vscode-text focus:outline-none';

/** Full-width input that mutes read-only values. */
export const readOnlyMutedInputClass =
  'w-full rounded-[2px] border border-vscode-border bg-vscode-input px-2 py-1.5 text-[13px] text-vscode-text outline-none read-only:text-vscode-text-muted';

/** Small full-width input below a label. */
export const smallInputClass =
  'mt-1 min-h-8 w-full rounded border border-vscode-border bg-vscode-input px-2 text-xs text-vscode-text';

/** Small full-width block input below a label. */
export const smallBlockInputClass =
  'mt-1 block min-h-8 w-full rounded border border-vscode-border bg-vscode-input px-2 text-xs text-vscode-text';

/** Small full-width field. */
export const smallFieldClass =
  'w-full rounded border border-vscode-border bg-vscode-input px-2 py-1 text-xs text-vscode-text';

/** Input on the white print preview. */
export const printInputClass = 'block w-full rounded border p-2 text-black bg-white';

/** Muted label text. */
export const mutedLabelClass = 'text-xs text-vscode-text-muted';

/** Label stacked above its control. */
export const stackedLabelClass = 'flex flex-col gap-1 text-xs text-vscode-text-muted';

/** Medium-weight label stacked above its control. */
export const stackedMediumLabelClass = 'flex flex-col gap-1 text-xs font-medium text-vscode-text-muted';

/** Bordered form section. */
export const sectionClass = 'rounded-[3px] border border-vscode-border p-3';

/** Bordered form or panel on the editor background whose rows are spaced. */
export const spacedPanelClass = 'space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3';
