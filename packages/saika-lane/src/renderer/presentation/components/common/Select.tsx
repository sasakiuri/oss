// SPDX-License-Identifier: MIT
import React from 'react';

/**
 * Option type for Select component
 */
export interface SelectOption {
  /**
   * Display label for the option
   */
  label: string;
  /**
   * Value for the option
   */
  value: string;
}

/**
 * Select component props
 */
export interface SelectProps {
  /**
   * Current selected value
   */
  value: string;
  /**
   * Change handler called when selection changes
   */
  onChange: (value: string) => void;
  /**
   * Available options
   */
  options: SelectOption[];
  /**
   * Optional label displayed above the select
   */
  label?: string;
  /**
   * Additional CSS classes for the select container
   */
  className?: string;
  /**
   * Whether the select is disabled
   */
  disabled?: boolean;
  /**
   * Optional placeholder text
   */
  placeholder?: string;
}

/**
 * Select component with label and options support
 *
 * Provides a styled select dropdown with optional label and full keyboard accessibility.
 *
 * @example
 * ```tsx
 * <Select
 *   label="Target Type"
 *   value={selectedValue}
 *   onChange={handleChange}
 *   options={[
 *     { label: 'SIUS', value: 'sius' },
 *     { label: 'Meyton', value: 'meyton' }
 *   ]}
 * />
 * ```
 *
 * @param props - Select component props
 * @returns Select component
 */
export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  label,
  className = '',
  disabled = false,
  placeholder,
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value);
  };

  const selectId = React.useId();

  return (
    <div className={`flex flex-col gap-2 ${className}`.trim()}>
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-vscode-text">
          {label}
        </label>
      )}
      <select
        id={selectId}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="cursor-pointer rounded border border-vscode-border bg-vscode-bg-light px-3 py-2 text-vscode-text focus:border-transparent focus:outline-none focus:ring-2 focus:ring-vscode-primary disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={label || 'Select option'}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};
