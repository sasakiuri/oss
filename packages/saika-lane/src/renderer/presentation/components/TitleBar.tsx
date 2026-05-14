// SPDX-License-Identifier: MIT
/**
 * TitleBar component
 *
 * @description
 * VSCode-style custom titlebar with menu bar and window controls.
 * Replaces native OS titlebar for consistent cross-platform appearance.
 */

import { Copy, Minus, Square, Target, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useEscapeKey } from '@/renderer/presentation/hooks/useEscapeKey';
import { windowService } from '@/renderer/services/windowService';

export interface TitleBarProps {
  isMaximized: boolean;
  isFullscreen: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  useNativeControlsOverlay?: boolean;
  onSettingsOpen?: () => void;
  onDebugPanelToggle?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
}

interface MenuDefinition {
  label: string;
  items: MenuItem[];
}

export const TitleBar: React.FC<TitleBarProps> = ({
  isMaximized,
  isFullscreen,
  onMinimize,
  onMaximize,
  onClose,
  useNativeControlsOverlay = false,
  onSettingsOpen,
  onDebugPanelToggle,
  onZoomIn,
  onZoomOut,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const isEmbeddedMenuBar = useNativeControlsOverlay;

  const menus: MenuDefinition[] = [
    {
      label: 'File',
      items: [
        { label: 'Settings...', shortcut: 'Ctrl+,', action: onSettingsOpen },
        { label: 'Quit', shortcut: 'Ctrl+Q', action: onClose },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z' },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z' },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Toggle Fullscreen',
          shortcut: 'F11',
          action: () => {
            windowService.toggleFullscreen().catch(() => {});
          },
        },
        ...(onDebugPanelToggle ? [{ label: 'Toggle Debug Panel', action: onDebugPanelToggle }] : []),
        { separator: true, label: '' },
        { label: 'Zoom In', action: onZoomIn },
        { label: 'Zoom Out', action: onZoomOut },
      ],
    },
    {
      label: 'Window',
      items: [
        { label: 'Minimize', action: onMinimize },
        { label: 'Maximize', action: onMaximize },
      ],
    },
    {
      label: 'Help',
      items: [{ label: 'About' }],
    },
  ];

  // Close dropdown on outside click
  useEffect(() => {
    if (!activeMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenu]);

  useEffect(() => {
    if (isFullscreen) {
      setActiveMenu(null);
    }
  }, [isFullscreen]);

  // Close dropdown on ESC
  useEscapeKey(
    activeMenu !== null,
    useCallback(() => setActiveMenu(null), []),
  );

  const handleMenuClick = (label: string) => {
    setActiveMenu((prev) => (prev === label ? null : label));
  };

  const handleMenuHover = (label: string) => {
    if (activeMenu !== null) {
      setActiveMenu(label);
    }
  };

  const handleMenuItemClick = (item: MenuItem) => {
    if (item.action) {
      item.action();
    }
    setActiveMenu(null);
  };

  return (
    <header
      role="banner"
      className={`relative flex h-8 select-none items-center border-b border-[#3E3E42] bg-[#252526] text-xs text-[#CCCCCC] ${
        isEmbeddedMenuBar ? 'app-no-drag' : 'app-drag'
      }`.trim()}
    >
      {/* App icon */}
      <div className="flex items-center px-2">
        <Target size={16} className="text-blue-500" />
      </div>

      {/* Menu bar */}
      {!isFullscreen && (
        <nav ref={menuBarRef} className="app-no-drag flex items-center" role="menubar">
          {menus.map((menu) => (
            <div key={menu.label} className="relative">
              <button
                role="menuitem"
                className={`h-8 px-3 transition-colors hover:bg-[#2A2D2E] ${
                  activeMenu === menu.label ? 'bg-[#2A2D2E]' : ''
                }`}
                onClick={() => handleMenuClick(menu.label)}
                onMouseEnter={() => handleMenuHover(menu.label)}
              >
                {menu.label}
              </button>

              {activeMenu === menu.label && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-50 min-w-[200px] rounded border border-[#3E3E42] bg-[#2D2D30] py-1 shadow-lg"
                >
                  {menu.items.map((item, index) =>
                    item.separator ? (
                      <div key={index} className="my-1 border-t border-[#3E3E42]" />
                    ) : (
                      <button
                        key={item.label}
                        role="menuitem"
                        className="flex w-full items-center justify-between px-4 py-1.5 text-left transition-colors hover:bg-[#007ACC] hover:text-white"
                        onClick={() => handleMenuItemClick(item)}
                      >
                        <span>{item.label}</span>
                        {item.shortcut && <span className="ml-8 text-[#858585]">{item.shortcut}</span>}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
      )}

      {/* Centered title */}
      {!isEmbeddedMenuBar && <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">Saika Lane</div>}

      {/* Window controls */}
      {!isEmbeddedMenuBar && (
        <div className="app-no-drag ml-auto flex items-center">
          <button
            aria-label="Minimize"
            className="flex h-8 w-12 items-center justify-center transition-colors hover:bg-[#2A2D2E]"
            onClick={onMinimize}
          >
            <Minus size={16} />
          </button>
          <button
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
            className="flex h-8 w-12 items-center justify-center transition-colors hover:bg-[#2A2D2E]"
            onClick={onMaximize}
          >
            {isMaximized ? <Copy size={14} /> : <Square size={14} />}
          </button>
          <button
            aria-label="Close"
            className="flex h-8 w-12 items-center justify-center transition-colors hover:bg-red-600 hover:text-white"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </header>
  );
};
