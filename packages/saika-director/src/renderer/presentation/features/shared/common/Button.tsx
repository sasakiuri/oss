import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center gap-1.5 rounded-[3px] border font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-70';

  const variantClasses = {
    primary:
      'border-vscode-primary bg-vscode-primary text-white hover:border-vscode-primary-hover hover:bg-vscode-primary-hover disabled:border-vscode-border disabled:bg-vscode-bg-lighter disabled:text-vscode-dimmed',
    secondary:
      'border-vscode-border bg-vscode-bg-light text-vscode-text hover:border-vscode-dimmed hover:bg-vscode-bg-hover disabled:text-vscode-dimmed',
    danger:
      'border-vscode-error/60 bg-transparent text-vscode-error hover:border-vscode-error hover:bg-vscode-error/10 disabled:border-vscode-border disabled:text-vscode-dimmed',
  };

  const sizeClasses = {
    sm: 'min-h-8 px-2.5 py-1 text-[13px]',
    md: 'min-h-9 px-3 py-1.5 text-[13px]',
    lg: 'min-h-10 px-4 py-2 text-sm',
  };

  return (
    <button
      type={type}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
