// SPDX-License-Identifier: MIT
/**
 * Custom hook for TitleBar window controls
 *
 * @description
 * Manages window state (maximized) and provides handlers for
 * minimize, maximize/restore, and close operations.
 */

import { useCallback, useEffect, useState } from 'react';

import { windowService } from '@/renderer/services/windowService';

export interface UseTitleBarResult {
  isMaximized: boolean;
  isFullscreen: boolean;
  handleMinimize: () => void;
  handleMaximize: () => void;
  handleClose: () => void;
}

export function useTitleBar(): UseTitleBarResult {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    windowService
      .getWindowState()
      .then((state) => {
        setIsMaximized(state.isMaximized);
        setIsFullscreen(state.isFullscreen);
      })
      .catch(() => {
        /* Initial fetch failure is non-critical */
      });
  }, []);

  useEffect(() => {
    return window.electronAPI.on.fullscreenChanged((state) => {
      setIsFullscreen(state.isFullscreen);
    });
  }, []);

  const handleMinimize = useCallback(() => {
    windowService.minimize().catch(() => {});
  }, []);

  const handleMaximize = useCallback(() => {
    windowService
      .maximize()
      .then((state) => setIsMaximized(state.isMaximized))
      .catch(() => {});
  }, []);

  const handleClose = useCallback(() => {
    windowService.close().catch(() => {});
  }, []);

  return { isMaximized, isFullscreen, handleMinimize, handleMaximize, handleClose };
}
