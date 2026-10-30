// SPDX-License-Identifier: MIT
import React from 'react';

export interface SideMenuButtonProps {
  /** Icon element */
  icon: React.ReactNode;
  /** Button label (used for aria-label and title) */
  label: string;
  /** Click handler */
  onClick?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Reason included in the tooltip while disabled */
  disabledReason?: string;
  /** Queries an unavailable capability again without performing the disabled action. */
  onDisabledClick?: () => void;
  /** Active state (for mode buttons) */
  active?: boolean;
  /** Color when active (hex value, e.g. '#029863'). When specified, acts as a mode button */
  activeColor?: string;
  'aria-haspopup'?: 'dialog';
  'aria-describedby'?: string;
}

export const SideMenuButton: React.FC<SideMenuButtonProps> = ({
  icon,
  label,
  onClick,
  disabled = false,
  disabledReason,
  onDisabledClick,
  active = false,
  activeColor,
  'aria-haspopup': ariaHasPopup,
  'aria-describedby': ariaDescribedBy,
}) => {
  const isToggle = activeColor !== undefined;

  const baseClasses =
    'flex items-center justify-center h-20 min-h-11 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vscode-primary';

  let className: string;
  let style: React.CSSProperties | undefined;

  if (isToggle && active) {
    // Active toggle buttons always show their color, even when disabled
    className = `${baseClasses} text-white cursor-not-allowed`;
    style = { backgroundColor: activeColor };
  } else if (disabled) {
    className = `${baseClasses} text-zinc-600 cursor-not-allowed`;
    style = undefined;
  } else if (isToggle) {
    className = `${baseClasses} hover:bg-zinc-800`;
    style = { color: activeColor };
  } else {
    className = `${baseClasses} text-zinc-300 hover:bg-zinc-800`;
    style = undefined;
  }

  return (
    <button
      type="button"
      onClick={disabled ? onDisabledClick : onClick}
      disabled={disabled && !onDisabledClick}
      aria-disabled={disabled && onDisabledClick ? true : undefined}
      className={className}
      style={style}
      aria-label={label}
      aria-haspopup={ariaHasPopup}
      aria-describedby={ariaDescribedBy}
      title={disabled && disabledReason ? `${label}: ${disabledReason}` : label}
      {...(isToggle ? { 'aria-pressed': active } : {})}
    >
      {icon}
    </button>
  );
};
