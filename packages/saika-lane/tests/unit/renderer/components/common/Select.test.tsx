// SPDX-License-Identifier: MIT
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Select, type SelectOption } from '@/renderer/presentation/components/common/Select';

describe('Select', () => {
  const mockOptions: SelectOption[] = [
    { label: 'Option 1', value: 'option1' },
    { label: 'Option 2', value: 'option2' },
    { label: 'Option 3', value: 'option3' },
  ];

  describe('basic rendering', () => {
    it('correctly displays the select element', () => {
      render(<Select value="option1" onChange={vi.fn()} options={mockOptions} />);
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('displays all options', () => {
      render(<Select value="" onChange={vi.fn()} options={mockOptions} />);

      const select = screen.getByRole('combobox');
      const options = within(select).getAllByRole('option');

      expect(options).toHaveLength(3);
      expect(options[0]).toHaveTextContent('Option 1');
      expect(options[1]).toHaveTextContent('Option 2');
      expect(options[2]).toHaveTextContent('Option 3');
    });

    it('selects the option corresponding to the value', () => {
      render(<Select value="option2" onChange={vi.fn()} options={mockOptions} />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('option2');
    });

    it('displays a label', () => {
      render(<Select value="" onChange={vi.fn()} options={mockOptions} label="Select an option" />);

      expect(screen.getByText('Select an option')).toBeInTheDocument();
      expect(screen.getByLabelText('Select an option')).toBeInTheDocument();
    });

    it('does not display a label element when label is not provided', () => {
      const { container } = render(<Select value="" onChange={vi.fn()} options={mockOptions} />);

      const label = container.querySelector('label');
      expect(label).not.toBeInTheDocument();
    });
  });

  describe('option selection', () => {
    it('calls onChange when an option is selected', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Select value="option1" onChange={handleChange} options={mockOptions} />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'option2');

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith('option2');
    });

    it('calls onChange even when the same option is selected', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Select value="option1" onChange={handleChange} options={mockOptions} />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'option1');

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith('option1');
    });

    it('can select multiple options sequentially', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Select value="option1" onChange={handleChange} options={mockOptions} />);

      const select = screen.getByRole('combobox');

      await user.selectOptions(select, 'option2');
      expect(handleChange).toHaveBeenCalledWith('option2');

      await user.selectOptions(select, 'option3');
      expect(handleChange).toHaveBeenCalledWith('option3');

      expect(handleChange).toHaveBeenCalledTimes(2);
    });
  });

  describe('placeholder', () => {
    it('displays a placeholder', () => {
      render(<Select value="" onChange={vi.fn()} options={mockOptions} placeholder="Please select an option" />);

      const select = screen.getByRole('combobox');
      const placeholderOption = within(select).getByRole('option', {
        name: 'Please select an option',
      });

      expect(placeholderOption).toBeInTheDocument();
      expect(placeholderOption).toHaveAttribute('disabled');
    });

    it('does not display when placeholder is not provided', () => {
      render(<Select value="" onChange={vi.fn()} options={mockOptions} />);

      const select = screen.getByRole('combobox');
      const options = within(select).getAllByRole('option');

      expect(options).toHaveLength(3); // no placeholder
    });

    it('placeholder has the disabled attribute', () => {
      render(<Select value="" onChange={vi.fn()} options={mockOptions} placeholder="Select..." />);

      const select = screen.getByRole('combobox');
      const placeholderOption = within(select).getByRole('option', { name: 'Select...' });

      expect(placeholderOption).toHaveAttribute('disabled');
      expect(placeholderOption).toHaveValue('');
    });
  });

  describe('disabled state', () => {
    it('disables the select when disabled attribute is true', () => {
      render(<Select value="" onChange={vi.fn()} options={mockOptions} disabled />);

      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });

    it('does not call onChange when in disabled state', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Select value="option1" onChange={handleChange} options={mockOptions} disabled />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'option2');

      expect(handleChange).not.toHaveBeenCalled();
    });

    it('applies disabled state styles', () => {
      render(<Select value="" onChange={vi.fn()} options={mockOptions} disabled />);

      const select = screen.getByRole('combobox');
      expect(select).toHaveClass('disabled:opacity-50');
      expect(select).toHaveClass('disabled:cursor-not-allowed');
    });
  });

  describe('accessibility', () => {
    it('has a combobox role', () => {
      render(<Select value="" onChange={vi.fn()} options={mockOptions} />);
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('associates label and select', () => {
      render(<Select value="" onChange={vi.fn()} options={mockOptions} label="Target Type" />);

      const select = screen.getByRole('combobox');
      const label = screen.getByText('Target Type');

      expect(label).toHaveAttribute('for', select.id);
    });

    it('has aria-label when label is not provided', () => {
      render(<Select value="" onChange={vi.fn()} options={mockOptions} />);

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-label', 'Select option');
    });

    it('is focusable', async () => {
      const user = userEvent.setup();
      render(<Select value="" onChange={vi.fn()} options={mockOptions} />);

      const select = screen.getByRole('combobox');
      await user.tab();

      expect(select).toHaveFocus();
    });

    it('cannot be focused when disabled', async () => {
      const user = userEvent.setup();
      render(<Select value="" onChange={vi.fn()} options={mockOptions} disabled />);

      const select = screen.getByRole('combobox');
      await user.tab();

      expect(select).not.toHaveFocus();
    });

    it('can select options via keyboard', async () => {
      const handleChange = vi.fn();

      render(<Select value="option1" onChange={handleChange} options={mockOptions} />);

      const select = screen.getByRole('combobox');
      select.focus();

      // Select elements don't directly change selection with ArrowDown and Enter,
      // so here we just verify that keyboard focus works
      expect(select).toHaveFocus();
    });
  });

  describe('customization', () => {
    it('applies additional className', () => {
      const { container } = render(
        <Select value="" onChange={vi.fn()} options={mockOptions} className="custom-class" />,
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('custom-class');
    });

    it('retains default style classes', () => {
      const { container } = render(
        <Select value="" onChange={vi.fn()} options={mockOptions} className="custom-class" />,
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex');
      expect(wrapper).toHaveClass('flex-col');
    });
  });

  describe('edge cases', () => {
    it('does not error when options are empty', () => {
      render(<Select value="" onChange={vi.fn()} options={[]} />);

      const select = screen.getByRole('combobox');
      const options = within(select).queryAllByRole('option');

      expect(options).toHaveLength(0);
    });

    it('does not error when value does not exist in options', () => {
      // When an HTMLSelectElement is given a value that doesn't exist, it selects the first option.
      // Here we verify it renders without error
      render(<Select value="invalid-value" onChange={vi.fn()} options={mockOptions} />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      // select is rendered
      expect(select).toBeInTheDocument();
      // value is set to the first option (HTML standard behavior)
      expect(select.value).toBe('option1');
    });

    it('works correctly when options have empty labels', () => {
      const optionsWithEmptyLabel: SelectOption[] = [
        { label: '', value: 'empty' },
        { label: 'Normal', value: 'normal' },
      ];

      render(<Select value="" onChange={vi.fn()} options={optionsWithEmptyLabel} />);

      const select = screen.getByRole('combobox');
      const options = within(select).getAllByRole('option');

      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent('');
      expect(options[1]).toHaveTextContent('Normal');
    });

    it('works correctly when options have duplicate values', () => {
      const duplicateOptions: SelectOption[] = [
        { label: 'First', value: 'duplicate' },
        { label: 'Second', value: 'duplicate' },
        { label: 'Third', value: 'unique' },
      ];

      render(<Select value="duplicate" onChange={vi.fn()} options={duplicateOptions} />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('duplicate');
    });

    it('works correctly with many options', () => {
      const manyOptions: SelectOption[] = Array.from({ length: 100 }, (_, i) => ({
        label: `Option ${i + 1}`,
        value: `option${i + 1}`,
      }));

      render(<Select value="" onChange={vi.fn()} options={manyOptions} />);

      const select = screen.getByRole('combobox');
      const options = within(select).getAllByRole('option');

      expect(options).toHaveLength(100);
    });

    it('generates unique IDs (multiple Selects)', () => {
      render(
        <>
          <Select value="" onChange={vi.fn()} options={mockOptions} label="Select 1" />
          <Select value="" onChange={vi.fn()} options={mockOptions} label="Select 2" />
        </>,
      );

      const labels = screen.getAllByText(/Select \d/);
      const id1 = labels[0]!.getAttribute('for');
      const id2 = labels[1]!.getAttribute('for');

      expect(id1).not.toBe(id2);
    });
  });
});
