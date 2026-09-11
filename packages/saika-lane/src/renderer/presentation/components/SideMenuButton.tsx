// SPDX-License-Identifier: MIT
/**
 * SideMenuButton component
 *
 * Individual button component within SideMenu.
 * Supports both regular buttons and mode-switch buttons (with active color).
 */

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
  /** Active state (for mode buttons) */
  active?: boolean;
  /** Color when active (hex value, e.g. '#029863'). When specified, acts as a mode button */
  activeColor?: string;
  'aria-haspopup'?: 'dialog';
}

export const SideMenuButton: React.FC<SideMenuButtonProps> = ({
  icon,
  label,
  onClick,
  disabled = false,
  active = false,
  activeColor,
  'aria-haspopup': ariaHasPopup,
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
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={style}
      aria-label={label}
      aria-haspopup={ariaHasPopup}
      title={label}
      {...(isToggle ? { 'aria-pressed': active } : {})}
    >
      {icon}
    </button>
  );
};
