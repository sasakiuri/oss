// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

const CURSOR_HIDDEN_CLASS = 'cursor-hidden';
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'wheel', 'keydown', 'touchstart'];

/**
 * Hides the cursor after a period of inactivity while active.
 */
export function useAutoHideCursor(isActive: boolean, idleMs = 5000): void {
  useEffect(() => {
    if (!isActive) {
      document.documentElement.classList.remove(CURSOR_HIDDEN_CLASS);
      return;
    }

    let hideTimer: number | undefined;

    const showCursor = () => {
      document.documentElement.classList.remove(CURSOR_HIDDEN_CLASS);
    };

    const scheduleHide = () => {
      if (hideTimer !== undefined) {
        window.clearTimeout(hideTimer);
      }

      hideTimer = window.setTimeout(() => {
        document.documentElement.classList.add(CURSOR_HIDDEN_CLASS);
      }, idleMs);
    };

    const handleActivity = () => {
      showCursor();
      scheduleHide();
    };

    handleActivity();
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, handleActivity));

    return () => {
      if (hideTimer !== undefined) {
        window.clearTimeout(hideTimer);
      }

      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      document.documentElement.classList.remove(CURSOR_HIDDEN_CLASS);
    };
  }, [idleMs, isActive]);
}
