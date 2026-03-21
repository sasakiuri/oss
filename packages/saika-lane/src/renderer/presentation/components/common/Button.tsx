// SPDX-License-Identifier: MIT
import React from 'react';

/**
 * Button variant types
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

/**
 * Button component props
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Button variant that determines the styling
   * @default 'primary'
   */
  variant?: ButtonVariant;
  /**
   * Button content
   */
  children: React.ReactNode;
}

/**
 * Button component with support for multiple variants
 *
 * @example
 * ```tsx
 * <Button variant="primary" onClick={handleClick}>
 *   Submit
 * </Button>
 * ```
 *
 * @param props - Button component props
 * @returns Button component
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  children,
  className = '',
  type = 'button',
  ...props
}) => {
  const baseStyles =
    'px-4 py-2 rounded font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-vscode-bg disabled:opacity-50 disabled:cursor-not-allowed';

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      'bg-vscode-primary text-white hover:bg-blue-600 focus:ring-vscode-primary disabled:hover:bg-vscode-primary',
    secondary:
      'bg-vscode-bg-light text-vscode-text border border-vscode-border hover:bg-vscode-bg-hover focus:ring-vscode-border disabled:hover:bg-vscode-bg-light',
    danger: 'bg-vscode-error text-white hover:bg-red-600 focus:ring-vscode-error disabled:hover:bg-vscode-error',
  };

  const combinedClassName = `${baseStyles} ${variantStyles[variant]} ${className}`.trim();

  return (
    <button type={type} className={combinedClassName} {...props}>
      {children}
    </button>
  );
};
