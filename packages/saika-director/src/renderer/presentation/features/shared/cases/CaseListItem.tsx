import type { ReactNode } from 'react';

interface CaseListItemProps {
  readonly selected: boolean;
  readonly onSelect: () => void;
  /** The row text; each panel keeps its own lines. */
  readonly children: ReactNode;
}

/** One row of a case list: a full-width button that highlights the selected case. */
export function CaseListItem({ selected, onSelect, children }: CaseListItemProps) {
  return (
    <button
      type="button"
      className={`block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 ${
        selected ? 'bg-vscode-highlight' : 'hover:bg-vscode-bg-hover'
      }`}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}
