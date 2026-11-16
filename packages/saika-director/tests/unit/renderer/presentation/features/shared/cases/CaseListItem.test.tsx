import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CaseListItem } from '@/renderer/presentation/features/shared/cases/CaseListItem';

const ROW_CLASS = 'block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0';

describe('CaseListItem', () => {
  it('renders the selected case as a highlighted button around its text', () => {
    render(
      <CaseListItem selected onSelect={() => {}}>
        <span>Case A</span>
      </CaseListItem>,
    );

    const button = screen.getByRole('button', { name: 'Case A' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('class', `${ROW_CLASS} bg-vscode-highlight`);
    expect(button.innerHTML).toBe('<span>Case A</span>');
  });

  it('renders another case with the hover background and selects it on click', () => {
    const onSelect = vi.fn();
    render(
      <CaseListItem selected={false} onSelect={onSelect}>
        Case B
      </CaseListItem>,
    );

    const button = screen.getByRole('button', { name: 'Case B' });
    expect(button).toHaveAttribute('class', `${ROW_CLASS} hover:bg-vscode-bg-hover`);
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
